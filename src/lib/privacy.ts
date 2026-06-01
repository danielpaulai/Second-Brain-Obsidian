/**
 * Privacy redaction layer.
 *
 * Three viewer modes:
 *   - "owner"  → no redaction. Sees raw vault content. (Default for the owner.)
 *   - "team"   → emails, phones, specific client names → [redacted].
 *                $ amounts → ranges. Quotes from sessions preserved with names anonymised.
 *   - "public" → strongest. Removes ALL named entities, financial numbers, direct quotes,
 *                client references. Keeps only frameworks + principles.
 *
 * Customisable rules: _ai-danny/privacy-rules.md in the vault. The user maintains a
 * list of specific names / companies / emails to redact. Reloaded with a 60s TTL.
 *
 * Strategy (Option A — server-side at tool boundary):
 *   1. Tool responses (queryBrain results, readNote bodies, queryKnowledge content)
 *      → redacted BEFORE the model sees them (for non-owner viewers).
 *   2. Model sees the redacted version, so its output is also redacted by construction.
 *   3. A final regex sweep on the streamed answer catches anything that leaked through.
 */

import fs from "node:fs/promises";
import path from "node:path";

export type ViewerRole = "owner" | "team" | "public";

const VAULT_PATH = process.env.VAULT_PATH || "";
const RULES_FILE = "_ai-danny/privacy-rules.md";
const TTL_MS = 60_000;

/* ---------------------------------------------------------------------------
 * Built-in regex patterns
 * ------------------------------------------------------------------------ */

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

// Phone numbers (E.164, US, international with separators)
const PHONE_RE =
  /(?<![\w$])(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}(?:[\s.-]?\d{1,4})?(?![\w$])/g;

// Currency amounts: $1,234 / $1.5K / $25k / $100M / €50,000 / £10K
const CURRENCY_RE = /[$€£¥₹]\s?\d{1,3}(?:[,\d]{0,9})(?:\.\d{1,2})?\s?[KMBkmb]?\b/g;

// "X figures" — "five-figure deal", "six-figure salary"
const FIGURES_RE =
  /\b(?:six|seven|eight|nine|five|four)[-\s]?figure[s]?\b/gi;

// Revenue figures with words: "1.5M ARR", "200K MRR"
const REVENUE_WORDS_RE = /\b\d+(?:\.\d+)?\s?[KMBkmb]\s?(?:ARR|MRR|revenue|in revenue)\b/g;

/* ---------------------------------------------------------------------------
 * Custom rules loaded from _ai-danny/privacy-rules.md
 * ------------------------------------------------------------------------ */

type Rules = {
  names: string[];      // Specific client/people names → [client]
  companies: string[];  // Specific companies → [company]
  emails: string[];     // Specific emails that the auto-regex might miss
  custom: Array<{ pattern: string; replace: string }>; // Custom regex + replacement
};

const EMPTY_RULES: Rules = { names: [], companies: [], emails: [], custom: [] };

let cache: { rules: Rules; loadedAt: number } | null = null;

async function loadRules(): Promise<Rules> {
  if (cache && Date.now() - cache.loadedAt < TTL_MS) return cache.rules;
  if (!VAULT_PATH) return EMPTY_RULES;
  try {
    const txt = await fs.readFile(path.join(VAULT_PATH, RULES_FILE), "utf8");
    const rules: Rules = {
      names: extractSection(txt, "names"),
      companies: extractSection(txt, "companies"),
      emails: extractSection(txt, "emails"),
      custom: [],
    };
    cache = { rules, loadedAt: Date.now() };
    return rules;
  } catch {
    cache = { rules: EMPTY_RULES, loadedAt: Date.now() };
    return EMPTY_RULES;
  }
}

function extractSection(md: string, header: string): string[] {
  const re = new RegExp(
    `##\\s*${header}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`,
    "i"
  );
  const m = md.match(re);
  if (!m) return [];
  return m[1]
    .split("\n")
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("<!--"));
}

/* ---------------------------------------------------------------------------
 * Redaction
 * ------------------------------------------------------------------------ */

export type RedactOptions = {
  role: ViewerRole;
  /** Optional override of the loaded rules */
  rules?: Rules;
  /** When true, also strip wiki links [[Note Title]] → [note] */
  stripWikiLinks?: boolean;
};

const TEAM_REDACTIONS = {
  email: "[email]",
  phone: "[phone]",
  name: "[client]",
  company: "[company]",
  currency: "[$amount]",
  figures: "[size]",
  wikiLink: "[note]",
};

const PUBLIC_REDACTIONS = {
  ...TEAM_REDACTIONS,
  currency: "[range]",
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function redact(text: string, opts: RedactOptions): Promise<string> {
  if (opts.role === "owner") return text;
  if (!text) return text;

  const rules = opts.rules ?? (await loadRules());
  const reps = opts.role === "public" ? PUBLIC_REDACTIONS : TEAM_REDACTIONS;
  let out = text;

  // 1. Always-on regex patterns
  out = out.replace(EMAIL_RE, reps.email);
  out = out.replace(PHONE_RE, reps.phone);
  out = out.replace(CURRENCY_RE, reps.currency);
  out = out.replace(FIGURES_RE, reps.figures);
  out = out.replace(REVENUE_WORDS_RE, reps.figures);

  // 2. User-supplied names
  for (const name of rules.names) {
    if (!name) continue;
    const re = new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi");
    out = out.replace(re, reps.name);
  }

  // 3. User-supplied companies
  for (const company of rules.companies) {
    if (!company) continue;
    const re = new RegExp(`\\b${escapeRegExp(company)}\\b`, "gi");
    out = out.replace(re, reps.company);
  }

  // 4. User-supplied emails (catches edge cases like obfuscated emails)
  for (const email of rules.emails) {
    if (!email) continue;
    out = out.replaceAll(email, reps.email);
  }

  // 5. Wiki link stripping (public mode)
  if (opts.role === "public" || opts.stripWikiLinks) {
    out = out.replace(/\[\[([^\]]+)\]\]/g, reps.wikiLink);
  }

  // 6. Public mode also strips quoted dialogue
  if (opts.role === "public") {
    // Long-form double-quoted sentences (likely client quotes)
    out = out.replace(/"[^"]{40,}"/g, "[quote removed]");
    // Likely a transcript line: "**Name** [timestamp]:"
    out = out.replace(/\*\*[^*]+\*\*\s*\[\d{1,2}:\d{2}(?::\d{2})?\]:?/g, "[speaker]");
  }

  return out;
}

/**
 * Redact an arbitrary object — walks string fields recursively.
 * Useful for redacting tool execute return values.
 */
export async function redactObject<T>(obj: T, opts: RedactOptions): Promise<T> {
  if (opts.role === "owner") return obj;
  return walk(obj, opts) as T;
}

async function walk(v: unknown, opts: RedactOptions): Promise<unknown> {
  if (typeof v === "string") return redact(v, opts);
  if (Array.isArray(v)) return Promise.all(v.map((x) => walk(x, opts)));
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, vv] of Object.entries(v as Record<string, unknown>)) {
      out[k] = await walk(vv, opts);
    }
    return out;
  }
  return v;
}

/* ---------------------------------------------------------------------------
 * System-prompt addendum — tells the model the viewer's role
 * ------------------------------------------------------------------------ */

export function viewerSystemAddendum(role: ViewerRole): string {
  if (role === "owner") return "";

  const teamRules = `

== PRIVACY CONTEXT ==

The current viewer is on the TEAM tier, not the owner.

Apply these rules to EVERY output:
- NEVER name specific clients by full name. Use generic terms like "one client", "a founder I worked with", or "[client]".
- NEVER quote exact financial figures from Daniel's business or his clients. Use ranges ("low five figures", "$10-50K"), never precise numbers.
- NEVER reveal email addresses, phone numbers, or personal contact information of anyone.
- Quote insight and principle freely. Quote IDENTIFYING details never.
- Frameworks, methods, voice, and positioning are all fair game. Specific identifying data is not.

If a question would require leaking client identities, financials, or contact info to answer fully, refuse politely:
"That answer would require sharing client-specific details I'm not authorised to discuss with the team tier. The principle behind it is..." then deliver the principle.
`;

  const publicRules = `

== PRIVACY CONTEXT ==

The current viewer is PUBLIC — not the owner, not on the team. Treat them as a stranger.

Apply these rules to EVERY output:
- Speak ONLY in principles, frameworks, and general patterns.
- NEVER name any client, company, or person from Daniel's vault.
- NEVER quote financial figures of any kind. No prices, no revenue, no fees, no salaries.
- NEVER quote dialogue from real sessions.
- NEVER cite specific vault notes with [[Note Title]] — these reveal what's in the vault.
- If asked about anything specific to a real client or specific to Daniel's finances, decline politely and offer the principle instead.

Default to short, principle-only answers. If unsure whether something is too specific, omit it.
`;

  return role === "team" ? teamRules : publicRules;
}

/* ---------------------------------------------------------------------------
 * Validate / parse role from request body
 * ------------------------------------------------------------------------ */

export function parseRole(input: unknown): ViewerRole {
  if (input === "team" || input === "public" || input === "owner") return input;
  return "owner";
}

/* ---------------------------------------------------------------------------
 * Refresh the rules cache (e.g. after editing privacy-rules.md)
 * ------------------------------------------------------------------------ */

export function clearRulesCache() {
  cache = null;
}
