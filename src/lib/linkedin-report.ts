/**
 * Shared LinkedIn-report builder. Turns a natural-language ask ("analyse my last 20 posts")
 * into the report payload the UI renders: deterministic chart data (computeLinkedInStats) plus a
 * narrative written with a real reasoning pass (Anthropic Claude by default, OpenAI high-effort if
 * AI_MODEL=openai/...). Used by BOTH /api/linkedin-report (static output.json) and the dashboard's
 * live "scrape my own posts" tool (which passes freshly scraped posts) — so the report is identical
 * whether the data is cached or just scraped.
 */

import { generateText } from "ai";
import { NO_EMDASH_RULE, stripEmDashes } from "@/lib/sanitize";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { anthropicFetch } from "@/lib/anthropic-fetch";
import { computeLinkedInStats, type RawPost } from "@/lib/linkedin-analysis";
import { parseLinkedInScope } from "@/lib/linkedin-scope";
import type { LIMonthly, LITopPost, LIReaction } from "@/lib/linkedin-charts";

export type LinkedInReportPayload = {
  kpis: { posts: number; reactions: number; comments: number; shares: number; avgEngagement: number };
  monthly: LIMonthly[];
  topPosts: LITopPost[];
  reactionMix: LIReaction[];
  /** LLM-authored markdown with [[chart:NAME]] tokens + the shared answer-block tokens inline. */
  document: string;
  /** Human window label ("your last 5 posts", "the last month") for the UI header. */
  scopeLabel: string;
};

type Picked = {
  model: Parameters<typeof generateText>[0]["model"];
  providerOptions: NonNullable<Parameters<typeof generateText>[0]["providerOptions"]>;
};
function pickModel(): Picked {
  const id = process.env.AI_MODEL || "anthropic/claude-opus-4-8";
  const [provider, ...rest] = id.split("/");
  const model = rest.join("/");
  if (provider === "openai") {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    // Responses API — required for reasoning models (effort set via providerOptions).
    return { model: openai.responses(model || "gpt-5.5"), providerOptions: { openai: { reasoningEffort: "high" } } };
  }
  // Read the key at REQUEST time (not import time) so env injection is in effect.
  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY, fetch: anthropicFetch });
  // NOTE: Opus 4.7/4.8 REMOVED `thinking: {type:"enabled", budget_tokens}` — sending it 400s.
  // Opus 4.8 reasons well without an explicit thinking budget; omit thinking config here.
  return { model: anthropic(model || "claude-opus-4-8"), providerOptions: { anthropic: {} } };
}

/** Hand-authored fallback so the report still renders if the LLM call fails. */
const FALLBACK_DOC =
  "## Your AI-build posts are your biggest winners\n\n[[callout:win]] Concrete 'I built X' AI stories dominate. Your top post pulled 1,800+ reactions and 4,600+ comments. [[/callout]]\n\n[[chart:topPosts]]\n\nEngagement spiked in spring when you posted these consistently.\n\n[[chart:engagement]]\n\n## What to post next\n\n[[idea]]\n**Hook:** I rebuilt my whole content engine with AI in a weekend. Here's the exact stack.\n**Angle:** Walk through the tools and wiring, screenshots included.\n**Format:** Carousel\n**Why:** Your 'I built X' posts are your top performers by a wide margin.\n[[/idea]]\n\n[[idea]]\n**Hook:** I made a free Notion template that plans 30 days of posts. Take it, no email needed.\n**Angle:** Give away something genuinely useful with no gate.\n**Format:** Text post\n**Why:** Generosity posts outperform your workshop promos every time.\n[[/idea]]";

/**
 * Build the full report payload for `query`. Pass `posts` to analyse a freshly scraped set;
 * omit it to analyse the bundled output.json (the /stage + charts-preview behaviour).
 */
export async function buildLinkedInReport(opts: { query?: string; posts?: RawPost[] }): Promise<LinkedInReportPayload> {
  const query = (opts.query ?? "").trim() || "Analyse my LinkedIn — what's working, what's not, and what should I do next?";

  // The window the user asked for ("last month", "last 5 posts"…) drives the charts, KPIs and advice.
  const scope = parseLinkedInScope(query);
  const stats = computeLinkedInStats(scope, opts.posts);

  const topBlock = stats.topContent
    .map((p, i) => `#${i + 1} · ${p.reactions} reactions · ${p.comments} comments · ${p.shares} shares\n"${p.hook}"\n${p.excerpt}`)
    .join("\n\n");
  const bottomBlock = stats.bottomContent
    .map((p) => `${p.reactions} reactions · ${p.comments} comments\n"${p.hook}"\n${p.excerpt}`)
    .join("\n\n");

  const prompt = `You are Daniel Paul's LinkedIn growth analyst. Daniel has just asked you:

"${query}"

Answer THAT request specifically — do not produce a generic report. If he asked for a content plan, deliver a content plan (e.g. a numbered list of the exact posts to write, each with a hook + angle). If he asked what's working, analyse that. Shape the whole response around his actual ask.

SCOPE: Daniel asked you to look at ${scope.label}. Every number, chart, and recommendation below is computed from EXACTLY that window — frame your whole analysis around ${scope.label} (say so explicitly, e.g. "Across ${scope.label}…"), and base your advice on what this window shows, not his all-time history. ${
    stats.kpis.posts < 8
      ? `This is a small sample (${stats.kpis.posts} posts), so call out trends as directional, not definitive.`
      : ""
  }

Here is the data on ${scope.label} (${stats.kpis.posts} posts):
OVERALL: ${stats.kpis.reactions.toLocaleString()} reactions, ${stats.kpis.comments.toLocaleString()} comments, ${stats.kpis.shares.toLocaleString()} shares, avg ${stats.kpis.avgEngagement} engagement/post.

TOP PERFORMERS:
${topBlock}

WEAKEST PERFORMERS:
${bottomBlock}

You have FOUR data visualisations. EMBED ALL FOUR exactly once, each by writing its token ON ITS OWN LINE at the point in your analysis where it genuinely supports what you're saying (a thorough read of this data naturally touches all four — the trend, the winners, the audience's reaction quality, and the posting rhythm). Don't force them into a list; weave each one in where it earns its place:
- [[chart:engagement]] — engagement over time (monthly trend) — peaked hard in spring.
- [[chart:topPosts]]   — his top 7 posts by engagement (the "I built an AI team" posts dominate).
- [[chart:reactions]]  — reaction-type mix (≈81% plain Likes — shallow, mostly passive).
- [[chart:cadence]]    — posts-per-month vs average engagement (does volume help or hurt?).

You have rich UI BLOCK tokens — use them so the report renders as live elements, not walls of text:
- POST IDEA (renders as a LinkedIn post preview). One per content idea / post suggestion:
[[idea]]
**Hook:** the exact opening line Daniel would post (this is shown as the post body, so write it as the real post opener)
**Angle:** one line on what the post argues
**Format:** text post / carousel / short video / etc.
**Why:** one line tying it to the data above
[[/idea]]
- [[callout:insight]] one or two sentences [[/callout]] — spotlight a key finding. Variants: insight, win, risk, note.
- [[stats]] then "Label | Value" per line (e.g. Avg engagement | 201) [[/stats]] — standout numbers.
- [[kpi:accent]] then "Value | Label | delta | context" [[/kpi]] — ONE hero number worth dominating (e.g. a top post's reactions, total engagement). accent = cyan|violet|emerald|amber|sky|rose; an optional delta starting with + or - shows a momentum pill.
- [[bars:Title]] then "Label | value" per line [[/bars]] — compare a handful of like-for-like quantities the four charts do NOT already cover (e.g. avg engagement by format: text vs carousel vs video).
- [[keypoints]] / [[actions]] with \`- \` bullets — what's working / what to do.
If Daniel asked for a content plan or what to post next, deliver the plan as a SERIES of [[idea]] previews (one per post), NOT a numbered list. Use callouts/stats for the analysis highlights. Keep the connecting narrative as short prose, with the four charts woven in.

Write a DETAILED, thorough response that reads like a senior strategist's full work-up, go deep, not a quick summary. Open with a single \`## \` headline, then build the analysis section by section with real evidence from the numbers, embedding each chart where it backs your point and using callouts/stats to make findings pop. Even if Daniel asked for a content plan, FIRST ground it in a proper read of the data (referencing all four charts), THEN deliver the plan AS [[idea]] PREVIEWS. Be concrete and specific, cite actual posts and figures. Do NOT mention the tokens or that you are inserting charts/blocks.\n\n${NO_EMDASH_RULE}`;

  let document = FALLBACK_DOC;
  try {
    const { model, providerOptions } = pickModel();
    const { text } = await generateText({
      model,
      providerOptions,
      prompt,
      maxTokens: 16000, // headroom for the thinking budget + a detailed report
    });
    if (text.trim()) document = stripEmDashes(text);
  } catch {
    /* keep the fallback document so the charts still render */
  }

  return {
    kpis: stats.kpis,
    monthly: stats.monthly,
    topPosts: stats.topPosts,
    reactionMix: stats.reactionMix,
    document,
    scopeLabel: scope.label,
  };
}
