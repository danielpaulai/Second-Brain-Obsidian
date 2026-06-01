import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";

export const runtime = "nodejs";
export const maxDuration = 300; // distillation can take a few minutes

const execFileAsync = promisify(execFile);

/**
 * GET /api/cron/librarian
 *
 * Runs scripts/librarian.mjs as a child process (vault must be accessible).
 * On Vercel the vault isn't mounted so this returns a clear skip message.
 *
 * Local invocation:
 *   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/librarian
 *
 * Flags via query params:
 *   ?force=1     → pass --force to librarian
 *   ?dry-run=1   → pass --dry-run to librarian (prints plan, no writes)
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const vaultPath = process.env.VAULT_PATH;
  if (!vaultPath) {
    return NextResponse.json({
      ok: false,
      reason: "VAULT_PATH not set — run librarian.mjs locally via launchd",
    });
  }

  // Check vault is actually accessible (will be empty on Vercel)
  try {
    await fs.access(vaultPath);
  } catch {
    return NextResponse.json({
      ok: false,
      reason: "vault not mounted on this host — run librarian.mjs locally",
    });
  }

  const { searchParams } = new URL(req.url);
  const args: string[] = [];
  if (searchParams.get("force") === "1") args.push("--force");
  if (searchParams.get("dry-run") === "1") args.push("--dry-run");
  if (searchParams.get("no-propose") === "1") args.push("--no-propose");

  const scriptPath = path.join(process.cwd(), "scripts", "librarian.mjs");

  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [scriptPath, ...args], {
      cwd: process.cwd(),
      timeout: 280_000, // just under maxDuration
      env: process.env,
    });
    const output = [stdout, stderr].filter(Boolean).join("\n");
    return NextResponse.json({ ok: true, output });
  } catch (err: unknown) {
    const e = err as { message?: string; stdout?: string; stderr?: string };
    const output = [e.stdout, e.stderr].filter(Boolean).join("\n");
    return NextResponse.json({ ok: false, error: e.message, output }, { status: 500 });
  }
}
