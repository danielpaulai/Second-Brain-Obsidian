import { NextResponse } from "next/server";
import { getCurrentUser, getViewerRoleFromAuth } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const BRIEF_KINDS = ["project-pulse", "content-brief", "intelligence-brief"] as const;
type BriefKind = (typeof BRIEF_KINDS)[number];

/**
 * GET /api/briefings/latest
 *
 * Returns the latest brief row for each of the 3 kinds (owner-only).
 * Response: { ok: true, briefs: Brief[] }  — one entry per kind, most recent first.
 */
export async function GET() {
  const supabaseConfigured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseConfigured) return NextResponse.json({ ok: true, briefs: [] });

  const user = await getCurrentUser();
  const role = await getViewerRoleFromAuth();
  if (!user || role !== "owner") return NextResponse.json({ ok: true, briefs: [] });

  const supabase = createAdminClient();

  // Fetch latest row per kind in one query
  const { data, error } = await supabase
    .from("briefings")
    .select("id, kind, title, body, created_at")
    .eq("user_id", user.id)
    .in("kind", [...BRIEF_KINDS])
    .order("created_at", { ascending: false })
    .limit(BRIEF_KINDS.length * 3); // fetch a few per kind in case of retries

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Deduplicate: keep only the latest row per kind
  const seen = new Set<string>();
  const briefs = (data ?? []).filter((row) => {
    if (seen.has(row.kind)) return false;
    seen.add(row.kind);
    return true;
  });

  return NextResponse.json({ ok: true, briefs });
}

/**
 * POST /api/briefings/latest
 *
 * Regenerates all 3 sub-briefs on demand (owner-only).
 */
export async function POST() {
  const user = await getCurrentUser();
  const role = await getViewerRoleFromAuth();
  if (!user || role !== "owner") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { runSkillAsOwner } = await import("@/lib/skill-runner");
  const supabase = createAdminClient();

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][now.getDay()];
  const inputs = { today, dayOfWeek };

  const [pulse, content, intel] = await Promise.all([
    runSkillAsOwner("project-pulse", inputs),
    runSkillAsOwner("content-brief", inputs),
    runSkillAsOwner("intelligence-brief", inputs),
  ]);

  const briefs = [];
  for (const [kind, result] of [
    ["project-pulse", pulse],
    ["content-brief", content],
    ["intelligence-brief", intel],
  ] as const) {
    if (!result.ok || !result.text) continue;
    const { data: row } = await supabase
      .from("briefings")
      .insert({
        user_id: user.id,
        kind,
        title: `${dayOfWeek}, ${today}`,
        body: result.text,
        meta: { modelUsed: result.modelUsed, durationMs: result.durationMs, triggeredBy: "manual" },
      })
      .select("id, kind, title, body, created_at")
      .single();
    if (row) briefs.push(row);
  }

  return NextResponse.json({ ok: true, briefs });
}
