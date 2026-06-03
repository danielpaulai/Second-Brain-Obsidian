import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { readText as storageReadText } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Persist Theatre.js choreography state to the vault so live tweaks survive reloads.
 *   {vault}/_ai-danny/choreo-state.json
 *
 * GET  → returns the saved state (reads from disk OR the production Blob via the storage layer).
 * POST → writes to disk when a local VAULT_PATH is set. In Blob mode (production data) the vault is
 *        read-only here, so it no-ops gracefully (studio authoring is a local-only flow) — it never
 *        500s, so it can't pollute the console on a normal page load.
 */

const KEY = "_ai-danny/choreo-state.json";
const VAULT_PATH = process.env.VAULT_PATH || "";

export async function GET() {
  try {
    const raw = await storageReadText(KEY);
    return NextResponse.json({ ok: true, state: raw ? JSON.parse(raw) : null });
  } catch {
    return NextResponse.json({ ok: true, state: null });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!VAULT_PATH) {
      // Blob-backed (production) data is read-only from here.
      return NextResponse.json({ ok: false, error: "choreo save needs a local VAULT_PATH (Blob mode is read-only)" });
    }
    const target = path.join(VAULT_PATH, KEY);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(body, null, 2), "utf8");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}
