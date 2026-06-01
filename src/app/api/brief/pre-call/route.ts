import { NextResponse } from "next/server";
import { runSkillAsOwner } from "@/lib/skill-runner";
import { getCurrentUser, getViewerRoleFromAuth } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 90;

/**
 * POST /api/brief/pre-call
 *
 * On-demand pre-call brief. Owner-only (it surfaces private client history).
 * Two auth paths:
 *   - Supabase owner session (when called from the app UI), OR
 *   - Bearer CRON_SECRET (when called by a local calendar-watcher script).
 *
 * Body: { who: string, meetingTitle?: string, context?: string, store?: boolean }
 * Returns: { ok, brief } and (if store) persists it to briefings (kind=ad-hoc).
 */
export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const who = String(body.who || "").trim();
  const meetingTitle = body.meetingTitle ? String(body.meetingTitle).trim() : "";
  let context = body.context ? String(body.context).trim() : "";
  const store = Boolean(body.store);
  const rawAttendees: Array<{ name: string; email: string }> = Array.isArray(body.attendees)
    ? body.attendees.map((a: any) => ({ name: String(a.name || "").trim(), email: String(a.email || "").trim() }))
    : [];
  if (!who) {
    return NextResponse.json({ ok: false, error: "`who` is required" }, { status: 400 });
  }

  // Authorize: CRON_SECRET header OR owner Supabase session.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const viaSecret = !!secret && auth === `Bearer ${secret}`;

  let ownerId: string | null = null;
  if (!viaSecret) {
    const user = await getCurrentUser();
    const role = await getViewerRoleFromAuth();
    if (!user || role !== "owner") {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    ownerId = user.id;
  }

  // ── Resolve attendees against the people table ──────────────────────────
  // For each attendee passed from the calendar watcher, look up their record
  // so the skill gets relationship / company / title / last-contact context
  // automatically — no manual `context` field needed.
  if (rawAttendees.length > 0) {
    try {
      const supabase = createAdminClient();
      const emails = rawAttendees.map((a) => a.email).filter(Boolean);
      const names = rawAttendees.map((a) => a.name).filter(Boolean);

      // Fetch by email first (exact), then by name (ilike) for those not found.
      let rows: any[] = [];
      if (emails.length > 0) {
        const { data } = await supabase
          .from("people")
          .select("full_name, email, relationship, company, title, last_contact_at")
          .in("email", emails);
        rows = data || [];
      }

      // Find attendees not matched by email; try a case-insensitive name search.
      const matchedEmails = new Set(rows.map((r) => r.email?.toLowerCase()));
      const unmatchedNames = rawAttendees
        .filter((a) => !matchedEmails.has(a.email?.toLowerCase()))
        .map((a) => a.name)
        .filter(Boolean);

      for (const name of unmatchedNames) {
        const { data } = await supabase
          .from("people")
          .select("full_name, email, relationship, company, title, last_contact_at")
          .ilike("full_name", `%${name}%`)
          .limit(1);
        if (data?.length) rows.push(data[0]);
      }

      if (rows.length > 0) {
        const lines = rows.map((p) => {
          const parts: string[] = [p.full_name];
          if (p.relationship && p.relationship !== "other") parts.push(p.relationship);
          if (p.company) parts.push(`at ${p.company}`);
          if (p.title) parts.push(`(${p.title})`);
          if (p.last_contact_at) {
            const days = Math.round(
              (Date.now() - new Date(p.last_contact_at).getTime()) / 86_400_000
            );
            parts.push(`last contact ${days}d ago`);
          }
          return parts.join(" — ");
        });
        const resolved = "Known context:\n" + lines.map((l) => `• ${l}`).join("\n");
        context = context ? `${context}\n\n${resolved}` : resolved;
      }
    } catch (err) {
      console.error("[pre-call] people lookup failed:", err);
      // Non-fatal — proceed without enriched context.
    }
  }

  const result = await runSkillAsOwner("pre-call-brief", { who, meetingTitle, context });
  if (!result.ok || !result.text) {
    return NextResponse.json(
      { ok: false, error: result.error || "skill returned no text" },
      { status: 500 }
    );
  }

  // Optionally persist (resolve owner id if we came in via CRON_SECRET).
  if (store) {
    try {
      const supabase = createAdminClient();
      if (!ownerId) {
        const { data } = await supabase.auth.admin.listUsers({ perPage: 200 });
        const ownerEmail = process.env.OWNER_EMAIL?.toLowerCase();
        ownerId =
          data?.users.find((u) => u.email?.toLowerCase() === ownerEmail)?.id ?? null;
      }
      if (ownerId) {
        await supabase.from("briefings").insert({
          user_id: ownerId,
          kind: "ad-hoc",
          title: `Pre-call: ${who}${meetingTitle ? " — " + meetingTitle : ""}`,
          body: result.text,
          meta: { skill: "pre-call-brief", who, meetingTitle },
        });
      }
    } catch (err) {
      console.error("[pre-call] store failed:", err);
    }
  }

  return NextResponse.json({
    ok: true,
    who,
    meetingTitle: meetingTitle || null,
    brief: result.text,
    durationMs: result.durationMs,
    toolCallCount: result.toolCallCount,
  });
}
