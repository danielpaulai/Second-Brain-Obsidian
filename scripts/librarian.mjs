#!/usr/bin/env node
/**
 * Librarian — self-maintaining vault→SQL sync agent.
 *
 * Runs nightly (via launchd or /api/cron/librarian). Detects which vault
 * files changed since the last run, determines the minimum set of SQL tables
 * to re-distill, spawns distill-to-sql for only those tables, backfills any
 * new meeting notes via backfill-structured, and proposes MASTER.md additions
 * when new insights are found in meeting notes.
 *
 * State file: <project>/.librarian-state.json
 * Proposals:  <vault>/_ai-danny/MASTER-proposals.md  (append-only)
 *
 * Usage:
 *   node scripts/librarian.mjs               # run since last checkpoint
 *   node scripts/librarian.mjs --since=2026-06-01   # override checkpoint date
 *   node scripts/librarian.mjs --force       # re-distill ALL tables regardless
 *   node scripts/librarian.mjs --dry-run     # print plan, no writes
 *   node scripts/librarian.mjs --no-propose  # skip MASTER.md proposal step
 *
 * Env (.env.local): ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL,
 *   SUPABASE_SERVICE_ROLE_KEY, OWNER_EMAIL, VAULT_PATH.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const SCRIPTS_DIR = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(SCRIPTS_DIR, "..");
const STATE_FILE = path.join(PROJECT_ROOT, ".librarian-state.json");

await loadDotEnvLocal();

const VAULT_PATH = process.env.VAULT_PATH;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.DISTILL_MODEL || "claude-sonnet-4-6";

const ARGS = process.argv.slice(2);
const FORCE = ARGS.includes("--force");
const DRY_RUN = ARGS.includes("--dry-run");
const NO_PROPOSE = ARGS.includes("--no-propose");
const SINCE_ARG = (ARGS.find((a) => a.startsWith("--since=")) || "").replace("--since=", "");

function log(...a) {
  console.log("[librarian]", ...a);
}

/* ─────────────────────── env loading ─────────────────────── */

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

/* ─────────────────────── state file ─────────────────────── */

async function loadState() {
  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return { lastRun: null, lastMeetingFiles: [] };
  }
}

async function saveState(state) {
  if (DRY_RUN) return;
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

/* ─────────────────────── vault file walking ─────────────────────── */

async function walkMd(dir, out = []) {
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walkMd(full, out);
    else if (e.isFile() && e.name.endsWith(".md")) out.push(full);
  }
  return out;
}

async function getMtime(p) {
  try {
    const s = await fs.stat(p);
    return s.mtime;
  } catch {
    return null;
  }
}

/* ─────────────────────── change detection ─────────────────────── */

const IDENTITY_DIR = path.join(VAULT_PATH || "", "_ai-danny");
const CORE_FILES = ["MASTER.md", "voice.md", "positioning.md", "icp.md", "frameworks.md", "do-not-say.md"];

// Which tables each core identity file affects
const CORE_FILE_TABLES = {
  "MASTER.md": null, // null = all tables
  "voice.md": ["voice_rules", "signature_phrases", "tone_profiles", "personality_traits"],
  "positioning.md": ["offers", "icp_segments", "content_pillars", "hooks"],
  "icp.md": ["icp_segments", "client_problems", "content_pillars"],
  "frameworks.md": ["frameworks", "decision_rules"],
  "do-not-say.md": ["voice_rules", "signature_phrases"],
};

const ALL_TABLES = [
  // core tier
  "voice_rules", "tone_profiles", "personality_traits", "principles", "signature_phrases",
  // full tier
  "offers", "offer_objections", "case_studies", "icp_segments", "client_problems",
  "solutions", "common_issues", "frameworks", "decision_rules", "content_pillars", "hooks",
  // stories tier
  "stories",
];

const FULL_TIER = ["offers", "offer_objections", "case_studies", "icp_segments", "client_problems",
  "solutions", "common_issues", "frameworks", "decision_rules", "content_pillars", "hooks"];
const CORE_TIER = ["voice_rules", "tone_profiles", "personality_traits", "principles", "signature_phrases"];

async function findChangedFiles(since) {
  const changedCore = [];
  const changedKnowledge = [];
  const changedMeetings = [];

  // Check core identity files
  for (const f of CORE_FILES) {
    const full = path.join(IDENTITY_DIR, f);
    const mtime = await getMtime(full);
    if (mtime && mtime > since) changedCore.push(f);
  }

  // Check knowledge/* files
  const knowledgeDir = path.join(IDENTITY_DIR, "knowledge");
  const kFiles = await walkMd(knowledgeDir);
  for (const f of kFiles) {
    const mtime = await getMtime(f);
    if (mtime && mtime > since) changedKnowledge.push(f);
  }

  // Check Meetings/* files
  const meetingsDir = path.join(VAULT_PATH, "Meetings");
  const mFiles = await walkMd(meetingsDir);
  for (const f of mFiles) {
    const mtime = await getMtime(f);
    if (mtime && mtime > since) changedMeetings.push(f);
  }

  return { changedCore, changedKnowledge, changedMeetings };
}

function getAffectedTables(changedCore, changedKnowledge, changedMeetings) {
  const tables = new Set();

  for (const f of changedCore) {
    const affected = CORE_FILE_TABLES[f];
    if (affected === null) {
      // MASTER.md changed — rebuild everything
      ALL_TABLES.forEach((t) => tables.add(t));
      return [...tables];
    }
    if (affected) affected.forEach((t) => tables.add(t));
  }

  // Any knowledge/* change → re-run all full-tier + stories (they all use fullCorpus or storiesCorpus)
  if (changedKnowledge.length > 0) {
    FULL_TIER.forEach((t) => tables.add(t));
    tables.add("stories");
  }

  // Any meetings change → re-run stories + case_studies (meetings feed these)
  if (changedMeetings.length > 0) {
    tables.add("stories");
    tables.add("case_studies");
  }

  return [...tables];
}

/* ─────────────────────── child process runners ─────────────────────── */

async function runDistill(tables) {
  if (!tables.length) {
    log("No tables to distill.");
    return { ok: true, skipped: true };
  }
  const only = tables.join(",");
  log(`Running distill-to-sql --force --only=${only}`);
  if (DRY_RUN) {
    log("[DRY RUN] would spawn: node scripts/distill-to-sql.mjs --force --only=" + only);
    return { ok: true, dryRun: true };
  }
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [path.join(SCRIPTS_DIR, "distill-to-sql.mjs"), "--force", `--only=${only}`],
      { cwd: PROJECT_ROOT, timeout: 10 * 60 * 1000 } // 10 min
    );
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
    return { ok: true };
  } catch (err) {
    log("distill-to-sql error:", err.message);
    return { ok: false, error: err.message };
  }
}

async function runBackfill() {
  log("Running backfill-structured for new meeting notes…");
  if (DRY_RUN) {
    log("[DRY RUN] would spawn: node scripts/backfill-structured.mjs");
    return { ok: true, dryRun: true };
  }
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [path.join(SCRIPTS_DIR, "backfill-structured.mjs")],
      { cwd: PROJECT_ROOT, timeout: 10 * 60 * 1000 }
    );
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
    return { ok: true };
  } catch (err) {
    log("backfill-structured error:", err.message);
    return { ok: false, error: err.message };
  }
}

/* ─────────────────────── MASTER.md proposal ─────────────────────── */

async function proposeEdits(newMeetingFiles) {
  if (!ANTHROPIC_API_KEY) {
    log("ANTHROPIC_API_KEY not set — skipping proposals.");
    return null;
  }
  if (!newMeetingFiles.length) return null;

  // Read the new meeting notes
  const meetingParts = [];
  for (const f of newMeetingFiles.slice(0, 8)) { // cap at 8 to avoid token explosion
    const txt = await fs.readFile(f, "utf8").catch(() => "");
    if (!txt) continue;
    const name = path.basename(f, ".md");
    meetingParts.push(`### ${name}\n${txt.trim().slice(0, 3000)}`);
  }
  if (!meetingParts.length) return null;

  // Read current MASTER.md for context
  const masterPath = path.join(IDENTITY_DIR, "MASTER.md");
  const master = await fs.readFile(masterPath, "utf8").catch(() => "");

  const prompt = `You are the librarian for Daniel Paul's second brain.

You just ingested ${newMeetingFiles.length} new meeting note(s). Your job is to identify any NEW insights, patterns, or facts that should be added to MASTER.md, but are not currently there.

CURRENT MASTER.md (first 8000 chars):
${master.slice(0, 8000)}

NEW MEETING NOTES:
${meetingParts.join("\n\n")}

Output a short markdown block (max 400 words) of PROPOSED ADDITIONS to MASTER.md. Format as:

## Proposed MASTER.md additions — ${new Date().toISOString().slice(0, 10)}

For each proposal:
- **Section**: which section of MASTER.md this belongs in
- **Proposed text**: the exact text to add
- **Why**: one sentence why this is worth adding

If there's nothing new worth adding, output only: "No new additions suggested."`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}`);
    const j = await res.json();
    return j.content?.find?.((c) => c.type === "text")?.text || null;
  } catch (err) {
    log("proposal error:", err.message);
    return null;
  }
}

async function appendProposals(text) {
  if (!text || text.trim() === "No new additions suggested.") return;
  const proposalsPath = path.join(IDENTITY_DIR, "MASTER-proposals.md");
  if (DRY_RUN) {
    log("[DRY RUN] would append to MASTER-proposals.md:\n" + text.slice(0, 200) + "…");
    return;
  }
  const sep = "\n\n---\n\n";
  try {
    const existing = await fs.readFile(proposalsPath, "utf8").catch(() => "");
    await fs.writeFile(proposalsPath, existing + sep + text, "utf8");
    log(`Proposals appended to MASTER-proposals.md`);
  } catch (err) {
    log("Failed to write proposals:", err.message);
  }
}

/* ─────────────────────── main ─────────────────────── */

async function main() {
  if (!VAULT_PATH) {
    console.error("[librarian] VAULT_PATH not set — aborting.");
    process.exit(1);
  }

  // Verify vault is accessible
  try {
    await fs.access(VAULT_PATH);
  } catch {
    console.error(`[librarian] Vault not accessible at ${VAULT_PATH}`);
    process.exit(1);
  }

  const startTime = Date.now();
  const now = new Date();

  const state = await loadState();
  let since;
  if (SINCE_ARG) {
    since = new Date(SINCE_ARG);
  } else if (FORCE) {
    since = new Date(0); // epoch = everything
  } else if (state.lastRun) {
    since = new Date(state.lastRun);
  } else {
    // First run: look back 24 hours
    since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  }

  log(`Checking vault for changes since ${since.toISOString()}`);
  if (DRY_RUN) log("DRY RUN mode — no writes will occur.");

  const { changedCore, changedKnowledge, changedMeetings } = await findChangedFiles(since);

  log(`Changed files: ${changedCore.length} core, ${changedKnowledge.length} knowledge, ${changedMeetings.length} meetings`);

  if (changedCore.length) log("  Core:", changedCore.join(", "));
  if (changedKnowledge.length) log("  Knowledge:", changedKnowledge.length + " files");
  if (changedMeetings.length) log("  Meetings:", changedMeetings.map((f) => path.basename(f)).join(", "));

  const hasChanges = changedCore.length + changedKnowledge.length + changedMeetings.length > 0;

  if (!hasChanges && !FORCE) {
    log("No vault changes detected. Nothing to do.");
    await saveState({ ...state, lastRun: now.toISOString() });
    return;
  }

  const tablesToRefresh = FORCE ? ALL_TABLES : getAffectedTables(changedCore, changedKnowledge, changedMeetings);
  log(`Tables to refresh: ${tablesToRefresh.join(", ") || "none"}`);

  // Step 1: Re-distill affected SQL tables
  const distillResult = await runDistill(tablesToRefresh);
  if (!distillResult.ok) log("⚠ distill-to-sql had errors — check output above.");

  // Step 2: Backfill new meetings into structured tables
  if (changedMeetings.length > 0) {
    const backfillResult = await runBackfill();
    if (!backfillResult.ok) log("⚠ backfill-structured had errors — check output above.");
  }

  // Step 3: Propose MASTER.md additions from new meeting insights
  if (!NO_PROPOSE && changedMeetings.length > 0) {
    log("Generating MASTER.md proposals from new meetings…");
    const proposals = await proposeEdits(changedMeetings);
    await appendProposals(proposals);
  }

  // Save state
  const allMeetingFiles = await walkMd(path.join(VAULT_PATH, "Meetings"));
  await saveState({
    lastRun: now.toISOString(),
    lastMeetingFiles: allMeetingFiles.map((f) => path.relative(VAULT_PATH, f)),
    lastChangeSummary: {
      coreFiles: changedCore,
      knowledgeFiles: changedKnowledge.length,
      meetingFiles: changedMeetings.map((f) => path.basename(f)),
      tablesRefreshed: tablesToRefresh,
    },
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`Done in ${elapsed}s.`);
}

main().catch((e) => {
  console.error("[librarian] Fatal:", e);
  process.exit(1);
});
