"use client";

import { create } from "zustand";
import { startAmbientDrone, stopAmbientDrone } from "./cinema-audio";
import { staggerFor } from "./brain-visual";

/**
 * Global presentation-mode state.
 *
 * Toggle keyboard shortcut: ⌘+Shift+P (Cmd on mac, Ctrl on win/linux).
 * When ON: the full-bleed stage takes over — a dormant brain silhouette that
 * "wakes" (`woken`) into the live network, all chrome hidden.
 *
 * `igniteProgressive` ticks `litCount`/`phase` for the HUD in lockstep with the same
 * STAGGER_MS the BrainGraph uses for per-node ignition, so HUD + graph stay in sync.
 */

type AgentKey = "danny" | "ceo" | "coo" | "cfo" | "cmo" | "cro";
type Phase = "idle" | "thinking" | "recalling" | "recalled";

/** A live "tool call" the agent is running while answering — surfaced as a stage card. */
export type StageCard = {
  id: string;
  label: string; // e.g. "Reading note", "Searching your vault"
  detail?: string; // e.g. the note title or query
  state: "running" | "done";
};

/** The three view modes, switched from the dock (StageDeck):
 *  - live: the everyday 2D BrainGraph.
 *  - presentation: the 3D r3f cinematic (PresentationGraph).
 *  - stage: full-bleed dormant-brain → "wake up" → live network. */
export type Mode = "live" | "presentation" | "stage";

// Module-scoped timers for the progressive HUD ticker. Cleared before each new
// burst so rapid re-calls (e.g. per streaming chunk) don't pile up hundreds of timers.
let igniteTimers: ReturnType<typeof setTimeout>[] = [];
function clearIgniteTimers() {
  for (const t of igniteTimers) clearTimeout(t);
  igniteTimers = [];
}

type PresentationState = {
  /** Which view mode is active. */
  mode: Mode;
  /** Convenience: any non-live mode (presentation OR stage) is active. */
  on: boolean;
  /** Stage cinematic: false = dormant brain shape, true = woken/grown into the network. */
  woken: boolean;
  /** Stage: true once the wake morph has finished + the network has shifted left (drives the greeting). */
  expanded: boolean;
  /** Stage Q&A: a query is in flight (drives the retrieval cards over the greeting). */
  querying: boolean;
  /** Stage Q&A: retrieved note titles waiting to be "read through" (revealed one at a time). */
  readQueue: string[];
  /** Stage Q&A: titles revealed so far (page maps these → lit nodes, in lock-step with the cards). */
  revealedTitles: string[];
  /** Stage Q&A: the read cards shown so far (one per lit node). */
  stageCards: StageCard[];
  /** Stage Q&A: the answer text, buffered until the read-through finishes. */
  pendingAnswer: string | null;
  /** Stage Q&A: the settled final answer text (shown big, like the greeting). */
  answer: string;
  /** Stage: the LinkedIn "scrape & analyse" chat is running. */
  linkedinActive: boolean;
  /** Stage: the question that kicked off the LinkedIn chat (shown as the user message). */
  linkedinQuery: string;
  /** Stage: bumps on every `startLinkedInScrape` so a re-run (new scope) fully remounts the flow.
   *  >1 means a prior run already happened this session → the re-run uses a quick re-scope, not a full scrape. */
  linkedinRunId: number;
  /** Notes currently being "fired at" by a query — drives the cinematic burst */
  firing: string[];
  phase: Phase;
  litCount: number;
  recallTotal: number;
  personaAgent: AgentKey;
  /** True while the user is dragging a node / orbiting — HUD dims so it never fights the data */
  dragging: boolean;
  /** Switch view mode (live / presentation / stage). Resets the stage `woken` flag. */
  setMode: (m: Mode) => void;
  toggle: () => void;
  set: (v: boolean) => void;
  fire: (notes: string[]) => void;
  clearFiring: () => void;
  setPhase: (p: Phase) => void;
  setLitCount: (n: number) => void;
  setPersona: (a: AgentKey) => void;
  setDragging: (v: boolean) => void;
  /** Stage: the brain "wakes up" and grows from the brain shape into the network. */
  wake: () => void;
  /** Stage: wake morph done + network shifted left — reveal the greeting on the right. */
  setExpanded: (v: boolean) => void;
  /** Stage Q&A: a new question started — clear everything, show the retrieval view. */
  startQuery: () => void;
  /** Stage Q&A: retrieved note titles arrived — queue them to be read through. */
  enqueueReads: (titles: string[]) => void;
  /** Stage Q&A: reveal the next queued read (light its node + show its card). Returns false if empty. */
  revealNextRead: () => boolean;
  /** Stage Q&A: the LLM finished — buffer the answer until the read-through completes. */
  setPendingAnswer: (text: string) => void;
  /** Stage Q&A: read-through done — reveal the buffered answer big. */
  commitAnswer: () => void;
  /** Stage Q&A: reveal a specific (already-formatted) display string as the answer. */
  revealAnswer: (display: string) => void;
  /** Stage: start the LinkedIn scrape & analyse chat (replaces the read-through for this turn). */
  startLinkedInScrape: (query?: string) => void;
  /** Stage: the LinkedIn theater finished — tear it down. */
  endLinkedIn: () => void;
  /** A query was submitted — brain is "thinking" before any results land. */
  beginThinking: () => void;
  /** Shared progressive-ignition entry point for both graphs + the HUD. */
  igniteProgressive: (notes: string[], persona?: AgentKey) => void;
};

export const usePresentation = create<PresentationState>((set, get) => ({
  mode: "live",
  on: false,
  woken: false,
  expanded: false,
  querying: false,
  readQueue: [],
  revealedTitles: [],
  stageCards: [],
  pendingAnswer: null,
  answer: "",
  linkedinActive: false,
  linkedinQuery: "",
  linkedinRunId: 0,
  firing: [],
  phase: "idle",
  litCount: 0,
  recallTotal: 0,
  personaAgent: "danny",
  dragging: false,
  setMode: (m) => {
    const nonLive = m !== "live";
    // Ambient drone plays during any non-live cinematic.
    if (nonLive) void startAmbientDrone();
    else void stopAmbientDrone();
    // Entering stage always starts dormant (brain shape), waiting for "wake up".
    set({
      mode: m, on: nonLive, woken: false, expanded: false,
      querying: false, readQueue: [], revealedTitles: [], stageCards: [], pendingAnswer: null, answer: "",
      linkedinActive: false, linkedinQuery: "", linkedinRunId: 0,
    });
  },
  // ⌘⇧P / Esc / debug all map onto the primary Live↔Stage path.
  toggle: () => get().setMode(get().mode === "stage" ? "live" : "stage"),
  set: (v) => get().setMode(v ? "stage" : "live"),
  wake: () => set({ woken: true }),
  setExpanded: (v) => set({ expanded: v }),
  startQuery: () =>
    set({ querying: true, readQueue: [], revealedTitles: [], stageCards: [], pendingAnswer: null, answer: "", linkedinActive: false, linkedinQuery: "", linkedinRunId: 0 }),
  startLinkedInScrape: (query = "") =>
    set((s) => ({
      querying: true, linkedinActive: true, linkedinQuery: query, linkedinRunId: s.linkedinRunId + 1,
      readQueue: [], revealedTitles: [], stageCards: [], pendingAnswer: null, answer: "",
    })),
  endLinkedIn: () => set({ linkedinActive: false }),
  enqueueReads: (titles) =>
    set((s) => {
      const have = new Set([...s.readQueue, ...s.revealedTitles]);
      const fresh = titles.filter((t) => t && !have.has(t));
      if (!fresh.length) return s;
      // Cap the read-through so a huge result set never drags on too long.
      const room = Math.max(0, 12 - (s.readQueue.length + s.revealedTitles.length));
      return { readQueue: [...s.readQueue, ...fresh.slice(0, room)] };
    }),
  revealNextRead: () => {
    const s = get();
    if (s.readQueue.length === 0) return false;
    const [next, ...rest] = s.readQueue;
    set({
      readQueue: rest,
      revealedTitles: [...s.revealedTitles, next],
      // Mark prior cards done; the newest is "running" (currently being read).
      stageCards: [
        ...s.stageCards.map((c) => (c.state === "running" ? { ...c, state: "done" as const } : c)),
        { id: `read-${s.revealedTitles.length}`, label: "Reading", detail: next, state: "running" as const },
      ],
    });
    return true;
  },
  setPendingAnswer: (text) => set({ pendingAnswer: text }),
  commitAnswer: () =>
    set((s) => ({
      querying: false,
      answer: s.pendingAnswer ?? s.answer,
      pendingAnswer: null,
      stageCards: s.stageCards.map((c) => (c.state === "running" ? { ...c, state: "done" as const } : c)),
    })),
  revealAnswer: (display) =>
    set((s) => ({
      querying: false,
      answer: display,
      pendingAnswer: null,
      stageCards: s.stageCards.map((c) => (c.state === "running" ? { ...c, state: "done" as const } : c)),
    })),
  fire: (notes) => set({ firing: notes }),
  clearFiring: () => {
    clearIgniteTimers();
    set({ firing: [], phase: "idle", litCount: 0, recallTotal: 0 });
  },
  setPhase: (p) => set({ phase: p }),
  setLitCount: (n) => set({ litCount: n }),
  setPersona: (a) => set({ personaAgent: a }),
  setDragging: (v) => set({ dragging: v }),
  beginThinking: () => {
    clearIgniteTimers();
    set({ firing: [], phase: "thinking", litCount: 0, recallTotal: 0 });
  },
  igniteProgressive: (notes, persona) => {
    clearIgniteTimers(); // cancel any in-flight ticker from a prior (or streaming) burst
    set({
      firing: notes,
      phase: notes.length ? "recalling" : "idle",
      litCount: 0,
      recallTotal: notes.length,
      personaAgent: persona ?? get().personaAgent,
    });
    if (notes.length === 0) return;
    const step = staggerFor(notes.length);
    // Tick the HUD LIT counter in lockstep with the per-node 2D ignition stagger.
    notes.forEach((_, k) =>
      igniteTimers.push(
        setTimeout(
          () => set((s) => ({ litCount: Math.min(s.recallTotal, s.litCount + 1) })),
          k * step
        )
      )
    );
    // Flip to "recalled" once the last node has started + flashed.
    igniteTimers.push(setTimeout(() => set({ phase: "recalled" }), notes.length * step + 400));
  },
}));

// Dev-only debug handle (lets you drive the stage cinematic from the console:
// `__present.getState().wake()`). Never attached in production.
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as { __present?: typeof usePresentation }).__present = usePresentation;
}
