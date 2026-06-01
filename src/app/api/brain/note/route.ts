import { NextResponse } from "next/server";
import { getCachedVault } from "@/lib/vault";

export const runtime = "nodejs";

/**
 * GET /api/brain/note?title=Exact_Or_Partial_Title
 * Returns full note body for distillation pipeline.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const title = url.searchParams.get("title");
  if (!title) return NextResponse.json({ error: "missing title" }, { status: 400 });
  try {
    const { notes } = await getCachedVault();
    const norm = title.trim().toLowerCase();
    const exact = notes.find((n) => n.title.toLowerCase() === norm);
    const hit =
      exact ||
      notes.find((n) => n.title.toLowerCase().includes(norm)) ||
      notes.find((n) => norm.includes(n.title.toLowerCase()));
    if (!hit) return NextResponse.json({ ok: false, found: false }, { status: 404 });
    return NextResponse.json({
      ok: true,
      found: true,
      title: hit.title,
      folder: hit.folder,
      body: hit.body,
      tags: hit.tags,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
