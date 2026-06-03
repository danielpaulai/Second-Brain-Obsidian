import fs from "fs";
import path from "path";
import type { LIMonthly, LITopPost, LIReaction } from "./linkedin-charts";
import type { LinkedInScope } from "./linkedin-scope";

/**
 * Server-side analysis of the scraped LinkedIn posts (output.json at repo root). Produces the
 * SAME data-driven shapes the charts consume (so a different range just recomputes these), plus
 * the top/bottom posts' content for the LLM narrative. Pure read, cached per process.
 */

type RawPost = {
  content?: string;
  engagement?: { comments?: number; shares?: number; reactions?: { type: string; count: number }[] };
  postedAt?: { date?: string; postedAgoShort?: string };
};

let _cache: RawPost[] | null = null;
function load(): RawPost[] {
  if (_cache) return _cache;
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "output.json"), "utf8");
    const parsed = JSON.parse(raw);
    _cache = Array.isArray(parsed) ? (parsed as RawPost[]) : [];
  } catch {
    _cache = [];
  }
  return _cache;
}

const reactions = (p: RawPost) => (p.engagement?.reactions ?? []).reduce((s, r) => s + r.count, 0);
const comments = (p: RawPost) => p.engagement?.comments ?? 0;
const shares = (p: RawPost) => p.engagement?.shares ?? 0;
const dateMs = (p: RawPost) => (p.postedAt?.date ? new Date(p.postedAt.date).getTime() : NaN);
const score = (p: RawPost) => reactions(p) + 2 * comments(p) + 3 * shares(p);
const firstLine = (p: RawPost) => (p.content ?? "").trim().split("\n")[0] ?? "";
const hook = (p: RawPost) => {
  const l = firstLine(p);
  return l.length > 53 ? l.slice(0, 52) + "…" : l;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const NICE: Record<string, string> = {
  LIKE: "Like",
  EMPATHY: "Empathy",
  APPRECIATION: "Appreciation",
  INTEREST: "Insightful",
  PRAISE: "Praise",
  ENTERTAINMENT: "Funny",
};

export type LinkedInStats = {
  kpis: { posts: number; reactions: number; comments: number; shares: number; avgEngagement: number };
  monthly: LIMonthly[];
  topPosts: LITopPost[];
  reactionMix: LIReaction[];
  /** Top + bottom post content for the LLM to reason over. */
  topContent: { hook: string; reactions: number; comments: number; shares: number; excerpt: string }[];
  bottomContent: { hook: string; reactions: number; comments: number; excerpt: string }[];
};

/** Adaptive time-series: bucket the scoped posts by month / week / day depending on how wide the
 *  window is, so a narrow scope ("last week", "last 5 posts") still draws a real trend, not one bar.
 *  Keeps the LIMonthly shape (the `month` field just holds the bucket label). */
function buildSeries(posts: RawPost[]): LIMonthly[] {
  const dated = posts.filter((p) => Number.isFinite(dateMs(p)));
  if (!dated.length) return [];
  const times = dated.map(dateMs);
  const spanDays = (Math.max(...times) - Math.min(...times)) / 86_400_000;
  const gran: "month" | "week" | "day" = spanDays > 75 ? "month" : spanDays > 21 ? "week" : "day";

  const keyOf = (d: Date): string => {
    if (gran === "month") return d.toISOString().slice(0, 7); // YYYY-MM
    if (gran === "day") return d.toISOString().slice(0, 10); // YYYY-MM-DD
    const x = new Date(d); // week → Monday (UTC)
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
    x.setUTCHours(0, 0, 0, 0);
    return x.toISOString().slice(0, 10);
  };
  const labelOf = (key: string): string => {
    if (gran === "month") return MONTHS[parseInt(key.slice(5, 7), 10) - 1];
    const d = new Date(key + "T00:00:00Z");
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  };

  const buckets = new Map<string, { reactions: number; comments: number; posts: number }>();
  for (const p of dated) {
    const key = keyOf(new Date(dateMs(p)));
    const b = buckets.get(key) ?? { reactions: 0, comments: 0, posts: 0 };
    b.reactions += reactions(p);
    b.comments += comments(p);
    b.posts += 1;
    buckets.set(key, b);
  }
  return [...buckets.keys()].sort().map((key) => {
    const b = buckets.get(key)!;
    return { month: labelOf(key), reactions: b.reactions, comments: b.comments, engagement: b.reactions + b.comments, posts: b.posts };
  });
}

/** Compute everything from the posts in `scope`. Relative windows are anchored to the LATEST post
 *  date (not the wall clock), so "last month" / "last 5 posts" always land on real data. */
export function computeLinkedInStats(scope?: LinkedInScope): LinkedInStats {
  const all = load();
  const allTimes = all.map(dateMs).filter(Number.isFinite);
  const refMs = allTimes.length ? Math.max(...allTimes) : Date.now();

  let posts = all;
  if (scope && scope.kind !== "all") {
    if (scope.kind === "count") {
      posts = all
        .filter((p) => Number.isFinite(dateMs(p)))
        .sort((a, b) => dateMs(b) - dateMs(a))
        .slice(0, Math.max(1, scope.value));
    } else {
      const cutoff = new Date(refMs);
      if (scope.kind === "days") cutoff.setUTCDate(cutoff.getUTCDate() - scope.value);
      else cutoff.setUTCMonth(cutoff.getUTCMonth() - scope.value); // months
      const c = cutoff.getTime();
      posts = all.filter((p) => Number.isFinite(dateMs(p)) && dateMs(p) >= c);
    }
  }
  // never analyse an empty window — fall back to everything
  if (!posts.length) posts = all;

  const monthly = buildSeries(posts);

  // Ranked
  const ranked = [...posts].sort((a, b) => score(b) - score(a));
  const topPosts: LITopPost[] = ranked.slice(0, 7).map((p) => ({
    hook: hook(p),
    reactions: reactions(p),
    comments: comments(p),
    shares: shares(p),
    total: score(p),
  }));

  // Reaction mix
  const mix = new Map<string, number>();
  for (const p of posts) for (const r of p.engagement?.reactions ?? []) mix.set(r.type, (mix.get(r.type) ?? 0) + r.count);
  const totalReact = [...mix.values()].reduce((s, v) => s + v, 0) || 1;
  const reactionMix: LIReaction[] = [...mix.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({ type: NICE[type] ?? type, count, pct: Math.round((count * 1000) / totalReact) / 10 }));

  // KPIs
  const totReact = posts.reduce((s, p) => s + reactions(p), 0);
  const totComm = posts.reduce((s, p) => s + comments(p), 0);
  const totShare = posts.reduce((s, p) => s + shares(p), 0);
  const kpis = {
    posts: posts.length,
    reactions: totReact,
    comments: totComm,
    shares: totShare,
    avgEngagement: posts.length ? Math.round((totReact + totComm) / posts.length) : 0,
  };

  const excerpt = (p: RawPost) => (p.content ?? "").trim().replace(/\s+/g, " ").slice(0, 280);
  const topContent = ranked.slice(0, 8).map((p) => ({
    hook: hook(p),
    reactions: reactions(p),
    comments: comments(p),
    shares: shares(p),
    excerpt: excerpt(p),
  }));
  const bottomContent = ranked.slice(-8).map((p) => ({
    hook: hook(p),
    reactions: reactions(p),
    comments: comments(p),
    excerpt: excerpt(p),
  }));

  return { kpis, monthly, topPosts, reactionMix, topContent, bottomContent };
}
