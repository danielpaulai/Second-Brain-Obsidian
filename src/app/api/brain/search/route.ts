import { NextResponse } from "next/server";
import { hybridSearch } from "@/lib/vault";

export const runtime = "nodejs";

/**
 * POST /api/brain/search
 * Body: { query: string, limit?: number }
 * Returns: hybrid keyword + semantic search results
 */
export async function POST(req: Request) {
  try {
    const { query, limit = 8 } = (await req.json()) as { query: string; limit?: number };
    if (!query) return NextResponse.json({ error: "missing query" }, { status: 400 });
    const results = await hybridSearch(query, Math.min(20, Math.max(1, limit)));
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
