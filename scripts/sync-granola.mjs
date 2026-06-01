#!/usr/bin/env node
/**
 * Granola → Obsidian + AI Danny sync (v3 — public REST API, real field shape).
 *
 * Granola public API: https://public-api.granola.ai/v1
 * Auth: Authorization: Bearer grn_...  (Settings → Connectors → API keys)
 *
 * Real note shape (confirmed from live data):
 *   { id, object, title, web_url, owner:{name,email}, created_at, updated_at,
 *     calendar_event:{start,end,attendees}, attendees:[...],
 *     folder_membership, transcript:[{speaker:{source,diarization_label},text}],
 *     summary_text, summary_markdown }
 *
 * Env (auto-loaded from .env.local):
 *   GRANOLA_API_KEY (required) | GRANOLA_BASE_URL (optional)
 *   VAULT_PATH | APP_URL | CRON_SECRET (required)
 *   LOOKBACK_HOURS (optional, default 168, first run only)
 *   GRANOLA_DEBUG=1 (optional)
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeMeetingNote } from "./lib/meeting-note.mjs";
import { postCapture } from "./lib/upsert-capture.mjs";

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(__filename), "..");

await loadDotEnvLocal();

const GRANOLA_API_KEY = process.env.GRANOLA_API_KEY;
const GRANOLA_BASE_URL = (
  process.env.GRANOLA_BASE_URL || "https://public-api.granola.ai/v1"
).replace(/\/$/, "");
const VAULT_PATH = process.env.VAULT_PATH;
const APP_URL = process.env.APP_URL || "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET || "";
const LOOKBACK_HOURS = Number(process.env.LOOKBACK_HOURS || 168);
const DEBUG = process.env.GRANOLA_DEBUG === "1";

const SYNC_STATE_FILE = "_ai-danny/.granola-sync-state.json";

function log(...args) {
  console.log("[granola-sync]", ...args);
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

async function granolaFetch(pathStr, query = {}) {
  const url = new URL(GRANOLA_BASE_URL + pathStr);
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${GRANOLA_API_KEY}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`Granola ${res.status} ${pathStr}: ${body.slice(0, 240)}`);
    err.status = res.status;
    throw err;
  }
  return await res.json();
}

async function listNotes(createdAfterIso) {
  const out = [];
  let cursor = undefined;
  let page = 0;
  while (true) {
    page++;
    const resp = await granolaFetch("/notes", {
      created_after: createdAfterIso,
      cursor,
    });
    const items = resp.notes || resp.items || [];
    out.push(...items);
    cursor = resp.cursor || resp.pagination?.nextCursor || null;
    const hasMore = resp.hasMore ?? resp.has_more ?? false;
    if (!hasMore || !cursor || page > 20) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  return out;
}

async function getNote(id) {
  return await granolaFetch(`/notes/${id}`, { include: "transcript" });
}

/** Pull a date string out of a calendar_event start/end (handles {dateTime}|{date}|string). */
function calTime(node) {
  if (!node) return null;
  if (typeof node === "string") return node;
  return node.dateTime || node.date || node.timestamp || null;
}

function getTimes(n) {
  const ce = n.calendar_event || n.calendarEvent || null;
  // Prefer the real calendar event window; fall back to note created_at for the date.
  const startedAt = calTime(ce?.start) || n.created_at || n.createdAt || null;
  const endedAt = calTime(ce?.end) || null;
  let durationMin = null;
  if (startedAt && endedAt) {
    const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
    if (Number.isFinite(ms) && ms > 0 && ms < 24 * 3600 * 1000) {
      durationMin = Math.round(ms / 60000);
    }
  }
  return { startedAt, endedAt: endedAt || startedAt, durationMin };
}

function pushName(set, p) {
  if (!p) return;
  const name =
    typeof p === "string"
      ? p
      : p.name || p.displayName || p.display_name || p.email;
  if (name && String(name).trim()) set.add(String(name).trim());
}

function getAttendees(n) {
  const out = new Set();
  if (n.owner?.name) out.add(n.owner.name);
  const ce = n.calendar_event || n.calendarEvent || null;
  const lists = [n.attendees, n.participants, n.people, ce?.attendees];
  for (const l of lists) {
    if (Array.isArray(l)) for (const p of l) pushName(out, p);
  }
  return [...out];
}

function getTranscript(n, ownerName) {
  const t = n.transcript;
  if (!t) return "";
  if (typeof t === "string") return t.trim();
  if (Array.isArray(t)) {
    return t
      .map((seg) => {
        const sp = seg.speaker || {};
        // microphone = the person recording (note owner). speaker = others.
        const label =
          sp.source === "microphone"
            ? ownerName || "Me"
            : sp.diarization_label || sp.label || "Speaker";
        const text = seg.text || seg.content || "";
        return text ? `${label}: ${text}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function normaliseGranolaNote(n) {
  const id = n.id || n.note_id;
  const title = n.title || n.name || "(untitled note)";
  const ownerName = n.owner?.name || null;
  const { startedAt, endedAt, durationMin } = getTimes(n);
  // Real summary fields: summary_markdown (rich) → summary_text (plain).
  const summary =
    (typeof n.summary_markdown === "string" && n.summary_markdown.trim()) ||
    (typeof n.summary_text === "string" && n.summary_text.trim()) ||
    (typeof n.summary === "string" && n.summary.trim()) ||
    "";
  return {
    source: "granola",
    id: String(id),
    title,
    startedAt,
    endedAt,
    durationMin,
    type: null,
    category: null,
    attendees: getAttendees(n),
    summary,
    bullets: [],
    painPoints: [],
    faq: [],
    actionItems: [],
    transcript: getTranscript(n, ownerName),
    recordingUrl: n.recording_url || n.recordingUrl || null,
    sourceUrl: n.web_url || n.url || (id ? `https://notes.granola.ai/d/${id}` : null),
    dealName: null,
    dealStage: null,
  };
}

async function main() {
  if (!GRANOLA_API_KEY) {
    console.error(
      "GRANOLA_API_KEY not set. Granola desktop → Settings → Connectors → API keys → Create new key, then add to .env.local."
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

  const state = await readSyncState();
  const since = state.lastSyncedAt
    ? new Date(state.lastSyncedAt)
    : new Date(Date.now() - LOOKBACK_HOURS * 3600 * 1000);
  const sinceIso = new Date(since.getTime() - 3600 * 1000).toISOString();
  log(`Listing notes since ${sinceIso}`);

  let summaries;
  try {
    summaries = await listNotes(sinceIso);
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      console.error("Granola auth failed — check GRANOLA_API_KEY + its scope.");
    }
    console.error("List notes failed:", err.message);
    process.exit(1);
  }
  log(`Found ${summaries.length} notes from Granola`);

  if (DEBUG && summaries[0]) {
    log("DEBUG first list item keys:", Object.keys(summaries[0]));
  }

  let wrote = 0;
  let skipped = 0;
  let captured = 0;
  let failed = 0;
  const newLatestIso = new Date().toISOString();

  for (const summary of summaries) {
    const idForLog = summary.id || summary.note_id;
    const titleForLog = summary.title || "(untitled)";
    try {
      let detail;
      try {
        detail = await getNote(idForLog);
      } catch (err) {
        if (err.status === 404) {
          log(`SKIP  ${titleForLog} — not processed yet (404)`);
          skipped++;
          continue;
        }
        throw err;
      }

      if (DEBUG) log("DEBUG note keys:", Object.keys(detail));

      const meeting = normaliseGranolaNote(detail);

      const res = await writeMeetingNote(VAULT_PATH, meeting);
      if (res.written) {
        log(`WROTE ${titleForLog} → ${path.relative(VAULT_PATH, res.path)}`);
        wrote++;
      } else if (res.skipped) {
        log(`SKIP  ${titleForLog} — already on disk`);
        skipped++;
      }

      if (meeting.transcript && meeting.transcript.length > 100) {
        try {
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
        } catch (capErr) {
          log(`  capture skipped — ${capErr.message} (note still written)`);
        }
      } else {
        log(`  capture skipped — no transcript`);
      }

      await new Promise((r) => setTimeout(r, 250));
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
