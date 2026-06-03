/**
 * Parse the time/quantity SCOPE out of a natural-language LinkedIn request so the charts, KPIs and
 * recommendation all recompute for exactly the window the user asked for ("last month", "last 5 posts",
 * "past 90 days", "this year"…). Pure + client-safe (no fs) — used by the report route AND the stage UI.
 */
export type LinkedInScope = {
  kind: "count" | "days" | "months" | "all";
  value: number; // posts (count) | days | months | 0 (all)
  label: string; // human phrase for the UI + the LLM ("your last 5 posts", "the last 30 days")
};

const WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, ninety: 90, hundred: 100,
};
const QTY = "(\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|ninety|hundred)";

function qty(m: RegExpMatchArray | null): number | null {
  if (!m) return null;
  const t = m[1];
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : WORDS[t] ?? null;
}

export function parseLinkedInScope(query: string): LinkedInScope {
  const q = (query || "").toLowerCase();

  // "last 5 posts" / "5 most recent posts" / "last 5 pots" (typo tolerated)
  const posts =
    qty(q.match(new RegExp(`(?:last|past|recent|latest|previous|top|most recent)\\s+${QTY}\\s+(?:linkedin\\s+)?(?:posts?|pots?|updates?|pieces?)`))) ??
    qty(q.match(new RegExp(`${QTY}\\s+(?:most[\\s-]recent|latest|last|recent)\\s+(?:posts?|pots?|updates?)`)));
  if (posts && posts > 0) return { kind: "count", value: posts, label: `your last ${posts} posts` };

  // explicit days ("last 90 days", "past 30 days")
  const days = qty(q.match(new RegExp(`(?:last|past|previous)\\s+${QTY}\\s+days?`)));
  if (days && days > 0) return { kind: "days", value: days, label: `the last ${days} days` };

  // weeks ("last 2 weeks", "last week", "this week")
  let weeks = qty(q.match(new RegExp(`(?:last|past|previous)\\s+${QTY}\\s+weeks?`)));
  if (weeks == null && /\b(last|past|this|previous)\s+week\b/.test(q)) weeks = 1;
  if (weeks && weeks > 0) return { kind: "days", value: weeks * 7, label: weeks === 1 ? "the last week" : `the last ${weeks} weeks` };

  // quarter
  if (/\b(last|past|this|previous)\s+quarter\b/.test(q) || /\b(last|past)\s+90\s+days\b/.test(q))
    return { kind: "months", value: 3, label: "the last quarter" };

  // months ("last 3 months", "last month", "this month")
  let months = qty(q.match(new RegExp(`(?:last|past|previous)\\s+${QTY}\\s+months?`)));
  if (months == null && /\b(last|past|this|previous)\s+month\b/.test(q)) months = 1;
  if (months && months > 0) return { kind: "months", value: months, label: months === 1 ? "the last month" : `the last ${months} months` };

  // year ("last year", "this year", "past 12 months")
  if (/\b(last|past|this|previous)\s+year\b/.test(q) || /\b(last|past)\s+(12|twelve)\s+months\b/.test(q))
    return { kind: "months", value: 12, label: "the last year" };

  return { kind: "all", value: 0, label: "all of your posts" };
}
