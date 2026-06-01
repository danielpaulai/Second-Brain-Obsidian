import { NextResponse } from "next/server";
import { runSkillAsOwner } from "@/lib/skill-runner";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * GET /api/cron/weekly-review
 *
 * Vercel Cron fires this Sunday evening. Auth via Bearer CRON_SECRET.
 * Runs the weekly-review skill and stores the result in briefings (kind=weekly).
 *
 * Local: curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/weekly-review
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail) {
    return NextResponse.json({ ok: false, error: "OWNER_EMAIL not set" }, { status: 500 });
  }

  const supabase = createAdminClient();
  const { data: usersList, error: listErr } = await supabase.auth.admin.listUsers({
    perPage: 200,
  });
  if (listErr) {
    return NextResponse.json({ ok: false, error: `list users: ${listErr.message}` }, { status: 500 });
  }
  const owner = usersList.users.find(
    (u) => u.email?.toLowerCase() === ownerEmail.toLowerCase()
  );
  if (!owner) {
    return NextResponse.json({ ok: false, error: `owner not found for ${ownerEmail}` }, { status: 404 });
  }

  // Compute the week under review (the 7 days ending today).
  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - 6);
  const weekStart = start.toISOString().slice(0, 10);
  const weekEnd = end.toISOString().slice(0, 10);

  const result = await runSkillAsOwner("weekly-review", { weekStart, weekEnd });
  if (!result.ok || !result.text) {
    return NextResponse.json(
      { ok: false, error: result.error || "skill returned no text", durationMs: result.durationMs },
      { status: 500 }
    );
  }

  const { data: row, error: insertErr } = await supabase
    .from("briefings")
    .insert({
      user_id: owner.id,
      kind: "weekly",
      title: `Week of ${weekStart} → ${weekEnd}`,
      body: result.text,
      meta: {
        modelUsed: result.modelUsed,
        toolCallCount: result.toolCallCount,
        durationMs: result.durationMs,
        triggeredBy: "cron",
      },
    })
    .select("id, created_at")
    .single();

  if (insertErr) {
    return NextResponse.json(
      { ok: false, error: `insert: ${insertErr.message}`, body: result.text },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    id: row?.id,
    createdAt: row?.created_at,
    title: `Week of ${weekStart} → ${weekEnd}`,
    durationMs: result.durationMs,
    toolCallCount: result.toolCallCount,
    bodyLength: result.text.length,
  });
}
