#!/usr/bin/env node
/**
 * Backfill the structured tables from synced Meetings/ notes.
 *
 * Reads every <vault>/Meetings/*.md note (already synced from Sybill/Granola)
 * and populates the relational brain:
 *   - meetings           (one row per call)
 *   - people             (attendees → contacts, relationship inferred)
 *   - meeting_attendees  (who was on which call)
 *   - commitments        (action items, owner_side = me|them)
 *   - case_studies       (real results mentioned on the call — the empty table)
 *
 * Idempotent: a meeting already present in the `meetings` table is skipped
 * (unless --force). Safe to run repeatedly and on a schedule (launchd).
 *
 * Usage:
 *   node scripts/backfill-structured.mjs            # process new meetings
 *   node scripts/backfill-structured.mjs --force    # re-process all
 *   node scripts/backfill-structured.mjs --limit=5  # cap (testing)
 *
 * Env (.env.local): ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL,
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
const MODEL = process.env.BACKFILL_MODEL || "claude-haiku-4-5";

const ARGS = process.argv.slice(2);
const FORCE = ARGS.includes("--force");
const LIMIT = Number((ARGS.find((a) => a.startsWith("--limit=")) || "").replace("--limit=", "")) || 0;

const OWNER_NAMES = /daniel paul|danny/i;
const BOT_NAMES = /sybill|fathom|otter|notetaker|assistant|fireflies|read\.ai/i;

function log(...a) {
  console.log("[backfill]", ...a);
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

/* ----------------------------- note parsing ----------------------------- */

/** Parse YAML-ish frontmatter incl. simple `key:` list blocks. */
function parseNote(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: raw };
  const fm = {};
  const lines = m[1].split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) {
      const key = kv[1];
      const val = kv[2].trim();
      if (val === "" || val === "[]") {
        // possible list block
        const items = [];
        let j = i + 1;
        while (j < lines.length && /^\s+-\s+/.test(lines[j])) {
          items.push(lines[j].replace(/^\s+-\s+/, "").replace(/^["']|["']$/g, "").trim());
          j++;
        }
        fm[key] = items.length ? items : (val === "[]" ? [] : "");
        i = j;
        continue;
      }
      fm[key] = val.replace(/^["']|["']$/g, "");
    }
    i++;
  }
  return { fm, body: m[2] };
}

/** Extract a `## Section` block's text up to the next `## `. */
function section(body, name) {
  const re = new RegExp(`^##\\s+${name}\\s*$([\\s\\S]*?)(?=^##\\s|\\Z)`, "im");
  const m = body.match(re);
  return m ? m[1].trim() : "";
}

/** Pull the transcript out of the `> [!quote]- Full transcript` callout. */
function transcript(body) {
  const idx = body.indexOf("[!quote]- Full transcript");
  if (idx === -1) return "";
  const after = body.slice(idx);
  return after
    .split("\n")
    .slice(1)
    .filter((l) => l.startsWith(">"))
    .map((l) => l.replace(/^>\s?/, ""))
    .join("\n")
    .trim();
}

function inferRelationship(fm) {
  const cat = (fm.category || "").toLowerCase();
  const type = (fm.type || "").toUpperCase();
  if (/prospect|discovery|sales|lead/.test(cat)) return "prospect";
  if (/customer|client|checkin|onboard/.test(cat)) return "client";
  if (type === "INTERNAL") return "team";
  return "other";
}

function durationMin(fm) {
  if (!fm.started_at || !fm.ended_at) return null;
  const ms = new Date(fm.ended_at).getTime() - new Date(fm.started_at).getTime();
  if (Number.isFinite(ms) && ms > 0 && ms < 24 * 3600 * 1000) return Math.round(ms / 60000);
  return null;
}

/* ----------------------------- LLM extraction ---------------------------- */

async function extractStructured(title, attendees, summary, body) {
  const transcriptText = transcript(body).slice(0, 40_000);
  const system = `You extract structured facts from a meeting note. Output STRICT JSON only (no markdown, no prose):
{
  "commitments": [ { "description": string, "owner_side": "me"|"them", "person_name": string|null, "due_hint": string|null } ],
  "case_studies": [ { "client_name": string, "before_state": string, "after_state": string, "key_metric": string|null, "result_value": string|null } ]
}
Rules:
- "me" = Daniel Paul committed to it; "them" = someone else did.
- Only include a case_study when a REAL, specific client result is stated (a number, a before→after, a concrete outcome). NEVER invent results, clients, or numbers. If none, return [].
- person_name should match an attendee when the commitment is to/with a specific person, else null.
- Keep each field tight. Max 12 commitments, 6 case studies. Return {"commitments":[],"case_studies":[]} if nothing concrete.`;

  const user = `MEETING: ${title}
ATTENDEES: ${attendees.join(", ") || "(unknown)"}

SUMMARY:
${summary || "(none)"}

TRANSCRIPT:
${transcriptText || "(none)"}

Return the JSON now.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 2000, system, messages: [{ role: "user", content: user }] }),
  });
  if (!res.ok) {
    const b = await res.text();
    throw new Error(`Anthropic ${res.status}: ${b.slice(0, 200)}`);
  }
  const j = await res.json();
  const text = (j.content?.find?.((c) => c.type === "text"))?.text || "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { commitments: [], case_studies: [] };
  try {
    const o = JSON.parse(m[0]);
    return {
      commitments: Array.isArray(o.commitments) ? o.commitments : [],
      case_studies: Array.isArray(o.case_studies) ? o.case_studies : [],
    };
  } catch {
    return { commitments: [], case_studies: [] };
  }
}

/* ----------------------------- main -------------------------------------- */

async function resolveOwnerId(supabase) {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  const owner = data.users.find((u) => u.email?.toLowerCase() === OWNER_EMAIL.toLowerCase());
  if (!owner) throw new Error(`owner not found for ${OWNER_EMAIL}`);
  return owner.id;
}

async function main() {
  for (const [k, v] of Object.entries({ ANTHROPIC_API_KEY, SUPABASE_URL, SERVICE_KEY, OWNER_EMAIL, VAULT_PATH })) {
    if (!v) { console.error(`Missing env: ${k}`); process.exit(1); }
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const userId = await resolveOwnerId(supabase);
  log(`Owner: ${OWNER_EMAIL} → ${userId.slice(0, 8)}…`);

  const meetingsDir = path.join(VAULT_PATH, "Meetings");
  let files = [];
  try {
    files = (await fs.readdir(meetingsDir)).filter((f) => f.endsWith(".md")).map((f) => path.join(meetingsDir, f));
  } catch {
    log(`No Meetings/ folder at ${meetingsDir}`); process.exit(0);
  }
  if (LIMIT) files = files.slice(0, LIMIT);
  log(`${files.length} meeting note(s) found`);

  // Cache people by lowercased name for this run.
  const peopleCache = new Map();
  async function upsertPerson(name, relationship) {
    const key = name.toLowerCase();
    if (peopleCache.has(key)) return peopleCache.get(key);
    const { data: existing } = await supabase
      .from("people").select("id").eq("user_id", userId).ilike("full_name", name).limit(1).maybeSingle();
    if (existing?.id) { peopleCache.set(key, existing.id); return existing.id; }
    const { data: ins, error } = await supabase
      .from("people").insert({ user_id: userId, full_name: name, relationship }).select("id").single();
    if (error) { log(`  person insert failed (${name}): ${error.message}`); return null; }
    peopleCache.set(key, ins.id);
    return ins.id;
  }

  let mCount = 0, pCount = 0, cCount = 0, csCount = 0, skipped = 0;

  for (const file of files) {
    const raw = await fs.readFile(file, "utf8");
    const { fm, body } = parseNote(raw);
    const externalId = fm.meeting_id;
    const source = fm.source || "unknown";
    const title = fm.title || path.basename(file, ".md");
    if (!externalId) { log(`SKIP ${title} — no meeting_id`); continue; }

    // Idempotency
    const { data: existing } = await supabase
      .from("meetings").select("id").eq("user_id", userId).eq("source", source).eq("external_id", externalId).maybeSingle();
    if (existing?.id && !FORCE) { skipped++; continue; }

    let meetingId = existing?.id;
    const summary = section(body, "Summary");

    if (!meetingId) {
      const { data: mins, error: mErr } = await supabase.from("meetings").insert({
        user_id: userId,
        source,
        external_id: externalId,
        title,
        started_at: fm.started_at || null,
        ended_at: fm.ended_at || null,
        duration_min: durationMin(fm),
        meeting_type: fm.type || null,
        category: fm.category || null,
        summary: summary || null,
        source_url: fm.source_url || null,
        obsidian_path: path.relative(VAULT_PATH, file),
      }).select("id").single();
      if (mErr) { log(`SKIP ${title} — meeting insert: ${mErr.message}`); continue; }
      meetingId = mins.id;
      mCount++;
    }

    // People + attendees
    const relationship = inferRelationship(fm);
    const attendees = (Array.isArray(fm.attendees) ? fm.attendees : [])
      .filter((a) => a && !OWNER_NAMES.test(a) && !BOT_NAMES.test(a));
    for (const name of attendees) {
      const pid = await upsertPerson(name, relationship);
      if (pid) {
        await supabase.from("meeting_attendees").upsert({ meeting_id: meetingId, person_id: pid });
        pCount++;
      }
    }

    // Commitments + case studies (LLM)
    try {
      const { commitments, case_studies } = await extractStructured(title, attendees, summary, body);
      for (const c of commitments.slice(0, 12)) {
        let pid = null;
        if (c.person_name && !OWNER_NAMES.test(c.person_name)) pid = await upsertPerson(c.person_name, relationship);
        const { error } = await supabase.from("commitments").insert({
          user_id: userId,
          description: String(c.description || "").slice(0, 500),
          owner_side: c.owner_side === "them" ? "them" : "me",
          person_id: pid,
          meeting_id: meetingId,
          status: "open",
        });
        if (!error) cCount++;
      }
      for (const cs of case_studies.slice(0, 6)) {
        if (!cs.client_name && !cs.result_value) continue;
        const { error } = await supabase.from("case_studies").insert({
          user_id: userId,
          client_name: cs.client_name || null,
          before_state: cs.before_state || null,
          after_state: cs.after_state || null,
          key_metric: cs.key_metric || null,
          result_value: cs.result_value || null,
          timeframe: null,
        });
        if (!error) csCount++;
      }
    } catch (err) {
      log(`  extract failed (${title}): ${err.message}`);
    }

    log(`✓ ${title}`);
  }

  log(`Done. meetings+${mCount} attendees+${pCount} commitments+${cCount} case_studies+${csCount} skipped=${skipped}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
