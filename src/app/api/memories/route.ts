import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { listMemories, deleteMemory } from "@/lib/memories";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const memories = await listMemories(user.id);
  return NextResponse.json({ ok: true, memories });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });
  const ok = await deleteMemory(user.id, id);
  return NextResponse.json({ ok });
}
