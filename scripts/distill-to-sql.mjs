#!/usr/bin/env node
/**
 * Distill the vault → the 17 identity/knowledge SQL tables (migration 0005).
 *
 * Reads what you already wrote — MASTER.md, voice.md, positioning.md, icp.md,
 * frameworks.md, do-not-say.md, and the 266 distilled knowledge categories —
 * and runs a focused LLM extraction PER TABLE that emits rows matching each
 * table's schema. Inserts them for the owner user via the Supabase service role.
 *
 * Safe to re-run: by default it SKIPS any table that already has rows for the
 * owner (so it won't duplicate or clobber edits). Pass --force to wipe + refill
 * a table, or --only=offers,voice_rules to target specific tables.
 *
 * Usage:
 *   node scripts/distill-to-sql.mjs                 # fill all empty tables
 *   node scripts/distill-to-sql.mjs --force         # wipe + refill ALL 17
 *   node scripts/distill-to-sql.mjs --only=offers,frameworks --force
 *
 * Env (from .env.local): ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL,
 *   SUPABASE_SERVICE_ROLE_KEY, OWNER_EMAIL, VAULT_PATH.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(__filename), "..");

await loadDotEnvLocal();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OWNER_EMAIL = process.env.OWNER_EMAIL;
const VAULT_PATH = process.env.VAULT_PATH;
const MODEL = process.env.DISTILL_MODEL || "claude-sonnet-4-6";

const ARGS = process.argv.slice(2);
const FORCE = ARGS.includes("--force");
const ONLY = (ARGS.find((a) => a.startsWith("--only=")) || "")
  .replace("--only=", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function log(...a) {
  console.log("[distill-sql]", ...a);
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

/* ----------------------------- corpus loading ---------------------------- */

const IDENTITY_DIR = path.join(VAULT_PATH || "", "_ai-danny");
const CORE_FILES = [
  "MASTER.md",
  "voice.md",
  "positioning.md",
  "icp.md",
  "frameworks.md",
  "do-not-say.md",
];

async function readIfExists(p) {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return "";
  }
}

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

let _core = null;
async function coreCorpus() {
  if (_core) return _core;
  const parts = [];
  for (const f of CORE_FILES) {
    const txt = await readIfExists(path.join(IDENTITY_DIR, f));
    if (txt) parts.push(`===== ${f} =====\n${txt.trim()}`);
  }
  _core = parts.join("\n\n").slice(0, 60_000);
  return _core;
}

let _full = null;
async function fullCorpus() {
  if (_full) return _full;
  const core = await coreCorpus();
  // Add distilled knowledge categories (lead chunk of each) as breadth.
  const knowledgeDir = path.join(IDENTITY_DIR, "knowledge");
  const files = await walkMd(knowledgeDir);
  const chunks = [];
  let total = 0;
  const CAP = 120_000;
  for (const f of files) {
    if (total >= CAP) break;
    const txt = await readIfExists(f);
    if (!txt) continue;
    const rel = path.relative(knowledgeDir, f).replace(/\.md$/, "");
    const lead = txt.trim().slice(0, 900);
    const chunk = `## ${rel}\n${lead}`;
    chunks.push(chunk);
    total += chunk.length;
  }
  _full = `${core}\n\n===== DISTILLED KNOWLEDGE CATEGORIES =====\n\n${chunks.join("\n\n")}`.slice(
    0,
    180_000
  );
  return _full;
}

/** Deep corpus for stories: full knowledge bodies (up to 4k chars each) + Meetings. */
let _stories = null;
async function storiesCorpus() {
  if (_stories) return _stories;
  const core = await coreCorpus();
  const parts = [core];
  let total = core.length;
  const CAP = 160_000;

  // Full knowledge category bodies (4000 chars each — stories are deeper than 900).
  const knowledgeDir = path.join(IDENTITY_DIR, "knowledge");
  const kFiles = await walkMd(knowledgeDir);
  const kChunks = [];
  for (const f of kFiles) {
    if (total >= CAP) break;
    const txt = await readIfExists(f);
    if (!txt) continue;
    const rel = path.relative(knowledgeDir, f).replace(/\.md$/, "");
    const body = txt.trim().slice(0, 4_000);
    const chunk = `## ${rel}\n${body}`;
    kChunks.push(chunk);
    total += chunk.length;
  }
  if (kChunks.length) parts.push(`===== KNOWLEDGE CATEGORIES (full bodies) =====\n\n${kChunks.join("\n\n")}`);

  // Meeting notes — anecdotes / real stories from calls.
  const meetingsDir = path.join(VAULT_PATH, "Meetings");
  const mFiles = await walkMd(meetingsDir);
  const mChunks = [];
  for (const f of mFiles) {
    if (total >= CAP) break;
    const txt = await readIfExists(f);
    if (!txt) continue;
    const name = path.basename(f, ".md");
    // Skip bot notes and pure transcripts — keep summaries.
    const body = txt.trim().slice(0, 3_000);
    const chunk = `### Meeting: ${name}\n${body}`;
    mChunks.push(chunk);
    total += chunk.length;
  }
  if (mChunks.length) parts.push(`===== MEETING NOTES (for story material) =====\n\n${mChunks.join("\n\n")}`);

  _stories = parts.join("\n\n").slice(0, 180_000);
  return _stories;
}

/* ----------------------------- table specs ------------------------------- */
// tier: which corpus to feed. arrays: fields that are text[] in Postgres.
// schema: compact column list shown to the model. guidance: extraction intent.

const TABLES = [
  {
    name: "offers",
    tier: "full",
    arrays: ["deliverables"],
    schema:
      "name, tagline, tier(entry|core|premium|enterprise), price(number|null), currency, billing(one_time|monthly|retainer), deliverables(array of strings), ideal_client, positioning, guarantee, status(active|draft), notes",
    guidance:
      "Every productized offer / package / service Daniel sells or has sold. One row per distinct offer. If price is unknown, null.",
    max: 20,
  },
  {
    name: "offer_objections",
    tier: "full",
    arrays: [],
    schema: "objection, rebuttal, category(price|trust|timing|fit|authority)",
    guidance:
      "Common objections prospects raise and exactly how Daniel rebuts each, in his voice. Leave offer linkage out.",
    max: 30,
  },
  {
    name: "case_studies",
    tier: "full",
    arrays: [],
    schema:
      "client_name, before_state, after_state, key_metric, result_value, quote, timeframe",
    guidance:
      "Client transformations / results Daniel can cite as proof. Only include ones grounded in the material.",
    max: 25,
  },
  {
    name: "icp_segments",
    tier: "full",
    arrays: ["pains", "desires", "disqualifiers"],
    schema:
      "name, description, pains(array), desires(array), where_to_find, disqualifiers(array)",
    guidance: "Ideal customer profiles / target segments Daniel serves.",
    max: 10,
  },
  {
    name: "client_problems",
    tier: "full",
    arrays: ["symptoms"],
    schema:
      "problem, domain(marketing|sales|ops|mindset|content|offer), symptoms(array), root_cause, severity(low|medium|high), frequency(rare|common|constant)",
    guidance:
      "Recurring problems Daniel's clients bring to him. The pains he diagnoses.",
    max: 30,
  },
  {
    name: "solutions",
    tier: "full",
    arrays: [],
    schema: "solution, approach, typical_outcome, time_to_result",
    guidance:
      "How Daniel solves the recurring client problems — his actual method/approach. One per distinct solution.",
    max: 30,
  },
  {
    name: "common_issues",
    tier: "full",
    arrays: [],
    schema: "issue, area(delivery|tooling|team|client_mgmt|content_ops), trigger, standard_fix, prevention",
    guidance:
      "Recurring INTERNAL/operational issues in running the business + Daniel's standard fix. Not client-facing.",
    max: 20,
  },
  {
    name: "frameworks",
    tier: "full",
    arrays: ["steps"],
    schema: "name, acronym, summary, steps(array), when_to_use, source_note",
    guidance:
      "Named frameworks, methodologies, mental models Daniel teaches/uses. steps = ordered list. source_note = category it came from.",
    max: 40,
  },
  {
    name: "voice_rules",
    tier: "core",
    arrays: [],
    schema:
      "rule_type(do|avoid), rule, reason, example_good, example_bad, category(word|phrase|structure|tone|formatting)",
    guidance:
      "Concrete language rules. Mine do-not-say.md hard for rule_type='avoid'. Each banned phrase/word = an avoid row with example_bad.",
    max: 50,
  },
  {
    name: "tone_profiles",
    tier: "core",
    arrays: [],
    schema:
      "context(sales|content|coaching|internal|dm|email), description, energy(low|medium|high), formality(casual|neutral|formal), pacing(punchy|conversational|measured)",
    guidance: "How Daniel's tone shifts by channel/context. One row per context.",
    max: 8,
  },
  {
    name: "personality_traits",
    tier: "core",
    arrays: [],
    schema: "trait, description, how_it_shows, intensity(int 1-10)",
    guidance: "Core personality traits and how each shows up in behaviour.",
    max: 15,
  },
  {
    name: "decision_rules",
    tier: "full",
    arrays: ["tags"],
    schema:
      "situation, heuristic, default_action, rationale, priority(int, 1=highest), tags(array)",
    guidance:
      "Daniel's decision-making heuristics: when X situation, he does Y because Z. The decision tree that lets the AI choose like Daniel.",
    max: 40,
  },
  {
    name: "principles",
    tier: "core",
    arrays: [],
    schema: "principle, statement, applies_to(life|business|content|sales|team)",
    guidance: "Core operating beliefs/values — the 'why' behind decisions, in Daniel's words.",
    max: 25,
  },
  {
    name: "signature_phrases",
    tier: "core",
    arrays: [],
    schema: "phrase, meaning, usage_context, category(hook|transition|close|reframe|catchphrase)",
    guidance:
      "Daniel's actual recurring phrasings / catchphrases / ways of saying things. Verbatim where possible.",
    max: 40,
  },
  {
    name: "stories",
    tier: "stories",
    arrays: ["characters"],
    schema: "title, summary, lesson, when_to_use, characters(array)",
    guidance:
      "Signature stories/anecdotes Daniel tells — personal, client, or business. Include origin stories, turning-point moments, client transformation stories, and stories he references when teaching. Each must have a clear lesson + when he'd tell it.",
    max: 25,
  },
  {
    name: "content_pillars",
    tier: "full",
    arrays: ["proof_points"],
    schema: "pillar, description, angle, proof_points(array)",
    guidance: "The recurring themes/pillars Daniel creates content around + the angle + proof.",
    max: 15,
  },
  {
    name: "hooks",
    tier: "full",
    arrays: [],
    schema:
      "hook, format(question|stat|story|contrarian|listicle|confession), topic, performance_note",
    guidance: "Proven opening hooks Daniel uses in content. Verbatim or close. Tag the format + topic.",
    max: 40,
  },
];

/* ----------------------------- LLM extraction ---------------------------- */

async function extractRows(spec, corpus) {
  const system = `You convert Daniel Paul's knowledge base into structured database rows.
You will be given source material and ONE target table. Output STRICT JSON: an array of objects matching the schema exactly. No markdown, no prose, no code fence.

Rules:
- Only use facts grounded in the source material. Do NOT invent offers, results, or numbers.
- Write in Daniel's voice where the field is prose (rebuttal, rule, heuristic, phrase).
- Array fields must be JSON arrays of strings.
- Integer fields must be numbers, not strings. Unknown number → null.
- Omit a row entirely rather than fill it with filler.
- Return [] if the material genuinely contains nothing for this table.
- Max ${spec.max} rows. Quality over quantity.`;

  const user = `TARGET TABLE: ${spec.name}
SCHEMA (object keys → meaning):
${spec.schema}

INTENT: ${spec.guidance}

SOURCE MATERIAL:
${corpus}

Output the JSON array now.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic ${res.status}: ${body.slice(0, 240)}`);
  }
  const j = await res.json();
  const text = (j.content?.find?.((c) => c.type === "text"))?.text || "";
  return parseJsonArray(text);
}

function parseJsonArray(text) {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/* ----------------------------- main -------------------------------------- */

async function resolveOwnerId(supabase) {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  const owner = data.users.find(
    (u) => u.email?.toLowerCase() === OWNER_EMAIL.toLowerCase()
  );
  if (!owner) throw new Error(`owner not found for ${OWNER_EMAIL}`);
  return owner.id;
}

function sanitizeRow(spec, row, userId) {
  const out = { user_id: userId };
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined) continue;
    if (spec.arrays.includes(k)) {
      out[k] = Array.isArray(v) ? v.map(String) : v == null ? null : [String(v)];
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function main() {
  for (const [k, v] of Object.entries({
    ANTHROPIC_API_KEY,
    SUPABASE_URL,
    SERVICE_KEY,
    OWNER_EMAIL,
    VAULT_PATH,
  })) {
    if (!v) {
      console.error(`Missing env: ${k}`);
      process.exit(1);
    }
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
  const userId = await resolveOwnerId(supabase);
  log(`Owner resolved: ${OWNER_EMAIL} → ${userId.slice(0, 8)}…`);

  const targets = ONLY.length
    ? TABLES.filter((t) => ONLY.includes(t.name))
    : TABLES;
  log(`Targets: ${targets.map((t) => t.name).join(", ")}`);
  if (FORCE) log("FORCE mode: existing rows for each target will be wiped first.");

  let grandTotal = 0;
  for (const spec of targets) {
    // Skip non-empty unless --force
    const { count } = await supabase
      .from(spec.name)
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (count && count > 0 && !FORCE) {
      log(`SKIP ${spec.name} — already has ${count} rows (use --force to refill)`);
      continue;
    }
    if (count && count > 0 && FORCE) {
      await supabase.from(spec.name).delete().eq("user_id", userId);
      log(`wiped ${count} existing ${spec.name} rows`);
    }

    const corpus =
      spec.tier === "stories"
        ? await storiesCorpus()
        : spec.tier === "full"
        ? await fullCorpus()
        : await coreCorpus();
    process.stdout.write(`[distill-sql] ${spec.name}: extracting… `);
    let rows;
    try {
      rows = await extractRows(spec, corpus);
    } catch (err) {
      console.log(`ERROR ${err.message}`);
      continue;
    }
    if (!rows.length) {
      console.log("0 rows");
      continue;
    }
    const clean = rows.slice(0, spec.max).map((r) => sanitizeRow(spec, r, userId));
    const { error } = await supabase.from(spec.name).insert(clean);
    if (error) {
      console.log(`INSERT ERROR ${error.message}`);
      continue;
    }
    console.log(`+${clean.length} rows`);
    grandTotal += clean.length;
  }

  log(`Done. Inserted ${grandTotal} rows across ${targets.length} tables.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
