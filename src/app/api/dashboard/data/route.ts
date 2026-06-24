import { NextResponse } from "next/server";
import { zapierMcpConfigured } from "@/lib/zapier-mcp";
import { buildLiveDashboard, type DashboardLive } from "@/lib/dashboard-live";
import { linkedinMetrics } from "@/lib/linkedin-metrics";

export const runtime = "nodejs";
export const maxDuration = 180; // the LLM tool-loop over the connected apps can take a bit

// The tool-loop is slow + costs real tokens, so cache the snapshot per warm
// instance. `?refresh=1` forces a re-pull. (Module state survives warm invocations
// on Vercel; cold starts simply rebuild it.)
const TTL_MS = 10 * 60 * 1000;
let cache: { at: number; data: DashboardLive } | null = null;

/**
 * GET /api/dashboard/data — live dashboard snapshot from the founder's connected
 * apps (via Zapier MCP). Returns { live: false } when unconfigured (local dev),
 * so the dashboard renders its demo data instead.
 */
export async function GET(req: Request) {
  // LinkedIn engagement is real static data — always returned, regardless of Zapier.
  const linkedin = linkedinMetrics();
  if (!zapierMcpConfigured()) {
    return NextResponse.json({ live: false, linkedin, note: "Zapier MCP not configured (set ZAPIER_MCP_URL)." });
  }
  const params = new URL(req.url).searchParams;
  const refresh = params.get("refresh") === "1";
  const debug = params.get("debug") === "1"; // returns the plan + raw tool results, skips cache
  if (!refresh && !debug && cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json({ live: true, data: cache.data, linkedin, cached: true });
  }
  try {
    const data = await buildLiveDashboard({ debug });
    if (!data) return NextResponse.json({ live: false, linkedin, note: "No live data available." });
    if (!debug) cache = { at: Date.now(), data };
    return NextResponse.json({ live: true, data, linkedin });
  } catch (err) {
    // serve stale cache on error if we have one
    if (cache) return NextResponse.json({ live: true, data: cache.data, linkedin, cached: true, stale: true });
    return NextResponse.json({ live: false, linkedin, error: err instanceof Error ? err.message : String(err) }, { status: 200 });
  }
}
