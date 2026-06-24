/**
 * Second Brain — the vault vector store (Supabase pgvector).
 *
 * The curated GTM docs (content/knowledge/*) are the polished positioning; THIS
 * is the founder's whole Obsidian vault, chunked + embedded so /jarvis and the
 * brain can retrieve from everything they've ever written.
 *
 * Pipeline: /brain uploads a .zip → notes parsed client-side → batches POSTed to
 * /api/brain/vault/ingest → ingestNotes() embeds (text-embedding-3-small) and
 * upserts into vault_documents + vault_chunks → searchVault() runs cosine NN via
 * the match_vault_chunks RPC. Mirrors the proven memories.ts pattern.
 */

import matter from "gray-matter";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { embed, embedOne, describeEmbeddingProvider } from "./embeddings";
import { APP_CLIENT } from "./client";
// TYPE-ONLY import (erased at build) so brain-vault never pulls vault.ts → LanceDB
// into the bundles of the many routes that import it.
import type { BrainGraph } from "./vault";

export const VAULT_CLIENT = APP_CLIENT; // single-tenant: one client, no env

const CHUNK_TARGET = 1200; // ~300 tokens — a focused retrieval unit
const CHUNK_OVERLAP = 160;
const MAX_CHUNKS_PER_NOTE = 60; // guard against a pathological mega-note
const INSERT_BATCH = 20; // rows per chunk-insert — small enough that a single vector
// insert stays under Postgres' statement timeout as the table grows (100 timed out
// at ~71k rows and silently halted ingestion).

export type VaultNoteInput = { path: string; content: string };

export type VaultHit = {
  id: string;
  documentId: string;
  path: string;
  title: string;
  folder: string;
  chunkIndex: number;
  content: string;
  similarity: number;
};

export type VaultStats = { documents: number; chunks: number; folders: number };

/* --------------------------- configuration --------------------------- */

/** A real Supabase key looks like a JWT (eyJ…) or a new secret key (sb_…). */
const isRealKey = (k?: string): k is string => !!k && /^(eyJ|sb_)/.test(k);

/** Prefer the service-role key (bypasses RLS); fall back to the public anon key
 *  when no real service key is set (the permissive write policies cover it). */
function vaultKey(): string | undefined {
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (isRealKey(service)) return service;
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

let _db: SupabaseClient | null = null;
function vaultDb(): SupabaseClient {
  if (_db) return _db;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = vaultKey();
  if (!url || !key) throw new Error("Supabase not configured for the vault");
  _db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _db;
}

export function vaultConfigured(): { ok: boolean; reason?: string } {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !vaultKey()) {
    return { ok: false, reason: "Supabase not configured (need NEXT_PUBLIC_SUPABASE_URL + a service-role or anon key)" };
  }
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.OPENAI_API_KEY) {
    return { ok: false, reason: "No embedding key (AI_GATEWAY_API_KEY or OPENAI_API_KEY)" };
  }
  return { ok: true };
}

export function embeddingProvider(): string {
  return describeEmbeddingProvider();
}

/* --------------------------- parsing + chunking --------------------------- */

const TAG = /(?:^|\s)#([\w\-/]+)/g;
// [[Note]], [[Note|alias]], [[Note#heading]], [[folder/Note]] — capture the target before #/|.
const WIKILINK = /\[\[([^\]\|#]+)(?:#[^\]\|]+)?(?:\|[^\]]+)?\]\]/g;

type ParsedNote = { path: string; title: string; folder: string; tags: string[]; links: string[]; body: string };

/** Strip frontmatter, derive title/folder/tags/wikilinks from an uploaded note. */
export function parseNote(input: VaultNoteInput): ParsedNote {
  const rel = input.path.replace(/^\/+/, "");
  const segments = rel.split("/");
  const file = segments[segments.length - 1];
  const folder = segments.length > 1 ? segments.slice(0, -1).join("/") : "(root)";
  const title = file.replace(/\.md$/i, "");

  let body = input.content;
  let fmTags: string[] = [];
  try {
    const parsed = matter(input.content);
    body = parsed.content;
    if (Array.isArray(parsed.data?.tags)) fmTags = parsed.data.tags.map(String);
    else if (typeof parsed.data?.tags === "string") fmTags = [parsed.data.tags];
  } catch {
    /* malformed frontmatter — keep raw body */
  }
  const inlineTags = [...body.matchAll(TAG)].map((m) => m[1]);
  const tags = [...new Set([...fmTags, ...inlineTags])].slice(0, 24);
  // Store the link target's note name (last path segment) so it resolves to a title.
  const links = [...new Set([...body.matchAll(WIKILINK)].map((m) => m[1].trim().split("/").pop()!.trim()).filter(Boolean))].slice(0, 200);
  return { path: rel, title, folder, tags, links, body: body.trim() };
}

/**
 * Split a note into overlapping chunks on paragraph boundaries. Paragraphs are
 * packed up to CHUNK_TARGET; a single oversized paragraph is hard-split. A short
 * tail-overlap carries context across the seam so retrieval doesn't lose it.
 */
export function chunkText(body: string): string[] {
  const text = body.trim();
  if (!text) return [];
  if (text.length <= CHUNK_TARGET) return [text];

  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let cur = "";

  const push = () => {
    const c = cur.trim();
    if (c) chunks.push(c);
    cur = "";
  };

  for (const para of paras) {
    if (para.length > CHUNK_TARGET) {
      push();
      // hard-split the oversized paragraph by sentence-ish windows
      for (let i = 0; i < para.length; i += CHUNK_TARGET - CHUNK_OVERLAP) {
        chunks.push(para.slice(i, i + CHUNK_TARGET).trim());
        if (chunks.length >= MAX_CHUNKS_PER_NOTE) break;
      }
      continue;
    }
    if (cur.length + para.length + 2 > CHUNK_TARGET) {
      const tail = cur.slice(-CHUNK_OVERLAP);
      push();
      cur = tail ? `${tail}\n\n${para}` : para;
    } else {
      cur = cur ? `${cur}\n\n${para}` : para;
    }
    if (chunks.length >= MAX_CHUNKS_PER_NOTE) break;
  }
  push();
  return chunks.slice(0, MAX_CHUNKS_PER_NOTE);
}

/** What we embed for a chunk — a small header gives the model locating context. */
function embedText(note: ParsedNote, chunk: string): string {
  const head = `${note.title} · [${note.folder}]`;
  return `${head}\n\n${chunk}`;
}

/* --------------------------- ingest --------------------------- */

/** Wipe a client's whole vault (documents cascade to chunks). */
export async function clearVault(client = VAULT_CLIENT): Promise<void> {
  const db = vaultDb();
  await db.from("vault_documents").delete().eq("client", client);
}

export type IngestResult = { documents: number; chunks: number; skipped: number };

/**
 * Embed + store a batch of notes. Upserts each note's document row, replaces its
 * chunks, and embeds every chunk in the batch in as few calls as possible.
 */
export async function ingestNotes(notes: VaultNoteInput[], client = VAULT_CLIENT): Promise<IngestResult> {
  const cfg = vaultConfigured();
  if (!cfg.ok) throw new Error(cfg.reason || "Vault not configured");
  const db = vaultDb();

  // 1. Parse + chunk
  const parsed = notes
    .map(parseNote)
    .filter((n) => n.body.length > 0)
    .map((n) => ({ note: n, chunks: chunkText(n.body) }))
    .filter((x) => x.chunks.length > 0);

  if (parsed.length === 0) return { documents: 0, chunks: 0, skipped: notes.length };

  // 2. Upsert document rows, get their ids back keyed by path
  const docRows = parsed.map(({ note, chunks }) => ({
    client,
    path: note.path,
    title: note.title,
    folder: note.folder,
    tags: note.tags,
    links: note.links,
    content: note.body.slice(0, 200_000),
    char_count: note.body.length,
    chunk_count: chunks.length,
  }));
  const { data: upserted, error: upErr } = await db
    .from("vault_documents")
    .upsert(docRows, { onConflict: "client,path" })
    .select("id,path");
  if (upErr) throw new Error(`vault_documents upsert failed: ${upErr.message}`);
  const idByPath = new Map<string, string>((upserted ?? []).map((r: { id: string; path: string }) => [r.path, r.id]));

  // 3. Replace existing chunks for these documents (idempotent re-ingest)
  const docIds = [...idByPath.values()];
  if (docIds.length) await db.from("vault_chunks").delete().in("document_id", docIds);

  // 4. Embed every chunk in the batch (embed() handles token-budget batching)
  const flat: { docId: string; note: ParsedNote; index: number; content: string }[] = [];
  for (const { note, chunks } of parsed) {
    const docId = idByPath.get(note.path);
    if (!docId) continue;
    chunks.forEach((content, index) => flat.push({ docId, note, index, content }));
  }
  const vectors = await embed(flat.map((f) => embedText(f.note, f.content)));

  // 5. Insert chunk rows (sub-batched to keep payloads modest)
  const chunkRows = flat.map((f, i) => ({
    document_id: f.docId,
    client,
    path: f.note.path,
    title: f.note.title,
    folder: f.note.folder,
    chunk_index: f.index,
    content: f.content,
    embedding: vectors[i],
  }));
  for (let i = 0; i < chunkRows.length; i += INSERT_BATCH) {
    const slice = chunkRows.slice(i, i + INSERT_BATCH);
    const { error } = await db.from("vault_chunks").insert(slice);
    if (error) throw new Error(`vault_chunks insert failed: ${error.message}`);
  }

  return { documents: parsed.length, chunks: chunkRows.length, skipped: notes.length - parsed.length };
}

/* --------------------------- search --------------------------- */

/**
 * Semantic retrieval over the vault. Returns the nearest chunks; pass
 * `groupByDocument` to collapse to one best chunk per note (good for grounding).
 */
export async function searchVault(
  query: string,
  opts: { limit?: number; client?: string; threshold?: number; groupByDocument?: boolean } = {}
): Promise<VaultHit[]> {
  if (!query?.trim()) return [];
  if (!vaultConfigured().ok) return [];
  const limit = opts.limit ?? 8;
  try {
    const qVec = await embedOne(query);
    const db = vaultDb();
    const { data, error } = await db.rpc("match_vault_chunks", {
      query_embedding: qVec,
      filter_client: opts.client ?? VAULT_CLIENT,
      match_count: opts.groupByDocument ? limit * 3 : limit,
      similarity_threshold: opts.threshold ?? 0.2,
    });
    if (error) {
      console.error("[brain-vault] search failed:", error.message);
      return [];
    }
    let hits: VaultHit[] = ((data as RpcRow[]) || []).map((r) => ({
      id: r.id,
      documentId: r.document_id,
      path: r.path,
      title: r.title,
      folder: r.folder,
      chunkIndex: r.chunk_index,
      content: r.content,
      similarity: r.similarity,
    }));
    if (opts.groupByDocument) {
      const seen = new Set<string>();
      hits = hits.filter((h) => (seen.has(h.documentId) ? false : (seen.add(h.documentId), true))).slice(0, limit);
    }
    return hits;
  } catch (err) {
    console.error("[brain-vault] search exception:", err);
    return [];
  }
}

type RpcRow = {
  id: string;
  document_id: string;
  path: string;
  title: string;
  folder: string;
  chunk_index: number;
  content: string;
  similarity: number;
};

/* --------------------------- stats --------------------------- */

export async function vaultStats(client = VAULT_CLIENT): Promise<VaultStats> {
  try {
    const db = vaultDb();
    const { data, error } = await db.rpc("vault_stats", { filter_client: client });
    if (error || !data?.length) return { documents: 0, chunks: 0, folders: 0 };
    const row = data[0] as { documents: number; chunks: number; folders: number };
    return {
      documents: Number(row.documents) || 0,
      chunks: Number(row.chunks) || 0,
      folders: Number(row.folders) || 0,
    };
  } catch {
    return { documents: 0, chunks: 0, folders: 0 };
  }
}

/** Read ONE note's full content by title (exact case-insensitive, then fuzzy contains). */
export type VaultNoteRead = { found: boolean; title?: string; folder?: string; content?: string; path?: string };
export async function readVaultNote(title: string, client = VAULT_CLIENT): Promise<VaultNoteRead> {
  if (!vaultConfigured().ok || !title?.trim()) return { found: false };
  try {
    const db = vaultDb();
    const t = title.trim();
    const cols = "title,folder,content,path";
    let { data } = await db.from("vault_documents").select(cols).eq("client", client).ilike("title", t).limit(1);
    if (!data?.length) {
      ({ data } = await db.from("vault_documents").select(cols).eq("client", client).ilike("title", `%${t}%`).limit(1));
    }
    const row = data?.[0] as { title: string; folder: string; content: string; path: string } | undefined;
    if (!row) return { found: false };
    return { found: true, title: row.title, folder: row.folder, content: row.content, path: row.path };
  } catch (err) {
    console.error("[brain-vault] readVaultNote failed:", err);
    return { found: false };
  }
}

/** The most recently edited notes (by mtime), for "what did I work on lately". */
export async function recentVaultNotes(client = VAULT_CLIENT, limit = 10): Promise<{ title: string; folder: string; mtime: number; excerpt: string }[]> {
  if (!vaultConfigured().ok) return [];
  try {
    const db = vaultDb();
    const { data } = await db
      .from("vault_documents")
      .select("title,folder,content,mtime")
      .eq("client", client)
      .order("mtime", { ascending: false, nullsFirst: false })
      .limit(limit);
    return ((data as { title: string; folder: string; content: string | null; mtime: number | null }[]) ?? []).map((r) => ({
      title: r.title,
      folder: r.folder,
      mtime: Number(r.mtime) || 0,
      excerpt: (r.content ?? "").slice(0, 280),
    }));
  } catch (err) {
    console.error("[brain-vault] recentVaultNotes failed:", err);
    return [];
  }
}

/* --------------------------- knowledge graph --------------------------- */

export type VaultGraphResult = {
  graph: BrainGraph;
  stats: { notes: number; links: number; folders: number };
};

/**
 * Build the same {nodes, links, folders} graph the stage demo renders — but from
 * the Supabase vault. Edges come from each note's stored [[wikilinks]] resolved
 * by title (identical algorithm to vault.ts buildGraph, kept inline so this
 * widely-imported module stays free of the LanceDB-heavy vault.ts).
 */
export async function buildVaultGraph(client = VAULT_CLIENT): Promise<VaultGraphResult> {
  const empty: VaultGraphResult = { graph: { nodes: [], links: [], folders: [] }, stats: { notes: 0, links: 0, folders: 0 } };
  if (!vaultConfigured().ok) return empty;
  try {
    const db = vaultDb();
    type Row = { path: string; title: string; folder: string; tags: string[] | null; links: string[] | null };
    // Supabase caps .select() at 1000 rows — paginate so the whole vault graphs.
    const rows: Row[] = [];
    const PAGE = 1000;
    for (let from = 0; from < 50000; from += PAGE) {
      const { data, error } = await db
        .from("vault_documents")
        .select("path,title,folder,tags,links")
        .eq("client", client)
        .range(from, from + PAGE - 1);
      if (error) {
        if (!rows.length) return empty;
        break;
      }
      if (!data?.length) break;
      rows.push(...(data as Row[]));
      if (data.length < PAGE) break;
    }
    if (!rows.length) return empty;
    const notes = rows.map((r) => ({
      id: r.path.replace(/\.md$/i, ""),
      title: r.title,
      folder: r.folder || "(root)",
      tags: r.tags ?? [],
      links: r.links ?? [],
    }));

    const byTitle = new Map<string, (typeof notes)[number]>();
    for (const n of notes) byTitle.set(n.title.toLowerCase(), n);
    const folders = [...new Set(notes.map((n) => n.folder))].sort();
    const folderIdx = new Map(folders.map((f, i) => [f, i]));

    const links: BrainGraph["links"] = [];
    const degree = new Map<string, number>();
    for (const n of notes) {
      for (const target of n.links) {
        const t = byTitle.get(String(target).toLowerCase());
        if (t && t.id !== n.id) {
          links.push({ source: n.id, target: t.id });
          degree.set(n.id, (degree.get(n.id) || 0) + 1);
          degree.set(t.id, (degree.get(t.id) || 0) + 1);
        }
      }
    }

    const nodes: BrainGraph["nodes"] = notes.map((n) => {
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

    return { graph: { nodes, links, folders }, stats: { notes: nodes.length, links: links.length, folders: folders.length } };
  } catch (err) {
    console.error("[brain-vault] graph build failed:", err);
    return empty;
  }
}

/** A few representative note titles/folders for the manifest UI. */
export async function vaultSample(client = VAULT_CLIENT, limit = 8): Promise<{ title: string; folder: string; chunks: number }[]> {
  try {
    const db = vaultDb();
    const { data, error } = await db
      .from("vault_documents")
      .select("title,folder,chunk_count")
      .eq("client", client)
      .order("char_count", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.map((d: { title: string; folder: string; chunk_count: number }) => ({
      title: d.title,
      folder: d.folder,
      chunks: d.chunk_count,
    }));
  } catch {
    return [];
  }
}
