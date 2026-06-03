/**
 * linkedin-charts.ts — LOCKED chart DESIGN data shapes. The values below are precomputed from
 * output.json (200 posts, ~9 months) and used as defaults, but every chart takes its data as a
 * prop — so a different range (e.g. "last 2 months") just recomputes these shapes and the charts
 * render identically. The DESIGN is frozen; the data is not.
 */

/** Data shapes the charts consume (compute these for any post range). */
export type LIMonthly = { month: string; reactions: number; comments: number; engagement: number; posts: number };
export type LITopPost = { hook: string; reactions: number; comments: number; shares: number; total: number };
export type LIReaction = { type: string; count: number; pct: number };

export const LI_KPIS = {"posts": 200, "reactions": 19544, "comments": 20562, "shares": 729, "avgEngagement": 201, "topPost": "I built an entire marketing team using Claude.", "topPostEngagement": 11230};

/** Monthly engagement trend (reactions + comments). */
export const LI_MONTHLY = [
  {
    "month": "Sep",
    "reactions": 95,
    "comments": 45,
    "engagement": 140,
    "posts": 2
  },
  {
    "month": "Oct",
    "reactions": 1632,
    "comments": 755,
    "engagement": 2387,
    "posts": 23
  },
  {
    "month": "Nov",
    "reactions": 1675,
    "comments": 772,
    "engagement": 2447,
    "posts": 21
  },
  {
    "month": "Dec",
    "reactions": 1701,
    "comments": 865,
    "engagement": 2566,
    "posts": 23
  },
  {
    "month": "Jan",
    "reactions": 2195,
    "comments": 1609,
    "engagement": 3804,
    "posts": 23
  },
  {
    "month": "Feb",
    "reactions": 2158,
    "comments": 1983,
    "engagement": 4141,
    "posts": 24
  },
  {
    "month": "Mar",
    "reactions": 4628,
    "comments": 8175,
    "engagement": 12803,
    "posts": 28
  },
  {
    "month": "Apr",
    "reactions": 2531,
    "comments": 3226,
    "engagement": 5757,
    "posts": 26
  },
  {
    "month": "May",
    "reactions": 2783,
    "comments": 3079,
    "engagement": 5862,
    "posts": 28
  },
  {
    "month": "Jun",
    "reactions": 146,
    "comments": 53,
    "engagement": 199,
    "posts": 2
  }
];

/** Top 7 posts by weighted engagement. */
export const LI_TOP_POSTS = [
  {
    "hook": "I built an entire marketing team using Claude.",
    "reactions": 1804,
    "comments": 4620,
    "shares": 62,
    "total": 11230
  },
  {
    "hook": "I built an entire AI sales team using Claude. ",
    "reactions": 600,
    "comments": 1687,
    "shares": 23,
    "total": 4043
  },
  {
    "hook": "Your LinkedIn profile is quietly losing you 5–10 inb…",
    "reactions": 643,
    "comments": 1540,
    "shares": 16,
    "total": 3771
  },
  {
    "hook": "I am giving away my entire Claude Skills Library for…",
    "reactions": 391,
    "comments": 958,
    "shares": 28,
    "total": 2391
  },
  {
    "hook": "Your LinkedIn profile is costing you 5-10 calls per …",
    "reactions": 390,
    "comments": 882,
    "shares": 19,
    "total": 2211
  },
  {
    "hook": "I built an AI workflow that automates your entire sa…",
    "reactions": 268,
    "comments": 709,
    "shares": 27,
    "total": 1767
  },
  {
    "hook": "A tool that creates Scripts in Less than 60 Secs.",
    "reactions": 238,
    "comments": 652,
    "shares": 7,
    "total": 1563
  }
];

/** Reaction sentiment mix. */
export const LI_REACTION_MIX = [
  {
    "type": "Like",
    "count": 15747,
    "pct": 80.6
  },
  {
    "type": "Empathy",
    "count": 2496,
    "pct": 12.8
  },
  {
    "type": "Appreciation",
    "count": 475,
    "pct": 2.4
  },
  {
    "type": "Praise",
    "count": 415,
    "pct": 2.1
  },
  {
    "type": "Insightful",
    "count": 404,
    "pct": 2.1
  },
  {
    "type": "Funny",
    "count": 7,
    "pct": 0.0
  }
];
