#!/usr/bin/env node
/**
 * Sync your local Obsidian vault + knowledge map + LanceDB index to Vercel Blob.
 *
 * Run from your laptop whenever you've edited the vault and want production to
 * see the changes.
 *
 *   node scripts/sync-to-blob.mjs                 # full upload
 *   node scripts/sync-to-blob.mjs --only=ai-danny # just _ai-danny/ folder
 *   node scripts/sync-to-blob.mjs --only=index    # just the LanceDB index
 *   node scripts/sync-to-blob.mjs --dry           # don't actually upload
 *
 * Reads VAULT_PATH + BLOB_READ_WRITE_TOKEN from .env.local.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(__filename), "..");

async function loadEnv() {
  try {
    const txt = await fs.readFile(path.join(PROJECT_ROOT, ".env.local"), "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}
const only = flag("--only");
const dry = args.includes("--dry");

const VAULT_EXCLUDE = new Set([
  ".obsidian",
  ".trash",
  "node_modules",
  ".git",
  ".DS_Store",
]);

async function walk(dir, root, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith(".") && e.name !== ".env.local") continue;
    if (VAULT_EXCLUDE.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, root, out);
    else if (e.isFile() && (e.name.endsWith(".md") || e.name.endsWith(".json"))) {
      out.push({
        absPath: full,
        relPath: path.relative(root, full),
      });
    }
  }
  return out;
}

async function uploadFile(blob, relPath, absPath) {
  const data = await fs.readFile(absPath);
  await blob.put(relPath, data, {
    access: "private",
    contentType: relPath.endsWith(".json")
      ? "application/json"
      : "text/markdown",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

async function main() {
  await loadEnv();
  const vaultPath = process.env.VAULT_PATH;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!vaultPath) {
    console.error("VAULT_PATH not set in .env.local");
    process.exit(1);
  }
  if (!token && !dry) {
    console.error(
      "BLOB_READ_WRITE_TOKEN not set. Run `vercel storage create blob ai-danny-vault` to get one,"
    );
    console.error("then paste it into .env.local. Or run with --dry to preview.");
    process.exit(1);
  }

  let blob;
  if (!dry) {
    const pkg = await import("@vercel/blob");
    blob = {
      put: (key, data, opts) => pkg.put(key, data, { token, ...opts }),
    };
  }

  // Inventory
  console.log(`Scanning ${vaultPath}…`);
  const files = await walk(vaultPath, vaultPath);
  console.log(`  Found ${files.length} files\n`);

  let filtered = files;
  if (only === "ai-danny") {
    filtered = files.filter((f) => f.relPath.startsWith("_ai-danny/"));
  } else if (only === "vault") {
    filtered = files.filter((f) => !f.relPath.startsWith("_ai-danny/"));
  } else if (only === "knowledge") {
    filtered = files.filter((f) =>
      f.relPath.startsWith("_ai-danny/knowledge/")
    );
  }

  const total = filtered.length;
  console.log(`Uploading ${total} files${only ? ` (only=${only})` : ""}${dry ? " [DRY RUN]" : ""}…`);
  let done = 0;
  let bytes = 0;
  const start = Date.now();

  const CONCURRENCY = 6;
  for (let i = 0; i < filtered.length; i += CONCURRENCY) {
    const batch = filtered.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (f) => {
        const blobKey = `vault/${f.relPath}`;
        if (dry) {
          // Just print
        } else {
          await uploadFile(blob, blobKey, f.absPath);
        }
        const stat = await fs.stat(f.absPath);
        bytes += stat.size;
        done++;
      })
    );
    process.stdout.write(`\r  ${done}/${total} · ${(bytes / 1024 / 1024).toFixed(1)} MB`);
  }

  console.log(`\n\n✓ Synced ${done} files (${(bytes / 1024 / 1024).toFixed(1)} MB) in ${Math.ceil((Date.now() - start) / 1000)}s`);
  if (only === "index" || !only) {
    console.log(
      "\nNOTE: The LanceDB index isn't uploaded by this script (it's binary). " +
        "Production calls /api/brain/reindex once after deploy to rebuild from the synced .md files."
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
