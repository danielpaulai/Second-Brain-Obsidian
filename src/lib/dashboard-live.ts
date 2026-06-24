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
import { generateText, generateObject } from "ai";
import { z } from "zod";
import { anthropicFetch } from "./anthropic-fetch";
import { zapierMcpConfigured, zapierAiTools } from "./zapier-mcp";

function model() {
  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY, fetch: anthropicFetch });
  const id = (process.env.AI_MODEL || "anthropic/claude-opus-4-8").split("/").slice(1).join("/");
  return anthropic(id || "claude-opus-4-8");
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

const GATHER_SYSTEM = `You are a data-collection agent for a founder's executive dashboard. The founder has connected these apps via Zapier; call the relevant find / list / get / search tools to READ them: Google Calendar, Gmail, Slack, Notion, Zoom, Google Drive, LinkedIn.

Pull a current snapshot, METRICS ONLY. SPREAD YOUR READS ACROSS ALL THE APPS — do NOT over-rely on Gmail (one or two Gmail metrics at most). Aim to read each of these:
- Google Calendar + Zoom: UPCOMING meetings for the next 7 days (title, start time, duration, attendee COUNT, platform) and the single most recent PAST meeting.
- Slack: message volume and/or the most active channels over the last 7 days.
- Notion: pages/docs created or edited over the last 7 days.
- Google Drive: files added/modified over the last 7 days.
- LinkedIn: recent posts and their reach/engagement if available.
- Gmail: a simple email volume count (received/sent) — keep this to 1 metric, do not dump inbox contents.

HARD PRIVACY RULES, no exceptions: never output, repeat or summarise email addresses, phone numbers, message bodies, or individual people's names beyond what already appears in a meeting title. Report COUNTS, TITLES and TIMES only. If a tool returns emails or message text, do NOT echo them.

Be efficient but BROAD: a couple of targeted tool calls PER APP across Calendar, Zoom, Slack, Notion, Drive, LinkedIn and Gmail. Then write up exactly what you found as concise notes, grouped by app (counts, titles, times). If a tool errors or returns nothing, note it and move on.`;

const SHAPE_SYSTEM = `Turn the collected notes into the dashboard JSON. Use ONLY data that is actually present in the notes — never invent or estimate numbers. If something wasn't found, return a shorter array or null rather than guessing. Keep it strictly PII-free: no email addresses, no phone numbers, no message bodies, attendee COUNTS only (never names).

DIVERSITY RULE: the 4 KPIs must come from at least 3 DIFFERENT apps (set each KPI's "source"), and the mini-stats + activity feed must also span multiple apps. Do NOT let Gmail dominate — at most one Gmail KPI. Prefer a mix like: Meetings (Calendar/Zoom), Slack messages, Notion docs, Drive files, LinkedIn reach, and a single Emails count.`;

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
  const tools = await zapierAiTools();
  if (Object.keys(tools).length === 0) return null;

  // Phase 1 — gather via the Zapier tools (the LLM lists + calls them itself).
  const gather = await generateText({
    model: model(),
    tools,
    maxSteps: 16,
    maxTokens: 2600,
    system: GATHER_SYSTEM,
    prompt: "Collect the snapshot now. Treat today as the reference point: 'upcoming' = the next 7 days, 'recent' = the last 7 days.",
  });

  // Phase 2 — shape the notes into the dashboard JSON.
  const { object } = await generateObject({
    model: model(),
    schema: DashboardLiveSchema,
    maxTokens: 1800,
    system: SHAPE_SYSTEM,
    prompt: `Collected notes:\n\n${gather.text || "(the agent returned no notes)"}`,
  });

  return { ...scrubPii(object), generatedAt: Date.now() };
}
