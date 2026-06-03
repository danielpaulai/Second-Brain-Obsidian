import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { anthropicFetch } from "./anthropic-fetch";
import { getIdentityContext, buildIdentityPreamble } from "./vault";
import { getAgent, type AgentId } from "./agents";
import { viewerSystemAddendum, type ViewerRole } from "./privacy";
import { buildAgentTools } from "./agent-tools";
import { getSkill, renderSkillForExecution } from "./skills";

export type SkillRunResult = {
  ok: boolean;
  text: string;
  toolCallCount: number;
  durationMs: number;
  modelUsed: string;
  error?: string;
};

function pickModel() {
  const id = process.env.AI_MODEL || "anthropic/claude-sonnet-4-6";
  const [provider, ...rest] = id.split("/");
  const model = rest.join("/");
  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY, fetch: anthropicFetch });
  if (provider === "anthropic")
    return { wrapped: anthropic(model || "claude-sonnet-4-6"), id };
  if (provider === "openai") return { wrapped: openai(model || "gpt-4o"), id };
  return { wrapped: anthropic("claude-sonnet-4-6"), id: "anthropic/claude-sonnet-4-6" };
}

/**
 * Run a skill as the owner (full access) and return the generated text.
 * Used by cron routes — no streaming, no UI surface.
 */
export async function runSkillAsOwner(
  skillId: string,
  inputs: Record<string, unknown>,
  opts: { agentId?: AgentId; maxSteps?: number } = {}
): Promise<SkillRunResult> {
  const t0 = Date.now();
  const viewerRole: ViewerRole = "owner";

  const skill = await getSkill(skillId);
  if (!skill) {
    return {
      ok: false,
      text: "",
      toolCallCount: 0,
      durationMs: Date.now() - t0,
      modelUsed: "(none)",
      error: `skill not found: ${skillId}`,
    };
  }

  const agent = getAgent(opts.agentId || "danny");
  const identity = await getIdentityContext();
  let preamble = buildIdentityPreamble(identity);
  preamble = preamble + viewerSystemAddendum(viewerRole);

  const skillBlock = renderSkillForExecution(skill, inputs);

  const system = [preamble, agent.system, skillBlock].filter(Boolean).join("\n\n");
  const { wrapped: model, id: modelId } = pickModel();

  try {
    const result = await generateText({
      model,
      system,
      messages: [
        {
          role: "user",
          content: `Execute the skill "${skill.name}" with the inputs above. Return the markdown output of the procedure as your entire response.`,
        },
      ],
      tools: buildAgentTools(viewerRole),
      maxSteps: opts.maxSteps ?? 10,
    });

    return {
      ok: true,
      text: result.text,
      toolCallCount: result.toolCalls?.length ?? 0,
      durationMs: Date.now() - t0,
      modelUsed: modelId,
    };
  } catch (err: any) {
    return {
      ok: false,
      text: "",
      toolCallCount: 0,
      durationMs: Date.now() - t0,
      modelUsed: modelId,
      error: err?.message || String(err),
    };
  }
}
