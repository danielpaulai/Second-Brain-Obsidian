import { streamText, tool, type CoreMessage } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { anthropicFetch } from "@/lib/anthropic-fetch";
import { NO_EMDASH_RULE, emDashTransform } from "@/lib/sanitize";
import { z } from "zod";
import { getIdentityContext, buildIdentityPreamble } from "@/lib/vault";
import { searchVault, readVaultNote, recentVaultNotes, vaultStats, buildVaultGraph } from "@/lib/brain-vault";
import { getKnowledgeTree, getKnowledgeNode } from "@/lib/knowledge";
import { getAgent, type AgentId } from "@/lib/agents";
import {
  parseRole,
  redact,
  redactObject,
  viewerSystemAddendum,
  type ViewerRole,
} from "@/lib/privacy";
import { getCurrentUser, getViewerRoleFromAuth } from "@/lib/supabase/server";
import {
  searchMemories,
  storeMemories,
  extractMemoriesFromExchange,
  buildMemoryPreamble,
} from "@/lib/memories";
import { buildBrainTools } from "@/lib/brain-tools";
import { buildBrainWriteTools } from "@/lib/brain-write-tools";
import { buildLinkedInTools } from "@/lib/linkedin-tool";

export const runtime = "nodejs";
export const maxDuration = 60;

// TODO: when we upgrade to AI SDK v6, switch to `@ai-sdk/gateway` to route via
// Vercel AI Gateway using AI_GATEWAY_API_KEY for observability + model fallback.
function pickModel() {
  const id = process.env.AI_MODEL || "anthropic/claude-opus-4-8";
  const [provider, ...rest] = id.split("/");
  const model = rest.join("/");
  if (provider === "openai") {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openai(model || "gpt-4o");
  }
  // Read the key at REQUEST time (not import time) and pass it explicitly —
  // avoids the provider capturing an empty key before env injection.
  const anthropic = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    fetch: anthropicFetch,
  });
  return anthropic(model || "claude-opus-4-8");
}

export async function POST(req: Request) {
  const { messages, agentId, viewerRole: rawRole } = (await req.json()) as {
    messages: CoreMessage[];
    agentId?: AgentId;
    viewerRole?: string;
  };

  const agent = getAgent(agentId || "danny");
  // Auth wins over body param when Supabase is configured. Otherwise fall
  // back to the body's viewerRole (legacy /ask password-gate flow).
  const authRole = await getViewerRoleFromAuth();
  const supabaseConfigured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const viewerRole: ViewerRole = supabaseConfigured
    ? authRole
    : parseRole(rawRole);
  const redactOpts = { role: viewerRole };

  // Memory (Phase 3) — only for authenticated users
  const currentUser = supabaseConfigured ? await getCurrentUser() : null;
  const lastUserMessage = [...messages]
    .reverse()
    .find((m) => m.role === "user");
  const lastUserText =
    typeof lastUserMessage?.content === "string"
      ? lastUserMessage.content
      : "";
  const userMemories = currentUser
    ? await searchMemories(currentUser.id, lastUserText, 6)
    : [];
  const memoryPreamble = buildMemoryPreamble(userMemories);

  // Load Daniel's identity context from _ai-danny/*.md on every request.
  // This is what makes AI Danny actually sound like Danny.
  const identity = await getIdentityContext();
  let preamble = buildIdentityPreamble(identity);
  // Add the privacy addendum so the model knows the viewer's tier.
  preamble = preamble + viewerSystemAddendum(viewerRole);
  // Inject any known facts about THIS user from prior conversations.
  preamble = preamble + memoryPreamble;

  // Force a reasoning loop: query brain → read full notes → synthesize in voice.
  const reasoningRules = `

${NO_EMDASH_RULE}

REASONING LOOP — follow this sequence:
1. If the question touches Daniel's business, voice, ICP, content, decisions, clients, or past work, call \`queryBrain\` first with a precise keyword query.
2. If the search returns relevant notes, call \`readNote\` for the top 1-2 to get the FULL content (excerpts are only 600 chars and not enough to synthesize).
3. If the question is structural ("how many," "most-linked," "biggest cluster"), call \`brainStats\`. For "recent / last week / yesterday," call \`recentNotes\`.
4. For any AGGREGATE or precise-fact question — pipeline value, revenue, # of calls, overdue commitments, your offers, objection rebuttals, decision rules, voice rules, sleep/run/finance metrics — call \`describeBrain\` then \`queryDatabase\` to run SQL against the structured brain. This is cheaper and exact; prefer it over reading notes for anything countable or tabular.
5. WRITE operations (owner-only): use these tools to update the structured brain from conversation:
   - \`logMetric\` — "I slept 7.5h", "my MRR is €12k", "mood 8/10"
   - \`addTask\` — "remind me to...", "add a task to...", "I need to..."
   - \`upsertOffer\` — "the workshop is €2,500", "rename offer X to Y", "retire offer Z"
   - \`closeCommitment\` — "done — I sent Dana the proposal", "mark that commitment closed"
   - \`addDecisionRule\` — "from now on when X, I'll Y", "my rule is...", "I've decided..."
   Before calling any write tool, briefly confirm what you're about to write. After writing, confirm what was saved.
6. Synthesize an answer that: (a) sounds in Daniel's voice from <voice>, (b) applies a relevant framework from <frameworks>, (c) cites the actual notes used as [[Title]], (d) rejects every phrase in <do-not-say>, (e) stays CONSISTENT with the conversation so far. This is ONE continuous chat: read the prior messages, build on them, and never contradict a fact you already gave Daniel (if you told him the workshop floor is €2,500 a moment ago, that is still true now — do not later say "the price wasn't in the notes"). When a follow-up uses "it / that / the price / why", resolve the reference from the earlier turns, not a blank-slate re-lookup; only re-query the brain for genuinely new information, and reconcile it with what you already said.
7. ALWAYS render answers as the rich UI BLOCKS below — never a bare wall of prose. Blocks are the DEFAULT, not a garnish: treat EVERY distinct fact, figure, list, step, entity, quote, definition, or rule as something that belongs INSIDE its matching block, and let plain prose be only the thin connective glue between them. Reach for a block wherever one could plausibly fit, and when in doubt, USE a block rather than a sentence. A substantive answer should be MOSTLY blocks (aim for several, almost never just one), with at most a short framing line or two of plain text. This applies to EVERY answer: the first one AND every follow-up after it. Only a one-word reply (a bare yes/no, name, date, or number with nothing to explain) stays plain text. The instant an answer carries substance — an explanation, a reason, a figure, a recommendation, a sequence, a rule — reach for the block whose SHAPE matches the content. NEVER drop back to a plain paragraph for a follow-up just because it is shorter (a focused follow-up gets FEWER blocks, not zero — e.g. "why was the price set there?" comes back as a [[callout]] with the figure in [[stats]] and the source cited). Pick the element by the data's shape:

   PROSE / EMPHASIS
   - Plain markdown — narrative glue and a short framing summary. Lead a rich answer with a \`# \` title and a 2-3 sentence summary that frames the situation.
   - [[callout:insight|win|risk|note]] one or two sentences [[/callout]] — a SINGLE spotlight takeaway. insight = cyan finding, win = emerald good news, risk = amber concern, note = violet aside. Use more than one only for genuinely distinct big points (a win AND a risk).
   - [[quote:Who]] the line they actually said [[/quote]] — a verbatim pull-quote; use more than one if warranted.
   - [[define:Term]] the meaning in 1-2 sentences [[/define]] — ONE term + its authoritative definition ("what is my ICP", "the 6-week outcome model"). Prefer over a callout when the answer is a canonical definition or principle.

   LISTS & SEQUENCES — pick by whether ORDER matters
   - [[keypoints]] then a \`- \` bullet per line [[/keypoints]] — UNORDERED key points / takeaways (usually 4-8, each a FULL specific sentence with real detail, not a stub).
   - [[actions]] then a \`- \` bullet per line [[/actions]] — a flat list of next steps / commitments / open threads, each concrete.
   - [[steps:Framework name]] then "Step title | what you do" per line [[/steps]] — an ORDERED, auto-numbered playbook / framework (one of Daniel's repeatable processes, e.g. "how you onboard a client"). Use when each step builds on the last. Do NOT write the numbers yourself.
   - [[timeline:Title]] then "When | Title | detail" per line [[/timeline]] — a CHRONOLOGICAL answer: a call/meeting recap (the arc of the call) or "what did I do last week". "When" is a short time anchor (0:11, Tue, Mar 14). FILL ALL THREE fields on EVERY event — a real When, a specific Title, and a full-sentence detail of what actually happened or was said. NEVER leave an event as a bare title with empty When/detail; if the source is thin, infer a sensible When and a concrete detail from the surrounding context. Use MANY events (a real call has 6-10 beats). Never fake chronology with bolded dates inside keypoints.

   NUMBERS & DATA — pick by shape
   - [[kpi:accent]] then "Value | Label | delta | context" [[/kpi]] — ONE hero number that dominates the answer (total pipeline, MRR, # of calls). accent = cyan|violet|emerald|amber|sky|rose; an optional delta starting with + or - drives a momentum pill (e.g. +18% MoM).
   - [[stats]] then "Label | Value | sub" per line [[/stats]] — a small set of several EQUAL headline numbers in a grid.
   - [[meter:Title]] then "Label | current | target | unit" per line [[/meter]] — a metric progressing toward a GOAL (MRR vs target, calls booked vs quota). Use when each number has a current AND a target.
   - [[bars:Title]] then "Label | value | unit" per line [[/bars]] — COMPARE 2-7 like-for-like quantities where ranking matters (revenue by offer, calls by channel, deal value by client).
   - [[table:Title]] then a header row, then one row per line, cells split by | [[/table]] — genuinely RELATIONAL data: multiple records each sharing the same 2-4 columns (your active deals with stage + value + next step, top notes by backlinks). Use when stats (single numbers) and bars (one quantity each) cannot show rows-by-columns. NEVER hand-write a raw markdown table — always wrap tabular data in [[table]].

   ENTITIES & RULES
   - [[people:Title]] then "Name | Role @ Company | note" per line [[/people]] — a roster of HUMANS each needing identity + a one-line relationship note ("who's on the Acme deal", "who did I talk to"). Use chips only for a bare name/tag cloud.
   - [[chips:Title]] Dana, B2B Founders, Workshop Offer [[/chips]] — a flat pill row of entities / topics / tags with no per-item detail.
   - [[decision:Rule name]] **When:** condition **Then:** action **Because:** rationale [[/decision]] — a DECISION RULE / conditional "when X, I do Y" heuristic. One rule per block.

   DEPTH — thin answers are the #1 failure, so deliberately over-correct. A recap or any "tell me about X" answer must be LONG and use MANY elements: aim for at least 5-6 distinct blocks. When the question is about a call, meeting, recording, project, or any note worth unpacking ("what was my last call with Dana about?"), do NOT give a 3-line skeleton. First READ the full note(s) with \`readNote\` (and queryBrain for related notes), then reconstruct the WHOLE picture in this shape:
     • a \`# \` title and a 3-4 sentence framing summary that sets up who, what, and why it mattered;
     • a [[timeline]] with EVERY real beat — 6-10 moments (the opening and what was really wanted, each topic raised, every objection and exactly how it was handled, each number or term discussed, what was agreed, the next step), each row with a When AND a full-sentence detail;
     • [[keypoints]] covering ALL substantive takeaways (5+), each a complete sentence with real detail;
     • [[actions]] for every next step / open thread;
     • [[stats]] for every figure, amount, date, count mentioned;
     • a [[quote]] of an actual telling line, [[people]] for who was involved, and a [[decision]] if a rule was set.
   Name the real people, numbers, dates, objections, and reasoning from the source. If the note is genuinely brief, STILL expand: infer and reconstruct reasonable specifics from the note and the surrounding context to fill the gaps rather than returning a sparse answer (the user prefers a rich, fully-populated answer over a terse one). Apply this same depth to EVERY substantive answer, not only call recaps. Err hard toward completeness over brevity.
   RULES: one block per distinct idea; do NOT nest tokens; ALWAYS close every token you open ([[x]] … [[/x]]) — a dangling open tag renders as broken text. Bodies are exactly the plain pipe-delimited or labelled lines shown (the component does all styling, numbering, and colour). For a block with no :param (keypoints, actions, stats), its content must begin on the LINE AFTER the opening token (never inline on the same line). **bold** and [[Note Title]] citations work inside details and every field degrades gracefully if omitted. Vary which blocks you reach for answer to answer. Do NOT emit [[chart:...]] on general answers (charts are LinkedIn-only). Avoid em-dashes; use commas or periods. (Note-citations like [[Some Note Title]] from rule 6 still work — they are not blocks.)
8. If Daniel asks to check / scrape / review his LinkedIn, what to post next, a content idea, or a new LinkedIn post, call \`suggestLinkedInPost\`. Present the returned \`post\` verbatim (optionally one short framing sentence first) — do NOT rewrite it.`;

  const system = [preamble, agent.system + reasoningRules].filter(Boolean).join("\n\n");

  // Hard guarantee (belt-and-suspenders with the prompt rule above): rewrite em/en dashes out of the
  // streamed text so one can NEVER reach the UI, whatever the model emits. Touches only text deltas;
  // tool calls and every other stream part pass through untouched.
  const stripDashes = emDashTransform();

  const result = streamText({
    model: pickModel(),
    system,
    experimental_transform: stripDashes,
    messages,
    // After the response completes, extract any durable memories and store them.
    // Fire-and-forget — does NOT block the response stream.
    onFinish: async ({ text }) => {
      if (!currentUser || !lastUserText || !text) return;
      try {
        const extracted = await extractMemoriesFromExchange(lastUserText, text);
        if (extracted.length > 0) {
          await storeMemories(currentUser.id, extracted);
        }
      } catch (err) {
        console.error("[memories] post-stream extraction failed:", err);
      }
    },
    onError: (event: any) => {
      console.error("[chat] STREAM ERROR:", event?.error ?? event);
    },
    tools: {
      queryBrain: tool({
        description:
          "Hybrid keyword + semantic search across Daniel's Obsidian vault. Use for any question about his voice, ICP, clients, content, decisions, business state, or past work. Semantic search finds notes by MEANING (e.g. 'best client transformation' finds high-result client work even when those exact words aren't in the note).",
        parameters: z.object({
          query: z.string().describe("Search query — natural language or keywords. Phrase it as the user would, not as keywords."),
          limit: z.number().int().min(1).max(12).default(6),
        }),
        execute: async ({ query, limit }) => {
          const hits = await searchVault(query, { limit, groupByDocument: true });
          const payload = {
            query,
            mode: "semantic",
            count: hits.length,
            results: hits.map((h) => ({
              title: h.title,
              folder: h.folder,
              excerpt: (h.content || "").slice(0, 600),
              foundBy: "semantic",
            })),
          };
          return await redactObject(payload, redactOpts);
        },
      }),
      brainStats: tool({
        description:
          "Get structural facts about the vault — total notes, total links, top hub notes (most-linked), and folder breakdown. Use when the user asks about the brain itself rather than its contents.",
        parameters: z.object({
          topHubs: z.number().int().min(1).max(20).default(10),
        }),
        execute: async ({ topHubs }) => {
          const stats = await vaultStats();
          const { graph } = await buildVaultGraph();
          const sorted = [...graph.nodes].sort((a, b) => (b.degree ?? 0) - (a.degree ?? 0)).slice(0, topHubs);
          const folderCounts = new Map<string, number>();
          for (const n of graph.nodes) folderCounts.set(n.folder, (folderCounts.get(n.folder) ?? 0) + 1);
          const folders = [...folderCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([folder, count]) => ({ folder, count }));
          const payload = {
            totals: { notes: stats.documents, links: graph.links.length, folders: stats.folders },
            topHubs: sorted.map((n) => ({ title: n.name, folder: n.folder, degree: n.degree ?? 0 })),
            foldersByCount: folders.slice(0, 15),
          };
          // Hub titles often contain client names — redact for non-owner viewers.
          return await redactObject(payload, redactOpts);
        },
      }),
      recentNotes: tool({
        description:
          "List the most recently edited notes in the vault. Use for 'what did I work on last week / yesterday / recently'.",
        parameters: z.object({ limit: z.number().int().min(1).max(20).default(10) }),
        execute: async ({ limit }) => {
          const notes = await recentVaultNotes(undefined, limit);
          const payload = {
            count: notes.length,
            results: notes.map((n) => ({
              title: n.title,
              folder: n.folder,
              editedAt: n.mtime ? new Date(n.mtime).toISOString() : null,
              excerpt: n.excerpt,
            })),
          };
          return await redactObject(payload, redactOpts);
        },
      }),
      readNote: tool({
        description:
          "Read the FULL body of a specific note by exact title (case-insensitive). Always call this for the top 1-2 hits from queryBrain before synthesizing an answer — excerpts alone are not enough.",
        parameters: z.object({
          title: z.string().describe("Exact note title, e.g. 'Client Index' or 'Personal_Branding_session_4_2023_11_26'"),
        }),
        execute: async ({ title }) => {
          // Public viewers should never read raw vault notes — refuse cleanly.
          if (viewerRole === "public") {
            return {
              found: false,
              refused: "Reading raw vault notes is not allowed for public viewers. Use queryKnowledge for principle-only summaries.",
              title,
            };
          }
          const note = await readVaultNote(title);
          if (!note.found) return { found: false, title };
          return await redactObject(
            {
              found: true,
              title: note.title,
              folder: note.folder,
              fullBody: note.content,
            },
            redactOpts
          );
        },
      }),
      listKnowledgeCategories: tool({
        description:
          "List the AI Danny knowledge map — 15 macros, 266 pre-distilled categories of Daniel's actual thinking. PREFER calling this FIRST for any question that maps to a clear topic (pricing, hooks, sales discovery, daily rituals, mentors, etc.). It returns macros + sub-category titles + slugs + status. Then call queryKnowledge with the matching slug.",
        parameters: z.object({
          macro: z
            .string()
            .optional()
            .describe(
              "Optional macro prefix (e.g. '06' or '06-personal-branding-coaching') to filter to one macro"
            ),
        }),
        execute: async ({ macro }) => {
          const tree = await getKnowledgeTree();
          const filtered = macro
            ? tree.filter((m) => m.dir.startsWith(macro))
            : tree;
          return {
            macros: filtered.map((m) => ({
              dir: m.dir,
              title: m.title,
              count: m.count,
              distilled: m.nodes.filter((n) => n.status === "distilled").length,
              nodes: m.nodes.map((n) => ({
                slug: n.slug,
                title: n.title,
                status: n.status,
              })),
            })),
          };
        },
      }),
      queryKnowledge: tool({
        description:
          "Read the distilled synthesis for ONE specific knowledge category — already written in Daniel's voice and citing the source vault notes. ALWAYS prefer this over queryBrain when the question maps clearly to a category (pricing philosophy, hook patterns, sales discovery, daily rituals, mentors, etc.). Cheaper, faster, on-voice. Use listKnowledgeCategories first if unsure of the exact macro/slug.",
        parameters: z.object({
          macro: z
            .string()
            .describe("Macro folder, e.g. '04-offers-pricing' or '06-personal-branding-coaching'"),
          slug: z
            .string()
            .describe(
              "Sub-category slug, e.g. 'pricing-philosophy' or 'how-you-close-calls'"
            ),
        }),
        execute: async ({ macro, slug }) => {
          const node = await getKnowledgeNode(macro, slug);
          if (!node) return { ok: false, error: `not found: ${macro}/${slug}` };
          const payload = {
            ok: true as const,
            title: node.title,
            macro: node.macroTitle,
            status: node.status,
            description: node.description,
            distilled: node.body || null,
            isEmpty: !node.body,
          };
          return await redactObject(payload, redactOpts);
        },
      }),
      ...buildBrainTools(viewerRole),
      ...buildBrainWriteTools(viewerRole, currentUser?.id ?? null),
      ...buildLinkedInTools(),
    },
    maxSteps: 10,
  });

  return result.toDataStreamResponse({
    headers: { "X-Agent-Id": agent.id, "X-Agent-Name": agent.name },
    getErrorMessage: (error: unknown) => {
      console.error("[chat] toDataStream error:", error);
      return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    },
  });
}
