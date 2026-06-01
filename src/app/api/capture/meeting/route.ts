import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSkill } from "@/lib/skills";
import {
  extractMemoriesFromTranscript,
  storeMemories,
} from "@/lib/memories";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/capture/meeting
 *
 * Accepts a meeting transcript, extracts durable commitments via the
 * post-meeting-capture skill, and stores them as memories with kind=commitment.
 *
 * Idempotent: same `meetingId` won't be re-processed.
 *
 * Auth: requires `Authorization: Bearer <CRON_SECRET>` header. This endpoint
 * is called by either (a) a local sync script that has Granola access, or
 * (b) a future Granola webhook.
 *
 * Body:
 *   {
 *     meetingId: string,        // external id (e.g. Granola meeting id)
 *     meetingTitle: string,
 *     meetingDate: string,      // ISO date or YYYY-MM-DD
 *     transcript: string,       // full transcript (will be capped at 50k chars)
 *     meetingEndedAt?: string   // ISO timestamp; defaults to now
 *   }
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const meetingId = String(body.meetingId || "").trim();
  const meetingTitle = String(body.meetingTitle || "").trim();
  const meetingDate = String(body.meetingDate || "").trim();
  const transcript = String(body.transcript || "").trim();
  const meetingEndedAt = body.meetingEndedAt ? new Date(body.meetingEndedAt).toISOString() : new Date().toISOString();

  if (!meetingId || !transcript) {
    return NextResponse.json(
      { ok: false, error: "meetingId and transcript are required" },
      { status: 400 }
    );
  }

  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail) {
    return NextResponse.json(
      { ok: false, error: "OWNER_EMAIL not set" },
      { status: 500 }
    );
  }

  const supabase = createAdminClient();

  // Resolve owner user id
  const { data: usersList, error: listErr } = await supabase.auth.admin.listUsers({
    perPage: 200,
  });
  if (listErr) {
    return NextResponse.json(
      { ok: false, error: `list users: ${listErr.message}` },
      { status: 500 }
    );
  }
  const owner = usersList.users.find(
    (u) => u.email?.toLowerCase() === ownerEmail.toLowerCase()
  );
  if (!owner) {
    return NextResponse.json(
      { ok: false, error: `owner not found for ${ownerEmail}` },
      { status: 404 }
    );
  }

  // Idempotency check
  const { data: existing } = await supabase
    .from("processed_meetings")
    .select("id, memories_added, processed_at")
    .eq("user_id", owner.id)
    .eq("meeting_id", meetingId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({
      ok: true,
      alreadyProcessed: true,
      memoriesAdded: existing.memories_added,
      processedAt: existing.processed_at,
    });
  }

  // Load the capture skill
  const skill = await getSkill("post-meeting-capture");
  if (!skill) {
    return NextResponse.json(
      { ok: false, error: "post-meeting-capture skill not found in vault" },
      { status: 500 }
    );
  }

  // Extract commitments
  const t0 = Date.now();
  const extracted = await extractMemoriesFromTranscript(
    meetingTitle || "(untitled meeting)",
    meetingDate || meetingEndedAt.slice(0, 10),
    transcript,
    skill.body
  );

  // Coerce all extractions to commitment-leaning kinds (skill output already does this)
  // Store memories
  let added = 0;
  if (extracted.length > 0) {
    added = await storeMemories(owner.id, extracted);
  }

  // Log to processed_meetings for idempotency
  await supabase.from("processed_meetings").insert({
    user_id: owner.id,
    meeting_id: meetingId,
    meeting_title: meetingTitle || null,
    meeting_ended_at: meetingEndedAt,
    memories_added: added,
  });

  return NextResponse.json({
    ok: true,
    meetingId,
    extractedCount: extracted.length,
    memoriesAdded: added,
    durationMs: Date.now() - t0,
    extracted: extracted.map((m) => ({ text: m.text, kind: m.kind })),
  });
}
