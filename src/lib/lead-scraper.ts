/**
 * LinkedIn lead scraping — the real engine behind the Sales / CRO agent.
 *
 * It turns an ICP (roles, seniority, function, geo, company size, signals) into
 * a concrete LinkedIn people-search and pulls REAL prospects via the
 * `harvestapi/linkedin-profile-search` Apify actor (no cookies, pay-per-event,
 * optional email enrichment). The label→id maps below come straight from that
 * actor's input schema so callers can pass human-readable values.
 *
 * If APIFY_TOKEN is missing the scrape returns `configured: false` with a clear
 * note — the caller still delivers the targeting plan, it just can't pull live
 * people. We never fabricate a prospect.
 */

import { runActorSync, apifyConfigured } from "./apify";
import { leadsTestMode, fixtureSearchItems } from "./lead-fixtures";

export const LINKEDIN_SEARCH_ACTOR = "harvestapi/linkedin-profile-search";

/** Hard cap on a single scrape (cost + run-time guardrail). */
export const MAX_LEADS = 100;

/* ----------------------- label → LinkedIn filter id ----------------------- */

export const SENIORITY_IDS: Record<string, string> = {
  "in training": "100",
  "entry level": "110",
  entry: "110",
  senior: "120",
  strategic: "130",
  "entry level manager": "200",
  "experienced manager": "210",
  manager: "210",
  director: "220",
  "vice president": "300",
  vp: "300",
  cxo: "310",
  "c-level": "310",
  "c level": "310",
  executive: "310",
  owner: "320",
  partner: "320",
  "owner / partner": "320",
  founder: "320",
};

export const FUNCTION_IDS: Record<string, string> = {
  accounting: "1",
  administrative: "2",
  "arts and design": "3",
  "business development": "4",
  "community and social services": "5",
  consulting: "6",
  education: "7",
  engineering: "8",
  entrepreneurship: "9",
  finance: "10",
  "healthcare services": "11",
  healthcare: "11",
  "human resources": "12",
  hr: "12",
  "information technology": "13",
  it: "13",
  legal: "14",
  marketing: "15",
  "media and communication": "16",
  "military and protective services": "17",
  operations: "18",
  "product management": "19",
  product: "19",
  "program and project management": "20",
  purchasing: "21",
  "quality assurance": "22",
  "real estate": "23",
  research: "24",
  sales: "25",
  "customer success and support": "26",
  "customer success": "26",
  support: "26",
};

export const HEADCOUNT_CODES: Record<string, string> = {
  "self-employed": "A",
  "self employed": "A",
  "1-10": "B",
  "11-50": "C",
  "51-200": "D",
  "201-500": "E",
  "501-1000": "F",
  "501-1,000": "F",
  "1001-5000": "G",
  "1,001-5,000": "G",
  "5001-10000": "H",
  "5,001-10,000": "H",
  "10001+": "I",
  "10,001+": "I",
};

/* ------------------------------ types ------------------------------ */

export type LeadFilters = {
  /** Free-text LinkedIn search (role + niche). Supports LinkedIn search operators. */
  searchQuery?: string;
  jobTitles?: string[];
  locations?: string[];
  /** human seniority labels, e.g. ["Director","Vice President","CXO"] */
  seniority?: string[];
  /** human function labels, e.g. ["Sales","Marketing"] */
  functions?: string[];
  /** human headcount bands, e.g. ["11-50","51-200"] */
  companySize?: string[];
  recentlyChangedJobs?: boolean;
  recentlyPostedOnLinkedIn?: boolean;
  count?: number;
  findEmails?: boolean;
};

export type Lead = {
  name: string;
  firstName: string;
  lastName: string;
  headline: string;
  title: string;
  company: string;
  companyUrl: string;
  location: string;
  linkedinUrl: string;
  email: string;
  pictureUrl: string;
  id: string;
};

export type ScrapeResult = {
  configured: boolean;
  ok: boolean;
  leads: Lead[];
  requested: number;
  returned: number;
  withEmail: number;
  actor: string;
  costEstimateUsd: number;
  note: string;
  error?: string;
};

/* ------------------------------ mapping ------------------------------ */

function mapLabels(values: string[] | undefined, table: Record<string, string>): string[] {
  if (!values?.length) return [];
  const out = new Set<string>();
  for (const v of values) {
    const id = table[v.trim().toLowerCase()];
    if (id) out.add(id);
  }
  return Array.from(out);
}

export function buildActorInput(filters: LeadFilters): {
  input: Record<string, unknown>;
  count: number;
} {
  const count = Math.max(1, Math.min(MAX_LEADS, Math.round(filters.count ?? 25)));
  const input: Record<string, unknown> = {
    profileScraperMode: filters.findEmails ? "Full + email search" : "Full",
    maxItems: count,
  };
  // Each LinkedIn search page yields 25 profiles; ask for enough pages to fill
  // the requested count (maxItems is still the hard stop).
  if (count > 25) input.takePages = Math.ceil(count / 25);
  if (filters.searchQuery?.trim()) input.searchQuery = filters.searchQuery.trim();
  if (filters.jobTitles?.length) input.currentJobTitles = filters.jobTitles;
  if (filters.locations?.length) input.locations = filters.locations;

  const seniority = mapLabels(filters.seniority, SENIORITY_IDS);
  if (seniority.length) input.seniorityLevelIds = seniority;
  const functions = mapLabels(filters.functions, FUNCTION_IDS);
  if (functions.length) input.functionIds = functions;
  const headcount = mapLabels(filters.companySize, HEADCOUNT_CODES);
  if (headcount.length) input.companyHeadcount = headcount;

  if (filters.recentlyChangedJobs) input.recentlyChangedJobs = true;
  if (filters.recentlyPostedOnLinkedIn) input.recentlyPostedOnLinkedIn = true;
  return { input, count };
}

/* ------------------------------ normalize ------------------------------ */

function firstString(...vals: unknown[]): string {
  for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim();
  return "";
}

/** Defensive email extraction — the actor surfaces emails under varying keys. */
function extractEmail(item: Record<string, any>): string {
  const fromArray = (() => {
    const arr = item?.emails;
    if (!Array.isArray(arr) || !arr.length) return "";
    const first = arr[0];
    if (typeof first === "string") return first;
    return firstString(first?.email, first?.value, first?.address);
  })();
  return firstString(
    item?.email,
    item?.workEmail,
    item?.professionalEmail,
    item?.emailAddress,
    fromArray,
    item?.contactInfo?.email
  );
}

export function normalizeLead(item: Record<string, any>): Lead {
  const pos =
    (Array.isArray(item?.currentPositions) && item.currentPositions[0]) ||
    item?.currentPosition ||
    {};
  const firstName = firstString(item?.firstName, item?.first_name);
  const lastName = firstString(item?.lastName, item?.last_name);
  const name = firstString(item?.name, item?.fullName, `${firstName} ${lastName}`);
  const linkedinUrl = firstString(
    item?.linkedinUrl,
    item?.profileUrl,
    item?.url,
    item?.publicIdentifier ? `https://www.linkedin.com/in/${item.publicIdentifier}` : ""
  );
  const location = firstString(
    item?.location?.linkedinText,
    item?.location?.parsed?.text,
    item?.locationName,
    typeof item?.location === "string" ? item.location : ""
  );
  return {
    name,
    firstName,
    lastName,
    headline: firstString(item?.headline, item?.summary, pos?.title),
    title: firstString(pos?.title, item?.headline, item?.jobTitle),
    company: firstString(pos?.companyName, item?.companyName, item?.company),
    companyUrl: firstString(pos?.companyLinkedinUrl, item?.companyUrl),
    location,
    linkedinUrl,
    email: extractEmail(item),
    pictureUrl: firstString(item?.pictureUrl, item?.photo, item?.profilePicture),
    id: firstString(item?.id, item?.publicIdentifier, linkedinUrl, name),
  };
}

/* ------------------------- single full profile ------------------------- */

export type LinkedInProfile = Lead & {
  about: string;
  followers: number | null;
  connections: number | null;
  experience: { title: string; company: string; duration: string; location: string }[];
  education: { school: string; degree: string; field: string; years: string }[];
  skills: string[];
};

export type LinkedInProfileResult = {
  configured: boolean;
  found: boolean;
  profile: LinkedInProfile | null;
  note: string;
  error?: string;
};

const numOrNull = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseInt(v.replace(/[^\d]/g, ""), 10) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Defensively pull the RICH profile fields the actor surfaces under varying keys. */
function toProfile(item: Record<string, any>): LinkedInProfile {
  const base = normalizeLead(item);
  const exp = (item?.experience || item?.positions || item?.currentPositions || []) as Record<string, any>[];
  const edu = (item?.education || item?.schools || item?.educations || []) as Record<string, any>[];
  const skillsRaw = (item?.skills || item?.topSkills || []) as unknown[];
  return {
    ...base,
    about: firstString(item?.about, item?.summary, item?.description, item?.bio),
    followers: numOrNull(item?.followers ?? item?.followersCount ?? item?.followerCount),
    connections: numOrNull(item?.connections ?? item?.connectionsCount),
    experience: (Array.isArray(exp) ? exp : [])
      .slice(0, 8)
      .map((p) => ({
        title: firstString(p?.title, p?.position, p?.role, p?.jobTitle),
        company: firstString(p?.companyName, p?.company, p?.organization, p?.subtitle),
        duration: firstString(p?.duration, p?.dateRange, p?.date, p?.period, p?.caption),
        location: firstString(p?.location),
      }))
      .filter((e) => e.title || e.company),
    education: (Array.isArray(edu) ? edu : [])
      .slice(0, 6)
      .map((e) => ({
        school: firstString(e?.schoolName, e?.school, e?.title, e?.name),
        degree: firstString(e?.degree, e?.degreeName, e?.subtitle),
        field: firstString(e?.fieldOfStudy, e?.field),
        years: firstString(e?.dateRange, e?.years, e?.date, e?.caption),
      }))
      .filter((e) => e.school),
    skills: (Array.isArray(skillsRaw) ? skillsRaw : [])
      .map((s) => (typeof s === "string" ? s : firstString((s as Record<string, any>)?.name, (s as Record<string, any>)?.title, (s as Record<string, any>)?.skill)))
      .filter(Boolean)
      .slice(0, 24),
  };
}

/**
 * Scrape ONE full LinkedIn profile (everything we can get) via the harvestapi
 * actor in "Full" mode. `query` is a name, or name + company/title for precision.
 */
export async function scrapeLinkedInProfile(query: string): Promise<LinkedInProfileResult> {
  const q = (query || "").trim();
  if (!q) return { configured: apifyConfigured(), found: false, profile: null, note: "No name or query provided." };

  const { input } = buildActorInput({ searchQuery: q, count: 1, findEmails: true });

  if (leadsTestMode()) {
    return { configured: true, found: true, profile: toProfile(fixtureSearchItems(1, true)[0]), note: "TEST MODE — mock profile." };
  }
  if (!apifyConfigured()) {
    return { configured: false, found: false, profile: null, note: "LinkedIn scraping is not configured. Set APIFY_TOKEN to scrape live profiles." };
  }

  const res = await runActorSync<Record<string, any>>(LINKEDIN_SEARCH_ACTOR, input, { maxItems: 1, timeoutMs: 180_000 });
  if (!res.ok) {
    return { configured: true, found: false, profile: null, note: "Could not reach the scraper.", error: res.error };
  }
  if (!res.items.length) {
    return { configured: true, found: false, profile: null, note: "No matching profile found." };
  }
  return { configured: true, found: true, profile: toProfile(res.items[0]), note: `Scraped via ${LINKEDIN_SEARCH_ACTOR}.` };
}

/* ------------------------------ scrape ------------------------------ */

/**
 * Progressive search-broadening plan. Pass 0 is the exact ICP; each later pass
 * relaxes the most peripheral filter (company size + signals, then function,
 * then seniority) while ALWAYS keeping the core ICP (job titles, search query,
 * locations). We only top up to the requested count from these — we never drop
 * the role itself, so the leads stay on-ICP.
 */
function scrapePasses(f: LeadFilters): LeadFilters[] {
  const passes: LeadFilters[] = [f];
  const canBroaden =
    (f.companySize?.length ?? 0) > 0 ||
    (f.functions?.length ?? 0) > 0 ||
    (f.seniority?.length ?? 0) > 0 ||
    Boolean(f.recentlyChangedJobs) ||
    Boolean(f.recentlyPostedOnLinkedIn);
  if (!canBroaden) return passes;
  const base: LeadFilters = { ...f, recentlyChangedJobs: undefined, recentlyPostedOnLinkedIn: undefined };
  passes.push({ ...base, companySize: undefined });
  passes.push({ ...base, companySize: undefined, functions: undefined });
  passes.push({ ...base, companySize: undefined, functions: undefined, seniority: undefined });
  return passes;
}

export async function scrapeLinkedInLeads(filters: LeadFilters): Promise<ScrapeResult> {
  const { count } = buildActorInput(filters);
  const actor = LINKEDIN_SEARCH_ACTOR;

  // TEST MODE — return mock prospects in the exact actor shape (no Apify call).
  if (leadsTestMode()) {
    const leads = fixtureSearchItems(count, !!filters.findEmails).map(normalizeLead).filter((l) => l.name || l.linkedinUrl);
    const withEmail = leads.filter((l) => l.email).length;
    return {
      configured: true,
      ok: true,
      leads,
      requested: count,
      returned: leads.length,
      withEmail,
      actor: `${actor} (TEST)`,
      costEstimateUsd: 0,
      note: `TEST MODE — ${leads.length} mock prospects (no live Apify call).`,
    };
  }

  if (!apifyConfigured()) {
    return {
      configured: false,
      ok: false,
      leads: [],
      requested: count,
      returned: 0,
      withEmail: 0,
      actor,
      costEstimateUsd: 0,
      note: "Live LinkedIn scraping is not configured. Set APIFY_TOKEN in the environment to pull real prospects via the harvestapi/linkedin-profile-search Apify actor. The targeting plan and qualification rules below are ready to run the moment it is set.",
    };
  }

  // rough cost per profile incl. amortised search-page cost (Full vs Full+email)
  const perProfile = filters.findEmails ? 0.012 : 0.008;
  const target = count;

  // TOP-UP LOOP — keep scraping (progressively broadening) until we actually hit
  // the requested count, deduping across passes. This is the guardrail so that
  // "50 leads" can't quietly return 13 just because the exact ICP was narrow.
  const passes = scrapePasses(filters);
  const seen = new Set<string>();
  const collected: Lead[] = [];
  let totalFetched = 0;
  let broadened = false;
  let firstError: string | undefined;

  for (let i = 0; i < passes.length && collected.length < target; i++) {
    const remaining = target - collected.length;
    // Pass 0 asks for the target (+small buffer for filter loss). Broadened passes
    // re-include the narrow matches we already have, so ask wide enough to clear
    // the overlap AND find `remaining` new ones.
    const ask = i === 0 ? Math.min(MAX_LEADS, remaining + 5) : Math.min(MAX_LEADS, collected.length + remaining + 15);
    const { input: passInput } = buildActorInput({ ...passes[i], count: ask });

    const res = await runActorSync<Record<string, unknown>>(actor, passInput, { maxItems: ask, timeoutMs: 240_000 });
    if (!res.ok) {
      if (i === 0) firstError = res.error; // a *broadening* failure just stops widening
      continue;
    }
    totalFetched += res.items.length;

    let added = 0;
    for (const item of res.items) {
      const lead = normalizeLead(item);
      if (!(lead.name || lead.linkedinUrl)) continue;
      const key = (lead.linkedinUrl || lead.id || lead.name).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      collected.push(lead);
      added++;
      if (collected.length >= target) break;
    }
    if (i > 0 && added > 0) broadened = true;
    if (i > 0 && added === 0) break; // wider search found nothing new — stop spending
  }

  if (firstError && collected.length === 0) {
    return {
      configured: true,
      ok: false,
      leads: [],
      requested: target,
      returned: 0,
      withEmail: 0,
      actor,
      costEstimateUsd: 0,
      note: `The LinkedIn scrape did not complete: ${firstError}`,
      error: firstError,
    };
  }

  const leads = collected.slice(0, target);
  const withEmail = leads.filter((l) => l.email).length;
  const short = leads.length < target;
  const note = short
    ? `Returned ${leads.length} of the ${target} requested. LinkedIn had no more profiles matching this ICP${broadened ? ", even after broadening the search" : ""}. Widen the filters (seniority, function, geo) or lower the count.`
    : `Scraped ${leads.length} real LinkedIn prospect${leads.length === 1 ? "" : "s"} via ${actor}${broadened ? " (broadened the search to reach the requested count)" : ""}${
        filters.findEmails ? ` (${withEmail} with an email found)` : ""
      }.`;

  return {
    configured: true,
    ok: true,
    leads,
    requested: target,
    returned: leads.length,
    withEmail,
    actor,
    costEstimateUsd: Math.round(totalFetched * perProfile * 100) / 100,
    note,
  };
}
