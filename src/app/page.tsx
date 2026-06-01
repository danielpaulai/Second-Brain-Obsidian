"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CaretLeft, CaretRight, Chat } from "@phosphor-icons/react";
import BrainGraph from "@/components/BrainGraph";
import PresentationGraph, { useFireCinematic } from "@/components/PresentationGraph";
import StageDeck from "@/components/StageDeck";
import ChatPanel, { type ChatPanelHandle } from "@/components/ChatPanel";
import StatsBar from "@/components/StatsBar";
import HeaderBackdrop from "@/components/HeaderBackdrop";
import CommandPalette from "@/components/CommandPalette";
import AgentIcon from "@/components/AgentIcon";
import MorningBriefBanner from "@/components/MorningBriefBanner";
import { Kbd } from "@/components/ui/kbd";
import { usePresentation } from "@/lib/presentation-store";
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
  const [error, setError] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentId>("danny");
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const chatRef = useRef<ChatPanelHandle>(null);
  const presentationOn = usePresentation((s) => s.on);
  const fireCinematic = useFireCinematic();

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

  // Same trick when toggling between BrainGraph (2D) and PresentationGraph (3D)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t1 = setTimeout(() => window.dispatchEvent(new Event("resize")), 80);
    const t2 = setTimeout(() => window.dispatchEvent(new Event("resize")), 400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [presentationOn]);

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

  const handleBrainQuery = (titles: string[]) => {
    if (!graph) return;
    const byTitle = new Map(graph.nodes.map((n) => [n.name.toLowerCase(), n.id]));
    const ids = titles.map((t) => byTitle.get(t.toLowerCase())).filter(Boolean) as string[];
    setHighlights(ids);
    fireCinematic(ids);
    setTimeout(() => setHighlights([]), 8000);
  };

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
          ) : presentationOn ? (
            <PresentationGraph data={graph} highlights={highlights} />
          ) : (
            <BrainGraph data={graph} highlights={highlights} />
          )}
          <div className="pointer-events-none absolute bottom-4 left-4 text-[11px] text-muted-foreground/70 font-mono">
            drag · scroll to zoom · hover to focus
          </div>

          {/* Morning brief — owner-only, auto-hides for everyone else */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-auto w-full px-4">
            <MorningBriefBanner />
          </div>

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
          setTimeout(() => setHighlights([]), 5000);
        }}
      />
    </main>
  );
}
