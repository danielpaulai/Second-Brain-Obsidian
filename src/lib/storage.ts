import fs from "node:fs/promises";
import path from "node:path";

/**
 * Storage abstraction — reads files from local filesystem in dev,
 * from Vercel Blob in production.
 *
 *   isLocal()        — true if VAULT_PATH is set + accessible
 *   readText(key)    — returns file contents as string
 *   listKeys(prefix) — lists all files under a prefix
 *
 * `key` is relative to the vault root, e.g. "_ai-danny/MASTER.md".
 */

const VAULT_PATH = process.env.VAULT_PATH || "";
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || "";

export function isLocal() {
  return !!VAULT_PATH;
}

export function isBlobConfigured() {
  return !!BLOB_TOKEN;
}

export async function readText(key: string): Promise<string | null> {
  if (isLocal()) {
    try {
      const full = path.join(VAULT_PATH, key);
      return await fs.readFile(full, "utf8");
    } catch {
      return null;
    }
  }
  if (isBlobConfigured()) {
    try {
      const { list, head } = await import("@vercel/blob");
      // Blob URLs look like /vault/<key>, but our list operations return URLs
      const blobKey = `vault/${key}`;
      const info = await head(blobKey, { token: BLOB_TOKEN });
      if (!info?.url) return null;
      // Private store — the blob URL 403s without the token on the request.
      const res = await fetch(info.url, { headers: { Authorization: `Bearer ${BLOB_TOKEN}` } });
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  }
  return null;
}

export async function listKeys(prefix: string): Promise<string[]> {
  if (isLocal()) {
    const full = path.join(VAULT_PATH, prefix);
    try {
      const out: string[] = [];
      async function walk(dir: string) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const e of entries) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) await walk(p);
          else if (e.isFile() && e.name.endsWith(".md")) {
            out.push(path.relative(VAULT_PATH, p));
          }
        }
      }
      await walk(full);
      return out;
    } catch {
      return [];
    }
  }
  if (isBlobConfigured()) {
    const { list } = await import("@vercel/blob");
    const result = await list({
      prefix: `vault/${prefix}`,
      token: BLOB_TOKEN,
      limit: 5000,
    });
    return result.blobs
      .map((b) => b.pathname.replace(/^vault\//, ""))
      .filter((p) => p.endsWith(".md"));
  }
  return [];
}
