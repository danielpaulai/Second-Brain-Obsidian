import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

/**
 * Skills = procedural knowledge stored as markdown files in
 * <vault>/_ai-danny/skills/*.md
 *
 * Each skill has YAML frontmatter (name, description, inputs) + a markdown
 * body that's the procedure. The skill body is injected verbatim into the
 * system prompt when Danny is asked to run that skill — Danny then executes
 * the procedure using its existing tools (queryBrain, queryKnowledge, etc.).
 *
 * This is the "Capabilities" layer in the Nate Herk 4-Cs framework.
 */

const VAULT_PATH = process.env.VAULT_PATH || "";
const SKILLS_DIR = "_ai-danny/skills";

export type SkillInputSpec = {
  name: string;
  type: "string" | "number" | "boolean";
  required?: boolean;
  description?: string;
};

export type Skill = {
  /** Slug used to invoke — comes from filename without `.md`. */
  id: string;
  /** Human-readable name from frontmatter. */
  name: string;
  /** One-line description for tool listing. */
  description: string;
  /** Input parameters the skill expects. */
  inputs: SkillInputSpec[];
  /** Whether this is an internal/admin-only skill (owner-tier only). */
  ownerOnly: boolean;
  /** The markdown procedure body. */
  body: string;
};

let cache: { skills: Skill[]; loadedAt: number } | null = null;
const TTL_MS = 15_000;

export async function loadSkills(): Promise<Skill[]> {
  if (cache && Date.now() - cache.loadedAt < TTL_MS) return cache.skills;
  if (!VAULT_PATH) return [];

  const dir = path.join(VAULT_PATH, SKILLS_DIR);
  let files: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    files = entries
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => path.join(dir, e.name));
  } catch {
    // Folder doesn't exist yet — that's fine, return empty.
    return [];
  }

  const skills: Skill[] = [];
  for (const file of files) {
    try {
      const raw = await fs.readFile(file, "utf8");
      const { data, content } = matter(raw);
      const slug = path.basename(file, ".md");
      skills.push({
        id: slug,
        name: String(data.name || slug),
        description: String(data.description || "").slice(0, 240),
        inputs: Array.isArray(data.inputs) ? (data.inputs as SkillInputSpec[]) : [],
        ownerOnly: Boolean(data.ownerOnly ?? false),
        body: content.trim(),
      });
    } catch (err) {
      console.warn("[skills] failed to load", file, err);
    }
  }
  cache = { skills, loadedAt: Date.now() };
  return skills;
}

export async function getSkill(id: string): Promise<Skill | null> {
  const all = await loadSkills();
  return all.find((s) => s.id === id) ?? null;
}

/**
 * Format a skill as a system-prompt block so Danny can execute it.
 * The block is injected after the identity preamble but before the user turn.
 */
export function renderSkillForExecution(skill: Skill, inputs: Record<string, unknown>): string {
  const inputLines = skill.inputs
    .map((i) => `- ${i.name}: ${JSON.stringify(inputs[i.name] ?? null)}`)
    .join("\n");
  return `

== SKILL: ${skill.name} ==

You are executing a procedural skill. Follow the procedure below literally. Use
your existing tools (queryBrain, queryKnowledge, etc.) as the procedure directs.
When the procedure says "write the output as markdown", that markdown IS your
final response — no preamble, no apology, no "here is the brief".

INPUTS:
${inputLines || "(none)"}

PROCEDURE:
${skill.body}
`;
}
