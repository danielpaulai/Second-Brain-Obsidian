import { streamText, tool, type CoreMessage } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { anthropicFetch } from "@/lib/anthropic-fetch";
import { z } from "zod";
import { NO_EMDASH_RULE, emDashTransform } from "@/lib/sanitize";
import { callZapierTool, executeZapierAction, zapierMcpConfigured } from "@/lib/zapier-mcp";
import { searchVault, readVaultNote } from "@/lib/brain-vault";
import { scrapeLinkedInProfile } from "@/lib/lead-scraper";

export const runtime = "nodejs";
export const maxDuration = 120;

function pickModel() {
  const id = process.env.AI_MODEL || "anthropic/claude-opus-4-8";
  const [provider, ...rest] = id.split("/");
  const model = rest.join("/");
  if (provider === "openai") {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openai(model || "gpt-4o");
  }
  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY, fetch: anthropicFetch });
  return anthropic(model || "claude-opus-4-8");
}

/** Keep tool results small so big record sets don't blow the context. */
function trim(v: unknown, max = 14): unknown {
  if (Array.isArray(v)) return v.slice(0, max).map((x) => trim(x, max));
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = typeof val === "string" ? val.slice(0, 600) : trim(val, 6);
    }
    return out;
  }
  return v;
}

const SYSTEM = `You are the founder's operations agent, living inside their private command dashboard. You can act across their connected apps via MCP tools (Gmail, Slack, Notion, Google Calendar, Zoom, LinkedIn), look up LinkedIn profiles with a dedicated scraper, and read their second brain (their Obsidian vault). This is the OWNER's private cockpit, so showing their own data back to them is fine.

APPROVALS — be decisive, not annoying:
- READS NEVER need approval. Anything that only reads / searches / lists / gets / looks up (readData, searchBrain, readBrainNote, linkedinProfile) — just run it immediately and use the result. NEVER ask before reading.
- ONLY WRITES need approval: anything that CREATES, UPDATES, DELETES, SENDS, POSTS, SCHEDULES, or INVITES. For those you MUST call \`proposeAction\` and then STOP — never write directly. The user reviews an approval card; on approval the system runs it and returns the result, then you confirm. If declined, acknowledge and offer an alternative.

HOW TO WORK
- To act on an app, call \`listApps\` once to get its \`selected_api\`, then \`listActions(selected_api)\` to find the exact action key.
- For anything that only READS, call \`readData\` directly (Zapier resolves params from your natural-language \`instructions\`).
- ANYTHING LinkedIn — looking someone up, scraping a profile, researching a person/prospect — ALWAYS call \`linkedinProfile(query)\` IMMEDIATELY as your FIRST step. It scrapes via Apify and returns the FULL profile. There is NO LinkedIn app in the MCP list (it's hidden on purpose), so NEVER call \`listApps\`/\`listActions\`/\`readData\` for LinkedIn — go straight to \`linkedinProfile\`. The result renders as a rich report card automatically, so do NOT re-list every field in your text; add only a short useful takeaway or answer their specific question.
- Use \`searchBrain\` / \`readBrainNote\` for context from the founder's own notes.

BE EFFICIENT — make the FEWEST tool calls that fully answer the request, in a sensible order:
- Call \`listApps\` AT MOST ONCE per conversation, and \`listActions\` at most once per app — remember the results; never re-list what you already have.
- Reads are forgiving — if you know the app + a sensible action you can call \`readData\` directly. But for a WRITE, ALWAYS use the EXACT action key from \`listActions\` for that app — never invent keys like "draft" or "send"; if you don't already have the exact key, call \`listActions(selected_api)\` first. (The system auto-corrects a wrong key, but getting it right avoids a retry.)
- Don't make speculative or duplicate calls. Plan the sequence, then execute it.

OUTPUT: respond in clean, concise GitHub-flavored Markdown — short headings, tight bullet lists, **bold** for the key facts. Keep it brief; the data already shows in the cards above your reply, so summarize and recommend rather than re-listing rows. ${NO_EMDASH_RULE}`;

function buildTools() {
  return {
    listApps: tool({
      description: "List the connected MCP apps and each one's selected_api id. Call this first when you need to act on an app.",
      parameters: z.object({}),
      execute: async () => {
        const r = await callZapierTool("list_enabled_zapier_actions", {});
        const d = r.data as Record<string, unknown> | null;
        const apps = (d?.apps as unknown[]) ?? (Array.isArray(d) ? d : []);
        return {
          ok: r.ok,
          // LinkedIn is intentionally hidden from the MCP list — its MCP action can't
          // return profile detail. Anything LinkedIn goes through `linkedinProfile` (Apify).
          apps: (apps as Record<string, unknown>[])
            .map((a) => ({ app: a.app ?? a.name, selected_api: a.selected_api ?? a.api }))
            .filter((a) => !/linkedin/i.test(String(a.app)) && !/linkedin/i.test(String(a.selected_api))),
          error: r.error,
        };
      },
    }),
    listActions: tool({
      description: "List the available actions for ONE app (by its selected_api), so you can find the exact action key and whether it reads or writes.",
      parameters: z.object({ selected_api: z.string() }),
      execute: async ({ selected_api }) => {
        const r = await callZapierTool("list_enabled_zapier_actions", { selected_api });
        const d = r.data as unknown;
        const acts = (Array.isArray(d) ? (d[0] as Record<string, unknown>)?.actions : (d as Record<string, unknown>)?.actions) as Record<string, unknown>[] | undefined;
        return {
          ok: r.ok,
          actions: (acts ?? []).map((a) => ({ key: a.key, name: a.name, write: a.tool === "execute_zapier_write_action" })),
          error: r.error,
        };
      },
    }),
    readData: tool({
      description: "Execute a READ-ONLY action (find / list / get / search) on an app and return the records. Use ONLY for reads. Describe what to fetch in `instructions`; Zapier fills the params.",
      parameters: z.object({
        selected_api: z.string(),
        action: z.string().describe("the action key from listActions"),
        instructions: z.string().describe("natural-language description of what to fetch"),
        output: z.string().optional().describe("the fields you want back, comma-separated"),
      }),
      execute: async ({ selected_api, action, instructions, output }) => {
        // foolproof: resolves a wrong/guessed action key + always sends `output`
        const r = await executeZapierAction("read", { selected_api, action, instructions, output });
        const d = r.data as Record<string, unknown> | null;
        const records = Array.isArray(d?.results) ? (d!.results as unknown[]) : d;
        return { ok: r.ok, count: Array.isArray(records) ? records.length : undefined, records: trim(records), available: r.available, error: r.error };
      },
    }),
    searchBrain: tool({
      description: "Semantic search across the founder's second brain (Obsidian vault) — clients, voice, decisions, notes, past work.",
      parameters: z.object({ query: z.string(), limit: z.number().int().min(1).max(10).default(6) }),
      execute: async ({ query, limit }) => {
        const hits = await searchVault(query, { limit, groupByDocument: true });
        return { results: hits.map((h) => ({ title: h.title, folder: h.folder, excerpt: (h.content || "").slice(0, 500) })) };
      },
    }),
    readBrainNote: tool({
      description: "Read the full content of ONE brain note by exact title.",
      parameters: z.object({ title: z.string() }),
      execute: async ({ title }) => {
        const n = await readVaultNote(title);
        return n.found ? { found: true, title: n.title, folder: n.folder, content: (n.content || "").slice(0, 6000) } : { found: false };
      },
    }),
    linkedinProfile: tool({
      description:
        "Look up ONE LinkedIn person and return their FULL profile (headline, about, experience, education, skills, metrics) via the dedicated scraper. Use for ANY LinkedIn profile lookup or prospect research — NOT the LinkedIn MCP. The result renders to the user as a rich report card automatically.",
      parameters: z.object({
        query: z.string().describe("the person's name, ideally with company or title for precision, e.g. 'Jane Doe, Head of Growth at Acme'"),
      }),
      execute: async ({ query }) => scrapeLinkedInProfile(query),
    }),
    // HUMAN-IN-THE-LOOP: no execute() — the client renders an approval card, runs
    // it on approval via /api/dashboard/agent/execute, and returns the result.
    proposeAction: tool({
      description:
        "Propose a WRITE / side-effecting action for the user to APPROVE before it runs (send email, post to Slack, create/update Notion, schedule a calendar event, etc.). Never run writes yourself — always propose. After approval the system executes it and returns the result.",
      parameters: z.object({
        app: z.string().describe("the app's display name, e.g. 'Gmail'"),
        selected_api: z.string().describe("the app's selected_api"),
        action: z.string().describe("the WRITE action key from listActions"),
        title: z.string().describe("a short human title, e.g. 'Send email to Dana'"),
        summary: z.string().describe("1-2 sentence plain-English description of exactly what will happen"),
        instructions: z.string().describe("the complete natural-language instruction Zapier will use to perform the write (include all the content/recipients/values)"),
        details: z
          .array(z.object({ label: z.string(), value: z.string() }))
          .describe("the key fields for the approval card (To, Subject, Body preview, Channel, Date, etc.)"),
        risk: z.enum(["low", "medium", "high"]).describe("how consequential / hard to reverse the action is"),
      }),
    }),
  };
}

export async function POST(req: Request) {
  const { messages } = (await req.json()) as { messages: CoreMessage[] };

  const result = streamText({
    model: pickModel(),
    system:
      SYSTEM +
      (zapierMcpConfigured() ? "" : "\n\nNOTE: the connected apps (MCP) are not configured right now, so app actions will fail — you can still use the second brain. Tell the user if they ask to act on an app."),
    messages,
    tools: buildTools(),
    maxSteps: 12,
    experimental_transform: emDashTransform(),
    onError: (event: unknown) => {
      console.error("[dashboard-agent] stream error:", event);
    },
  });

  return result.toDataStreamResponse({
    getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  });
}
