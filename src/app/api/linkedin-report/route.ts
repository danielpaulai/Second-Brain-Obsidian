import { buildLinkedInReport } from "@/lib/linkedin-report";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/linkedin-report  { query? }  →  full report (blocks of text + charts).
 * Deterministic chart data + a narrative written with a real reasoning pass — see
 * src/lib/linkedin-report.ts. Analyses the bundled output.json (the /stage + charts-preview path);
 * the dashboard's live "scrape my own posts" tool calls the same builder with freshly scraped posts.
 */
export async function POST(req: Request) {
  let query = "";
  try {
    const body = (await req.json().catch(() => ({}))) as { query?: string };
    query = (body?.query ?? "").trim();
  } catch {
    /* default: all */
  }

  const report = await buildLinkedInReport({ query });
  return Response.json({
    kpis: report.kpis,
    monthly: report.monthly,
    topPosts: report.topPosts,
    reactionMix: report.reactionMix,
    document: report.document,
  });
}
