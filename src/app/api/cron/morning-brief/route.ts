import { NextResponse } from "next/server";
import { runSkillAsOwner } from "@/lib/skill-runner";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * GET /api/cron/morning-brief
 *
 * Runs all 3 sub-skills in parallel and stores one briefing row per kind:
 *   project-pulse | content-brief | intelligence-brief
 *
 * Triggered by Vercel Cron at 07:00 in Daniel's timezone (Europe/London).
 * Local: curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/morning-brief
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
  const { data: usersList, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (listErr) {
    return NextResponse.json({ ok: false, error: `list users: ${listErr.message}` }, { status: 500 });
  }
  const owner = usersList.users.find(
    (u) => u.email?.toLowerCase() === ownerEmail.toLowerCase()
  );
  if (!owner) {
    return NextResponse.json({ ok: false, error: `owner not found for ${ownerEmail}` }, { status: 404 });
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][now.getDay()];
  const inputs = { today, dayOfWeek };

  // Run all 3 sub-briefs in parallel
  const [pulse, content, intel] = await Promise.all([
    runSkillAsOwner("project-pulse", inputs),
    runSkillAsOwner("content-brief", inputs),
    runSkillAsOwner("intelligence-brief", inputs),
  ]);

  const results: Record<string, { ok: boolean; id?: string; error?: string }> = {};

  for (const [kind, result] of [
    ["project-pulse", pulse],
    ["content-brief", content],
    ["intelligence-brief", intel],
  ] as const) {
    if (!result.ok || !result.text) {
      results[kind] = { ok: false, error: result.error || "skill returned no text" };
      continue;
    }
    const { data: row, error: insertErr } = await supabase
      .from("briefings")
      .insert({
        user_id: owner.id,
        kind,
        title: `${dayOfWeek}, ${today}`,
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

    results[kind] = insertErr
      ? { ok: false, error: `insert: ${insertErr.message}` }
      : { ok: true, id: row?.id };
  }

  const anyOk = Object.values(results).some((r) => r.ok);
  return NextResponse.json({ ok: anyOk, today, dayOfWeek, results });
}
