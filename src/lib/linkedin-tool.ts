/**
 * linkedin-tool.ts — the `suggestLinkedInPost` tool (a sub-agent). It has Daniel's last 10
 * LinkedIn posts hardcoded ([[linkedin-data]]) with their reactions/comments/shares, ranks
 * them by engagement, hands them to a ghostwriter sub-agent (a nested generateText call),
 * and returns ONE drafted post to publish next. The main chat agent presents the draft.
 */

import { tool, generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { LINKEDIN_POSTS, type LinkedInPost } from "./linkedin-data";

function pickModel() {
  const id = process.env.AI_MODEL || "openai/gpt-5.5";
  const [provider, ...rest] = id.split("/");
  const model = rest.join("/");
  if (provider === "openai") {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openai(model || "gpt-4o");
  }
  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropic(model || "claude-sonnet-4-6");
}

/** Weighted engagement score — comments + shares count more than passive reactions. */
function score(p: LinkedInPost): number {
  const reactions = p.reactions.reduce((s, r) => s + r.count, 0);
  return reactions + p.comments * 2 + p.shares * 3;
}

export function buildLinkedInTools() {
  return {
    suggestLinkedInPost: tool({
      description:
        "Call this WHENEVER Daniel asks to check / scrape / review / look at his LinkedIn, or asks what to post next, for a content idea, or for a new LinkedIn post. It analyses his last 10 LinkedIn posts (captions + reaction/comment/share counts) and DRAFTS one new post in his voice. Present the returned `post` verbatim as your answer — you may prefix it with one short sentence of framing, but do NOT rewrite the post.",
      parameters: z.object({
        angle: z
          .string()
          .optional()
          .describe("Optional topic/angle Daniel hinted at (e.g. 'AI funnels', 'hiring')."),
      }),
      execute: async ({ angle }) => {
        const ranked = [...LINKEDIN_POSTS].sort((a, b) => score(b) - score(a));
        const context = ranked
          .map((p, i) => {
            const reactions = p.reactions.reduce((s, r) => s + r.count, 0);
            return `POST ${i + 1} — ${reactions} reactions · ${p.comments} comments · ${p.shares} shares\n${p.content}`;
          })
          .join("\n\n———\n\n");

        const prompt = `Here are Daniel Paul's last 10 LinkedIn posts, ranked by engagement (highest first), with their reaction / comment / share counts:

${context}

First, silently work out what's driving the winners — the hook style, topics, post length, formatting (short lines, line breaks), and the through-line in his voice.

Then WRITE ONE new LinkedIn post for Daniel to publish next. It must:
- build on his best-performing patterns${angle ? ` and lean into: ${angle}` : ""}
- open with a scroll-stopping one-line hook
- use short, punchy lines with line breaks (no walls of text)
- sound exactly like him — direct, practical, founder-to-founder, AI-for-business
- end with a clear takeaway or soft CTA
- no hashtag spam, no emoji-bullets

Output ONLY the post text, ready to paste.`;

        try {
          const { text } = await generateText({
            model: pickModel(),
            system:
              "You are Daniel Paul's LinkedIn ghostwriter. You write in his exact voice and only ever output a single ready-to-publish post draft.",
            prompt,
          });
          return {
            ok: true,
            post: text.trim(),
            analysed: LINKEDIN_POSTS.length,
            topPerformers: ranked.slice(0, 3).map((p) => ({
              reactions: p.reactions.reduce((s, r) => s + r.count, 0),
              comments: p.comments,
              hook: (p.content.split("\n")[0] || "").slice(0, 90),
            })),
          };
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
    }),
  };
}
