#!/usr/bin/env node
/**
 * Calendar watcher — auto-triggers a pre-call brief 30 min before meetings.
 *
 * Uses the Google Calendar REST API (no npm deps — built-in fetch only).
 * Run via launchd every 15 minutes.
 *
 * ── One-time setup ──────────────────────────────────────────────────────────
 * 1. Google Cloud Console → New project → Enable "Google Calendar API"
 * 2. Credentials → Create OAuth 2.0 Client ID (Desktop app)
 * 3. Download the JSON → copy client_id + client_secret into .env.local
 * 4. Get a refresh token (run once):
 *      node scripts/watch-calendar.mjs --auth
 *    Opens a browser, you approve, script prints GCAL_REFRESH_TOKEN.
 *    Paste it into .env.local.
 *
 * .env.local keys:
 *   GCAL_CLIENT_ID=...
 *   GCAL_CLIENT_SECRET=...
 *   GCAL_REFRESH_TOKEN=...
 *   GCAL_CALENDAR_IDS=primary,work@group.calendar.google.com   (optional)
 *   APP_URL=http://localhost:3000                               (optional)
 *   CRON_SECRET=...
 *
 * Usage:
 *   node scripts/watch-calendar.mjs              # normal run (launchd)
 *   node scripts/watch-calendar.mjs --dry-run    # print events, no API calls
 *   node scripts/watch-calendar.mjs --lookahead=60  # look ahead 60 min (default 30)
 *   node scripts/watch-calendar.mjs --auth       # one-time OAuth flow
 *   - tracks which event UIDs have already triggered a brief (deduplication)
 *   - auto-cleans entries older than 24h
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(__filename), "..");
const STATE_FILE = path.join(PROJECT_ROOT, ".calendar-watcher-state.json");

await loadDotEnvLocal();

const CLIENT_ID = process.env.GCAL_CLIENT_ID;
const CLIENT_SECRET = process.env.GCAL_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GCAL_REFRESH_TOKEN;
const CALENDAR_IDS = (process.env.GCAL_CALENDAR_IDS || "primary")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const CRON_SECRET = process.env.CRON_SECRET;
const APP_URL = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes("--dry-run");
const AUTH_MODE = ARGS.includes("--auth");
const LOOKAHEAD_MIN =
  Number((ARGS.find((a) => a.startsWith("--lookahead=")) || "").replace("--lookahead=", "")) || 30;

// Bot / notetaker names to exclude from "who" list
const BOT_RE = /sybill|fathom|otter|notetaker|fireflies|read\.ai|chorus|gong|zoom|teams|meet/i;

function log(...a) {
  console.log("[cal-watcher]", ...a);
}

/* ─────────────────────── .env.local loader ─────────────────────── */

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

/* ─────────────────────── state ─────────────────────── */

async function loadState() {
  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return { triggered: {}, accessToken: null, accessTokenExpiry: 0 };
  }
}

async function saveState(state) {
  if (DRY_RUN) return;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [uid, ts] of Object.entries(state.triggered || {})) {
    if (ts < cutoff) delete state.triggered[uid];
  }
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

/* ─────────────────────── OAuth helpers ─────────────────────── */

/** Exchange refresh token → access token. Caches in state file. */
async function getAccessToken(state) {
  if (state.accessToken && state.accessTokenExpiry > Date.now() + 60_000) {
    return state.accessToken;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  state.accessToken = data.access_token;
  state.accessTokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
  return state.accessToken;
}

/* ─────────────────────── one-time auth flow ─────────────────────── */

async function runAuthFlow() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    log("ERROR: GCAL_CLIENT_ID and GCAL_CLIENT_SECRET must be set in .env.local");
    process.exit(1);
  }

  const PORT = 9876;
  const REDIRECT_URI = `http://localhost:${PORT}/callback`;
  const SCOPES = "https://www.googleapis.com/auth/calendar.readonly";

  const authUrl =
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: SCOPES,
      access_type: "offline",
      prompt: "consent",
    });

  log("Opening browser for Google auth...");
  log("If it doesn't open automatically, visit:\n\n  " + authUrl + "\n");

  try {
    const { execFile } = await import("node:child_process");
    execFile("open", [authUrl]);
  } catch {}

  const code = await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      res.writeHead(200, { "Content-Type": "text/html" });
      if (code) {
        res.end("<h2>Auth complete — you can close this tab.</h2>");
        server.close();
        resolve(code);
      } else {
        res.end(`<h2>Auth failed: ${error}</h2>`);
        server.close();
        reject(new Error("Auth error: " + error));
      }
    });
    server.listen(PORT, () => log("Waiting for Google redirect on port " + PORT + "..."));
    server.on("error", reject);
  });

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    log("Token exchange failed:", body);
    process.exit(1);
  }

  const tokens = await tokenRes.json();
  if (!tokens.refresh_token) {
    log("ERROR: No refresh token returned. Make sure you used prompt=consent.");
    process.exit(1);
  }

  log("\n✓ Add this to your .env.local:\n");
  log("GCAL_REFRESH_TOKEN=" + tokens.refresh_token + "\n");
}

/* ─────────────────────── calendar query ─────────────────────── */

/**
 * @typedef {{ uid: string, title: string, startDate: string, location: string, calendarId: string, attendees: Array<{name: string, email: string}> }} CalEvent
 */

/** @param {object} state @returns {Promise<CalEvent[]>} */
async function fetchUpcomingEvents(state) {
  const token = await getAccessToken(state);
  const now = new Date();
  const windowEnd = new Date(now.getTime() + LOOKAHEAD_MIN * 60_000);

  const results = [];

  for (const calId of CALENDAR_IDS) {
    const url =
      "https://www.googleapis.com/calendar/v3/calendars/" +
      encodeURIComponent(calId) +
      "/events?" +
      new URLSearchParams({
        timeMin: now.toISOString(),
        timeMax: windowEnd.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "20",
      });

    const res = await fetch(url, {
      headers: { Authorization: "Bearer " + token },
    });

    if (!res.ok) {
      const body = await res.text();
      log("Calendar fetch error for " + calId + " (" + res.status + "):", body.slice(0, 200));
      continue;
    }

    const data = await res.json();
    for (const item of data.items || []) {
      // Skip all-day events (no dateTime)
      const startRaw = item.start?.dateTime;
      if (!startRaw) continue;

      const attendees = (item.attendees || [])
        .filter((a) => !a.self)
        .map((a) => ({ name: a.displayName || "", email: a.email || "" }));

      results.push({
        uid: item.id,
        title: item.summary || "Untitled",
        startDate: startRaw,
        location: item.location || "",
        calendarId: calId,
        attendees,
      });
    }
  }

  return results;
}

/* ─────────────────────── brief trigger ─────────────────────── */

/** @param {CalEvent} event */
function extractWho(event) {
  const names = event.attendees
    .filter((a) => !BOT_RE.test(a.name) && !BOT_RE.test(a.email))
    .map((a) => (a.name || a.email.split("@")[0]).trim())
    .filter(Boolean);

  if (!names.length) {
    const m = event.title.match(
      /(?:with|call|meeting|sync)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i
    );
    if (m) return m[1];
    return event.title;
  }
  return names.join(", ");
}

/** @param {CalEvent} event @returns {Promise<boolean>} */
async function triggerBrief(event) {
  const who = extractWho(event);
  const meetingTitle = event.title;
  const minutesUntil = Math.round(
    (new Date(event.startDate).getTime() - Date.now()) / 60_000
  );

  // Pass the filtered (non-bot) attendees so the route can resolve them
  // against the people table and auto-inject context (relationship, company…).
  const attendees = event.attendees
    .filter((a) => !BOT_RE.test(a.name) && !BOT_RE.test(a.email))
    .map((a) => ({ name: (a.name || a.email.split("@")[0]).trim(), email: a.email }));

  log("Triggering pre-call brief: \"" + meetingTitle + "\" with " + who + " (in " + minutesUntil + " min)");

  if (DRY_RUN) {
    log("[DRY RUN] POST " + APP_URL + "/api/brief/pre-call", JSON.stringify({ who, meetingTitle, attendees, store: true }));
    return true;
  }

  try {
    const res = await fetch(APP_URL + "/api/brief/pre-call", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(CRON_SECRET ? { Authorization: "Bearer " + CRON_SECRET } : {}),
      },
      body: JSON.stringify({ who, meetingTitle, attendees, store: true }),
    });

    if (!res.ok) {
      const body = await res.text();
      log("API error " + res.status + ":", body.slice(0, 200));
      return false;
    }

    const j = await res.json();
    if (j.ok) {
      log("✓ Brief ready for " + who + " (" + (j.durationMs ?? "?") + "ms)");
      return true;
    }
    log("API returned ok:false:", j.error);
    return false;
  } catch (err) {
    log("Fetch error:", err.message);
    return false;
  }
}

/* ─────────────────────── main ─────────────────────── */

async function main() {
  if (AUTH_MODE) {
    await runAuthFlow();
    return;
  }

  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    log("ERROR: Missing GCAL_CLIENT_ID / GCAL_CLIENT_SECRET / GCAL_REFRESH_TOKEN in .env.local");
    log("Run with --auth to complete the one-time setup flow.");
    process.exit(1);
  }

  if (!CRON_SECRET && !DRY_RUN) {
    log("Warning: CRON_SECRET not set — API call will be unauthenticated");
  }

  const state = await loadState();

  let events;
  try {
    events = await fetchUpcomingEvents(state);
  } catch (err) {
    log("Failed to fetch events:", err.message);
    await saveState(state);
    process.exit(1);
  }

  if (!events.length) {
    log("No meetings in the next " + LOOKAHEAD_MIN + " minutes.");
    await saveState(state);
    return;
  }

  log("Found " + events.length + " upcoming event(s):");
  for (const ev of events) {
    const min = Math.round((new Date(ev.startDate).getTime() - Date.now()) / 60_000);
    log("  · \"" + ev.title + "\" in " + min + " min [" + ev.uid.slice(0, 12) + "]");
  }

  let triggered = 0;
  for (const ev of events) {
    if (state.triggered[ev.uid]) {
      log("  Skipping \"" + ev.title + "\" — brief already triggered");
      continue;
    }
    const ok = await triggerBrief(ev);
    if (ok) {
      state.triggered[ev.uid] = Date.now();
      triggered++;
    }
  }

  await saveState(state);
  log("Done. Triggered " + triggered + " new brief(s).");
}

main().catch((err) => {
  log("Fatal:", err.message);
  process.exit(1);
});

