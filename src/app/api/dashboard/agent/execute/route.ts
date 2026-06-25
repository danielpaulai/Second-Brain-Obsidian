import { NextResponse } from "next/server";
import { executeZapierAction, zapierMcpConfigured } from "@/lib/zapier-mcp";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/dashboard/agent/execute — runs ONE approved write action via the Zapier
 * MCP. Called by the chat panel only AFTER the user approves a proposed action; the
 * result is fed back into the conversation so the agent can confirm what happened.
 */
export async function POST(req: Request) {
  if (!zapierMcpConfigured()) {
    return NextResponse.json({ ok: false, error: "Connected apps (MCP) are not configured." }, { status: 200 });
  }
  let body: { selected_api?: string; action?: string; instructions?: string; params?: Record<string, unknown>; output?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  const { selected_api, action, instructions, params, output } = body;
  if (!selected_api || !action) {
    return NextResponse.json({ ok: false, error: "Missing action." }, { status: 400 });
  }

  // Foolproof: executeZapierAction always sends the required `output` string AND, if
  // the agent guessed the wrong action key, resolves it against the live action list
  // and retries — so a wrong key can't fail the write.
  const r = await executeZapierAction("write", { selected_api, action, instructions, params, output });

  const d = r.data as Record<string, unknown> | null;
  const status = (d?.execution as Record<string, unknown> | undefined)?.status ?? (r.ok ? "SUCCESS" : "ERROR");
  return NextResponse.json({
    ok: r.ok,
    status,
    result: d?.results ?? d ?? null,
    resolvedAction: r.resolvedAction ?? null,
    available: r.available ?? null,
    error: r.error ?? null,
  });
}
