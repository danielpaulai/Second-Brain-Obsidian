import { generateObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { anthropicFetch } from "@/lib/anthropic-fetch";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/voice-format  { text }  →  { display, voice }
 *
 * Splits a finished assistant answer into TWO clean versions for the stage:
 *  - `display`: what's shown on screen — plain, human, NO markdown, NO em-dashes, NO slashes
 *               used as separators, no AI-tell punctuation. Meaningful line breaks kept.
 *  - `voice`:   what's sent to ElevenLabs — optimised for natural spoken delivery (expand
 *               symbols/abbreviations, conversational phrasing, no markdown/URLs/emojis).
 */
function pickModel() {
  const id = process.env.AI_MODEL || "openai/gpt-5.5";
  const [provider, ...rest] = id.split("/");
  const model = rest.join("/");
  if (provider === "openai") {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openai(model || "gpt-5.5");
  }
  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY, fetch: anthropicFetch });
  return anthropic(model || "claude-sonnet-4-6");
}

export async function POST(req: Request) {
  let text = "";
  try {
    const body = (await req.json()) as { text?: string };
    text = (body.text ?? "").trim();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  if (!text) return Response.json({ display: "", voice: "" });

  try {
    const { object } = await generateObject({
      model: pickModel(),
      schema: z.object({
        display: z
          .string()
          .describe(
            "The answer to SHOW on screen. Plain text only — no markdown (**, #, backticks, [[ ]], links). " +
              "NEVER use em-dashes (—) or en-dashes (–); rewrite with commas, periods, or a colon. " +
              "Do NOT use a forward slash '/' as a separator (write 'and', 'or', 'per', or rephrase; e.g. '24/7' → 'around the clock', '1/ ' list markers → '1. '). " +
              "No emojis, no hashtags, no URLs. Keep meaningful line breaks (use \\n) so it reads cleanly. Keep the wording faithful to the original."
          ),
        voice: z
          .string()
          .describe(
            "The SAME answer rewritten for natural text-to-speech. Conversational and smooth when read aloud. " +
              "Spell out or rephrase anything that sounds odd spoken (symbols, slashes, abbreviations, numbers where helpful). " +
              "No markdown, no emojis, no URLs, no list markers or bullet symbols — just flowing spoken sentences. Keep it faithful and not longer than the display version."
          ),
      }),
      prompt: `Convert this assistant answer into a clean on-screen version and a natural spoken version.\n\n---\n${text}\n---`,
    });
    return Response.json({
      display: object.display?.trim() || text,
      voice: object.voice?.trim() || object.display?.trim() || text,
    });
  } catch (err) {
    console.error("[voice-format] failed:", err);
    // Degrade gracefully — caller falls back to the raw text.
    return Response.json({ display: text, voice: text });
  }
}
