"use client";

import { useCallback, useRef, useState } from "react";
import {
  drainEvents,
  type CarouselArtifactData,
  type LeadsArtifactData,
  type NewsletterArtifactData,
  type JarvisEvent,
  type JarvisNodeId,
} from "@/lib/jarvis-events";
import { node } from "@/lib/org";
import { sounds } from "@/lib/sounds";

// Turn raw, technical tool names into human, on-brand phrasing for the feed.
const TOOL_HUMAN: Record<string, string> = {
  "gpt-image": "Generating the visuals",
  "Second Brain": "Searching your second brain",
  "Content guide": "Reading your playbook",
  "Voice DNA": "Matching your voice",
};
function humanizeTool(tool: string): string {
  if (TOOL_HUMAN[tool]) return TOOL_HUMAN[tool];
  const t = tool.toLowerCase();
  if (t.includes("image")) return "Generating the visuals";
  if (t.includes("web") || t.includes("search")) return "Searching the web";
  if (t.includes("apify") || t.includes("scrap") || t.includes("lead")) return "Finding the right people";
  if (t.includes("brain") || t.includes("vault")) return "Searching your second brain";
  return tool;
}

// Subtle audio cues as events stream in. The frequent "message-level" events share
// one throttle so a burst feels like a gentle patter, not a machine-gun.
let lastTick = 0;
function playEventSound(e: JarvisEvent) {
  const throttled = (fn: () => void) => {
    const now = Date.now();
    if (now - lastTick < 110) return;
    lastTick = now;
    fn();
  };
  switch (e.type) {
    case "route":
      sounds.open();
      break;
    case "agent.activate":
      throttled(sounds.switchAgent);
      break;
    case "agent.output":
    case "agent.report":
      throttled(sounds.message);
      break;
    case "artifact":
      sounds.reply();
      break;
    case "response":
      sounds.notify();
      break;
    case "run.complete":
      sounds.complete();
      break;
    case "run.error":
      sounds.error();
      break;
    default:
      break;
  }
}

export type NodePhase = "idle" | "waking" | "working" | "reporting" | "done";

export type FeedEntry = {
  id: number;
  node: JarvisNodeId;
  kind: "route" | "activate" | "status" | "tool" | "output" | "report";
  text: string;
  at: number;
};

export type JarvisRunState = {
  running: boolean;
  instruction: string;
  rationale?: string;
  department?: JarvisNodeId;
  /** every department head KRONOS delegated to (team runs) */
  departments?: JarvisNodeId[];
  plan: JarvisNodeId[];
  phases: Partial<Record<JarvisNodeId, NodePhase>>;
  active?: JarvisNodeId;
  /** active node + its ancestors — used to light the org-chart path */
  litPath: JarvisNodeId[];
  feed: FeedEntry[];
  artifact?: CarouselArtifactData;
  /** the scraped prospect deliverable (CRO / leads runs) */
  leads?: LeadsArtifactData;
  /** a complete on-brand HTML newsletter (light-themed email) */
  newsletter?: NewsletterArtifactData;
  /** a rich block-formatted report (markdown w/ block tokens) for non-carousel runs */
  response?: string;
  pulse: number;
  error?: string;
  done: boolean;
};

const EMPTY: JarvisRunState = {
  running: false,
  instruction: "",
  plan: [],
  phases: {},
  litPath: [],
  feed: [],
  pulse: 0,
  done: false,
};

function ancestors(id: JarvisNodeId): JarvisNodeId[] {
  const out: JarvisNodeId[] = [id];
  let cur = node(id).parent;
  while (cur) {
    out.push(cur);
    cur = node(cur).parent;
  }
  return out;
}

/**
 * Pure reducer: fold one event into the run state. All merging happens here so a
 * burst of events arriving in one network chunk composes correctly (React runs
 * each setState updater against the accumulated state, never a stale snapshot).
 */
function reduce(s: JarvisRunState, e: JarvisEvent, nextId: () => number): JarvisRunState {
  const bump = (extra: Partial<JarvisRunState>, feed?: Omit<FeedEntry, "id">): JarvisRunState => ({
    ...s,
    ...extra,
    pulse: s.pulse + 1,
    feed: feed ? [...s.feed, { id: nextId(), ...feed }].slice(-60) : s.feed,
  });

  switch (e.type) {
    case "run.start":
      return s;
    case "route": {
      const departments = e.assignments.map((a) => a.department);
      const plan = [...e.shared, ...e.assignments.flatMap((a) => a.plan)];
      return bump(
        { departments, department: departments[0], plan, rationale: e.rationale, active: "kronos", litPath: ["kronos"] },
        { node: "kronos", kind: "route", text: e.rationale, at: e.at }
      );
    }
    case "agent.activate":
      return bump(
        { active: e.node, litPath: ancestors(e.node), phases: { ...s.phases, [e.node]: "working" } },
        { node: e.node, kind: "activate", text: e.label, at: e.at }
      );
    case "agent.status":
      return bump({ active: e.node }, { node: e.node, kind: "status", text: e.status, at: e.at });
    case "agent.tool":
      return bump({}, { node: e.node, kind: "tool", text: humanizeTool(e.tool) + (e.detail ? ` · ${e.detail}` : ""), at: e.at });
    case "agent.output":
      return bump(
        { phases: { ...s.phases, [e.node]: "done" } },
        { node: e.node, kind: "output", text: e.summary, at: e.at }
      );
    case "agent.report":
      return bump(
        { active: e.to, litPath: ancestors(e.from), phases: { ...s.phases, [e.from]: "done" } },
        { node: e.from, kind: "report", text: `${node(e.from).title} → ${node(e.to).title}: ${e.summary}`, at: e.at }
      );
    case "artifact":
      if (e.kind === "leads") return bump({ leads: e.data });
      if (e.kind === "newsletter") return bump({ newsletter: e.data });
      return bump({ artifact: e.data });
    case "response":
      return bump({ response: e.markdown });
    case "run.complete":
      return bump({ running: false, done: true, active: "kronos", litPath: ["kronos"] });
    case "run.error":
      return bump({ running: false, error: e.message });
    default:
      return s;
  }
}

export function useJarvisRun() {
  const [state, setState] = useState<JarvisRunState>(EMPTY);
  const feedId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (instruction: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    feedId.current = 0;
    const nextId = () => feedId.current++;
    setState({ ...EMPTY, running: true, instruction });
    sounds.send(); // "sent" cue — a real user gesture, so it also unlocks Web Audio

    try {
      const res = await fetch("/api/jarvis/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction }),
        signal: ac.signal,
      });
      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = drainEvents(buffer);
        buffer = rest;
        for (const e of events) {
          setState((s) => reduce(s, e, nextId));
          playEventSound(e);
        }
      }
    } catch (err) {
      if (!ac.signal.aborted) {
        setState((s) => ({ ...s, running: false, error: err instanceof Error ? err.message : String(err) }));
      }
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(EMPTY);
  }, []);

  return { state, run, reset };
}
