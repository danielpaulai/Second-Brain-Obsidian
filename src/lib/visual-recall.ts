/**
 * visual-recall.ts — picks which brain nodes light up when a question is asked.
 *
 * The model's actual citations are often sparse OR land on poorly-connected notes, so the brain
 * barely reacts to a query. But the "lighting up" is THEATRE as much as truth: a request should
 * ALWAYS set off a good-looking burst across the graph. So on every query we pick a visually-strong,
 * query-relevant, multi-cluster set to ignite during the "querying" beat — independent of (and ahead
 * of) the real retrieval, which still gets the final cited emphasis when the answer lands.
 *
 * The picks are: (1) RELEVANT — lexical match of the query against note titles / folders / tags;
 * (2) SPREAD — always span several distinct folders (clusters), pulling in "remotely relevant"
 * neighbour clusters when the query only hits one; (3) VISIBLE — prefer well-connected notes and
 * grow each seed into a connected burst, never lone dots; (4) VARIED — module-level memory rotates
 * the clusters/nodes so two asks in a row don't light the exact same constellation.
 *
 * Pure-ish: deterministic for a given (graph, query) EXCEPT the cross-call variety memory below.
 */
import type { GraphNode, GraphLink } from "./vault";

const STOP = new Set(
  ("the a an and or but nor of to in into on for from with without by as at it its this that these " +
    "those i me my we us our you your he she they them their his her do does did is are was were be " +
    "been being have has had will would can could should may might must not no nor yes about over " +
    "under again more most some any all what which who whom how when where why if then than so just " +
    "like get got make made want need know think tell ask say said new use using used give show find " +
    "look give me please tell about whats what's hows how's")
    .split(/\s+/)
);

/** Query → meaningful lowercase search terms (drops stopwords + punctuation + short tokens). */
export function tokenizeQuery(q: string): string[] {
  return [
    ...new Set(
      q
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOP.has(w))
    ),
  ];
}

// ── Cross-query variety memory (module-level) — so consecutive asks light DIFFERENT constellations. ──
let recallTick = 0;
let recentFolders: string[] = []; // most-recently-lit regions, most-recent first
let recentNodeIds: string[] = []; // most-recently-lit node ids, most-recent first

export function resetVisualRecallMemory() {
  recallTick = 0;
  recentFolders = [];
  recentNodeIds = [];
}

export type VisualRecall = { ids: string[]; clusters: string[] };

/**
 * @returns ids ordered for the ignite sweep (interleaved across clusters so it visibly hops the
 *          brain), plus the chosen cluster (folder) names. Always non-empty when the graph has
 *          connected nodes.
 */
export function pickVisualRecall(
  graph: { nodes: GraphNode[]; links: GraphLink[] },
  query: string,
  opts: { count?: number } = {}
): VisualRecall {
  const targetCount = opts.count ?? 20;
  const { nodes, links } = graph;
  if (!nodes.length) return { ids: [], clusters: [] };
  const tick = ++recallTick;

  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const adj = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    let arr = adj.get(a);
    if (!arr) adj.set(a, (arr = []));
    arr.push(b);
  };
  for (const l of links) {
    link(l.source, l.target);
    link(l.target, l.source);
  }

  const terms = tokenizeQuery(query);

  // Lexical relevance per node: a title hit is strongest, folder/tag hit is a softer signal.
  const scoreOf = (n: GraphNode): number => {
    if (!terms.length) return 0;
    const name = n.name.toLowerCase();
    const meta = (n.folder + " " + (n.tags || []).join(" ")).toLowerCase();
    let s = 0;
    for (const t of terms) {
      if (name.includes(t)) s += 3;
      else if (meta.includes(t)) s += 1.5;
    }
    return s;
  };

  // A folder like "Client calls/Weekly Meetings" shares a top-level REGION with "Client calls/Other".
  // "(root)" is a catch-all spread ALL OVER the graph (not a tight region), so it is never capped.
  const topOf = (f: string) => f.split("/")[0];
  const ROOT = "(root)";
  const REGION_CAP = 4; // ≤4 picks from any one topical region → the burst spreads across the brain
  // recently-lit regions + nodes get pushed down so the next ask lights a different constellation.
  const recentPenalty = (tl: string) => {
    const i = recentFolders.indexOf(tl);
    return i === -1 ? 0 : recentFolders.length - i;
  };
  const recentNodes = new Set(recentNodeIds);
  // a recently-lit note is nudged down — capped so the brain's few biggest centre-piece hubs can
  // still recur, while the mid-tier rotates through fresh notes each ask ("not the same ones").
  const nodePenalty = (n: GraphNode) => (recentNodes.has(n.id) ? Math.min(n.degree * 0.6, 100) : 0);
  const rank = (n: GraphNode) => n.degree - nodePenalty(n) - recentPenalty(topOf(n.folder)) * 20;

  const picks: GraphNode[] = [];
  const pickedIds = new Set<string>();
  const regionCount = new Map<string, number>();
  const take = (n: GraphNode | undefined) => {
    if (!n || pickedIds.has(n.id) || picks.length >= targetCount) return;
    const tl = topOf(n.folder);
    if (tl !== ROOT && (regionCount.get(tl) ?? 0) >= REGION_CAP) return;
    picks.push(n);
    pickedIds.add(n.id);
    regionCount.set(tl, (regionCount.get(tl) ?? 0) + 1);
  };
  const regionsHit = () => new Set(picks.map((n) => topOf(n.folder))).size;

  // 1) PRIMARY — the most VISIBLE relevant notes: relevance gates, DEGREE orders. High-degree notes
  //    anchor different link-communities, so this is naturally both well-connected AND spatially
  //    spread; a relevant lone deg-1 note reads as nothing (that was the whole complaint). Recently
  //    lit regions are nudged down for cross-query variety.
  const relevant = nodes.filter((n) => n.degree >= 2 && scoreOf(n) > 0).sort((a, b) => rank(b) - rank(a));
  const primaryCap = Math.ceil(targetCount * 0.7);
  for (const n of relevant) {
    if (picks.length >= primaryCap) break;
    take(n);
  }

  // 2) SPREAD (remotely relevant) — high-degree notes one hop out from the picked hubs, preferring
  //    DIFFERENT regions, so the burst jumps across the brain while staying related.
  if (picks.length < targetCount || regionsHit() < 3) {
    const seedRegions = new Set(picks.map((n) => topOf(n.folder)));
    const nbrs = new Set<string>();
    for (const n of picks.slice(0, 10)) for (const nb of adj.get(n.id) ?? []) nbrs.add(nb);
    [...nbrs]
      .map((id) => byId.get(id))
      .filter((n): n is GraphNode => !!n && n.degree >= 2 && !pickedIds.has(n.id))
      .sort((a, b) => b.degree - a.degree)
      .forEach((n) => {
        if (picks.length < targetCount && (regionsHit() < 3 || !seedRegions.has(topOf(n.folder)))) take(n);
      });
  }

  // 3) FILL / FALLBACK — the brain's biggest hubs across regions, rotated by tick for variety.
  //    Tops up a thin burst and is the WHOLE selection when the query matched nothing lexically.
  if (picks.length < Math.max(10, Math.floor(targetCount * 0.6)) || regionsHit() < 2) {
    const hubs = nodes.filter((n) => n.degree >= 2 && !pickedIds.has(n.id)).sort((a, b) => rank(b) - rank(a));
    const span = Math.min(hubs.length, 40); // rotate among the top hubs so repeats differ
    const off = span ? tick % span : 0;
    for (let i = 0; i < hubs.length && picks.length < targetCount; i++) take(hubs[(off + i) % hubs.length]);
  }

  // Last resort (degenerate, all-low-degree graph): light ANY connected node so a request never goes
  // dark — matches the "always non-empty when the graph has a connected node" guarantee.
  if (!picks.length) {
    for (const n of nodes.filter((x) => x.degree >= 1).sort((a, b) => b.degree - a.degree)) {
      if (picks.length >= targetCount) break;
      take(n);
    }
  }

  if (!picks.length) return { ids: [], clusters: [] };

  // Order as a cross-brain SWEEP: round-robin across regions (each region degree-sorted) so the
  // strongest hub of every region fires first, then the next tier — a visible hop across the graph.
  const byRegion = new Map<string, GraphNode[]>();
  for (const n of picks) {
    const tl = topOf(n.folder);
    let a = byRegion.get(tl);
    if (!a) byRegion.set(tl, (a = []));
    a.push(n);
  }
  const lanes = [...byRegion.values()]
    .map((a) => a.sort((x, y) => y.degree - x.degree))
    .sort((a, b) => b[0].degree - a[0].degree); // hub-richest region sweeps first
  const ids: string[] = [];
  for (let i = 0; ids.length < picks.length; i++) {
    let any = false;
    for (const lane of lanes) if (i < lane.length) { ids.push(lane[i].id); any = true; }
    if (!any) break;
  }

  const usedRegions = [...new Set(picks.map((n) => topOf(n.folder)))];
  recentFolders = [...usedRegions, ...recentFolders.filter((f) => !usedRegions.includes(f))].slice(0, 6);
  recentNodeIds = [...picks.map((n) => n.id), ...recentNodeIds.filter((id) => !pickedIds.has(id))].slice(0, 40);
  return { ids: ids.slice(0, targetCount), clusters: usedRegions };
}
