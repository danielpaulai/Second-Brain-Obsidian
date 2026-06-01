#!/usr/bin/env node
/**
 * Sybill → Obsidian + AI Danny sync.
 *
 * 1. Hits Sybill REST API at https://api.sybill.ai/v1/conversations to list
 *    recent meetings.
 * 2. For each, fetches full details (transcript, summary, recording).
 * 3. Writes a markdown note in `<VAULT>/Meetings/`.
 * 4. POSTs the transcript to /api/capture/meeting for memory extraction.
 *
 * Tracks the last-synced timestamp in `<VAULT>/_ai-danny/.sybill-sync-state.json`
 * so each run only pulls newly-ended meetings.
 *
 * Env (auto-loaded from .env.local):
 *   SYBILL_API_KEY (required) — Bearer token from sybill.ai → Settings → API
 *   SYBILL_BASE_URL (optional, default https://api.sybill.ai/v1)
 *   VAULT_PATH (required)
 *   APP_URL (required)
 *   CRON_SECRET (required)
 *   LOOKBACK_HOURS (optional, default 168 — 7 days; first run pulls more)
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeMeetingNote } from "./lib/meeting-note.mjs";
import { postCapture } from "./lib/upsert-capture.mjs";

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(__filename), "..");

await loadDotEnvLocal();

const SYBILL_API_KEY = process.env.SYBILL_API_KEY;
const SYBILL_BASE_URL = (
  process.env.SYBILL_BASE_URL || "https://api.sybill.ai/v1"
).replace(/\/$/, "");
const VAULT_PATH = process.env.VAULT_PATH;
const APP_URL = process.env.APP_URL || "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET || "";
const LOOKBACK_HOURS = Number(process.env.LOOKBACK_HOURS || 168);

const SYNC_STATE_FILE = "_ai-danny/.sybill-sync-state.json";

function log(...args) {
  console.log("[sybill-sync]", ...args);
}

async function loadDotEnvLocal() {
  const envPath = path.join(PROJECT_ROOT, ".env.local");
  try {
    const raw = await fs.readFile(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (!m) continue;
      if (process.env[m[1]]) continue;
      let val = m[2];
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[m[1]] = val;
    }
  } catch {
    // ok
  }
}

async function readSyncState() {
  if (!VAULT_PATH) return { lastSyncedAt: null };
  try {
    const raw = await fs.readFile(path.join(VAULT_PATH, SYNC_STATE_FILE), "utf8");
    return JSON.parse(raw);
  } catch {
    return { lastSyncedAt: null };
  }
}

async function writeSyncState(state) {
  if (!VAULT_PATH) return;
  const full = path.join(VAULT_PATH, SYNC_STATE_FILE);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, JSON.stringify(state, null, 2), "utf8");
}

async function sybillFetch(pathStr, query = {}) {
  const url = new URL(SYBILL_BASE_URL + pathStr);
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${SYBILL_API_KEY}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sybill ${res.status} ${pathStr}: ${body.slice(0, 240)}`);
  }
  return await res.json();
}

async function listRecentConversations(startedAfterIso) {
  const out = [];
  let cursor = undefined;
  let page = 0;
  while (true) {
    page++;
    const resp = await sybillFetch("/conversations", {
      limit: 50,
      startedAfter: startedAfterIso,
      cursor,
    });
    const items = resp.conversations || resp.items || [];
    out.push(...items);
    cursor = resp.pagination?.nextCursor || resp.nextCursor || null;
    if (!cursor || page > 20) break;
  }
  return out;
}

async function getConversationDetails(id) {
  return await sybillFetch(`/conversations/${id}`);
}

function getAttendees(c) {
  const out = new Set();
  const ps = c.participants || c.attendees || [];
  for (const p of ps) {
    const name = p.name || p.displayName || p.email;
    if (typeof name === "string" && name.trim()) out.add(name.trim());
  }
  return [...out];
}

function getTranscriptText(c) {
  // Confirmed shape: c.transcript = [ { speaker, text, startTime, endTime } ]
  const cand = c.transcript;
  if (!cand) return "";
  if (typeof cand === "string" && cand.trim().length > 100) return cand;
  if (Array.isArray(cand)) {
    return cand
      .map((u) => {
        const speaker = u.speaker || u.speakerName || u.author || "Speaker";
        const text = u.text || u.content || u.transcript || "";
        return text ? `${speaker}: ${text}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

/**
 * Sybill's `summary` is a rich object:
 *   { Outcome: string, "Key Takeaways": [{topic, key_takeaway}],
 *     "Pain Points": [string], FAQ: [{question, answer}] }
 *
 * We extract:
 *   - summary string  ← Outcome
 *   - bullets[]       ← Key Takeaways (formatted "**topic** — text")
 *   - painPoints[]    ← Pain Points
 *   - faq[]           ← FAQ pairs
 */
function getStructuredSummary(c) {
  const out = { summary: "", bullets: [], painPoints: [], faq: [] };
  const s = c.summary;
  if (!s) return out;

  // Plain-string fallback (some older Sybill responses)
  if (typeof s === "string") {
    out.summary = s.trim();
    return out;
  }
  if (typeof s !== "object") return out;

  if (typeof s.Outcome === "string") out.summary = s.Outcome.trim();
  else if (typeof s.outcome === "string") out.summary = s.outcome.trim();

  const kt = s["Key Takeaways"] || s.keyTakeaways || s.key_takeaways;
  if (Array.isArray(kt)) {
    out.bullets = kt
      .map((t) => {
        if (typeof t === "string") return t;
        const topic = (t.topic || "").trim();
        const text = (t.key_takeaway || t.text || t.point || "").trim();
        return topic ? `**${topic}** — ${text}` : text;
      })
      .filter(Boolean);
  }

  const pp = s["Pain Points"] || s.painPoints || s.pain_points;
  if (Array.isArray(pp)) {
    out.painPoints = pp.map((p) => (typeof p === "string" ? p : p.text || "")).filter(Boolean);
  }

  const faq = s.FAQ || s.faq;
  if (Array.isArray(faq)) {
    out.faq = faq
      .map((f) => ({
        question: (f.question || "").trim(),
        answer: (f.answer || "").trim(),
      }))
      .filter((f) => f.question && f.answer);
  }

  return out;
}

function getRecordingUrl(c) {
  return c.recordings?.videoUrl || c.recordings?.videoStreamUrl || c.recordingUrl || null;
}

function getSourceUrl(c) {
  // Sybill app URL pattern (best-effort — the API doesn't return one)
  const id = c.conversationId || c.id;
  return id ? `https://app.sybill.ai/conversation/${id}` : null;
}

function normaliseSybillConversation(c) {
  const id = c.conversationId || c.id;
  const title = c.title || c.displayName || "(untitled call)";
  const startedAt = c.startTime || c.startedAt || c.createdAt || null;
  const endedAt = c.endTime || c.endedAt || startedAt;
  let durationMin = null;
  if (startedAt && endedAt) {
    const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
    if (Number.isFinite(ms) && ms > 0) durationMin = Math.round(ms / 60000);
  }
  const { summary, bullets, painPoints, faq } = getStructuredSummary(c);
  return {
    source: "sybill",
    id: String(id),
    title,
    startedAt,
    endedAt,
    durationMin,
    type: c.type || null,            // EXTERNAL / INTERNAL
    category: c.category || null,    // prospect_discovery / customer_checkin / etc.
    attendees: getAttendees(c),
    summary,
    bullets,
    painPoints,
    faq,
    actionItems: [],                 // Sybill doesn't expose discrete action items
    transcript: getTranscriptText(c),
    recordingUrl: getRecordingUrl(c),
    sourceUrl: getSourceUrl(c),
    dealName: c.crm?.deal?.name || c.deal?.name || null,
    dealStage: c.crm?.deal?.stage || c.deal?.stage || null,
  };
}

async function main() {
  if (!SYBILL_API_KEY) {
    console.error(
      "SYBILL_API_KEY not set. Get one from sybill.ai → Settings → API, then add to .env.local."
    );
    process.exit(1);
  }
  if (!VAULT_PATH) {
    console.error("VAULT_PATH not set");
    process.exit(1);
  }
  if (!CRON_SECRET) {
    console.error("CRON_SECRET not set");
    process.exit(1);
  }

  // Sanity check the API key
  try {
    const health = await sybillFetch("/health");
    log(`API ok — org ${health.org_id || "(unknown)"}, scopes ${(health.scopes || []).join(",") || "?"}`);
  } catch (err) {
    console.error("Sybill auth failed:", err.message);
    process.exit(1);
  }

  const state = await readSyncState();
  const since = state.lastSyncedAt
    ? new Date(state.lastSyncedAt)
    : new Date(Date.now() - LOOKBACK_HOURS * 3600 * 1000);
  // Subtract a 1h overlap to catch any backdated meetings
  const sinceIso = new Date(since.getTime() - 3600 * 1000).toISOString();
  log(`Listing conversations since ${sinceIso}`);

  let summaries;
  try {
    summaries = await listRecentConversations(sinceIso);
  } catch (err) {
    console.error("List conversations failed:", err.message);
    process.exit(1);
  }
  log(`Found ${summaries.length} conversations from Sybill`);

  let wrote = 0;
  let skipped = 0;
  let captured = 0;
  let failed = 0;
  const newLatestIso = new Date().toISOString();

  for (const summary of summaries) {
    const idForLog = summary.conversationId || summary.id;
    const titleForLog = summary.title || "(untitled)";
    try {
      // Fetch full detail (transcript, summary)
      const detail = await getConversationDetails(idForLog);
      const meeting = normaliseSybillConversation(detail);

      const res = await writeMeetingNote(VAULT_PATH, meeting);
      if (res.written) {
        log(`WROTE ${titleForLog} → ${path.relative(VAULT_PATH, res.path)}`);
        wrote++;
      } else if (res.skipped) {
        log(`SKIP  ${titleForLog} — already on disk`);
        skipped++;
      }

      if (meeting.transcript && meeting.transcript.length > 100) {
        const cap = await postCapture({
          appUrl: APP_URL,
          cronSecret: CRON_SECRET,
          meeting,
        });
        if (cap.status === 200 && cap.body.ok) {
          if (cap.body.alreadyProcessed) {
            log(`  capture: already processed`);
          } else {
            log(
              `  capture: +${cap.body.memoriesAdded} memories (${cap.body.extractedCount} extracted)`
            );
            captured++;
          }
        } else {
          log(`  capture FAILED ${cap.status}:`, cap.body.error || "");
        }
      } else {
        log(`  capture skipped — no transcript`);
      }
    } catch (err) {
      log(`ERROR ${titleForLog}:`, err.message);
      failed++;
    }
  }

  await writeSyncState({ lastSyncedAt: newLatestIso });
  log(
    `Done. wrote=${wrote} skipped=${skipped} captured=${captured} failed=${failed} (state saved)`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
