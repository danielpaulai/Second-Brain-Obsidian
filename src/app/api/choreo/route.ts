import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

/**
 * Persist Theatre.js choreography state to the vault so live tweaks survive
 * reloads + production builds. Lives at:
 *   {VAULT_PATH}/_ai-danny/choreo-state.json
 *
 * GET  → returns the saved state (or `{}` if none yet)
 * POST → body is the project state JSON, gets written to disk
 */

function file() {
  const vault = process.env.VAULT_PATH;
  if (!vault) throw new Error("VAULT_PATH not set");
  return path.join(vault, "_ai-danny", "choreo-state.json");
}

export async function GET() {
  try {
    const raw = await fs.readFile(file(), "utf8");
    return NextResponse.json({ ok: true, state: JSON.parse(raw) });
  } catch (err: any) {
    if (err.code === "ENOENT") return NextResponse.json({ ok: true, state: null });
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const target = file();
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(body, null, 2), "utf8");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
