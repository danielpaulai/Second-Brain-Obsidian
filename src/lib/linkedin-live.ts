/**
 * Live LinkedIn-posts scraping for the founder's OWN profile, wired to the report builder.
 *
 * The dashboard operator can ask "scrape my last 20 posts" / "how did my posts do last month" and
 * this scrapes the founder's authored posts via harvestapi/linkedin-profile-posts (the SAME actor
 * that produced the bundled output.json, so the scraped items drop straight into computeLinkedInStats
 * with no shape mapping), then builds the same report the /stage demo renders.
 *
 * Graceful + honest: if APIFY_TOKEN is missing or the scrape comes back empty, we fall back to the
 * bundled output.json so the report still renders, but we flag it (`live:false` + a note) — we never
 * pass cached data off as a fresh live scrape.
 */

import { runActorSync, apifyConfigured } from "./apify";
import { PROFILE_POSTS_ACTOR } from "./lead-enrichment";
import { parseLinkedInScope, type LinkedInScope } from "./linkedin-scope";
import { buildLinkedInReport, type LinkedInReportPayload } from "./linkedin-report";
import type { RawPost } from "./linkedin-analysis";

/** The founder's profile. Hardcoded per request; overridable via env without a code change. */
export const OWN_PROFILE_URL = process.env.LINKEDIN_PROFILE_URL || "https://www.linkedin.com/in/danielpaulai/";

/** Hard cap on posts fetched for a time-window scrape (cost + run-time guard; $0.002/post). */
const WINDOW_MAX_POSTS = 100;

/** Map the parsed scope to the actor's input. For a time window we fetch a generous bucket via the
 *  actor's coarse `postedLimit`, then computeLinkedInStats re-filters to the exact cutoff. */
function scopeToActorInput(scope: LinkedInScope): { maxPosts: number; postedLimit: string } {
  if (scope.kind === "count") {
    return { maxPosts: Math.min(Math.max(scope.value, 1), WINDOW_MAX_POSTS), postedLimit: "any" };
  }
  if (scope.kind === "days") {
    const d = scope.value;
    const postedLimit = d <= 1 ? "24h" : d <= 7 ? "week" : d <= 31 ? "month" : d <= 93 ? "3months" : d <= 186 ? "6months" : "year";
    return { maxPosts: WINDOW_MAX_POSTS, postedLimit };
  }
  if (scope.kind === "months") {
    const m = scope.value;
    const postedLimit = m <= 1 ? "month" : m <= 3 ? "3months" : m <= 6 ? "6months" : "year";
    return { maxPosts: WINDOW_MAX_POSTS, postedLimit };
  }
  return { maxPosts: WINDOW_MAX_POSTS, postedLimit: "any" }; // "all" (still capped)
}

export type ScrapeResult = { ok: boolean; configured: boolean; posts: RawPost[]; error?: string };

/** Scrape the founder's own recent posts for the given window. */
export async function scrapeOwnLinkedInPosts(scope: LinkedInScope): Promise<ScrapeResult> {
  if (!apifyConfigured()) return { ok: false, configured: false, posts: [], error: "APIFY_TOKEN is not set" };

  const { maxPosts, postedLimit } = scopeToActorInput(scope);
  const res = await runActorSync<Record<string, unknown>>(
    PROFILE_POSTS_ACTOR,
    {
      targetUrls: [OWN_PROFILE_URL],
      maxPosts,
      postedLimit,
      // engagement.reactions[{type,count}] (the reaction-mix donut) comes back by default — no need
      // for the paid scrapeReactions/scrapeComments events.
      scrapeReactions: false,
      scrapeComments: false,
      // authored content only — pure reposts have null engagement and would skew the analysis.
      includeReposts: false,
      includeQuotePosts: true,
    },
    { maxItems: maxPosts, timeoutMs: 150_000 }
  );

  if (!res.ok) return { ok: false, configured: true, posts: [], error: res.error };
  // keep real post items that carry engagement (drop "0-result" / malformed rows)
  const posts = res.items.filter((p) => p && typeof p === "object" && "engagement" in p && (p as { content?: unknown }).content != null) as RawPost[];
  return { ok: true, configured: true, posts };
}

export type OwnPostsReport = LinkedInReportPayload & {
  /** true when the report was built from a fresh scrape; false when it fell back to cached posts. */
  live: boolean;
  postsScraped: number;
  configured: boolean;
  /** honest note shown to the user when we fell back to cached data. */
  note?: string;
};

/**
 * End-to-end: parse the ask → scrape the founder's posts → build the report. Falls back to the
 * bundled output.json (clearly flagged) if scraping is off or returns nothing.
 */
export async function buildOwnLinkedInPostsReport(request: string): Promise<OwnPostsReport> {
  const scope = parseLinkedInScope(request);
  const scrape = await scrapeOwnLinkedInPosts(scope);
  const live = scrape.ok && scrape.posts.length > 0;

  const report = await buildLinkedInReport({ query: request, posts: live ? scrape.posts : undefined });

  const note = live
    ? undefined
    : scrape.configured
      ? "Live scrape returned no posts for this window, so this report uses your most recent cached posts."
      : "Live scraping is off (APIFY_TOKEN not set), so this report uses your most recent cached posts.";

  return { ...report, live, postsScraped: live ? scrape.posts.length : 0, configured: scrape.configured, note };
}
