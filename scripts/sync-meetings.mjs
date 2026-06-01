#!/usr/bin/env node
/**
 * Orchestrator — runs Granola sync, then Sybill sync.
 *
 * Designed for `launchd` (macOS) or any 15-30 minute cron loop. Each child
 * script is self-contained and exits cleanly; this wrapper just sequences
 * them so the log output is interleaved cleanly.
 *
 * Run:
 *   node scripts/sync-meetings.mjs
 *
 * launchd example: see scripts/launchd/com.aidanny.sync.plist
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const SCRIPTS_DIR = path.dirname(__filename);

function runChild(scriptName) {
  return new Promise((resolve) => {
    const child = spawn("node", [path.join(SCRIPTS_DIR, scriptName)], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("close", (code) => resolve(code));
    child.on("error", (err) => {
      console.error(`[orchestrator] failed to start ${scriptName}:`, err.message);
      resolve(1);
    });
  });
}

async function main() {
  console.log("[orchestrator] ── Granola ──");
  const granolaCode = await runChild("sync-granola.mjs");
  if (granolaCode !== 0) {
    console.warn(`[orchestrator] Granola sync exited ${granolaCode} — continuing to Sybill`);
  }

  console.log("\n[orchestrator] ── Sybill ──");
  // Only run Sybill if the key exists — skip silently otherwise.
  if (!process.env.SYBILL_API_KEY) {
    // Try .env.local one more time before giving up — sync-sybill.mjs loads
    // it internally, so check by spawning and letting it self-report.
    const sybillCode = await runChild("sync-sybill.mjs");
    process.exit(sybillCode);
  }
  const sybillCode = await runChild("sync-sybill.mjs");
  process.exit(sybillCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
