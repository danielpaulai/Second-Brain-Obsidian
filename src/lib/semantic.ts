/**
 * Semantic search index — LanceDB + OpenAI text-embedding-3-small.
 *
 * Storage: ./.brain-index/ alongside the project (gitignored).
 * Lifecycle:
 *   - reindexAll() embeds every vault note + writes the table
 *   - semanticSearch(query, limit) embeds the query + nearest-neighbor search
 *   - lazyReindex() kicks off reindex in the background if the index is empty
 *
 * The hybridSearch lives in vault.ts and fuses keyword + semantic via RRF.
 */

import * as lancedb from "@lancedb/lancedb";
import path from "node:path";
import { embed, embedOne } from "./embeddings";
import { readVault, type VaultNote } from "./vault";

const INDEX_DIR = path.resolve(process.cwd(), ".brain-index");
const TABLE_NAME = "notes";
const EMBED_TEXT_LIMIT = 18000; // ~4500 tokens — fits well under text-embedding-3-small's 8191 limit

type IndexState = "missing" | "indexing" | "ready" | "failed";

const state: {
  status: IndexState;
  indexedAt: number;
  count: number;
  lastError?: string;
  progress?: { done: number; total: number };
} = {
  status: "missing",
  indexedAt: 0,
  count: 0,
};

let _conn: lancedb.Connection | null = null;
async function db() {
  if (!_conn) _conn = await lancedb.connect(INDEX_DIR);
  return _conn;
}

export function getIndexState() {
  return { ...state };
}

export async function isIndexReady(): Promise<boolean> {
  if (state.status === "ready") return true;
  if (state.status === "indexing" || state.status === "failed") return false;
  try {
    const names = await (await db()).tableNames();
    if (!names.includes(TABLE_NAME)) return false;
    const tbl = await (await db()).openTable(TABLE_NAME);
    const count = await tbl.countRows();
    if (count > 0) {
      state.status = "ready";
      state.count = count;
      return true;
    }
  } catch {
    /* table doesn't exist yet */
  }
  return false;
}

function buildEmbedText(n: VaultNote) {
  const head = `${n.title}\n[${n.folder}]`;
  const tagLine = n.tags.length ? `tags: ${n.tags.slice(0, 8).join(", ")}\n` : "";
  return `${head}\n${tagLine}\n${n.body.slice(0, EMBED_TEXT_LIMIT)}`;
}

export async function reindexAll(): Promise<{
  count: number;
  durationMs: number;
}> {
  if (state.status === "indexing") {
    throw new Error("Reindex already in progress");
  }
  state.status = "indexing";
  state.progress = { done: 0, total: 0 };
  state.lastError = undefined;
  const t0 = Date.now();

  try {
    const notes = await readVault();
    state.progress = { done: 0, total: notes.length };
    const texts = notes.map(buildEmbedText);

    // Embed in batches; report progress so the endpoint can poll.
    const BATCH = 96;
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      const slice = texts.slice(i, i + BATCH);
      const batchVecs = await embed(slice);
      vectors.push(...batchVecs);
      state.progress = { done: Math.min(i + BATCH, texts.length), total: texts.length };
    }

    const records = notes.map((n, i) => ({
      id: n.id,
      title: n.title,
      folder: n.folder,
      snippet: n.body.slice(0, 600),
      mtime: n.mtime,
      vector: vectors[i],
    }));

    const d = await db();
    const existing = await d.tableNames();
    if (existing.includes(TABLE_NAME)) {
      await d.dropTable(TABLE_NAME);
    }
    await d.createTable(TABLE_NAME, records);

    state.status = "ready";
    state.count = records.length;
    state.indexedAt = Date.now();
    state.progress = undefined;
    return { count: records.length, durationMs: Date.now() - t0 };
  } catch (err) {
    state.status = "failed";
    state.lastError = err instanceof Error ? err.message : String(err);
    state.progress = undefined;
    throw err;
  }
}

export type SemanticHit = {
  id: string;
  title: string;
  folder: string;
  snippet: string;
  distance: number;
};

export async function semanticSearch(query: string, limit = 8): Promise<SemanticHit[]> {
  const ready = await isIndexReady();
  if (!ready) return [];
  const qVec = await embedOne(query);
  const tbl = await (await db()).openTable(TABLE_NAME);
  const results = await tbl.search(qVec).limit(limit).toArray();
  return results.map((r: any) => ({
    id: String(r.id),
    title: String(r.title),
    folder: String(r.folder),
    snippet: String(r.snippet),
    distance: typeof r._distance === "number" ? r._distance : 0,
  }));
}

/**
 * Kick off a reindex in the background if the index is missing.
 * Checks the on-disk LanceDB table first — only triggers a rebuild if neither
 * the in-memory cache nor the on-disk index has data. This prevents a phantom
 * reindex after a Next.js hot reload wipes module state.
 */
let _bgPromise: Promise<unknown> | null = null;
export async function lazyReindex() {
  if (state.status === "ready" || state.status === "indexing") return;
  if (_bgPromise) return;
  // Cheap: check disk before blowing $0.20 on a needless rebuild.
  const ready = await isIndexReady();
  if (ready) return;
  _bgPromise = reindexAll()
    .catch((err) => {
      console.error("[semantic] background reindex failed:", err);
    })
    .finally(() => {
      _bgPromise = null;
    });
}
