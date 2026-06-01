#!/usr/bin/env node
/**
 * Phase B: Distill 1,492 vault notes into the 266-category knowledge map.
 *
 * Pipeline per category:
 *   1. Build a natural-language query from category title + description
 *   2. Hit /api/brain/search → top N hits (hybrid keyword + semantic)
 *   3. Hit /api/brain/note for the top 3 hits → full bodies
 *   4. Call Claude Sonnet via Vercel AI Gateway with:
 *        - MASTER prompt (Danny's voice)
 *        - Category metadata
 *        - Retrieved excerpts
 *   5. Write synthesis into the .md file between <!-- DANNY:START --> markers
 *
 * Resumable: progress saved to scripts/.distill-state.json — re-run picks up
 * where it left off. Pass --restart to ignore state.
 *
 * Usage:
 *   node scripts/distill-knowledge.mjs              # run all categories
 *   node scripts/distill-knowledge.mjs --limit 5    # do first 5 (testing)
 *   node scripts/distill-knowledge.mjs --restart    # ignore prior progress
 *   node scripts/distill-knowledge.mjs --macro 06   # only one macro folder
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const STATE_PATH = path.join(__dirname, ".distill-state.json");

const APP_URL = "http://localhost:3000";
// Anthropic direct accepts versioned model IDs. Sonnet 4.5 is the latest GA model.
const MODEL = "claude-sonnet-4-5-20250929";
const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1";
const CONCURRENCY = 4;
const TOP_HITS = 12;
const FULL_NOTES_PER_CAT = 8;
const MAX_NOTE_CHARS = 6000;
const MAX_OUTPUT_TOKENS = 5000;

/* ----- env loader ---------------------------------------------------------- */

async function loadEnv() {
  try {
    const txt = await fs.readFile(path.join(PROJECT_ROOT, ".env.local"), "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}

/* ----- CLI args ------------------------------------------------------------ */

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}
const limit = Number(flag("--limit")) || Infinity;
const restart = args.includes("--restart");
const macroFilter = flag("--macro");

/* ----- file I/O helpers ---------------------------------------------------- */

async function readJson(p, fallback) {
  try {
    return JSON.parse(await fs.readFile(p, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(p, data) {
  await fs.writeFile(p, JSON.stringify(data, null, 2));
}

function progressBar(done, total) {
  const pct = total === 0 ? 0 : Math.floor((done / total) * 100);
  const w = 36;
  const filled = Math.floor((done / total) * w);
  return `[${"█".repeat(filled)}${"░".repeat(w - filled)}] ${done}/${total} (${pct}%)`;
}

/* ----- API helpers --------------------------------------------------------- */

async function searchBrain(query, lim = TOP_HITS) {
  const res = await fetch(`${APP_URL}/api/brain/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit: lim }),
  });
  if (!res.ok) throw new Error(`search failed: ${res.status} ${await res.text()}`);
  const j = await res.json();
  return j.results || [];
}

async function readNote(title) {
  const res = await fetch(`${APP_URL}/api/brain/note?title=${encodeURIComponent(title)}`);
  if (!res.ok) return null;
  const j = await res.json();
  return j.found ? j : null;
}

/* ----- Claude call via Vercel AI Gateway ----------------------------------- */

async function callClaude(systemPrompt, userPrompt, attempt = 1) {
  // Prefer DIRECT Anthropic — bills against the user's Anthropic account, no Vercel routing.
  // Fall back to gateway only if no direct key is set.
  const directKey = process.env.ANTHROPIC_API_KEY;
  const gatewayKey = process.env.AI_GATEWAY_API_KEY;
  if (!directKey && !gatewayKey) {
    throw new Error("No ANTHROPIC_API_KEY or AI_GATEWAY_API_KEY in .env.local");
  }
  const useDirect = !!directKey;
  const baseUrl = useDirect ? "https://api.anthropic.com/v1" : GATEWAY_URL;
  const key = useDirect ? directKey : gatewayKey;
  const url = `${baseUrl}/messages`;
  const headers = useDirect
    ? { "x-api-key": key, "Content-Type": "application/json", "anthropic-version": "2023-06-01" }
    : { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "anthropic-version": "2023-06-01" };
  // Anthropic direct uses bare model IDs; gateway uses provider/model format.
  const directModel = MODEL.startsWith("anthropic/") ? MODEL.slice("anthropic/".length) : MODEL;
  const modelId = useDirect ? directModel : MODEL;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: modelId,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      // Retry on 429 (rate limit) and 5xx
      if ((res.status === 429 || res.status >= 500) && attempt < 4) {
        const delay = 1500 * attempt;
        console.error(`  → ${res.status}, retrying in ${delay}ms (attempt ${attempt})`);
        await sleep(delay);
        return callClaude(systemPrompt, userPrompt, attempt + 1);
      }
      throw new Error(`Claude ${res.status}: ${body.slice(0, 300)}`);
    }
    const j = await res.json();
    const block = j.content?.find?.((c) => c.type === "text");
    return block?.text || "";
  } catch (err) {
    if (attempt < 3) {
      await sleep(1500 * attempt);
      return callClaude(systemPrompt, userPrompt, attempt + 1);
    }
    throw err;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ----- Master prompt loader ------------------------------------------------ */

async function loadMaster() {
  const masterPath = path.join(
    process.env.VAULT_PATH,
    "_ai-danny",
    "MASTER.md"
  );
  try {
    return await fs.readFile(masterPath, "utf8");
  } catch {
    return "";
  }
}

/* ----- Distill one category ------------------------------------------------ */

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
1–2 paragraphs (3–5 sentences each). The thesis. The one belief that everything else flows from. Should land like a quotable line.

## Why this matters
3–5 paragraphs. The mechanism. The cost of getting this wrong. Who suffers when this principle isn't applied. The leverage of getting it right.

## How it shows up in client work
The biggest section. 6–10 paragraphs. Specific patterns Danny has seen across clients. Name the patterns. Cite specific notes with [[Note Title]]. Use concrete moments, named clients (use actual names from the vault), actual numbers, actual quoted dialogue from sessions where possible.

## Specific examples from the vault
4–8 paragraphs. Concrete moments from real notes. For each example: what was said, what changed, what was the result. Cite [[Note Title]] for every example. Where the vault has dialogue, quote it directly.

## Scripts and exact phrases
The actual language Danny uses or has clients use. Quote real lines. 4–8 specific phrases or scripts. Each one bullet or labelled.

## Common mistakes
3–6 paragraphs or labelled points. The specific ways people get this wrong (clients, peers, Danny himself in past). Be concrete. Use named examples from the vault.

## The contrarian read
2–4 paragraphs. Where Danny disagrees with conventional wisdom on this topic. The hot take. The thing nobody else will say.

## What it looks like when it's working
2–4 paragraphs. Observable signals. Numbers if possible. The before/after.

## Related categories
2–5 bullet cross-references to other categories in the knowledge map, format: [[slug|Title]] with a one-line note on why it connects.

VOICE RULES (non-negotiable — apply to EVERY paragraph):
- ONE SENTENCE PER PARAGRAPH (Taki Moore). Each line stands alone, separated by a blank line.
- Plain English. A sharp 14-year-old should follow it. No corporate jargon.
- No em dashes (—). Period or comma instead.
- No AI-slop phrases from the MASTER §7. Reject if you catch yourself.
- No hedging without commitment. "It depends" is fine ONLY if followed by what it depends on.
- Use names, numbers, dates, specifics. If you can't, you don't know enough yet.
- Sound like Danny on a real call to a real client, not like a textbook.

CITATION RULES:
- Every section that draws from the vault must cite at least one [[Note Title]].
- Use the EXACT title of the vault note (not a paraphrase).
- If a quote is from a note, attribute it: "as he told [[Client_Name]] in [[Session_Title]]: '…'"
- Citations weave into prose, never dumped at the end alone.

WHEN VAULT MATERIAL IS THIN:
- Better to write a strong, short section honestly than fake depth.
- For any section where the excerpts don't support 2-4 paragraphs, write what you can in 1-2 sentences and add: _Sparse vault material on this aspect — add more notes to deepen._
- Do NOT pad with generic AI-style "general best practices."

OUTPUT FORMAT:
- Pure markdown. Start with ## (not # — the file already has a title).
- No preamble. No "Here is the section." Just deliver.
- The output goes between <!--::DANNY-DISTILL-START::--> and <!--::DANNY-DISTILL-END::--> markers in an existing file.

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

async function distillCategory(category, master) {
  // 1. Build the query
  const query = `${category.title}. ${category.description}`;
  const hits = await searchBrain(query, TOP_HITS);
  if (hits.length === 0) {
    return {
      content: `_No vault notes surfaced for this category. Add content related to "${category.title}" and re-run distillation._`,
      sources: [],
    };
  }

  // 2. Fetch full bodies for the top N
  const topHits = hits.slice(0, FULL_NOTES_PER_CAT);
  const fullNotes = (await Promise.all(topHits.map((h) => readNote(h.title)))).filter(Boolean);
  if (fullNotes.length === 0) {
    return {
      content: `_Search found hits but couldn't load bodies for "${category.title}"._`,
      sources: hits.map((h) => h.title),
    };
  }

  // 3. Synthesize
  const synthesis = await callClaude(
    SYNTH_SYSTEM(master),
    userPromptFor(category, fullNotes)
  );

  return { content: synthesis.trim(), sources: fullNotes.map((n) => n.title) };
}

/* ----- File write between DANNY markers ------------------------------------ */

async function writeIntoFile(filePath, content, sources) {
  let txt;
  try {
    txt = await fs.readFile(filePath, "utf8");
  } catch (err) {
    console.error(`  ! file missing: ${filePath}`);
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

  // Update status frontmatter
  const stamped = replaced
    .replace(/^status:.*$/m, "status: distilled")
    .replace(/^last_distilled:.*$/m, `last_distilled: ${new Date().toISOString()}`);

  await fs.writeFile(filePath, stamped);
  return true;
}

/* ----- Taxonomy loader (mirrors scaffold-knowledge.mjs) -------------------- */

async function loadTaxonomy() {
  const knowledgeRoot = path.join(process.env.VAULT_PATH, "_ai-danny", "knowledge");
  const macros = (await fs.readdir(knowledgeRoot, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
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

/* ----- Main ---------------------------------------------------------------- */

async function main() {
  await loadEnv();
  if (!process.env.VAULT_PATH) {
    console.error("VAULT_PATH not set in .env.local");
    process.exit(1);
  }

  // 1. Confirm dev server is up
  try {
    const ping = await fetch(`${APP_URL}/api/brain/reindex`);
    if (!ping.ok) throw new Error(`HTTP ${ping.status}`);
  } catch (err) {
    console.error("\n❌ The dev server at http://localhost:3000 is not responding.");
    console.error("   Start it with `pnpm dev` (or `npx next dev`) and re-run.\n");
    process.exit(1);
  }

  const master = await loadMaster();
  if (!master) {
    console.warn("⚠ MASTER.md not found — synthesis will lack voice context");
  }

  const taxonomy = await loadTaxonomy();
  const state = restart ? {} : await readJson(STATE_PATH, {});

  const pending = taxonomy.filter((c) => !state[c.slug]).slice(0, limit);
  const totalToRun = pending.length;
  console.log(`\nDistilling ${totalToRun} categories (${taxonomy.length - totalToRun} already done).`);
  const provider = process.env.ANTHROPIC_API_KEY
    ? "Anthropic direct (billed to your Anthropic account)"
    : "Vercel AI Gateway";
  console.log(`Model: ${MODEL} · ${provider}`);
  console.log(`Concurrency: ${CONCURRENCY}  ·  Top hits/cat: ${TOP_HITS}  ·  Full notes/cat: ${FULL_NOTES_PER_CAT}\n`);

  let done = 0;
  const startedAt = Date.now();

  // Process in batches of CONCURRENCY
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (cat) => {
        const t0 = Date.now();
        try {
          const { content, sources } = await distillCategory(cat, master);
          const ok = await writeIntoFile(cat.filePath, content, sources);
          state[cat.slug] = {
            distilledAt: new Date().toISOString(),
            sources,
            tookMs: Date.now() - t0,
            ok,
          };
        } catch (err) {
          state[cat.slug] = {
            failedAt: new Date().toISOString(),
            error: err instanceof Error ? err.message : String(err),
          };
          console.error(`  ✗ ${cat.slug}: ${err.message?.slice(0, 100) || err}`);
        }
        done++;
        const elapsed = (Date.now() - startedAt) / 1000;
        const rate = done / elapsed;
        const eta = rate > 0 ? Math.ceil((totalToRun - done) / rate) : 0;
        process.stdout.write(
          `\r${progressBar(done, totalToRun)}  eta ${eta}s  · ${cat.macroDir}/${cat.slug.slice(0, 32).padEnd(32)}`
        );
      })
    );
    // Snapshot progress after every batch
    await writeJson(STATE_PATH, state);
  }

  console.log("\n");
  const succeeded = Object.values(state).filter((s) => s.ok).length;
  const failed = Object.values(state).filter((s) => s.error).length;
  const totalSecs = Math.ceil((Date.now() - startedAt) / 1000);
  console.log(`Done in ${totalSecs}s.`);
  console.log(`  Succeeded: ${succeeded}`);
  console.log(`  Failed:    ${failed}`);
  console.log(`\nState saved to ${path.relative(PROJECT_ROOT, STATE_PATH)}`);
  console.log(`Re-run anytime — completed categories are skipped.`);
}

main().catch((err) => {
  console.error("\n\nFatal:", err);
  process.exit(1);
});
