import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

const VAULT_PATH = process.env.VAULT_PATH || "";
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

async function readDirSafe(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

async function readMacroOverview(macroPath: string) {
  try {
    const raw = await fs.readFile(path.join(macroPath, "_README.md"), "utf8");
    const fm = matter(raw).data as any;
    // Title is in frontmatter or extracted from heading
    const headingMatch = raw.match(/^#\s+(.+)$/m);
    const descMatch = raw.split("\n").find(
      (l) => l.trim() && !l.startsWith("#") && !l.startsWith("---") && !l.startsWith("##")
    );
    return {
      title: (fm.title || headingMatch?.[1] || "")
        .replace(/\s*—\s*overview$/i, "")
        .replace(/"/g, "")
        .trim(),
      description: descMatch?.trim() || "",
    };
  } catch {
    return { title: "", description: "" };
  }
}

/** Returns the list of macros with their nodes (no body). Fast — used for trees. */
export async function getKnowledgeTree(): Promise<KnowledgeMacro[]> {
  if (!VAULT_PATH) return [];
  const root = path.join(VAULT_PATH, KNOWLEDGE_DIR);
  const macroDirs = (await readDirSafe(root))
    .filter((d) => /^\d{2}-/.test(d))
    .sort();

  const macros: KnowledgeMacro[] = [];
  for (const macroDir of macroDirs) {
    const macroPath = path.join(root, macroDir);
    const overview = await readMacroOverview(macroPath);
    const files = (await readDirSafe(macroPath))
      .filter((f) => f.endsWith(".md") && f !== "_README.md")
      .sort();
    const nodes = await Promise.all(
      files.map(async (f) => {
        try {
          const raw = await fs.readFile(path.join(macroPath, f), "utf8");
          const fm = matter(raw).data as any;
          return {
            slug: f.replace(/\.md$/, ""),
            title: String(fm.title || f).replace(/"/g, ""),
            description: String(fm.description || "").replace(/"/g, ""),
            status: fm.status || "scaffolded",
            lastDistilled: fm.last_distilled || null,
          };
        } catch {
          return null;
        }
      })
    );
    macros.push({
      dir: macroDir,
      title: overview.title || macroDir,
      description: overview.description,
      count: files.length,
      nodes: nodes.filter(Boolean) as any,
    });
  }
  return macros;
}

/** Returns full node including distilled body. */
export async function getKnowledgeNode(
  macroDir: string,
  slug: string
): Promise<KnowledgeNode | null> {
  if (!VAULT_PATH) return null;
  // Hard-block path traversal — only allow exact slug + macro folder names
  if (!/^\d{2}-[a-z0-9-]+$/.test(macroDir)) return null;
  if (!/^[a-z0-9-]+$/.test(slug)) return null;

  const file = path.join(VAULT_PATH, KNOWLEDGE_DIR, macroDir, `${slug}.md`);
  try {
    const raw = await fs.readFile(file, "utf8");
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
      relPath: path.relative(VAULT_PATH, file),
    };
  } catch {
    return null;
  }
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
