/**
 * Real LinkedIn engagement metrics, aggregated from the founder's full scraped
 * post dataset (output.json — 200 posts, all Daniel Paul's). LinkedIn does NOT
 * expose impressions/views publicly, so these are ENGAGEMENT metrics (reactions,
 * comments, reposts), which are real. Server-side only (the dataset is ~1MB, so it
 * never reaches the client bundle — the dashboard page imports only the type).
 */

import postsRaw from "../../output.json";

type RawPost = { content?: string; engagement?: { likes?: number; comments?: number; shares?: number } };
const POSTS = (postsRaw as RawPost[]) ?? [];

export type LinkedInMetrics = {
  posts: number;
  reactions: number;
  comments: number;
  shares: number;
  totalEngagement: number;
  avgEngagement: number;
  topPost: { hook: string; reactions: number; comments: number; shares: number };
  /** engagement per recent post, oldest→newest — drives the trend graph */
  series: number[];
};

export function linkedinMetrics(): LinkedInMetrics {
  let reactions = 0;
  let comments = 0;
  let shares = 0;
  let top: RawPost | undefined;
  let topEng = -1;
  for (const p of POSTS) {
    const e = p.engagement ?? {};
    const r = e.likes ?? 0;
    const c = e.comments ?? 0;
    const s = e.shares ?? 0;
    reactions += r;
    comments += c;
    shares += s;
    const eng = r + c + s;
    if (eng > topEng) {
      topEng = eng;
      top = p;
    }
  }
  const totalEngagement = reactions + comments + shares;
  const te = top?.engagement ?? {};
  // most recent ~28 posts, flipped to chronological order for a left→right trend
  const series = POSTS.slice(0, 28)
    .map((p) => {
      const e = p.engagement ?? {};
      return (e.likes ?? 0) + (e.comments ?? 0) + (e.shares ?? 0);
    })
    .reverse();
  return {
    series,
    posts: POSTS.length,
    reactions,
    comments,
    shares,
    totalEngagement,
    avgEngagement: POSTS.length ? Math.round(totalEngagement / POSTS.length) : 0,
    topPost: {
      hook: (top?.content || "").split("\n")[0].slice(0, 100),
      reactions: te.likes ?? 0,
      comments: te.comments ?? 0,
      shares: te.shares ?? 0,
    },
  };
}
