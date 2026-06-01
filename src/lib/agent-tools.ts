import { tool } from "ai";
import { z } from "zod";
import {
  getCachedVault,
  hybridSearch,
  getSearchModeInfo,
} from "./vault";
import { getKnowledgeTree, getKnowledgeNode } from "./knowledge";
import { redactObject, type ViewerRole } from "./privacy";
import { buildBrainTools } from "./brain-tools";

/**
 * Shared agent tool factory used by /api/chat and the cadence cron routes.
 * Keeping all tool definitions here ensures the morning brief / meeting
 * capture jobs see exactly the same vault + redaction behavior as a live
 * chat session.
 */
export function buildAgentTools(viewerRole: ViewerRole) {
  const redactOpts = { role: viewerRole };

  return {
    queryBrain: tool({
      description:
        "Hybrid keyword + semantic search across Daniel's Obsidian vault. Use for any question about his voice, ICP, clients, content, decisions, business state, or past work.",
      parameters: z.object({
        query: z
          .string()
          .describe("Search query — natural language or keywords."),
        limit: z.number().int().min(1).max(12).default(6),
      }),
      execute: async ({ query, limit }) => {
        const hits = await hybridSearch(query, limit);
        const mode = getSearchModeInfo();
        const payload = {
          query,
          mode:
            mode.indexState === "ready"
              ? "hybrid"
              : `keyword-only (semantic ${mode.indexState})`,
          count: hits.length,
          results: hits.map((h) => ({
            title: h.title,
            folder: h.folder,
            excerpt: h.excerpt,
            foundBy:
              h.source.keyword !== null && h.source.semantic !== null
                ? "both"
                : h.source.semantic !== null
                  ? "semantic"
                  : "keyword",
          })),
        };
        return await redactObject(payload, redactOpts);
      },
    }),

    brainStats: tool({
      description:
        "Get structural facts about the vault — total notes, total links, top hub notes, folder breakdown.",
      parameters: z.object({
        topHubs: z.number().int().min(1).max(20).default(10),
      }),
      execute: async ({ topHubs }) => {
        const { notes, graph } = await getCachedVault();
        const sorted = [...graph.nodes]
          .sort((a, b) => b.degree - a.degree)
          .slice(0, topHubs);
        const folderCounts = new Map<string, number>();
        for (const n of notes)
          folderCounts.set(n.folder, (folderCounts.get(n.folder) ?? 0) + 1);
        const folders = [...folderCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([folder, count]) => ({ folder, count }));
        const payload = {
          totals: {
            notes: notes.length,
            links: graph.links.length,
            folders: graph.folders.length,
          },
          topHubs: sorted.map((n) => ({
            title: n.name,
            folder: n.folder,
            degree: n.degree,
          })),
          foldersByCount: folders.slice(0, 15),
        };
        return await redactObject(payload, redactOpts);
      },
    }),

    recentNotes: tool({
      description:
        "List the most recently edited notes in the vault. Use for 'what did I work on last week / yesterday / recently'.",
      parameters: z.object({
        limit: z.number().int().min(1).max(20).default(10),
      }),
      execute: async ({ limit }) => {
        const { notes } = await getCachedVault();
        const sorted = [...notes].sort((a, b) => b.mtime - a.mtime).slice(0, limit);
        const payload = {
          count: sorted.length,
          results: sorted.map((n) => ({
            title: n.title,
            folder: n.folder,
            editedAt: new Date(n.mtime).toISOString(),
            excerpt: n.body.slice(0, 280),
          })),
        };
        return await redactObject(payload, redactOpts);
      },
    }),

    readNote: tool({
      description:
        "Read the FULL body of a specific note by exact title (case-insensitive).",
      parameters: z.object({
        title: z.string().describe("Exact note title."),
      }),
      execute: async ({ title }) => {
        if (viewerRole === "public") {
          return {
            found: false,
            refused:
              "Reading raw vault notes is not allowed for public viewers.",
            title,
          };
        }
        const { notes } = await getCachedVault();
        const norm = title.trim().toLowerCase();
        const hit = notes.find((n) => n.title.toLowerCase() === norm);
        if (!hit) {
          const fuzzy = notes.find(
            (n) =>
              n.title.toLowerCase().includes(norm) ||
              norm.includes(n.title.toLowerCase())
          );
          if (!fuzzy) return { found: false, title };
          return await redactObject(
            {
              found: true,
              title: fuzzy.title,
              folder: fuzzy.folder,
              fullBody: fuzzy.body,
              links: fuzzy.links,
              tags: fuzzy.tags,
            },
            redactOpts
          );
        }
        return await redactObject(
          {
            found: true,
            title: hit.title,
            folder: hit.folder,
            fullBody: hit.body,
            links: hit.links,
            tags: hit.tags,
          },
          redactOpts
        );
      },
    }),

    listKnowledgeCategories: tool({
      description:
        "List the AI Danny knowledge map — 15 macros, 266 pre-distilled categories.",
      parameters: z.object({
        macro: z.string().optional(),
      }),
      execute: async ({ macro }) => {
        const tree = await getKnowledgeTree();
        const filtered = macro
          ? tree.filter((m) => m.dir.startsWith(macro))
          : tree;
        return {
          macros: filtered.map((m) => ({
            dir: m.dir,
            title: m.title,
            count: m.count,
            distilled: m.nodes.filter((n) => n.status === "distilled").length,
            nodes: m.nodes.map((n) => ({
              slug: n.slug,
              title: n.title,
              status: n.status,
            })),
          })),
        };
      },
    }),

    queryKnowledge: tool({
      description:
        "Read the distilled synthesis for ONE specific knowledge category.",
      parameters: z.object({
        macro: z.string(),
        slug: z.string(),
      }),
      execute: async ({ macro, slug }) => {
        const node = await getKnowledgeNode(macro, slug);
        if (!node) return { ok: false, error: `not found: ${macro}/${slug}` };
        const payload = {
          ok: true as const,
          title: node.title,
          macro: node.macroTitle,
          status: node.status,
          description: node.description,
          distilled: node.body || null,
          isEmpty: !node.body,
        };
        return await redactObject(payload, redactOpts);
      },
    }),

    // Structured brain: schema + read-only SQL (owner-only inside the tool)
    ...buildBrainTools(viewerRole),
  };
}
