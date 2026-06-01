import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  const origin = new URL(req.url).origin;
  return NextResponse.redirect(`${origin}/login`, { status: 303 });
}
