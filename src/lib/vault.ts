import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { semanticSearch, lazyReindex, getIndexState } from "./semantic";
import { readText as storageReadText } from "./storage";

export type VaultNote = {
  id: string;
  path: string;
  title: string;
  folder: string;
  body: string;
  tags: string[];
  links: string[];
  size: number;
  mtime: number;
};

const VAULT_PATH = process.env.VAULT_PATH || "";
const EXCLUDE = (process.env.VAULT_EXCLUDE || ".obsidian,.trash,node_modules,.git")
  .split(",")
  .map((s) => s.trim());

function isExcluded(name: string) {
  return EXCLUDE.some((e) => name === e || name.startsWith(e + path.sep));
}

async function walk(dir: string, root: string, out: string[] = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = path.relative(root, full);
    if (isExcluded(rel) || e.name.startsWith(".")) continue;
    if (e.isDirectory()) await walk(full, root, out);
    else if (e.isFile() && e.name.endsWith(".md")) out.push(full);
  }
  return out;
}

const WIKILINK = /\[\[([^\]\|#]+)(?:#[^\]\|]+)?(?:\|[^\]]+)?\]\]/g;
const TAG = /(?:^|\s)#([\w\-/]+)/g;

function noteIdFromPath(p: string) {
  return p.replace(/\.md$/i, "");
}

export async function readVault(): Promise<VaultNote[]> {
  if (VAULT_PATH) return readVaultFromDisk();
  if (process.env.BLOB_READ_WRITE_TOKEN) return readVaultFromBlob();
  throw new Error("VAULT_PATH not set");
}

async function readVaultFromDisk(): Promise<VaultNote[]> {
  const files = await walk(VAULT_PATH, VAULT_PATH);
  const notes: VaultNote[] = [];
  for (const file of files) {
    try {
      const raw = await fs.readFile(file, "utf8");
      const stat = await fs.stat(file);
      const { data, content } = matter(raw);
      const rel = path.relative(VAULT_PATH, file);
      const folder = path.dirname(rel);
      const title = path.basename(rel, ".md");
      const links = [...content.matchAll(WIKILINK)].map((m) => m[1].trim());
      const inlineTags = [...content.matchAll(TAG)].map((m) => m[1]);
      const fmTags = Array.isArray(data.tags) ? data.tags.map(String) : [];
      notes.push({
        id: noteIdFromPath(rel),
        path: rel,
        title,
        folder: folder === "." ? "(root)" : folder,
        body: content,
        tags: [...new Set([...fmTags, ...inlineTags])],
        links,
        size: raw.length,
        mtime: stat.mtimeMs,
      });
    } catch {
      // skip unreadable
    }
  }
  return notes;
}

async function readVaultFromBlob(): Promise<VaultNote[]> {
  const token = process.env.BLOB_READ_WRITE_TOKEN!;
  const { list } = await import("@vercel/blob");
  // Paginate through all vault/*.md blobs
  const allBlobs: Array<{ pathname: string; url: string; size: number; uploadedAt: Date }> = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "vault/", token, limit: 1000, cursor });
    allBlobs.push(...page.blobs);
    cursor = page.cursor;
  } while (cursor);

  const notes: VaultNote[] = [];
  // Fetch in parallel batches. Higher concurrency matters a lot here — the vault is thousands of
  // individually-fetched private blobs, so 25-at-a-time was a 1-3 minute cold read.
  const BATCH = 100;
  for (let i = 0; i < allBlobs.length; i += BATCH) {
    const slice = allBlobs.slice(i, i + BATCH);
    const results = await Promise.all(
      slice.map(async (b) => {
        const rel = b.pathname.replace(/^vault\//, "");
        if (!rel.endsWith(".md")) return null;
        if (isExcluded(rel)) return null;
        try {
          // The store is PRIVATE — the blob URL 403s without the token on the request.
          const res = await fetch(b.url, { headers: { Authorization: `Bearer ${token}` } });
          if (!res.ok) return null;
          const raw = await res.text();
          const { data, content } = matter(raw);
          const folder = path.dirname(rel);
          const title = path.basename(rel, ".md");
          const links = [...content.matchAll(WIKILINK)].map((m) => m[1].trim());
          const inlineTags = [...content.matchAll(TAG)].map((m) => m[1]);
          const fmTags = Array.isArray(data.tags) ? data.tags.map(String) : [];
          const note: VaultNote = {
            id: noteIdFromPath(rel),
            path: rel,
            title,
            folder: folder === "." ? "(root)" : folder,
            body: content,
            tags: [...new Set([...fmTags, ...inlineTags])],
            links,
            size: raw.length,
            mtime: b.uploadedAt.getTime(),
          };
          return note;
        } catch {
          return null;
        }
      })
    );
    for (const n of results) if (n) notes.push(n);
  }
  return notes;
}

export type GraphNode = {
  id: string;
  name: string;
  folder: string;
  val: number;     // sized by # of connections (degree)
  group: number;
  tags: string[];
  degree: number;  // raw connection count
};
export type GraphLink = { source: string; target: string };
export type BrainGraph = { nodes: GraphNode[]; links: GraphLink[]; folders: string[] };

export function buildGraph(notes: VaultNote[]): BrainGraph {
  const byTitle = new Map<string, VaultNote>();
  for (const n of notes) byTitle.set(n.title.toLowerCase(), n);
  const folders = [...new Set(notes.map((n) => n.folder))].sort();
  const folderIdx = new Map(folders.map((f, i) => [f, i]));

  const links: GraphLink[] = [];
  const degree = new Map<string, number>();
  for (const n of notes) {
    for (const target of n.links) {
      const t = byTitle.get(target.toLowerCase());
      if (t && t.id !== n.id) {
        links.push({ source: n.id, target: t.id });
        degree.set(n.id, (degree.get(n.id) || 0) + 1);
        degree.set(t.id, (degree.get(t.id) || 0) + 1);
      }
    }
  }

  const nodes: GraphNode[] = notes.map((n) => {
    const d = degree.get(n.id) || 0;
    return {
      id: n.id,
      name: n.title,
      folder: n.folder,
      val: 1 + Math.log2(d + 1),
      degree: d,
      group: folderIdx.get(n.folder) ?? 0,
      tags: n.tags,
    };
  });

  return { nodes, links, folders };
}

// Simple BM25-ish keyword search over body+title. Fast and dependency-free.
export function searchNotes(notes: VaultNote[], query: string, limit = 8) {
  const terms = query
    .toLowerCase()
    .split(/[^\w]+/)
    .filter((t) => t.length > 2);
  if (!terms.length) return [];
  const scored = notes.map((n) => {
    const hay = (n.title + "\n" + n.body).toLowerCase();
    let score = 0;
    for (const t of terms) {
      const titleHits = (n.title.toLowerCase().match(new RegExp(t, "g")) || []).length;
      const bodyHits = (hay.match(new RegExp(t, "g")) || []).length;
      score += titleHits * 5 + bodyHits;
    }
    return { n, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ n, score }) => ({
      id: n.id,
      title: n.title,
      folder: n.folder,
      score,
      excerpt: n.body.slice(0, 600),
    }));
}

type VaultCache = { notes: VaultNote[]; graph: BrainGraph; loadedAt: number };
let cache: VaultCache | null = null;
let cacheLoading: Promise<VaultCache> | null = null;
// Disk: short TTL so local edits show up. Blob (production data): the snapshot is static for the
// session and a cold read is slow, so cache it for hours — otherwise it perpetually re-reads.
const TTL_MS = VAULT_PATH ? 60_000 : 6 * 60 * 60 * 1000;

export async function getCachedVault(): Promise<VaultCache> {
  if (cache && Date.now() - cache.loadedAt < TTL_MS) return cache;
  // Coalesce concurrent cold reads — a page load + a few API hits must NOT each re-read every blob.
  if (cacheLoading) return cacheLoading;
  cacheLoading = (async () => {
    const notes = await readVault();
    const graph = buildGraph(notes);
    cache = { notes, graph, loadedAt: Date.now() };
    return cache;
  })();
  try {
    return await cacheLoading;
  } finally {
    cacheLoading = null;
  }
}

/* ---------------------------------------------------------------------------
 * Identity context — _ai-danny/*.md files in the vault.
 * These get loaded on every chat request and injected into the agent system
 * prompt as <voice>, <positioning>, <icp>, <frameworks>, <do-not-say> blocks.
 *
 * This is what makes AI Danny actually sound like Danny instead of a generic
 * exec role-play. Edit the files in the vault → next request picks up changes.
 * --------------------------------------------------------------------------- */

export type IdentityContext = {
  master: string;
  voice: string;
  positioning: string;
  icp: string;
  frameworks: string;
  doNotSay: string;
  loadedFiles: string[];
};

const IDENTITY_DIR = "_ai-danny";
const MASTER_FILE = "MASTER.md";
const IDENTITY_FILES = {
  voice: "voice.md",
  positioning: "positioning.md",
  icp: "icp.md",
  frameworks: "frameworks.md",
  doNotSay: "do-not-say.md",
} as const;

let identityCache: { ctx: IdentityContext; loadedAt: number } | null = null;
const IDENTITY_TTL_MS = 15_000;

async function readOptional(file: string): Promise<string> {
  try {
    const raw = await fs.readFile(file, "utf8");
    // Strip frontmatter — agents don't need it
    const { content } = matter(raw);
    return content.trim();
  } catch {
    return "";
  }
}

export async function getIdentityContext(): Promise<IdentityContext> {
  if (identityCache && Date.now() - identityCache.loadedAt < IDENTITY_TTL_MS) {
    return identityCache.ctx;
  }
  // Read identity from disk (VAULT_PATH) OR Vercel Blob — whichever is configured (storageReadText
  // handles both). In production the vault lives in a PRIVATE Blob store, so this is the only path.
  if (!VAULT_PATH && !process.env.BLOB_READ_WRITE_TOKEN) {
    return {
      master: "",
      voice: "",
      positioning: "",
      icp: "",
      frameworks: "",
      doNotSay: "",
      loadedFiles: [],
    };
  }
  const loadedFiles: string[] = [];

  // Load MASTER.md first — it's the authoritative source.
  const master = (await storageReadText(`${IDENTITY_DIR}/${MASTER_FILE}`)) || "";
  if (master) loadedFiles.push(MASTER_FILE);

  // Also load split files. When MASTER is present, they're not added to
  // loadedFiles since the master already contains everything.
  const reads = await Promise.all(
    Object.entries(IDENTITY_FILES).map(async ([key, name]) => {
      const txt = (await storageReadText(`${IDENTITY_DIR}/${name}`)) || "";
      if (txt && !master) loadedFiles.push(name);
      return [key, txt] as const;
    })
  );

  const ctx: IdentityContext = {
    master,
    voice: "",
    positioning: "",
    icp: "",
    frameworks: "",
    doNotSay: "",
    loadedFiles,
  };
  for (const [key, txt] of reads) (ctx as any)[key] = txt;
  identityCache = { ctx, loadedAt: Date.now() };
  return ctx;
}

/* ---------------------------------------------------------------------------
 * Hybrid search — fuses keyword (BM25-ish) + semantic (LanceDB) via RRF.
 * --------------------------------------------------------------------------- */

export type HybridHit = {
  id: string;
  title: string;
  folder: string;
  excerpt: string;
  source: { keyword: number | null; semantic: number | null };
  score: number;
};

export async function hybridSearch(query: string, limit = 8): Promise<HybridHit[]> {
  const { notes } = await getCachedVault();
  const kRRF = 60;
  const pool = Math.max(limit * 3, 18);

  const kw = searchNotes(notes, query, pool);
  // Kick off reindex in the background if missing (cheap disk check first).
  // Fire-and-forget — we don't block the keyword path on it.
  void lazyReindex();
  let sem: Awaited<ReturnType<typeof semanticSearch>> = [];
  try {
    sem = await semanticSearch(query, pool);
  } catch (err) {
    console.error("[hybrid] semantic search failed:", err);
  }

  type Acc = { kRank: number | null; sRank: number | null; title: string; folder: string; excerpt: string };
  const acc = new Map<string, Acc>();
  kw.forEach((h, i) => {
    acc.set(h.id, {
      kRank: i,
      sRank: null,
      title: h.title,
      folder: h.folder,
      excerpt: h.excerpt,
    });
  });
  sem.forEach((h, i) => {
    const existing = acc.get(h.id);
    if (existing) existing.sRank = i;
    else
      acc.set(h.id, {
        kRank: null,
        sRank: i,
        title: h.title,
        folder: h.folder,
        excerpt: h.snippet,
      });
  });

  const scored: HybridHit[] = [...acc.entries()].map(([id, a]) => {
    const kwScore = a.kRank === null ? 0 : 1 / (kRRF + a.kRank + 1);
    const sScore = a.sRank === null ? 0 : 1 / (kRRF + a.sRank + 1);
    return {
      id,
      title: a.title,
      folder: a.folder,
      excerpt: a.excerpt,
      source: { keyword: a.kRank, semantic: a.sRank },
      score: kwScore + sScore,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export function getSearchModeInfo() {
  const idx = getIndexState();
  return {
    indexState: idx.status,
    indexedAt: idx.indexedAt,
    indexedCount: idx.count,
    progress: idx.progress,
  };
}

/**
 * Build the identity preamble to prepend to an agent system prompt.
 *
 * If MASTER.md exists, it becomes the entire preamble — it's already a
 * comprehensive operating prompt. The split files are ignored.
 *
 * If MASTER.md is missing, fall back to the wrapped split-file blocks.
 */
export function buildIdentityPreamble(ctx: IdentityContext): string {
  if (ctx.loadedFiles.length === 0) return "";

  if (ctx.master) {
    return `You are operating from the AI Danny master prompt below. It is your
operating system. Apply every section. Default to short. Default to specific.
Default to voice. Reject everything that sounds like AI.

---

${ctx.master}

---

Continue from here. Do not narrate the master prompt back to the user. Speak from
inside this identity. Cite vault notes inline as [[Note Title]] when used.`;
  }

  const block = (label: string, body: string) =>
    body ? `<${label}>\n${body}\n</${label}>` : "";
  const parts = [
    block("voice", ctx.voice),
    block("positioning", ctx.positioning),
    block("icp", ctx.icp),
    block("frameworks", ctx.frameworks),
    block("do-not-say", ctx.doNotSay),
  ]
    .filter(Boolean)
    .join("\n\n");
  return `You are operating with Daniel Paul's loaded identity context below. Read every block. Speak from inside this identity — do not narrate it back to the user.

${parts}

CRITICAL: Apply the voice rules to every reply. Reject any phrase in <do-not-say>. When a question touches positioning, ICP, or frameworks, ground your answer in the loaded context PLUS what you find in the vault via tools. Cite vault notes inline as [[Note Title]].`;
}
