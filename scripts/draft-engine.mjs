#!/usr/bin/env node
/**
 * Content Draft Engine watcher.
 *
 * Watches <vault>/Queue/ for request files. When you drop a markdown file
 * (e.g. `draft-linkedin-pricing.md`), it reads the request, calls
 * /api/draft/generate (which pulls your voice rules / hooks / pillars / proof
 * from SQL + vault research and drafts in your voice), and the route writes the
 * finished draft to <vault>/Generated/. The processed request is moved to
 * Queue/_processed/ so it won't run twice.
 *
 * Request file formats (either works):
 *   A) filename only:  Queue/draft-pricing-objections.md   (topic = "pricing objections")
 *   B) with frontmatter for control:
 *        ---
 *        format: carousel      # linkedin | tweet | carousel | newsletter | reel | email
 *        platform: linkedin
 *        ---
 *        Any body text here becomes extra context / angle for the draft.
 *
 * Run once (process everything pending):   node scripts/draft-engine.mjs
 * Watch continuously (poll every 10s):     node scripts/draft-engine.mjs --watch
 *
 * Env (from .env.local): VAULT_PATH, APP_URL, CRON_SECRET.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(__filename), "..");

await loadDotEnvLocal();

const VAULT_PATH = process.env.VAULT_PATH;
const APP_URL = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
const CRON_SECRET = process.env.CRON_SECRET || "";
const WATCH = process.argv.includes("--watch");
const POLL_MS = Number(process.env.DRAFT_POLL_MS || 10000);

const QUEUE_DIR = path.join(VAULT_PATH || "", "Queue");
const PROCESSED_DIR = path.join(QUEUE_DIR, "_processed");

function log(...a) {
  console.log("[draft-engine]", ...a);
}

async function loadDotEnvLocal() {
  try {
    const raw = await fs.readFile(path.join(PROJECT_ROOT, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (!m || process.env[m[1]]) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  } catch {}
}

/** Tiny frontmatter parser → { data, body }. */
function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: raw.trim() };
  const data = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^\s*([\w-]+)\s*:\s*(.+?)\s*$/);
    if (kv) data[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  return { data, body: m[2].trim() };
}

function topicFromFilename(name) {
  return name
    .replace(/\.md$/i, "")
    .replace(/^draft[-_\s]*/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

async function listQueueFiles() {
  try {
    const entries = await fs.readdir(QUEUE_DIR, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".md") && !e.name.startsWith("_"))
      .map((e) => path.join(QUEUE_DIR, e.name));
  } catch {
    return [];
  }
}

async function generate({ topic, format, platform, notes }) {
  const res = await fetch(`${APP_URL}/api/draft/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${CRON_SECRET}` },
    body: JSON.stringify({ topic, format, platform, notes, write: true }),
  });
  let j;
  try {
    j = await res.json();
  } catch {
    j = { ok: false, error: `non-json (${res.status})` };
  }
  return { status: res.status, body: j };
}

async function processFile(file) {
  const name = path.basename(file);
  const raw = await fs.readFile(file, "utf8");
  const { data, body } = parseFrontmatter(raw);
  const topic = (data.topic || topicFromFilename(name)).trim();
  if (!topic) {
    log(`SKIP ${name} — could not derive a topic`);
    return;
  }
  const format = (data.format || "linkedin").toLowerCase();
  const platform = data.platform || format;
  log(`DRAFT "${topic}" (${format})…`);
  const { status, body: resp } = await generate({ topic, format, platform, notes: body });
  if (status === 200 && resp.ok) {
    log(
      `  → ${resp.writtenPath || "(returned, not written)"} ` +
        `[voice:${resp.sourcesUsed?.voiceRules} hooks:${resp.sourcesUsed?.hooks} ` +
        `pillars:${resp.sourcesUsed?.pillars} proof:${resp.sourcesUsed?.caseStudies}]`
    );
    // Move the request to _processed/
    await fs.mkdir(PROCESSED_DIR, { recursive: true });
    await fs.rename(file, path.join(PROCESSED_DIR, `${Date.now()}-${name}`)).catch(() => {});
  } else {
    log(`  → FAILED ${status}: ${resp.error || JSON.stringify(resp).slice(0, 160)}`);
  }
}

async function runOnce() {
  if (!VAULT_PATH) {
    console.error("VAULT_PATH not set");
    process.exit(1);
  }
  if (!CRON_SECRET) {
    console.error("CRON_SECRET not set");
    process.exit(1);
  }
  await fs.mkdir(QUEUE_DIR, { recursive: true });
  const files = await listQueueFiles();
  if (!files.length) {
    log(`Queue empty (${QUEUE_DIR})`);
    return;
  }
  log(`${files.length} request(s) in queue`);
  for (const f of files) {
    try {
      await processFile(f);
    } catch (err) {
      log(`ERROR ${path.basename(f)}: ${err.message}`);
    }
  }
}

async function main() {
  await runOnce();
  if (WATCH) {
    log(`Watching ${QUEUE_DIR} every ${POLL_MS / 1000}s (Ctrl+C to stop)…`);
    // Simple poll loop — robust across editors/Obsidian sync vs fs.watch quirks.
    setInterval(() => {
      runOnce().catch((e) => log("watch error:", e.message));
    }, POLL_MS);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
