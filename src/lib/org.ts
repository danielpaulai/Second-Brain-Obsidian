/**
 * Pulse — the org chart. The CEO sits at the top and reads every document. It
 * never does the work itself: it routes each instruction to a department head
 * (CMO / COO / CTO / CRO), who fires the right specialist sub-agents. Content is
 * itself a small team: it picks a FORMAT (text / picture / carousel / reels /
 * long-form) and the matching producer writes it. The user only ever talks to
 * the CEO.
 *
 * This is the static topology + the routing brain's option space. The live run
 * (`/api/jarvis/run`) walks this tree and emits jarvis-events as it goes.
 */

import type { JarvisNodeId, RouteAssignment } from "./jarvis-events";
import type { AgentKey } from "./knowledge-map";

export type OrgKind = "ceo" | "department" | "specialist" | "format";

export type OrgNode = {
  id: JarvisNodeId;
  kind: OrgKind;
  /** Short codename shown on the node ("CEO", "CMO", "Research", "Carousel"). */
  title: string;
  /** The human role ("Reads every document", "Marketing", "Text posts"). */
  label: string;
  color: string;
  /** Phosphor icon name, resolved on the client. */
  icon: string;
  parent: JarvisNodeId | null;
  /** For producers: which GTM agent config + knowledge scope it borrows. */
  agentKey?: AgentKey;
};

export const CEO_ID: JarvisNodeId = "kronos";

export const ORG: Record<JarvisNodeId, OrgNode> = {
  kronos: {
    id: "kronos",
    kind: "ceo",
    title: "CEO",
    label: "Reads every document",
    color: "#22d3ee",
    icon: "Brain",
    parent: null,
  },

  /* ---- department heads ---- */
  cmo: { id: "cmo", kind: "department", title: "CMO", label: "Marketing", color: "#a78bfa", icon: "Megaphone", parent: "kronos" },
  coo: { id: "coo", kind: "department", title: "COO", label: "Operations", color: "#34d399", icon: "Gear", parent: "kronos" },
  cto: { id: "cto", kind: "department", title: "CTO", label: "Tech & build", color: "#38bdf8", icon: "Cpu", parent: "kronos" },
  cro: { id: "cro", kind: "department", title: "CRO", label: "Sales & leads", color: "#f59e0b", icon: "Target", parent: "kronos" },

  /* ---- specialists ---- */
  // Research is a SHARED specialist: it reports to the CEO, not to one
  // department, and any department can fire it first for a market/angle read.
  research: { id: "research", kind: "specialist", title: "Research", label: "Trends & angles", color: "#22d3ee", icon: "Binoculars", parent: "kronos", agentKey: "research" },
  content: { id: "content", kind: "specialist", title: "Content", label: "Posts in your voice", color: "#a78bfa", icon: "PenNib", parent: "cmo", agentKey: "content" },
  leads: { id: "leads", kind: "specialist", title: "Leads", label: "Prospect lists", color: "#f59e0b", icon: "UsersThree", parent: "cro", agentKey: "sales" },
  webpages: { id: "webpages", kind: "specialist", title: "Web pages", label: "Landing pages", color: "#38bdf8", icon: "Browser", parent: "cto", agentKey: "marketing" },
  ops: { id: "ops", kind: "specialist", title: "Ops", label: "Schedules & systems", color: "#34d399", icon: "ListChecks", parent: "coo", agentKey: "marketing" },

  /* ---- content formats (under Content) ---- */
  text: { id: "text", kind: "format", title: "Text", label: "Text posts", color: "#a78bfa", icon: "Article", parent: "content", agentKey: "content" },
  picture: { id: "picture", kind: "format", title: "Picture", label: "Single-image posts", color: "#c084fc", icon: "Image", parent: "content", agentKey: "content" },
  carousel: { id: "carousel", kind: "format", title: "Carousel", label: "Swipe-through decks", color: "#d946ef", icon: "Cards", parent: "content", agentKey: "content" },
  reels: { id: "reels", kind: "format", title: "Reels", label: "Short-form scripts", color: "#f472b6", icon: "VideoCamera", parent: "content", agentKey: "content" },
  longform: { id: "longform", kind: "format", title: "Long-form", label: "Long-form scripts", color: "#818cf8", icon: "FilmSlate", parent: "content", agentKey: "content" },
  newsletter: { id: "newsletter", kind: "format", title: "Newsletter", label: "Email newsletters", color: "#fb7185", icon: "EnvelopeSimple", parent: "content", agentKey: "content" },
};

export const ALL_NODES: OrgNode[] = Object.values(ORG);
export const DEPARTMENTS: OrgNode[] = ALL_NODES.filter((n) => n.kind === "department");

export const FORMAT_IDS: JarvisNodeId[] = ["text", "picture", "carousel", "reels", "longform", "newsletter"];
export function isFormat(id: JarvisNodeId): boolean {
  return FORMAT_IDS.includes(id);
}

/**
 * Shared specialists are not owned by a single department — any department head
 * can fire them. Research is shared across CMO / COO / CTO / CRO.
 */
export const SHARED_SPECIALISTS: JarvisNodeId[] = ["research"];
export function isShared(id: JarvisNodeId): boolean {
  return SHARED_SPECIALISTS.includes(id);
}

export function node(id: JarvisNodeId): OrgNode {
  return ORG[id];
}

/** Direct children of a node (departments under CEO, specialists under a dept, formats under Content). */
export function childrenOf(id: JarvisNodeId): OrgNode[] {
  return ALL_NODES.filter((n) => n.parent === id);
}

/** Producing leaves in a node's subtree (nodes that actually do work). */
export function leavesOf(id: JarvisNodeId): JarvisNodeId[] {
  const kids = childrenOf(id);
  if (kids.length === 0) return [id];
  return kids.flatMap((k) => leavesOf(k.id));
}

/** Chain from a node up to (and excluding) the CEO: [self, ...ancestors-below-ceo]. */
export function chainToCeo(id: JarvisNodeId): JarvisNodeId[] {
  const out: JarvisNodeId[] = [id];
  let cur = node(id).parent;
  while (cur && cur !== "kronos") {
    out.push(cur);
    cur = node(cur).parent;
  }
  return out;
}

/* --------------------------- routing --------------------------- */

export type TeamPlan = {
  /** one entry per department head assigned — they run in parallel as a team */
  assignments: RouteAssignment[];
  /** shared specialists (e.g. research) that run ONCE first for the whole team */
  shared: JarvisNodeId[];
  rationale: string;
};

/**
 * Deterministic keyword router — the fast, always-available fallback when the
 * LLM router is unavailable or returns something invalid. It can assign MULTIPLE
 * departments when an instruction mentions several kinds of work.
 */
export function keywordRoute(instruction: string): TeamPlan {
  const t = instruction.toLowerCase();
  const has = (...words: string[]) => words.some((w) => t.includes(w));

  const assignments: RouteAssignment[] = [];
  const reasons: string[] = [];
  let wantsResearch = false;

  // CMO — one content format
  let format: JarvisNodeId | null = null;
  if (has("newsletter", "email newsletter", "broadcast", "email blast", "email campaign", "weekly email")) format = "newsletter";
  else if (has("carousel", "slides", "slide deck", "swipe", "cheatsheet", "cheat sheet", "listicle")) format = "carousel";
  else if (has("picture", "image post", "graphic", "single image")) format = "picture";
  else if (has("reel", "short form", "short-form", "tiktok")) format = "reels";
  else if (has("long form", "long-form", "youtube", "video script", "vsl")) format = "longform";
  else if (has("text post", "linkedin post", "tweet", "thread")) format = "text";
  if (format) {
    assignments.push({ department: "cmo", plan: [format] });
    wantsResearch = true;
    reasons.push(`Content writes the ${node(format).title.toLowerCase()}`);
  }

  // CRO — leads
  if (has("lead", "prospect", "icp", "outreach list", "sales nav", "scrape")) {
    assignments.push({ department: "cro", plan: ["leads"] });
    wantsResearch = true; // a market read sharpens the targeting
    reasons.push("the CRO scrapes the prospect list");
  }
  // CTO — landing page
  if (has("landing", "web page", "webpage", "website", "site", "funnel")) {
    assignments.push({ department: "cto", plan: ["webpages"] });
    wantsResearch = true; // research informs the page's angle + proof
    reasons.push("the CTO builds the landing page");
  }
  // COO — operations
  if (has("schedule", "plan my week", "system", "operations", "calendar", "sop", "workflow")) {
    assignments.push({ department: "coo", plan: ["ops"] });
    reasons.push("the COO sets up the operating plan");
  }

  if (assignments.length === 0) {
    // default: a text post in their voice
    assignments.push({ department: "cmo", plan: ["text"] });
    wantsResearch = true;
    reasons.push("Content writes a post in your voice");
  }

  const rationale =
    reasons.length > 1
      ? `Open-ended — the team splits it: ${reasons.join("; ")}.`
      : `${reasons[0][0].toUpperCase()}${reasons[0].slice(1)}.`;

  return { assignments, shared: wantsResearch ? ["research"] : [], rationale };
}

/** The valid option space handed to the LLM router (so it can only pick real producing leaves). */
export const ROUTER_OPTIONS = {
  departments: DEPARTMENTS.map((d) => ({ id: d.id, label: d.label, produces: leavesOf(d.id) })),
  shared: SHARED_SPECIALISTS.map((id) => ({ id, label: node(id).label })),
};
