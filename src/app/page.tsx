"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CaretLeft, CaretRight, Chat } from "@phosphor-icons/react";
import BrainGraph from "@/components/BrainGraph";
import PresentationGraph from "@/components/PresentationGraph";
import BrainHud from "@/components/BrainHud";
import VoiceDeck from "@/components/VoiceDeck";
import StageGreeting from "@/components/StageGreeting";
import StageActivity from "@/components/StageActivity";
import StageAnswer from "@/components/StageAnswer";
import StageReadthrough from "@/components/StageReadthrough";
import StageLinkedIn from "@/components/StageLinkedIn";
import StageDeck from "@/components/StageDeck";
import ChatPanel, { type ChatPanelHandle } from "@/components/ChatPanel";
import StatsBar from "@/components/StatsBar";
import HeaderBackdrop from "@/components/HeaderBackdrop";
import CommandPalette from "@/components/CommandPalette";
import AgentIcon from "@/components/AgentIcon";
import MorningBriefBanner from "@/components/MorningBriefBanner";
import { Kbd } from "@/components/ui/kbd";
import { usePresentation } from "@/lib/presentation-store";
import { useVoice } from "@/lib/voice-store";
import { STAGE_BG } from "@/lib/brain-visual";
import type { BrainGraph as GraphData } from "@/lib/vault";
import type { AgentId } from "@/lib/agents";

const CHAT_WIDTH = 420;
const STORAGE_KEY = "ai-danny-chat-collapsed";

export default function Home() {
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [stats, setStats] = useState<{
    notes: number;
    links: number;
    folders: number;
    lastEdited: number;
  } | null>(null);
  const [highlights, setHighlights] = useState<string[]>([]);
  const [researchIds, setResearchIds] = useState<string[]>([]);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentId>("danny");
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [prefersReduced, setPrefersReduced] = useState(false);
  const chatRef = useRef<ChatPanelHandle>(null);
  const mode = usePresentation((s) => s.mode);
  const woken = usePresentation((s) => s.woken);
  const igniteProgressive = usePresentation((s) => s.igniteProgressive);
  const beginThinking = usePresentation((s) => s.beginThinking);
  const clearFiring = usePresentation((s) => s.clearFiring);

  // Retrieved notes light up live as tools resolve; cited notes get the final emphasis.
  const researchedRef = useRef<Set<string>>(new Set());
  const citedRef = useRef<Set<string>>(new Set());
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thinkingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamPending = useRef<string[]>([]);
  const streamTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReduced(mq.matches);
    const h = () => setPrefersReduced(mq.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  // Hydrate collapse pref from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    setChatCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, chatCollapsed ? "1" : "0");
  }, [chatCollapsed]);

  // After the sidebar finishes animating, force canvases to re-measure.
  // (r3f Canvas + 2D canvases don't always catch flex layout changes.)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const fire = () => window.dispatchEvent(new Event("resize"));
    const t1 = setTimeout(fire, 60); // mid-transition
    const t2 = setTimeout(fire, 520); // after spring settles
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [chatCollapsed]);

  // Same trick when toggling between the live graph and the full-bleed stage overlay,
  // so the newly-mounted canvas measures the viewport correctly.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t1 = setTimeout(() => window.dispatchEvent(new Event("resize")), 80);
    const t2 = setTimeout(() => window.dispatchEvent(new Event("resize")), 400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [mode]);

  // Keyboard: ⌘+/ toggles chat sidebar
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setChatCollapsed((c) => !c);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    fetch("/api/brain")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || "failed");
        return r.json();
      })
      .then((d) => {
        setGraph(d.graph);
        setStats(d.stats);
      })
      .catch((e) => setError(String(e.message || e)));
  }, []);

  const titleToId = useCallback(
    (titles: string[]) => {
      if (!graph) return [];
      const byTitle = new Map(graph.nodes.map((n) => [n.name.toLowerCase(), n.id]));
      return titles.map((t) => byTitle.get(t.toLowerCase())).filter(Boolean) as string[];
    },
    [graph]
  );

  const armClear = useCallback(() => {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => {
      setHighlights([]);
      setResearchIds([]);
      clearFiring();
      citedRef.current.clear();
      researchedRef.current.clear();
    }, 8000);
  }, [clearFiring]);

  const stopThinking = useCallback(() => {
    setThinking(false);
    if (thinkingTimer.current) {
      clearTimeout(thinkingTimer.current);
      thinkingTimer.current = null;
    }
  }, []);

  // A new query began — reset highlight state and play the "thinking" animation until results land.
  const handleQueryStart = useCallback(() => {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    if (streamTimer.current) clearTimeout(streamTimer.current);
    streamPending.current = [];
    researchedRef.current.clear();
    citedRef.current.clear();
    setResearchIds([]);
    setHighlights([]);
    beginThinking();
    setThinking(true);
    // Safety: never leave the thinking animation stuck if a turn produces no results.
    if (thinkingTimer.current) clearTimeout(thinkingTimer.current);
    thinkingTimer.current = setTimeout(() => setThinking(false), 30000);
  }, [beginThinking]);

  // RETRIEVED notes — light up live as each tool call resolves ("watch it query").
  // Debounced so a burst of tool results staggers smoothly.
  const handleResearch = useCallback(
    (titles: string[]) => {
      streamPending.current.push(...titles);
      if (streamTimer.current) return;
      streamTimer.current = setTimeout(() => {
        const batch = streamPending.current;
        streamPending.current = [];
        streamTimer.current = null;
        const ids = titleToId(batch);
        let added = false;
        for (const id of ids) if (!researchedRef.current.has(id)) { researchedRef.current.add(id); added = true; }
        if (!added) return;
        stopThinking(); // results are landing — end the "thinking" animation
        const all = [...researchedRef.current];
        setResearchIds(all);
        igniteProgressive(all, agent); // 3D + HUD: phase "recalling"
        armClear();
      }, 120);
    },
    [titleToId, igniteProgressive, agent, armClear, stopThinking]
  );

  // CITED notes — the answer's [[wikilinks]]. Final emphasis pulse; non-cited research fades.
  const handleBrainQuery = useCallback(
    (titles: string[]) => {
      stopThinking(); // answer is in — end the "thinking" animation
      const ids = titleToId(titles);
      if (ids.length === 0) {
        // Nothing cited; if nothing was researched either, return the HUD to idle.
        if (researchedRef.current.size === 0) clearFiring();
        return;
      }
      for (const id of ids) citedRef.current.add(id);
      const cited = [...citedRef.current];
      setHighlights(cited);
      igniteProgressive(cited, agent);
      armClear();
    },
    [titleToId, igniteProgressive, agent, armClear, stopThinking, clearFiring]
  );

  // Stage read-through: the store reveals retrieved notes one at a time (paced by
  // StageReadthrough); mirror those revealed titles into the brain's lit nodes so each
  // node lights exactly as its card appears on the right.
  const revealedTitles = usePresentation((s) => s.revealedTitles);
  useEffect(() => {
    if (mode !== "stage") return;
    if (revealedTitles.length === 0) {
      setResearchIds([]);
      return;
    }
    setResearchIds(titleToId(revealedTitles));
    setThinking(false); // a node is being read — drop the "thinking" shimmer
  }, [revealedTitles, mode, titleToId]);

  // Clear pending ignition timers on unmount.
  useEffect(
    () => () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
      if (streamTimer.current) clearTimeout(streamTimer.current);
      if (thinkingTimer.current) clearTimeout(thinkingTimer.current);
    },
    []
  );

  // Voice routing. In stage mode while still dormant, the FIRST utterance ALWAYS wakes
  // the brain — whatever was actually said. Recognition of "wake up" is unreliable, and
  // the demo beat is simply "speak → the sphere blooms"; we force the transcript to read
  // "wake up" so the record is consistent. Otherwise the utterance is a question.
  // Reads live store state so this stays a stable callback (VoiceDeck listeners don't churn).
  const handleVoice = useCallback((text: string) => {
    const st = usePresentation.getState();
    const v = useVoice.getState();
    if (st.mode === "stage" && !st.woken) {
      v.setTranscript("wake up"); // first voice note always reads "wake up"
      st.wake();
      v.setSpeakNext(false);
      v.setPhase("idle");
      // The greeting (text + speech) fires once the morph completes — see StageGreeting,
      // gated on the store's `expanded` flag set by BrainGraph.
      return;
    }
    // A bare "wake up" is a cue, NOT a question — never query the brain with it (no hits).
    // Guards the already-woken case (re-saying "wake up" between demo runs).
    const norm = text.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
    const isWakeCue = norm === "wake" || norm.startsWith("wake up") || (norm.includes("wake") && norm.split(" ").length <= 3);
    if (st.mode === "stage" && isWakeCue) {
      v.setSpeakNext(false);
      v.setPhase("idle");
      return;
    }
    chatRef.current?.ask(text);
  }, []);

  // Esc exits stage mode.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" && usePresentation.getState().on) {
        usePresentation.getState().set(false);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // Stage takes over the whole screen — request browser fullscreen on enter (hides the
  // tab/URL chrome), release it on exit. requestFullscreen needs a user gesture, which the
  // dock click / ⌘⇧P provides; failures (e.g. console-triggered) are swallowed.
  useEffect(() => {
    const doc = document as Document & {
      webkitFullscreenElement?: Element;
      webkitExitFullscreen?: () => Promise<void>;
    };
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };
    const fsEl = doc.fullscreenElement ?? doc.webkitFullscreenElement;
    if (mode === "stage") {
      if (!fsEl) {
        const req = el.requestFullscreen ?? el.webkitRequestFullscreen;
        try { req?.call(el)?.catch?.(() => {}); } catch { /* ignore */ }
      }
    } else if (fsEl) {
      const exit = doc.exitFullscreen ?? doc.webkitExitFullscreen;
      try { exit?.call(doc)?.catch?.(() => {}); } catch { /* ignore */ }
    }
  }, [mode]);

  return (
    <main className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden">
      <header className="relative flex items-center justify-between px-5 py-3 border-b border-border">
        <HeaderBackdrop />
        <div className="relative flex items-center gap-3">
          <div
            className="grid place-items-center w-9 h-9 rounded-lg bg-gradient-to-br from-accent-500/30 to-accent-500/5 border border-accent-500/30 shadow-[0_0_24px_-6px_rgba(167,139,250,0.5)]"
            aria-hidden
          >
            <AgentIcon id="danny" size={20} weight="duotone" />
          </div>
          <div>
            <div className="font-semibold tracking-tight">AI Danny</div>
            <div className="text-[11px] text-muted-foreground -mt-0.5">
              your second brain · your exec team
            </div>
          </div>
        </div>
        <div className="relative flex items-center gap-4">
          <StatsBar stats={stats} />
          <div className="hidden md:flex items-center gap-1.5 text-[10px] text-muted-foreground/80">
            <Kbd>⌘</Kbd><Kbd>K</Kbd>
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0 relative">
        {/* Brain section — flexes to fill remaining width */}
        <section className="flex-1 relative border-r border-border overflow-hidden">
          {error ? (
            <div className="absolute inset-0 flex items-center justify-center p-8 text-center">
              <div>
                <div className="text-rose-400 font-medium mb-2">Couldn&apos;t read your vault</div>
                <div className="text-xs text-muted-foreground font-mono mb-3">{error}</div>
                <div className="text-xs text-muted-foreground max-w-sm">
                  Set <code className="text-accent-300">VAULT_PATH</code> in{" "}
                  <code className="text-accent-300">.env.local</code> to your Obsidian vault.
                </div>
              </div>
            </div>
          ) : mode === "stage" ? null : mode === "presentation" ? (
            <PresentationGraph data={graph} highlights={highlights} />
          ) : (
            <BrainGraph data={graph} highlights={highlights} researchIds={researchIds} thinking={thinking} personaAgent={agent} />
          )}

          {/* Glass HUD + hints + brief — shown in live & presentation; hidden on the clutter-free stage. */}
          {!error && mode !== "stage" && (
            <>
              <BrainHud
                stats={stats}
                folders={graph?.folders ?? []}
                reducedMotion={prefersReduced}
              />

              <div className="pointer-events-none absolute bottom-5 left-4 z-20 text-[11px] text-muted-foreground/60 font-mono">
                drag · scroll to zoom · hover to focus
              </div>

              {/* Morning brief — owner-only, auto-hides for everyone else */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-auto w-full px-4">
                <MorningBriefBanner />
              </div>
            </>
          )}

          <StageDeck />
        </section>

        {/* Chat sidebar — animates width to 0 when collapsed */}
        <motion.aside
          initial={false}
          animate={{ width: chatCollapsed ? 0 : CHAT_WIDTH }}
          transition={{ type: "spring", stiffness: 220, damping: 30 }}
          className="relative overflow-hidden"
          aria-hidden={chatCollapsed}
        >
          <div
            className="absolute inset-y-0 right-0 h-full"
            style={{ width: CHAT_WIDTH }}
          >
            <ChatPanel
              ref={chatRef}
              agent={agent}
              onAgentChange={setAgent}
              onBrainQuery={handleBrainQuery}
              onResearch={handleResearch}
              onQueryStart={handleQueryStart}
            />
          </div>
        </motion.aside>

        {/* Floating collapse / expand handle — tracks the seam */}
        <motion.button
          initial={false}
          animate={{ right: chatCollapsed ? 0 : CHAT_WIDTH }}
          transition={{ type: "spring", stiffness: 220, damping: 30 }}
          onClick={() => setChatCollapsed((c) => !c)}
          title={chatCollapsed ? "Open chat (⌘+/)" : "Collapse chat (⌘+/)"}
          className="absolute top-1/2 -translate-y-1/2 z-40 grid place-items-center w-7 h-16 bg-card/85 backdrop-blur border border-border border-r-0 rounded-l-md hover:bg-card hover:border-accent-400/40 hover:text-accent-300 text-muted-foreground transition shadow-lg shadow-black/40"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={chatCollapsed ? "open" : "close"}
              initial={{ opacity: 0, rotate: -90 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0, rotate: 90 }}
              transition={{ duration: 0.18 }}
              className="grid place-items-center"
            >
              {chatCollapsed ? <Chat size={14} weight="duotone" /> : <CaretRight size={14} weight="bold" />}
            </motion.span>
          </AnimatePresence>
        </motion.button>
      </div>

      {/* ── Stage mode: full-bleed cinematic, all chrome hidden behind it ── */}
      {mode === "stage" && !error && (
        <div className="fixed inset-0 z-50 overflow-hidden" style={{ background: STAGE_BG }}>
          {/* The SAME live graph engine — dormant brain shape that "wakes" into the network,
              with all of BrainGraph's native hover / drag / glow / batch-fire behavior. */}
          <BrainGraph
            stage
            data={graph}
            highlights={highlights}
            researchIds={researchIds}
            thinking={thinking}
            personaAgent={agent}
          />
          <div className="pointer-events-none absolute top-6 right-7 z-10 font-mono text-[10px] uppercase tracking-[0.22em] text-white/25">
            esc to exit
          </div>
          {/* Demo beats on the right rail: greeting → live retrieval cards → big answer. */}
          <StageReadthrough />
          <StageGreeting />
          <StageActivity />
          <StageLinkedIn />
          <StageAnswer />

          <AnimatePresence>
            {!woken && (
              <motion.div
                key="wake-hint"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.7 }}
                className="pointer-events-none absolute bottom-44 left-1/2 -translate-x-1/2 z-10 text-center"
              >
                <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-white/40">
                  say <span className="text-cyan-300/80">&ldquo;wake up&rdquo;</span> to begin
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Voice pill — single instance, floats above both the live view and the stage */}
      {!error && <VoiceDeck onSend={handleVoice} />}

      <CommandPalette
        graph={graph}
        activeAgent={agent}
        onSetAgent={setAgent}
        onAsk={(prompt) => {
          // Auto-expand chat when a question is sent via the palette
          if (chatCollapsed) setChatCollapsed(false);
          chatRef.current?.ask(prompt);
        }}
        onFocusNote={(id) => {
          setHighlights([id]);
          igniteProgressive([id], agent);
          if (clearTimer.current) clearTimeout(clearTimer.current);
          clearTimer.current = setTimeout(() => {
            setHighlights([]);
            clearFiring();
          }, 5000);
        }}
      />
    </main>
  );
}
