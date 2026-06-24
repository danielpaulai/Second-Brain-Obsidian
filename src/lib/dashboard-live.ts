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

const Activity = z.object({
  source: z.enum(["Calendar", "Gmail", "Slack", "Notion", "Zoom", "LinkedIn", "Drive", "Other"]),
  text: z.string().describe("a metric-level summary line (counts, titles, channels). NEVER an email address, phone number or message body."),
});

export const DashboardLiveSchema = z.object({
  kpis: z.array(Kpi).max(4).describe("the 4 strongest headline metrics you could actually pull"),
  miniStats: z.array(MiniStat).max(6),
  meetings: z.object({
    upcoming: z.array(Meeting).max(6).describe("next 7 days, soonest first"),
    last: Meeting.nullable().describe("the most recent PAST meeting, or null"),
  }),
  activity: z.array(Activity).max(10).describe("recent app activity, newest first, metric-level + PII-free"),
});

export type DashboardLive = z.infer<typeof DashboardLiveSchema> & { generatedAt: number };

const PlanSchema = z.object({
  calls: z
    .array(
      z.object({
        name: z.string().describe("the EXACT tool name from the catalog"),
        argsJson: z.string().describe('a JSON object of arguments for this tool, e.g. {"instructions":"calendar events in the next 7 days"}'),
        gets: z.string().describe("the metric this call is for, e.g. 'upcoming meetings'"),
      })
    )
    .max(14)
    .describe("the read-only find/list/get/search calls to run, spread across the apps"),
});

const PLAN_SYSTEM = `You are assembling a live executive dashboard from a founder's connected apps (Google Calendar, Gmail, Slack, Notion, Zoom, Google Drive, LinkedIn) exposed as the Zapier tools listed below.

Choose the READ-ONLY tool calls (find / list / get / search) that pull a current snapshot, and SPREAD them across ALL the apps — do NOT over-use Gmail (one Gmail count at most). Aim to cover: upcoming meetings next 7 days + the most recent past meeting (Calendar/Zoom), Slack message/channel activity, Notion docs created/edited, Drive files added, LinkedIn recent posts + reach, and a single email count. Use each tool's natural-language argument (usually "instructions") to say what you want, e.g. "events in the next 7 days". METRICS ONLY — never request message bodies, full inboxes, or contact lists. Return up to ~12 calls.`;

const SHAPE_SYSTEM = `Turn the tool results into the dashboard JSON. Use ONLY data actually present in the results — never invent or estimate numbers; if a result errored or was empty, just leave it out. Keep it strictly PII-free: no email addresses, phone numbers, or message bodies; attendee COUNTS only, never names.

DIVERSITY RULE: the 4 KPIs must come from at least 3 DIFFERENT apps (set each KPI's "source"), and the mini-stats + activity must also span multiple apps. Do NOT let Gmail dominate — at most one Gmail KPI. Prefer a mix: Meetings (Calendar/Zoom), Slack messages, Notion docs, Drive files, LinkedIn reach, one Emails count.`;

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

export async function buildLiveDashboard(): Promise<DashboardLive | null> {
  if (!zapierMcpConfigured()) return null;
  // Hard timeout (below the function's maxDuration) so the route always answers
  // gracefully instead of 502-ing when the apps are slow.
  return withTimeout(gatherDashboard(), 150_000);
}

async function gatherDashboard(): Promise<DashboardLive | null> {
  return withZapierSession(async ({ tools, call }) => {
    if (!tools.length) return null;

    // 1. PLAN — one Opus call lists the tools and picks which to call.
    const catalog = tools
      .map((t) => `- ${t.name}: ${(t.description || "").slice(0, 140)}`)
      .join("\n")
      .slice(0, 14000);
    const { object: plan } = await generateObject({
      model: model(),
      schema: PlanSchema,
      maxTokens: 1600,
      system: PLAN_SYSTEM,
      prompt: `Available tools:\n${catalog}`,
    });

    // 2. EXECUTE — run the chosen calls CONCURRENTLY over the single connection.
    const results = await mapLimit(plan.calls.slice(0, 14), 5, async (c) => {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(c.argsJson);
      } catch {
        /* some tools accept empty args */
      }
      const r = await call(c.name, args);
      return { tool: c.name, for: c.gets, ok: r.ok, data: r.ok ? r.data : { error: r.error } };
    });

    // 3. SHAPE — one Opus call turns the raw results into the dashboard JSON.
    const raw = JSON.stringify(results).slice(0, 45000);
    const { object } = await generateObject({
      model: model(),
      schema: DashboardLiveSchema,
      maxTokens: 1800,
      system: SHAPE_SYSTEM,
      prompt: `Tool results from the founder's connected apps:\n${raw}`,
    });

    return { ...scrubPii(object), generatedAt: Date.now() };
  });
}
