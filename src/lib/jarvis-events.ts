/**
 * Pulse / KRONOS — the live event protocol.
 *
 * One run of the mission-control orchestrator (`/api/jarvis/run`) emits a stream
 * of these events as NDJSON (one JSON object per line). The dashboard consumes
 * them to drive the orb, the org chart, the live agent feed, and the final
 * artifact. Shared by server (emit) and client (render) so they never drift.
 *
 * The hierarchy mirrors the architecture doc: You -> KRONOS (AI CEO, reads every
 * document) -> department heads (CMO/COO/CTO/CRO) -> specialist sub-agents.
 */

export type JarvisNodeId =
  | "kronos"
  // department heads
  | "cmo"
  | "coo"
  | "cto"
  | "cro"
  // specialists
  | "research"
  | "content"
  | "leads"
  | "webpages"
  | "ops"
  // content formats (under Content)
  | "text"
  | "picture"
  | "carousel"
  | "reels"
  | "longform"
  | "newsletter";

/** A specialist's lifecycle phase, used to colour its node + feed row. */
export type AgentPhase = "idle" | "waking" | "working" | "reporting" | "done";

/** One department head + the ordered specialists it will fire. */
export type RouteAssignment = { department: JarvisNodeId; plan: JarvisNodeId[] };

export type CarouselSlide = {
  n: number;
  kind: "hook" | "body" | "cta";
  title: string;
  body: string;
  /** a generated slide image (data URL), when the image model is configured */
  image?: string;
  /** per-slide prompt metadata — the CLIENT uses these to render each image */
  layout?: "split" | "stacked" | "statement";
  visual?: string;
  logos?: string[];
};

export type CarouselArtifactData = {
  topic: string;
  hook: string;
  slides: CarouselSlide[];
  caption: string;
  /** doc titles the work was grounded in (for the "what it read" trail) */
  grounding: string[];
  /** the shared visual style paragraph — passed to the per-slide image endpoint */
  styleBible?: string;
};

export type NewsletterArtifactData = {
  subject: string;
  preview: string;
  /** the complete, self-contained newsletter HTML — light-themed, in the founder's
   *  brand DNA, with any generated image assets inlined as data URLs */
  html: string;
  grounding: string[];
};

/** One scraped prospect, flattened for the deliverable sheet. */
export type LeadEmailStatus = "valid" | "invalid" | "catch-all" | "disposable" | "unknown";

export type LeadRow = {
  name: string;
  title: string;
  company: string;
  location: string;
  linkedinUrl: string;
  email: string;
  /* ---- enrichment (optional; present after the enrichment protocol runs) ---- */
  emailStatus?: LeadEmailStatus;
  headline?: string;
  about?: string;
  skills?: string[];
  /** one-line "latest post" angle for personalized outreach */
  recentActivity?: string;
};

/** The Leads deliverable: the targeting plan + the real scraped prospect sheet. */
export type LeadsArtifactData = {
  title: string;
  /** one-line ICP summary */
  icp: string;
  /** the search criteria, in plain English */
  criteria: string[];
  /** in/out qualification rules grounded in the ICP */
  qualification: string[];
  leads: LeadRow[];
  requested: number;
  returned: number;
  withEmail: number;
  /* ---- enrichment summary (optional) ---- */
  enriched?: number;
  verifiedEmail?: number;
  withActivity?: number;
  /* ---- live streaming state ---- */
  /** "scraping" → rows arriving; "enriching" → enrichment filling in; "done" → final */
  phase?: "scraping" | "enriching" | "done";
  /** true when the rows are mock test data (LEADS_TEST_MODE) */
  testMode?: boolean;
  /** false when APIFY_TOKEN is missing — the plan is shown, no live people pulled */
  configured: boolean;
  note: string;
  /** doc titles the targeting was grounded in */
  grounding: string[];
};

export type JarvisEvent =
  | { type: "run.start"; runId: string; instruction: string; at: number }
  /** KRONOS has read the intent and delegated to one or more department heads. */
  | {
      type: "route";
      rationale: string;
      /** every department head assigned, each with its ordered specialist plan */
      assignments: RouteAssignment[];
      /** shared specialists (e.g. research) that run ONCE for the whole team */
      shared: JarvisNodeId[];
      at: number;
    }
  /** A node comes online (department head or specialist). */
  | { type: "agent.activate"; node: JarvisNodeId; label: string; at: number }
  /** A short status line for the feed ("reading your ICP", "writing slides"). */
  | { type: "agent.status"; node: JarvisNodeId; status: string; at: number }
  /** A concrete tool action — a document read, a search, a web fetch. */
  | {
      type: "agent.tool";
      node: JarvisNodeId;
      tool: string;
      detail: string;
      at: number;
    }
  /** A specialist finished its piece of work. */
  | { type: "agent.output"; node: JarvisNodeId; summary: string; at: number }
  /** Work reports back UP the chain (specialist -> head -> CEO). */
  | {
      type: "agent.report";
      from: JarvisNodeId;
      to: JarvisNodeId;
      summary: string;
      at: number;
    }
  /** The finished deliverable. */
  | { type: "artifact"; kind: "carousel"; data: CarouselArtifactData; at: number }
  | { type: "artifact"; kind: "leads"; data: LeadsArtifactData; at: number }
  | { type: "artifact"; kind: "newsletter"; data: NewsletterArtifactData; at: number }
  /** A rich, block-formatted report for the response panel (non-carousel runs). */
  | { type: "response"; format: "blocks"; markdown: string; at: number }
  | { type: "run.complete"; at: number }
  | { type: "run.error"; message: string; at: number };

export type JarvisEventType = JarvisEvent["type"];

/** Encode one event as a single NDJSON line. */
export function encodeEvent(e: JarvisEvent): string {
  return JSON.stringify(e) + "\n";
}

/** Parse a buffered NDJSON chunk into events + the leftover partial line. */
export function drainEvents(buffer: string): { events: JarvisEvent[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const events: JarvisEvent[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as JarvisEvent);
    } catch {
      // ignore a malformed line rather than killing the stream
    }
  }
  return { events, rest };
}
