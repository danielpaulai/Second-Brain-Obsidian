/**
 * Shared answer-block grammar. The model writes plain markdown sprinkled with inline tokens;
 * we parse them into typed blocks that render as rich, reusable UI elements — the SAME set
 * for general stage answers (a call recap, any query) and the LinkedIn report.
 *
 * Self-closing:  [[chart:NAME]]
 * Paired (param after the colon is optional):
 *   [[callout:win]] … [[/callout]]        [[keypoints]] - a [[/keypoints]]
 *   [[actions]] … [[/actions]]            [[stats]] Label | Value [[/stats]]
 *   [[quote:Dana]] … [[/quote]]           [[chips:People]] a, b [[/chips]]
 *   [[idea]] **Hook:** … [[/idea]]        [[timeline:Call] When | Title | detail [[/timeline]]
 *   [[steps:Framework]] Title | desc [[/steps]]   [[decision:Rule]] **When:**…**Then:**… [[/decision]]
 *   [[people:Title]] Name | Role @ Co | note [[/people]]
 *   [[kpi:emerald]] Value | Label | delta | ctx [[/kpi]]
 *   [[meter:Title]] Label | current | target | unit [[/meter]]
 *   [[bars:Title]] Label | value | unit [[/bars]]      [[define:Term]] definition [[/define]]
 */
export type ChartName = "engagement" | "topPosts" | "reactions" | "cadence";

export type Block =
  | { type: "text"; text: string }
  | { type: "chart"; chart: ChartName }
  | { type: "callout"; variant: string; body: string }
  | { type: "keypoints"; body: string }
  | { type: "actions"; body: string }
  | { type: "stats"; body: string }
  | { type: "quote"; attr: string; body: string }
  | { type: "chips"; title: string; body: string }
  | { type: "idea"; body: string }
  | { type: "timeline"; title: string; body: string }
  | { type: "steps"; title: string; body: string }
  | { type: "decision"; title: string; body: string }
  | { type: "people"; title: string; body: string }
  | { type: "kpi"; accent: string; body: string }
  | { type: "meter"; title: string; body: string }
  | { type: "bars"; title: string; body: string }
  | { type: "define"; term: string; body: string }
  | { type: "table"; title: string; body: string };

const PAIRED =
  "callout|keypoints|actions|stats|quote|chips|idea|timeline|steps|decision|people|kpi|meter|bars|define|table";
// A paired token is EITHER [[name:param]] … [[/name]] (param form, body may be inline) OR
// [[name]] … [[/name]] (paramless), but the paramless OPEN must be followed by a newline. That way an
// inline note-citation like "see [[Steps]]" can never be mistaken for a block open tag (it has no
// colon and no trailing newline), so citations to notes whose title equals a block name pass through.
//   group1 = chart name
//   group2 = param-form name, group3 = param, group4 = body (closed by \2)
//   group5 = paramless name, group6 = body (closed by \5)
const TOKEN = new RegExp(
  "\\[\\[chart:(engagement|topPosts|reactions|cadence)\\]\\]" +
    "|\\[\\[(" + PAIRED + "):([^\\]\\n]*)\\]\\]([\\s\\S]*?)\\[\\[\\/\\2\\]\\]" +
    "|\\[\\[(" + PAIRED + ")\\]\\][ \\t]*\\n([\\s\\S]*?)\\[\\[\\/\\5\\]\\]",
  "g"
);

export function parseBlocks(doc: string): Block[] {
  const blocks: Block[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(doc)) !== null) {
    const pre = doc.slice(last, m.index).trim();
    if (pre) blocks.push({ type: "text", text: pre });
    if (m[1]) {
      blocks.push({ type: "chart", chart: m[1] as ChartName });
    } else {
      const paramForm = m[2] !== undefined;
      const name = paramForm ? m[2] : m[5];
      const param = (paramForm ? m[3] : "").trim();
      const body = (paramForm ? m[4] : m[6] || "").trim();
      if (name === "callout") blocks.push({ type: "callout", variant: (param || "insight").toLowerCase(), body });
      else if (name === "keypoints") blocks.push({ type: "keypoints", body });
      else if (name === "actions") blocks.push({ type: "actions", body });
      else if (name === "stats") blocks.push({ type: "stats", body });
      else if (name === "quote") blocks.push({ type: "quote", attr: param, body });
      else if (name === "chips") blocks.push({ type: "chips", title: param, body });
      else if (name === "idea") blocks.push({ type: "idea", body });
      else if (name === "timeline") blocks.push({ type: "timeline", title: param, body });
      else if (name === "steps") blocks.push({ type: "steps", title: param, body });
      else if (name === "decision") blocks.push({ type: "decision", title: param, body });
      else if (name === "people") blocks.push({ type: "people", title: param, body });
      else if (name === "kpi") blocks.push({ type: "kpi", accent: param.toLowerCase(), body });
      else if (name === "meter") blocks.push({ type: "meter", title: param, body });
      else if (name === "bars") blocks.push({ type: "bars", title: param, body });
      else if (name === "define") blocks.push({ type: "define", term: param, body });
      else if (name === "table") blocks.push({ type: "table", title: param, body });
    }
    last = TOKEN.lastIndex;
  }
  const tail = doc.slice(last).trim();
  if (tail) blocks.push({ type: "text", text: tail });
  return blocks;
}

/* ----------------------------- line + number helpers ----------------------------- */

/** A markdown-table separator row like "|---|:--:|" — only pipes/dashes/colons/spaces, with a dash. */
const isSepRow = (l: string): boolean => /^[\s|:-]+$/.test(l) && l.includes("-");

/** Split a token body into clean lines (strip leading bullets / numbering, drop blanks AND any
 *  markdown-table separator rows, so a model that writes a `| --- |` table still parses). */
function lines(body: string): string[] {
  return body
    .split("\n")
    .map((l) => l.replace(/^\s*([-*]|\d+[.)])\s+/, "").trim())
    .filter(Boolean)
    .filter((l) => !isSepRow(l));
}

/** Split a line into pipe cells (trimmed), capped at `max` so any extra pipes stay literal in the
 *  last cell. Tolerates markdown-table rows by stripping a leading/trailing pipe first. */
function cells(line: string, max: number): string[] {
  const s = line.replace(/^\s*\|/, "").replace(/\|\s*$/, "");
  const parts = s.split("|");
  if (parts.length <= max) return parts.map((p) => p.trim());
  const head = parts.slice(0, max - 1).map((p) => p.trim());
  return [...head, parts.slice(max - 1).join("|").trim()];
}

/** Parse a human number out of any formatting: "$42,000" → 42000, "€1.5k" → 1500, "2m" → 2_000_000. */
export function num(s: string): number {
  const m = (s || "").toLowerCase().match(/(-?[\d,.]+)\s*([km])?/);
  if (!m) return 0;
  const base = parseFloat(m[1].replace(/,/g, ""));
  if (!Number.isFinite(base)) return 0;
  const mult = m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : 1;
  return base * mult;
}

/* ----------------------------- per-block parsers ----------------------------- */

/** "Label | Value | optional sub" lines → stat tiles. */
export function parseStats(body: string): { label: string; value: string; sub?: string }[] {
  return lines(body)
    .map((l) => {
      const p = cells(l, 3);
      return { label: p[0] || "", value: p[1] || "", sub: p[2] || undefined };
    })
    .filter((s) => s.label && s.value);
}

/** Comma- or newline-separated entities → chip labels. */
export function parseChips(body: string): string[] {
  return body
    .split(/[,\n]/)
    .map((s) => s.replace(/^\s*[-*]\s+/, "").trim())
    .filter(Boolean);
}

/** Bullet lines → plain strings (markdown kept inline) for key-point / action rows. */
export function parseBullets(body: string): string[] {
  return lines(body);
}

/** Pull the labelled fields out of an idea body for the post-preview layout. Works whether the
 *  fields are on separate lines OR inline on one line (lazy capture stops at the next label). */
export function parseIdea(body: string): { hook?: string; angle?: string; format?: string; why?: string } {
  const grab = (label: string) => {
    const re = new RegExp(
      `\\*\\*\\s*${label}[^*]*\\*\\*\\s*:?\\s*([\\s\\S]*?)(?=\\*\\*\\s*(?:hook|angle|format|why)\\b|$)`,
      "i"
    );
    const m = body.match(re);
    const v = m ? m[1].trim().replace(/^["“']|["”']$/g, "").trim() : "";
    return v || undefined;
  };
  return { hook: grab("hook"), angle: grab("angle"), format: grab("format"), why: grab("why") };
}

/** "When | Title | detail" lines → timeline events (most-recent-first as written). */
export function parseTimeline(body: string): { when?: string; title: string; detail?: string }[] {
  return lines(body)
    .map((l) => {
      const c = cells(l, 3);
      if (c.length >= 2) return { when: c[0] || undefined, title: c[1], detail: c[2] || undefined };
      return { title: c[0] };
    })
    .filter((e) => e.title);
}

/** "Step title | what you do" lines → auto-numbered framework steps. */
export function parseSteps(body: string): { title: string; desc?: string }[] {
  return lines(body)
    .map((l) => {
      const c = cells(l, 2);
      return { title: c[0], desc: c[1] || undefined };
    })
    .filter((s) => s.title);
}

/** "**When:** … **Then:** … **Because:** …" → a decision rule. Works whether the three labels are
 *  on separate lines OR all inline on one line (lazy capture stops at the next label, not end-of-line). */
export function parseDecision(body: string): { when?: string; then?: string; because?: string } {
  const grab = (label: string) => {
    const re = new RegExp(
      `\\*\\*\\s*${label}\\s*:?\\s*\\*\\*\\s*:?\\s*([\\s\\S]*?)(?=\\*\\*\\s*(?:when|then|because)\\b|$)`,
      "i"
    );
    const m = body.match(re);
    const v = m ? m[1].trim() : "";
    return v || undefined;
  };
  const when = grab("when");
  const then = grab("then");
  const because = grab("because");
  if (!when && !then && !because) return { then: body.trim() };
  return { when, then, because };
}

/** "Name | Role @ Company | note" lines → people roster. */
export function parsePeople(body: string): { name: string; role?: string; note?: string }[] {
  return lines(body)
    .map((l) => {
      const c = cells(l, 3);
      return { name: c[0], role: c[1] || undefined, note: c[2] || undefined };
    })
    .filter((p) => p.name);
}

/** "Value | Label | delta | context" → one hero KPI. */
export function parseKpi(body: string): { value: string; label: string; delta?: string; context?: string } {
  const first = lines(body)[0] || "";
  const c = cells(first, 4);
  return { value: c[0] || "", label: c[1] || "", delta: c[2] || undefined, context: c[3] || undefined };
}

/** "Label | current | target | unit" lines → goal-progress meters. */
export function parseMeter(
  body: string
): { label: string; current: number; target?: number; unit?: string; rawCurrent: string }[] {
  return lines(body)
    .map((l) => {
      const c = cells(l, 4);
      return {
        label: c[0] || "",
        current: num(c[1] || ""),
        target: c[2] ? num(c[2]) : undefined,
        unit: c[3] || undefined,
        rawCurrent: (c[1] || "").trim(),
      };
    })
    .filter((r) => r.label);
}

/** "Label | value | unit" lines → comparison bars (length encodes value). */
export function parseBars(body: string): { label: string; value: number; unit?: string; raw: string }[] {
  return lines(body)
    .map((l) => {
      const c = cells(l, 3);
      return { label: c[0] || "", value: num(c[1] || ""), unit: c[2] || undefined, raw: (c[1] || "").trim() };
    })
    .filter((r) => r.label);
}

/** First row = headers, rest = rows. Tolerates markdown-table syntax (leading/trailing pipes,
 *  a `|---|` separator row). A cell may contain **bold** and [[Note]] citations. */
export function parseTable(body: string): { headers: string[]; rows: string[][] } {
  const raw = body.split("\n").map((l) => l.trim()).filter(Boolean).filter((l) => !isSepRow(l));
  if (!raw.length) return { headers: [], rows: [] };
  const splitRow = (l: string) => l.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const headers = splitRow(raw[0]);
  const rows = raw.slice(1).map(splitRow);
  return { headers, rows };
}

/** A cell that is purely numeric / currency / percentage right-aligns under tabular-nums. */
export function isNumericCell(s: string): boolean {
  return /^[$€£+\-]?\s?[\d,.]+\s?[%kKmM]?$/.test(s.trim()) && /\d/.test(s);
}

/* ----------------------------- display helpers ----------------------------- */

/** The on-brand accent set, in order, used for deterministic per-name avatar tints. */
export const ACCENTS = ["cyan", "violet", "emerald", "amber", "sky", "rose"] as const;
export type Accent = (typeof ACCENTS)[number];

/** Stable hash of a name → an accent, so the same person always gets the same colour. */
export function accentFromName(name: string): Accent {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

/** "Dana Cole" → "DC", "Acme" → "AC". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Format a number for display, re-attaching a unit ('$' prefixes, others suffix). */
export function fmtVal(n: number, unit?: string, raw?: string): string {
  // If the model already wrote a formatted value (a currency symbol, a unit, a ratio), trust it.
  if (raw && /[^\d.,\s-]/.test(raw)) return raw;
  const s = n % 1 === 0 ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  if (!unit) return s;
  return unit === "$" ? `$${s}` : `${s}${unit.startsWith("%") || unit.length <= 2 ? unit : " " + unit}`;
}
