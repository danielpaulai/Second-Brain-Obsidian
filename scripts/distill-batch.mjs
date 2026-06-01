#!/usr/bin/env node
/**
 * Phase B (Batch mode): Submit all 266 categories to Anthropic's Message Batches API.
 *
 * 50% off vs synchronous. Async — returns when the batch is ready, up to 24h.
 *
 * Lifecycle:
 *   1. submit  → build requests, POST batch, save batch_id
 *   2. status  → check progress (succeeded / errored / processing)
 *   3. apply   → when ended, fetch results JSONL, write into .md files
 *
 * Commands:
 *   node scripts/distill-batch.mjs submit            # build + submit all 266
 *   node scripts/distill-batch.mjs status            # check current batch
 *   node scripts/distill-batch.mjs apply             # fetch results + write files
 *   node scripts/distill-batch.mjs run               # submit + poll + apply in one go
 *   node scripts/distill-batch.mjs --macro 06 submit # only one macro
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const BATCH_STATE = path.join(__dirname, ".distill-batch-state.json");

const APP_URL = "http://localhost:3000";
const ANTHROPIC_URL = "https://api.anthropic.com/v1";
const MODEL = "claude-sonnet-4-5-20250929";
const TOP_HITS = 12;
const FULL_NOTES_PER_CAT = 8;
const MAX_NOTE_CHARS = 6000;
const MAX_OUTPUT_TOKENS = 5000;
const POLL_INTERVAL_MS = 30_000;

/* ---------- env loader ---------------------------------------------------- */

async function loadEnv() {
  try {
    const txt = await fs.readFile(path.join(PROJECT_ROOT, ".env.local"), "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}

/* ---------- args ---------------------------------------------------------- */

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}
const macroFilter = flag("--macro");
const command = args.find((a) => !a.startsWith("--")) || "run";

/* ---------- helpers ------------------------------------------------------- */

async function readJson(p, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(p, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(p, data) {
  await fs.writeFile(p, JSON.stringify(data, null, 2));
}

function fmtDuration(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/* ---------- API helpers --------------------------------------------------- */

function anthropicHeaders() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set in .env.local");
  return {
    "x-api-key": key,
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
  };
}

async function fetchWithRetry(url, opts = {}, attempts = 4) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 60_000);
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      clearTimeout(timeoutId);
      return res;
    } catch (err) {
      lastErr = err;
      const backoff = 800 * (i + 1);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

async function searchBrain(query, lim = TOP_HITS) {
  const res = await fetchWithRetry(`${APP_URL}/api/brain/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit: lim }),
  });
  if (!res.ok) throw new Error(`search failed: ${res.status} ${await res.text()}`);
  const j = await res.json();
  return j.results || [];
}

async function readNote(title) {
  const res = await fetchWithRetry(
    `${APP_URL}/api/brain/note?title=${encodeURIComponent(title)}`
  );
  if (!res.ok) return null;
  const j = await res.json();
  return j.found ? j : null;
}

async function loadMaster() {
  const masterPath = path.join(process.env.VAULT_PATH, "_ai-danny", "MASTER.md");
  try {
    return await fs.readFile(masterPath, "utf8");
  } catch {
    return "";
  }
}

/* ---------- prompt (same as the synchronous script) ----------------------- */

const SYNTH_SYSTEM = (master) => `You are AI Danny writing the DEFINITIVE long-form entry for one category in his personal knowledge map.

The MASTER operating prompt below defines his voice, positioning, ICP, frameworks,
and the words he refuses to use. Apply ALL of it to your output.

You will receive:
  - A category (title + description + macro)
  - Up to 8 excerpts from his actual vault notes that semantic search surfaced

YOUR JOB: Write the comprehensive, opinionated, in-depth section that Danny himself would write if he sat down for two hours to fully articulate his thinking on this exact topic. This is the canonical entry. It should read like a deeply-thought essay-as-operator-playbook.

TARGET LENGTH: 2,000–3,000 words. Earn every word. Cut filler. Length without substance is worse than short.

STRUCTURE (use these exact ## headings, in this order):

## The core principle
1–2 paragraphs. The thesis. The one belief that everything else flows from. Should land like a quotable line.

## Why this matters
3–5 paragraphs. The mechanism. The cost of getting this wrong. Who suffers when this principle isn't applied. The leverage of getting it right.

## How it shows up in client work
The biggest section. 6–10 paragraphs. Specific patterns Danny has seen across clients. Name the patterns. Cite specific notes with [[Note Title]]. Use concrete moments, named clients, actual numbers, actual quoted dialogue from sessions where possible.

## Specific examples from the vault
4–8 paragraphs. Concrete moments from real notes. For each example: what was said, what changed, what was the result. Cite [[Note Title]] for every example. Quote real dialogue.

## Scripts and exact phrases
The actual language Danny uses or has clients use. Quote real lines. 4–8 specific phrases or scripts.

## Common mistakes
3–6 paragraphs or labelled points. The specific ways people get this wrong. Concrete. Named examples from the vault.

## The contrarian read
2–4 paragraphs. Where Danny disagrees with conventional wisdom. The hot take.

## What it looks like when it's working
2–4 paragraphs. Observable signals. Numbers if possible. The before/after.

## Related categories
2–5 bullet cross-references, format: [[slug|Title]] with a one-line note on why it connects.

VOICE RULES (non-negotiable):
- ONE SENTENCE PER PARAGRAPH (Taki Moore). Blank line between.
- Plain English. 14-year-old should follow it.
- No em dashes (—). Period or comma instead.
- No AI-slop phrases from MASTER §7.
- Use names, numbers, dates, specifics.
- Sound like Danny on a real call.

CITATION RULES:
- Every section using vault material must cite [[Note Title]].
- Use the EXACT title (not paraphrase).
- Citations weave into prose.

WHEN VAULT MATERIAL IS THIN:
- Write what you can in 1–2 sentences and add: _Sparse vault material on this aspect — add more notes to deepen._
- Do NOT pad with generic AI-style "general best practices."

OUTPUT FORMAT:
- Pure markdown. Start with ## (not # — file already has a title).
- No preamble.

MASTER PROMPT (apply throughout):

${master}`;

function userPromptFor(category, excerpts) {
  const excerptText = excerpts
    .map(
      (e, i) =>
        `--- EXCERPT ${i + 1} ---
Title: ${e.title}
Folder: ${e.folder}
Body:
${e.body.slice(0, MAX_NOTE_CHARS)}
`
    )
    .join("\n");

  return `CATEGORY: ${category.title}
MACRO: ${category.macroTitle}
DESCRIPTION: ${category.description}

Vault excerpts retrieved for this category (most relevant first, ${excerpts.length} total):

${excerptText}

Write the long-form entry for "${category.title}" now. Target 2,000–3,000 words. Use the 9 required section headings in order. Pure markdown, no preamble.`;
}

/* ---------- Taxonomy loader (mirrors synchronous script) ----------------- */

async function loadTaxonomy() {
  const knowledgeRoot = path.join(process.env.VAULT_PATH, "_ai-danny", "knowledge");
  const macros = (await fs.readdir(knowledgeRoot, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && /^\d{2}-/.test(d.name))
    .map((d) => d.name)
    .sort();

  const taxonomy = [];
  for (const macroDir of macros) {
    if (macroFilter && !macroDir.startsWith(macroFilter)) continue;
    const macroPath = path.join(knowledgeRoot, macroDir);
    const files = (await fs.readdir(macroPath))
      .filter((f) => f.endsWith(".md") && f !== "_README.md")
      .sort();
    for (const f of files) {
      const fp = path.join(macroPath, f);
      const raw = await fs.readFile(fp, "utf8");
      const titleMatch = raw.match(/^title:\s*"?([^"\n]+)"?$/m);
      const descMatch = raw.match(/^description:\s*"?([^"\n]+)"?$/m);
      const macroTitleMatch = raw.match(/^macro:\s*"?([^"\n]+)"?$/m);
      const slug = f.replace(/\.md$/, "");
      taxonomy.push({
        slug,
        title: titleMatch?.[1] || slug,
        description: descMatch?.[1] || "",
        macroTitle: macroTitleMatch?.[1] || macroDir,
        macroDir,
        filePath: fp,
      });
    }
  }
  return taxonomy;
}

/* ---------- File write between DANNY markers (same logic) ---------------- */

async function writeIntoFile(filePath, content, sources) {
  let txt;
  try {
    txt = await fs.readFile(filePath, "utf8");
  } catch {
    return false;
  }
  const sourceList =
    sources.length > 0
      ? `\n\n## Source notes\n\n${sources.map((s) => `- [[${s}]]`).join("\n")}\n`
      : "";

  const fullContent = `${content}${sourceList}`;
  const marker = /(<!--::DANNY-DISTILL-START::-->)[\s\S]*?(<!--::DANNY-DISTILL-END::-->)/;
  const replaced = marker.test(txt)
    ? txt.replace(marker, `$1\n\n${fullContent}\n\n$2`)
    : txt + `\n\n<!--::DANNY-DISTILL-START::-->\n\n${fullContent}\n\n<!--::DANNY-DISTILL-END::-->\n`;

  const stamped = replaced
    .replace(/^status:.*$/m, "status: distilled")
    .replace(/^last_distilled:.*$/m, `last_distilled: ${new Date().toISOString()}`);

  await fs.writeFile(filePath, stamped);
  return true;
}

/* ========================================================================
 * SUBMIT — build all 266 requests and POST to /v1/messages/batches
 * ====================================================================== */

async function cmdSubmit() {
  // Sanity check dev server
  try {
    const ping = await fetch(`${APP_URL}/api/brain/reindex`);
    if (!ping.ok) throw new Error(`HTTP ${ping.status}`);
  } catch {
    console.error("\n❌ Dev server at http://localhost:3000 is not responding.");
    console.error("   Start it with `npx next dev` and re-run.\n");
    process.exit(1);
  }

  const master = await loadMaster();
  const taxonomy = await loadTaxonomy();
  console.log(`\nBuilding ${taxonomy.length} batch requests…`);

  // Build requests with concurrency (search/note fetches against local dev server)
  // Resume-safe: snapshot built requests so we can recover after a transient failure.
  const buildSnapshotPath = path.join(__dirname, ".distill-batch-build.json");
  const prior = await readJson(buildSnapshotPath);
  const requests = prior?.requests || [];
  const sourcesByCustomId = prior?.sourcesByCustomId || {};
  const failedCats = prior?.failedCats || [];
  const builtCustomIds = new Set(requests.map((r) => r.custom_id));

  const CONCURRENCY = 3;
  let done = 0;
  const start = Date.now();
  // Anthropic batch requires custom_id ≤ 64 chars. Use short numeric IDs.
  // We track the mapping back to the file in customIdToCat in state.
  const customIdFor = (idx) => `r${String(idx).padStart(4, "0")}`;
  const pending = taxonomy
    .map((c, idx) => ({ ...c, customId: customIdFor(idx) }))
    .filter((c) => !builtCustomIds.has(c.customId));
  if (prior) {
    console.log(`  resuming from snapshot — ${requests.length} already built, ${pending.length} remaining`);
  }
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (cat) => {
        try {
          const hits = await searchBrain(`${cat.title}. ${cat.description}`, TOP_HITS);
          if (hits.length === 0) {
            failedCats.push({ slug: cat.slug, reason: "no search hits" });
            return;
          }
          const top = hits.slice(0, FULL_NOTES_PER_CAT);
          const full = (await Promise.all(top.map((h) => readNote(h.title)))).filter(Boolean);
          if (full.length === 0) {
            failedCats.push({ slug: cat.slug, reason: "no full bodies loaded" });
            return;
          }
          const customId = cat.customId;
          sourcesByCustomId[customId] = full.map((n) => n.title);
          requests.push({
            custom_id: customId,
            params: {
              model: MODEL,
              max_tokens: MAX_OUTPUT_TOKENS,
              system: SYNTH_SYSTEM(master),
              messages: [{ role: "user", content: userPromptFor(cat, full) }],
            },
          });
        } catch (err) {
          failedCats.push({
            slug: cat.slug,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
        done++;
      })
    );
    process.stdout.write(`\r  prepared ${requests.length}/${taxonomy.length}`);
    // Snapshot after every batch so we can resume on crash
    await writeJson(buildSnapshotPath, { requests, sourcesByCustomId, failedCats });
  }
  process.stdout.write(`\n  done in ${fmtDuration(Date.now() - start)}\n\n`);

  if (failedCats.length > 0) {
    console.warn(`⚠ Skipping ${failedCats.length} categories that had no source material:`);
    for (const f of failedCats.slice(0, 5)) console.warn(`    - ${f.slug}: ${f.reason}`);
    if (failedCats.length > 5) console.warn(`    + ${failedCats.length - 5} more`);
  }

  console.log(`Submitting ${requests.length} requests to Anthropic Batch API…`);
  const submitStart = Date.now();
  // Long-running upload — use 5 min timeout + retry
  async function submitWithRetry(attempts = 5) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
      try {
        const ctrl = new AbortController();
        const timeoutId = setTimeout(() => ctrl.abort(), 300_000);
        const res = await fetch(`${ANTHROPIC_URL}/messages/batches`, {
          method: "POST",
          headers: anthropicHeaders(),
          body: JSON.stringify({ requests }),
          signal: ctrl.signal,
        });
        clearTimeout(timeoutId);
        return res;
      } catch (err) {
        lastErr = err;
        const backoff = 2000 * (i + 1);
        console.warn(
          `  retry ${i + 1}/${attempts} after ${backoff}ms (${err?.code || err?.message || err})`
        );
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
    throw lastErr;
  }
  const res = await submitWithRetry();
  if (!res.ok) {
    const body = await res.text();
    console.error(`\n❌ Batch submission failed: ${res.status}\n${body.slice(0, 800)}`);
    process.exit(1);
  }
  const j = await res.json();

  // Build a mapping from custom_id → file path for the apply step
  const customIdToCat = {};
  taxonomy.forEach((cat, idx) => {
    customIdToCat[customIdFor(idx)] = {
      filePath: cat.filePath,
      slug: cat.slug,
      macroDir: cat.macroDir,
    };
  });

  const state = {
    batchId: j.id,
    submittedAt: new Date().toISOString(),
    requestCount: requests.length,
    failedCats,
    sourcesByCustomId,
    customIdToCat,
    status: j.processing_status,
    processingTookMs: Date.now() - submitStart,
  };
  await writeJson(BATCH_STATE, state);

  console.log(`\n✓ Batch submitted in ${fmtDuration(Date.now() - submitStart)}`);
  console.log(`  Batch ID:   ${j.id}`);
  console.log(`  Requests:   ${requests.length}`);
  console.log(`  Status:     ${j.processing_status}`);
  console.log(`  State file: ${path.relative(PROJECT_ROOT, BATCH_STATE)}`);
  console.log(`\nNext: 'node scripts/distill-batch.mjs status' or 'apply' when ready.`);
  console.log(`Estimated wait: anywhere from minutes to a few hours.`);
}

/* ========================================================================
 * STATUS — poll the batch and report
 * ====================================================================== */

async function fetchBatchStatus(batchId) {
  const res = await fetch(`${ANTHROPIC_URL}/messages/batches/${batchId}`, {
    headers: anthropicHeaders(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`status failed: ${res.status} ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function cmdStatus(quiet = false) {
  const state = await readJson(BATCH_STATE);
  if (!state?.batchId) {
    console.error("No batch in state. Run `submit` first.");
    process.exit(1);
  }
  const info = await fetchBatchStatus(state.batchId);
  if (!quiet) {
    const counts = info.request_counts;
    console.log(`\nBatch: ${info.id}`);
    console.log(`  Status:     ${info.processing_status}`);
    console.log(`  Created:    ${info.created_at}`);
    console.log(`  Ended:      ${info.ended_at ?? "—"}`);
    console.log(`  Processing: ${counts.processing}`);
    console.log(`  Succeeded:  ${counts.succeeded}`);
    console.log(`  Errored:    ${counts.errored}`);
    console.log(`  Cancelled:  ${counts.canceled}`);
    console.log(`  Expired:    ${counts.expired}`);
    if (info.processing_status === "ended") {
      console.log(`\n✓ Batch ended. Run 'apply' to write results into the vault.`);
    } else {
      console.log(`\nStill processing. Poll again later, or run 'run' to wait + apply.`);
    }
  }
  return info;
}

/* ========================================================================
 * APPLY — fetch results JSONL, write content into .md files
 * ====================================================================== */

async function cmdApply() {
  const state = await readJson(BATCH_STATE);
  if (!state?.batchId) {
    console.error("No batch in state. Run `submit` first.");
    process.exit(1);
  }
  const info = await fetchBatchStatus(state.batchId);
  if (info.processing_status !== "ended") {
    console.error(
      `Batch not yet ended (status: ${info.processing_status}). Run 'status' or wait.`
    );
    process.exit(1);
  }

  const resultsUrl = info.results_url;
  if (!resultsUrl) {
    console.error("No results_url on the batch. Cannot apply.");
    process.exit(1);
  }

  console.log(`\nFetching results from ${resultsUrl}…`);
  const res = await fetch(resultsUrl, { headers: anthropicHeaders() });
  if (!res.ok) {
    console.error(`Results fetch failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const text = await res.text();
  const lines = text.split("\n").filter(Boolean);
  console.log(`  ${lines.length} result lines\n`);

  let written = 0;
  let failed = 0;
  for (const line of lines) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      failed++;
      continue;
    }
    const customId = parsed.custom_id;
    const cat = state.customIdToCat[customId];
    if (!cat) {
      console.warn(`  ! no mapping for custom_id ${customId}`);
      failed++;
      continue;
    }
    const result = parsed.result;
    if (!result || result.type !== "succeeded" || !result.message) {
      console.warn(`  ! ${cat.slug} → ${result?.type || "unknown"}`);
      failed++;
      continue;
    }
    const block = result.message.content?.find((c) => c.type === "text");
    const body = block?.text?.trim() || "";
    if (!body) {
      failed++;
      continue;
    }
    const sources = state.sourcesByCustomId[customId] || [];
    const ok = await writeIntoFile(cat.filePath, body, sources);
    if (ok) written++;
    else failed++;
  }

  console.log(`\n✓ Wrote ${written} files`);
  if (failed > 0) console.log(`✗ Failed ${failed}`);
  state.applied = {
    at: new Date().toISOString(),
    written,
    failed,
  };
  await writeJson(BATCH_STATE, state);
}

/* ========================================================================
 * RUN — submit + poll + apply in one go
 * ====================================================================== */

async function cmdRun() {
  // If a batch is already in flight, skip submit
  const existing = await readJson(BATCH_STATE);
  if (!existing?.batchId) {
    await cmdSubmit();
  } else {
    console.log(`Resuming existing batch: ${existing.batchId}`);
  }
  // Poll
  console.log(`\nPolling every ${POLL_INTERVAL_MS / 1000}s…`);
  const startedPoll = Date.now();
  while (true) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const info = await cmdStatus(true);
    const c = info.request_counts;
    const total = c.processing + c.succeeded + c.errored + c.canceled + c.expired;
    const done = c.succeeded + c.errored + c.canceled + c.expired;
    const elapsed = fmtDuration(Date.now() - startedPoll);
    process.stdout.write(
      `\r  [${info.processing_status}] ${done}/${total} (succ:${c.succeeded} err:${c.errored}) · ${elapsed} elapsed`
    );
    if (info.processing_status === "ended") {
      process.stdout.write("\n\n");
      break;
    }
  }
  await cmdApply();
}

/* ========================================================================
 * Main
 * ====================================================================== */

async function main() {
  await loadEnv();
  switch (command) {
    case "submit":
      await cmdSubmit();
      break;
    case "status":
      await cmdStatus();
      break;
    case "apply":
      await cmdApply();
      break;
    case "run":
      await cmdRun();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error("Use: submit | status | apply | run");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("\nFatal:", err);
  process.exit(1);
});
