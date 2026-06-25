/**
 * Live dashboard data — pulled from the founder's connected apps via Zapier MCP
 * (Gmail, Google Calendar, Slack, Notion, Zoom, Drive, LinkedIn), NEVER any PII.
 *
 * Two-phase LLM: (1) a tool-loop agent that LISTS the Zapier tools and calls the
 * relevant find/list/get ones to read a current snapshot; (2) a structured pass
 * that shapes the collected notes into the dashboard JSON. Returns null when
 * Zapier MCP isn't configured, so the dashboard falls back to its demo data.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import { anthropicFetch } from "./anthropic-fetch";
import { zapierMcpConfigured, withZapierSession } from "./zapier-mcp";
import { mapLimit } from "./concurrency";

// Claude Opus 4.8 — the dashboard is low-frequency (cached client-side) so we use
// the strongest model for tool selection + shaping.
function model() {
  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY, fetch: anthropicFetch });
  const id = (process.env.AI_MODEL || "anthropic/claude-opus-4-8").split("/").slice(1).join("/");
  return anthropic(id || "claude-opus-4-8");
}

/** Race a promise against a hard timeout so the route returns gracefully (never 502s). */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

/* ---- the PII-free shape the LLM fills from the connected apps ---- */

const Meeting = z.object({
  title: z.string().describe("the meeting title / subject"),
  when: z.string().describe("ISO 8601 datetime if known, else a human time like 'Today 3:00 PM'"),
  durationMins: z.number().nullable().describe("length in minutes, or null"),
  attendees: z.number().nullable().describe("COUNT of attendees only — never names or emails"),
  platform: z.string().nullable().describe("Zoom / Google Meet / in person / null"),
});

const Kpi = z.object({
  key: z.string(),
  label: z.string().describe("e.g. 'Meetings this week', 'Emails (7d)', 'Slack messages', 'Docs created', 'LinkedIn reach', 'Files added'"),
  value: z.number(),
  format: z.enum(["currency", "compact", "number", "percent"]),
  delta: z.number().describe("percent change vs the prior period; 0 if unknown"),
  caption: z.string().describe("short context, e.g. 'Calendar · next 7 days'"),
  source: z.enum(["Calendar", "Gmail", "Slack", "Notion", "Zoom", "LinkedIn", "Drive"]).describe("which connected app this metric came from"),
});

const MiniStat = z.object({ label: z.string(), value: z.string(), delta: z.number() });

export const DashboardLiveSchema = z.object({
  kpis: z.array(Kpi).max(4).describe("the 4 strongest headline metrics you could actually pull"),
  miniStats: z.array(MiniStat).max(6),
  meetings: z.object({
    upcoming: z.array(Meeting).max(6).describe("next 7 days, soonest first"),
    last: Meeting.nullable().describe("the most recent PAST meeting, or null"),
  }),
});

export type DashboardLive = z.infer<typeof DashboardLiveSchema> & { generatedAt: number };

// Each call = one `execute_zapier_read_action` (the real data-fetch).
const ExecPlanSchema = z.object({
  calls: z
    .array(
      z.object({
        selected_api: z.string().describe("the app's selected_api from the catalog, e.g. 'GoogleCalendarCLIAPI'"),
        action: z.string().describe("the action KEY to execute, e.g. 'event_v2'"),
        instructions: z.string().describe("natural-language scope, e.g. 'find events in the next 7 days'"),
        output: z.string().describe("what data you want back, e.g. 'event titles, start times, attendee counts'"),
        gets: z.string().describe("the dashboard metric this call is for, e.g. 'upcoming meetings'"),
      })
    )
    .max(12)
    .describe("the read actions to execute, spread across the apps"),
});

const PLAN_SYSTEM = `You are assembling a live executive dashboard from a founder's connected apps via Zapier. Below is the catalog of ENABLED, READ-ONLY actions, grouped by app, each as "  • <action_key> — <Action Name>".

Pick the actions to EXECUTE (via execute_zapier_read_action) that fetch a current snapshot, SPREAD across the apps (do NOT over-use Gmail — one Gmail call at most). For each chosen action return its app's selected_api, the action key, a natural-language "instructions" scope, an "output" describing the fields you want, and "gets" (the metric).

Cover, ONE call each where a suitable action exists:
- Calendar: the "Find Events" action for the NEXT 7 DAYS (this is the meetings list).
- Zoom: a "Find/List Meeting(s)" action.
- Slack: a "Find Message" / "Find Public/Private Channel" / "Find User" style action that returns multiple records.
- Notion: a "Find Page" / "Search" / "Find Database Item" action (NOT "by title/id").
- LinkedIn: only if there is a real find/get-activity action; otherwise SKIP LinkedIn.
- Gmail: ONE "Find Email" action for recent mail (count only) — no bodies.

STRONG action-selection rules:
- PREFER actions named "Find …", "List …", "Search …" that return MULTIPLE records.
- AVOID any action ending in "by ID", "by Title", "by Name", or "Retrieve … by …" — they need a specific identifier you don't have.
- NEVER pick "Make API Request" / "_zap_raw_request" / raw HTTP actions.
- If an app has no good find/list/search action, SKIP that app rather than forcing a bad call.

Return up to ~7 calls. METRICS ONLY — never request message bodies or contact lists.`;

const SHAPE_SYSTEM = `Turn the EXECUTION RESULTS below into the dashboard JSON. Each result has the metric it was "for", and the records the action returned (with a count). Use ONLY what the actions actually RETURNED — never invent, estimate, or guess a number.

Build:
- meetings.upcoming from the Calendar/Zoom records (title + start time + attendee count + platform), soonest first; meetings.last = the most recent past meeting if present, else null. If those records are empty, return upcoming:[] and last:null — do NOT fabricate meetings.
- KPIs + mini-stats from the COUNTS of real records (e.g. "Meetings this week" = number of calendar events, "Slack messages" = count returned, "Notion pages" = count, one "Emails (7d)" count).

CRITICAL: never report counts of Zapier "actions / enabled tools / integrations / configured" items — those are NOT data. If an action errored or returned an empty/zero result, OMIT that app — it is correct to return fewer than 4 KPIs (even an empty array) and an empty meetings list. PII-free: no emails, phones, message bodies; attendee COUNTS only, never names; never show the selected_api.`;

/** Strip any email that slipped through (belt-and-suspenders on top of the prompt rules). */
function scrubPii<T>(value: T): T {
  const clean = (s: string) => s.replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "[hidden]");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walk = (v: any): any => {
    if (typeof v === "string") return clean(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const o: any = {};
      for (const k in v) o[k] = walk(v[k]);
      return o;
    }
    return v;
  };
  return walk(value);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export type DashboardDebug = {
  apps: any[];
  catalog: string;
  plan: any[];
  results: any[];
};

export async function buildLiveDashboard(opts: { debug?: boolean } = {}): Promise<(DashboardLive & { _debug?: DashboardDebug }) | null> {
  if (!zapierMcpConfigured()) return null;
  // Hard timeout (below the function's maxDuration) so the route always answers
  // gracefully instead of 502-ing when the apps are slow.
  return withTimeout(gatherDashboard(opts.debug ?? false), 150_000);
}

async function gatherDashboard(debug: boolean): Promise<(DashboardLive & { _debug?: DashboardDebug }) | null> {
  return withZapierSession(async ({ tools, call }) => {
    // This is Zapier's dynamic interface: list apps → drill each for read-action
    // keys → execute_zapier_read_action per metric. (No static per-app tools.)
    if (!tools.some((t) => t.name === "execute_zapier_read_action")) return null;

    // 1. DISCOVER — the enabled apps, then each app's READ actions (in parallel).
    const appsRes = await call("list_enabled_zapier_actions", {});
    const apps: any[] = (appsRes.data as any)?.apps ?? [];
    if (!apps.length) return null;
    const drilled = await mapLimit(apps, 4, async (a) => {
      const r = await call("list_enabled_zapier_actions", { selected_api: a.selected_api });
      const arr = Array.isArray(r.data) ? (r.data as any[]) : [];
      const actions = ((arr[0]?.actions ?? []) as any[]).filter((x) => x.tool === "execute_zapier_read_action");
      return { app: a.app, selected_api: a.selected_api, actions: actions.map((x) => ({ key: x.key, name: x.name })) };
    });
    const catalog = drilled
      .filter((d) => d.actions.length)
      .map((d) => `App: ${d.app} (selected_api: ${d.selected_api})\n` + d.actions.map((x) => `  • ${x.key} — ${x.name}`).join("\n"))
      .join("\n\n")
      .slice(0, 16000);

    // 2. PLAN — Opus picks which read actions to execute.
    const { object: plan } = await generateObject({
      model: model(),
      schema: ExecPlanSchema,
      maxTokens: 1800,
      system: PLAN_SYSTEM,
      prompt: `Enabled read actions, grouped by app:\n\n${catalog}`,
    });

    // 3. EXECUTE — run each read action and keep the returned records (+ count).
    // Capped + concurrent: each execute hits a live app, so keep the set tight.
    const results = await mapLimit(plan.calls.slice(0, 6), 4, async (c) => {
      const r = await call("execute_zapier_read_action", {
        selected_api: c.selected_api,
        action: c.action,
        instructions: c.instructions,
        params: {},
        output: c.output ?? "",
      });
      const d = r.data as any;
      const records = Array.isArray(d?.results) ? d.results : d?.results != null ? [d.results] : [];
      const failed = !r.ok || d?.error || d?.execution?.status === "ERROR";
      return {
        for: c.gets,
        ok: !failed,
        count: failed ? null : records.length,
        records: records.slice(0, 6),
        error: failed ? r.error || d?.error || "execution error" : undefined,
      };
    });

    // 4. SHAPE — Opus turns the execution results into the dashboard JSON.
    const raw = JSON.stringify(results).slice(0, 45000);
    const { object } = await generateObject({
      model: model(),
      schema: DashboardLiveSchema,
      maxTokens: 1800,
      system: SHAPE_SYSTEM,
      prompt: `Execution results from the founder's connected apps:\n${raw}`,
    });

    const out: DashboardLive & { _debug?: DashboardDebug } = { ...scrubPii(object), generatedAt: Date.now() };
    if (debug) out._debug = { apps, catalog, plan: plan.calls, results };
    return out;
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */
