import { NextResponse } from "next/server";
import { getKnowledgeNode } from "@/lib/knowledge";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ macro: string; slug: string }> }
) {
  const { macro, slug } = await params;
  const node = await getKnowledgeNode(macro, slug);
  if (!node) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, node });
}
