import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import {
  type AgentKey,
  type DocType,
  AGENT_KNOWLEDGE_SCOPE,
  KNOWLEDGE_MAP,
  isDocType,
} from "./knowledge-map";
import { APP_CLIENT } from "./client";

/**
 * Client knowledge — the student's ingested business-doc set.
 *
 * Notes live at content/knowledge/<client>/<doc_type>.md with routing
 * frontmatter (doc_type, authority, serves_agents, answers, provides, ...).
 * This module reads + parses them and provides AGENT-SCOPED retrieval so each
 * agent only looks where its knowledge-map scope says to look.
 *
 *   listBusinessDocs({ agent })   — the manifest: what exists + what it answers
 *   readBusinessDoc({ docType })  — one full document
 *   searchBusinessDocs({ query }) — scoped keyword search across documents
 *
 * Source of truth is the frontmatter on disk (bundled with the deployment).
 * The `knowledge_docs` Supabase table is a queryable mirror, not required here.
 */

export type BusinessDoc = {
  docType: DocType;
  title: string;
  client: string;
  authority: number;
  servesAgents: string[];
  answers: string[];
  provides: string[];
  pillars: string[];
  summary: string;
  sourceFile: string;
  body: string;
  storagePath: string;
};

const KNOWLEDGE_ROOT = path.join(process.cwd(), "content", "knowledge");
const TTL_MS = 60_000;

type Cache = { docs: BusinessDoc[]; loadedAt: number };
const cacheByClient = new Map<string, Cache>();
/** The active client. Single-tenant: there is exactly one (APP_CLIENT), so no env needed. */
export async function defaultClient(): Promise<string> {
  return APP_CLIENT;
}

async function loadDocs(client: string): Promise<BusinessDoc[]> {
  const cached = cacheByClient.get(client);
  if (cached && Date.now() - cached.loadedAt < TTL_MS) return cached.docs;

  const dir = path.join(KNOWLEDGE_ROOT, client, "knowledge");
  let files: string[] = [];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith(".md"));
  } catch {
    files = [];
  }

  const docs: BusinessDoc[] = [];
  for (const file of files) {
    try {
      const raw = await fs.readFile(path.join(dir, file), "utf8");
      const { data, content } = matter(raw);
      const dt = String(data.doc_type || "");
      if (!isDocType(dt)) continue;
      docs.push({
        docType: dt,
        title: String(data.title || KNOWLEDGE_MAP[dt].label),
        client,
        authority: Number(data.authority ?? KNOWLEDGE_MAP[dt].authority),
        servesAgents: Array.isArray(data.serves_agents) ? data.serves_agents.map(String) : KNOWLEDGE_MAP[dt].servesAgents,
        answers: Array.isArray(data.answers) ? data.answers.map(String) : KNOWLEDGE_MAP[dt].answers,
        provides: Array.isArray(data.provides) ? data.provides.map(String) : [],
        pillars: Array.isArray(data.pillars) ? data.pillars.map(String) : [],
        summary: String(data.summary || KNOWLEDGE_MAP[dt].summary),
        sourceFile: String(data.source_file || file),
        body: content.trim(),
        storagePath: `content/knowledge/${client}/knowledge/${file}`,
      });
    } catch {
      // skip unreadable
    }
  }
  // Highest authority first so the most canonical docs surface first.
  docs.sort((a, b) => b.authority - a.authority);
  cacheByClient.set(client, { docs, loadedAt: Date.now() });
  return docs;
}

function resolveScope(opts: { agent?: AgentKey; docTypes?: DocType[] }): DocType[] | null {
  if (opts.docTypes && opts.docTypes.length) return opts.docTypes;
  if (opts.agent) return AGENT_KNOWLEDGE_SCOPE[opts.agent] ?? null;
  return null; // null = all
}

/**
 * The manifest an agent reads to decide WHERE TO LOOK: each in-scope document,
 * what it is, and the questions it answers — plus whether it's actually been
 * ingested yet for this client.
 */
export async function listBusinessDocs(opts: { agent?: AgentKey; client?: string } = {}) {
  const client = opts.client || (await defaultClient());
  const docs = await loadDocs(client);
  const have = new Map(docs.map((d) => [d.docType, d]));
  const scope = resolveScope(opts);
  const types = (scope ?? (Object.keys(KNOWLEDGE_MAP) as DocType[]));
  return {
    client,
    documents: types.map((dt) => {
      const meta = KNOWLEDGE_MAP[dt];
      const doc = have.get(dt);
      return {
        docType: dt,
        label: meta.label,
        authority: meta.authority,
        summary: doc?.summary || meta.summary,
        answers: doc?.answers?.length ? doc.answers : meta.answers,
        available: !!doc,
      };
    }),
  };
}

/**
 * The full parsed doc set for a client (title, pillars, authority, scope, …) —
 * used by the brain-graph builder. Returns the resolved client slug too.
 */
export async function loadClientDocsForBrain(
  client?: string
): Promise<{ client: string; docs: BusinessDoc[] }> {
  const c = client || (await defaultClient());
  const docs = await loadDocs(c);
  return { client: c, docs };
}

export async function readBusinessDoc(opts: { docType: DocType; client?: string }) {
  const client = opts.client || (await defaultClient());
  const docs = await loadDocs(client);
  const doc = docs.find((d) => d.docType === opts.docType);
  if (!doc) {
    return { found: false as const, docType: opts.docType, client };
  }
  return {
    found: true as const,
    docType: doc.docType,
    title: doc.title,
    summary: doc.summary,
    authority: doc.authority,
    pillars: doc.pillars,
    body: doc.body,
  };
}

/**
 * Overwrite the BODY of a doc on disk, preserving its frontmatter. Used by the
 * settings editor so a founder can correct what an agent reads. Busts the cache
 * so the next read (and the next agent turn) sees the edit. Returns the updated
 * summary/title for the mirror row.
 */
export async function writeBusinessDoc(opts: {
  docType: DocType;
  body: string;
  client?: string;
}): Promise<{ ok: boolean; client: string; title?: string; summary?: string }> {
  const client = opts.client || (await defaultClient());
  const docs = await loadDocs(client);
  const doc = docs.find((d) => d.docType === opts.docType);
  if (!doc) return { ok: false, client };

  const file = path.basename(doc.storagePath);
  const full = path.join(KNOWLEDGE_ROOT, client, "knowledge", file);
  const raw = await fs.readFile(full, "utf8");
  const { data } = matter(raw);
  const next = matter.stringify(opts.body.trim() + "\n", data);
  await fs.writeFile(full, next, "utf8");

  cacheByClient.delete(client); // force re-parse on next read
  return { ok: true, client, title: doc.title, summary: doc.summary };
}

export type DocSearchHit = {
  docType: DocType;
  title: string;
  summary: string;
  authority: number;
  score: number;
  excerpt: string;
};

/**
 * Scoped keyword search. Title/answers/summary are weighted above body so a
 * question like "how do I sound" still routes toward voice-dna. When no docTypes
 * or agent scope is given, searches all documents for this client.
 */
export async function searchBusinessDocs(opts: {
  query: string;
  agent?: AgentKey;
  docTypes?: DocType[];
  client?: string;
  limit?: number;
}): Promise<{ client: string; scope: DocType[] | "all"; count: number; results: DocSearchHit[] }> {
  const client = opts.client || (await defaultClient());
  const all = await loadDocs(client);
  const scope = resolveScope(opts);
  const pool = scope ? all.filter((d) => scope.includes(d.docType)) : all;

  const terms = opts.query.toLowerCase().split(/[^\w]+/).filter((t) => t.length > 2);
  const limit = opts.limit ?? 5;

  const scored = pool.map((d) => {
    const high = (d.title + "\n" + d.summary + "\n" + d.answers.join("\n") + "\n" + d.provides.join(" ")).toLowerCase();
    const body = d.body.toLowerCase();
    let score = 0;
    for (const t of terms) {
      score += (high.match(new RegExp(t, "g")) || []).length * 6;
      score += (body.match(new RegExp(t, "g")) || []).length;
    }
    // Gentle authority prior so ties resolve toward canonical docs.
    score += d.authority * 0.5;
    return { d, score };
  });

  const results = scored
    .filter((s) => s.score > 0 || !terms.length)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ d, score }) => ({
      docType: d.docType,
      title: d.title,
      summary: d.summary,
      authority: d.authority,
      score: Math.round(score * 100) / 100,
      excerpt: bestExcerpt(d.body, terms),
    }));

  return { client, scope: scope ?? "all", count: results.length, results };
}

function bestExcerpt(body: string, terms: string[], window = 480): string {
  if (!terms.length) return body.slice(0, window);
  const lower = body.toLowerCase();
  let at = -1;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) return body.slice(0, window);
  const start = Math.max(0, at - 120);
  return (start > 0 ? "…" : "") + body.slice(start, start + window).trim() + "…";
}
