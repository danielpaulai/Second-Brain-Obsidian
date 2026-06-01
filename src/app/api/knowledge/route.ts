import { NextResponse } from "next/server";
import { getKnowledgeTree, getKnowledgeStats } from "@/lib/knowledge";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [tree, stats] = await Promise.all([getKnowledgeTree(), getKnowledgeStats()]);
    return NextResponse.json({ ok: true, tree, stats });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
