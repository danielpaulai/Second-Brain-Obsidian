import matter from "gray-matter";
import { readText as storageReadText, listKeys as storageListKeys } from "./storage";

/**
 * The 266 distilled knowledge categories under `_ai-danny/knowledge/<macro>/<slug>.md`.
 * Reads via the storage layer so it works from the local vault (VAULT_PATH) OR the production
 * private Vercel Blob store — directory walking isn't possible against Blob.
 */

const KNOWLEDGE_DIR = "_ai-danny/knowledge";

export type KnowledgeNode = {
  macro: string;
  macroTitle: string;
  slug: string;
  title: string;
  description: string;
  status: "scaffolded" | "distilled" | string;
  lastDistilled: string | null;
  /** Distilled body (between DANNY-DISTILL markers). Empty if undistilled. */
  body: string;
  /** Raw .md path relative to vault */
  relPath: string;
};

export type KnowledgeMacro = {
  dir: string;
  title: string;
  description: string;
  count: number;
  nodes: Array<Pick<KnowledgeNode, "slug" | "title" | "description" | "status" | "lastDistilled">>;
};

const DISTILL_RE = /<!--::DANNY-DISTILL-START::-->([\s\S]*?)<!--::DANNY-DISTILL-END::-->/;

function extractDistilled(raw: string): string {
  const m = raw.match(DISTILL_RE);
  if (!m) return "";
  return m[1].trim();
}

function parseMacroOverview(raw: string): { title: string; description: string } {
  if (!raw) return { title: "", description: "" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fm = matter(raw).data as any;
  const headingMatch = raw.match(/^#\s+(.+)$/m);
  const descMatch = raw
    .split("\n")
    .find((l) => l.trim() && !l.startsWith("#") && !l.startsWith("---") && !l.startsWith("##"));
  return {
    title: (fm.title || headingMatch?.[1] || "")
      .replace(/\s*—\s*overview$/i, "")
      .replace(/"/g, "")
      .trim(),
    description: descMatch?.trim() || "",
  };
}

/** Returns the list of macros with their nodes (no body). Fast — used for trees. */
export async function getKnowledgeTree(): Promise<KnowledgeMacro[]> {
  const keys = await storageListKeys(`${KNOWLEDGE_DIR}/`); // flat .md paths relative to vault root
  if (!keys.length) return [];

  // Group the flat key list into macro folders → their direct .md children.
  const byMacro = new Map<string, string[]>();
  for (const key of keys) {
    const rel = key.slice(KNOWLEDGE_DIR.length + 1); // "01-macro/file.md"
    const slash = rel.indexOf("/");
    if (slash < 0) continue;
    const macro = rel.slice(0, slash);
    const file = rel.slice(slash + 1);
    if (!/^\d{2}-/.test(macro)) continue;
    if (file.includes("/")) continue; // only direct children
    let arr = byMacro.get(macro);
    if (!arr) byMacro.set(macro, (arr = []));
    arr.push(file);
  }

  const macroDirs = [...byMacro.keys()].sort();
  const macros: KnowledgeMacro[] = [];
  for (const macroDir of macroDirs) {
    const files = byMacro.get(macroDir)!.sort();
    const readmeRaw = files.includes("_README.md")
      ? (await storageReadText(`${KNOWLEDGE_DIR}/${macroDir}/_README.md`)) || ""
      : "";
    const overview = parseMacroOverview(readmeRaw);
    const nodeFiles = files.filter((f) => f.endsWith(".md") && f !== "_README.md");
    const nodes = await Promise.all(
      nodeFiles.map(async (f) => {
        const raw = (await storageReadText(`${KNOWLEDGE_DIR}/${macroDir}/${f}`)) || "";
        if (!raw) return null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fm = matter(raw).data as any;
        return {
          slug: f.replace(/\.md$/, ""),
          title: String(fm.title || f).replace(/"/g, ""),
          description: String(fm.description || "").replace(/"/g, ""),
          status: fm.status || "scaffolded",
          lastDistilled: fm.last_distilled || null,
        };
      })
    );
    macros.push({
      dir: macroDir,
      title: overview.title || macroDir,
      description: overview.description,
      count: nodeFiles.length,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nodes: nodes.filter(Boolean) as any,
    });
  }
  return macros;
}

/** Returns full node including distilled body. */
export async function getKnowledgeNode(macroDir: string, slug: string): Promise<KnowledgeNode | null> {
  // Hard-block path traversal — only allow exact slug + macro folder names
  if (!/^\d{2}-[a-z0-9-]+$/.test(macroDir)) return null;
  if (!/^[a-z0-9-]+$/.test(slug)) return null;

  const key = `${KNOWLEDGE_DIR}/${macroDir}/${slug}.md`;
  const raw = await storageReadText(key);
  if (!raw) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fm = matter(raw).data as any;
  return {
    macro: macroDir,
    macroTitle: String(fm.macro || "").replace(/"/g, ""),
    slug,
    title: String(fm.title || slug).replace(/"/g, ""),
    description: String(fm.description || "").replace(/"/g, ""),
    status: fm.status || "scaffolded",
    lastDistilled: fm.last_distilled || null,
    body: extractDistilled(raw),
    relPath: key,
  };
}

/** Summary stats for the knowledge map. */
export async function getKnowledgeStats() {
  const macros = await getKnowledgeTree();
  let total = 0,
    distilled = 0;
  for (const m of macros) {
    for (const n of m.nodes) {
      total++;
      if (n.status === "distilled") distilled++;
    }
  }
  return {
    macros: macros.length,
    total,
    distilled,
    scaffolded: total - distilled,
    pctComplete: total === 0 ? 0 : Math.round((distilled / total) * 100),
  };
}
