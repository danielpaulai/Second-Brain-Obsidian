import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { getIdentityContext, buildIdentityPreamble, hybridSearch } from "@/lib/vault";
import { getSkill } from "@/lib/skills";
import { aiQuery } from "@/lib/structured";
import { getCurrentUser, getViewerRoleFromAuth } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 90;

const GENERATED_DIR = "Generated";

function pickModel() {
  const id = process.env.AI_MODEL || "anthropic/claude-sonnet-4-6";
  const [provider, ...rest] = id.split("/");
  const model = rest.join("/");
  if (provider === "openai") return openai(model || "gpt-4o");
  return anthropic(model || "claude-sonnet-4-6");
}

function q(s: string) {
  return s.replace(/'/g, "''");
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");
}

/**
 * POST /api/draft/generate
 *
 * The Content Draft Engine. Pulls Daniel's voice rules, hooks, pillars, and
 * proof straight from the structured brain, grounds the draft in relevant
 * vault research, generates a finished first draft in his voice, and writes it
 * to <vault>/Generated/.
 *
 * Auth: owner Supabase session OR Bearer CRON_SECRET (for the Queue watcher).
 *
 * Body: { topic: string, format?: string, platform?: string, notes?: string,
 *         write?: boolean (default true) }
 */
export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const topic = String(body.topic || "").trim();
  const format = String(body.format || "linkedin").trim().toLowerCase();
  const platform = String(body.platform || format).trim();
  const notes = String(body.notes || "").trim();
  const write = body.write !== false;
  if (!topic) {
    return NextResponse.json({ ok: false, error: "`topic` is required" }, { status: 400 });
  }

  // Authorize: CRON_SECRET (watcher) or owner session.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const viaSecret = !!secret && auth === `Bearer ${secret}`;
  if (!viaSecret) {
    const user = await getCurrentUser();
    const role = await getViewerRoleFromAuth();
    if (!user || role !== "owner") {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
  }

  // 1. Pull the voice/content material from the structured brain (best-effort —
  //    if a table is empty the query just returns []).
  const [voice, hooks, pillars, phrases, proof] = await Promise.all([
    aiQuery(
      `SELECT rule_type, rule, example_good, example_bad FROM voice_rules ORDER BY rule_type DESC LIMIT 60`
    ),
    aiQuery(
      `SELECT hook, format, topic FROM hooks ORDER BY (CASE WHEN topic ILIKE '%${q(topic)}%' THEN 0 ELSE 1 END), created_at DESC LIMIT 12`
    ),
    aiQuery(`SELECT pillar, angle, proof_points FROM content_pillars LIMIT 12`),
    aiQuery(`SELECT phrase, category FROM signature_phrases LIMIT 25`),
    aiQuery(
      `SELECT client_name, before_state, after_state, key_metric, result_value FROM case_studies LIMIT 8`
    ),
  ]);

  // 2. Ground in vault research.
  let research = "";
  try {
    const hits = await hybridSearch(topic, 6);
    research = hits
      .map((h) => `- [[${h.title}]] (${h.folder}): ${h.excerpt.slice(0, 280)}`)
      .join("\n");
  } catch {
    /* research is optional */
  }

  // 3. Identity preamble + draft guidance.
  const identity = await getIdentityContext();
  const preamble = buildIdentityPreamble(identity);
  const skill = await getSkill("draft-content");
  const guidance = skill?.body || "Write a finished first-draft post in Daniel's voice.";

  const block = (label: string, rows: unknown) =>
    Array.isArray(rows) && rows.length
      ? `\n== ${label} ==\n${JSON.stringify(rows)}`
      : "";

  const material = [
    block("VOICE RULES (follow do, never violate avoid)", voice.ok ? voice.rows : []),
    block("HOOKS (adapt one)", hooks.ok ? hooks.rows : []),
    block("CONTENT PILLARS / ANGLES", pillars.ok ? pillars.rows : []),
    block("SIGNATURE PHRASES (weave 1-2 in)", phrases.ok ? phrases.rows : []),
    block("PROOF / CASE STUDIES (cite real results only)", proof.ok ? proof.rows : []),
    research ? `\n== RESEARCH (vault excerpts) ==\n${research}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const system = [preamble, guidance].filter(Boolean).join("\n\n");
  const userPrompt = `Write a ${format} draft for ${platform}.

TOPIC: ${topic}
${notes ? `EXTRA CONTEXT / ANGLE: ${notes}\n` : ""}
Use ONLY the material below — it's pulled from Daniel's real brain. Do not invent results.
${material || "\n(No structured material found yet — write from the loaded identity + research.)"}

Return only the finished draft, ready to paste.`;

  let draft = "";
  try {
    const result = await generateText({
      model: pickModel(),
      system,
      messages: [{ role: "user", content: userPrompt }],
    });
    draft = result.text.trim();
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
  if (!draft) {
    return NextResponse.json({ ok: false, error: "model returned empty draft" }, { status: 500 });
  }

  // 4. Write to <vault>/Generated/
  let writtenPath: string | null = null;
  if (write && process.env.VAULT_PATH) {
    try {
      const dir = path.join(process.env.VAULT_PATH, GENERATED_DIR);
      await fs.mkdir(dir, { recursive: true });
      const day = new Date().toISOString().slice(0, 10);
      const file = path.join(dir, `${day} ${format} ${slugify(topic)}.md`);
      const fm = `---\ntype: draft\nformat: ${format}\nplatform: ${platform}\ntopic: ${JSON.stringify(topic)}\ngenerated_at: ${new Date().toISOString()}\nstatus: draft\n---\n\n`;
      await fs.writeFile(file, fm + draft + "\n", "utf8");
      writtenPath = path.relative(process.env.VAULT_PATH, file);
    } catch (err) {
      console.error("[draft] write failed:", err);
    }
  }

  return NextResponse.json({
    ok: true,
    topic,
    format,
    platform,
    draft,
    writtenPath,
    sourcesUsed: {
      voiceRules: voice.ok ? voice.rowCount : 0,
      hooks: hooks.ok ? hooks.rowCount : 0,
      pillars: pillars.ok ? pillars.rowCount : 0,
      caseStudies: proof.ok ? proof.rowCount : 0,
      researchNotes: research ? research.split("\n").length : 0,
    },
  });
}
