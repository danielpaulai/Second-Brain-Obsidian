import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

/**
 * Logs every question your team asks Danny to the vault so you can review and
 * use it to sharpen the identity files later.
 *
 * Writes one markdown file per day, appending each Q&A as a new section.
 */
export async function POST(req: Request) {
  const VAULT = process.env.VAULT_PATH;
  if (!VAULT) {
    return NextResponse.json({ ok: false, error: "VAULT_PATH not set" }, { status: 500 });
  }
  try {
    const { question, answer, citedNotes } = await req.json();
    if (!question) {
      return NextResponse.json({ ok: false, error: "missing question" }, { status: 400 });
    }
    const dir = path.join(VAULT, "_ai-danny", "team-questions");
    await fs.mkdir(dir, { recursive: true });
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const file = path.join(dir, `${day}.md`);
    const stamp = now.toISOString().slice(11, 19);
    const cited = Array.isArray(citedNotes) && citedNotes.length
      ? `\n**Cited notes:** ${citedNotes.map((n: string) => `[[${n}]]`).join(", ")}`
      : "";
    const block = `\n\n---\n\n## ${stamp} — ${truncate(question, 80)}\n\n**Asked:** ${question}\n\n**Danny replied:**\n\n${answer}${cited}\n`;
    try {
      await fs.access(file);
    } catch {
      const header = `---\ntitle: Team Questions — ${day}\ntags: [ai-danny, team-questions]\n---\n\n# Team questions for ${day}\n`;
      await fs.writeFile(file, header, "utf8");
    }
    await fs.appendFile(file, block, "utf8");
    return NextResponse.json({ ok: true, file: path.relative(VAULT, file) });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

function truncate(s: string, n: number) {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}
