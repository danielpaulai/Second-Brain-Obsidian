"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ShareNetwork, Cube, FilmSlate, Sliders, FloppyDisk } from "@phosphor-icons/react";
import { toast } from "sonner";
import { usePresentation, type Mode } from "@/lib/presentation-store";
import { toggleStudio, isStudioVisible, onStudioVisibilityChange, saveChoreoState } from "@/lib/theatre";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/utils";

/**
 * Mode dock — floating glass control at the bottom of the graph area.
 * Switches between Live (2D graph), Presentation (3D cinematic), and Stage
 * (full-bleed dormant-brain → "wake up" → live network). ⌘⇧P toggles Live↔Stage.
 */
export default function StageDeck() {
  const mode = usePresentation((s) => s.mode);
  const setMode = usePresentation((s) => s.setMode);
  // Theatre.js choreography studio (dev-only editor) — toggled here + via ⌘E / saved via ⌘S.
  const [studioOn, setStudioOn] = useState(false);

  /* ⌘⇧P toggles Live↔Stage (the primary demo path). ⌘E opens the Choreo studio; ⌘S saves it. */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && k === "p") {
        e.preventDefault();
        sounds.switchAgent();
        const cur = usePresentation.getState().mode;
        usePresentation.getState().setMode(cur === "stage" ? "live" : "stage");
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && k === "e") {
        e.preventDefault();
        setStudioOn(toggleStudio());
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && k === "s" && isStudioVisible()) {
        e.preventDefault();
        void onSaveChoreo();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // Keep the Choreo button in sync if the studio is toggled elsewhere.
  useEffect(() => {
    setStudioOn(isStudioVisible());
    const unsub = onStudioVisibilityChange(setStudioOn);
    return () => { unsub(); };
  }, []);

  async function onSaveChoreo() {
    const ok = await saveChoreoState();
    if (ok) toast.success("Choreography saved", { description: "Persisted to _ai-danny/choreo-state.json in your vault" });
    else toast.error("Couldn't save choreography");
  }

  const pick = (m: Mode) => {
    if (m === mode) return;
    sounds.switchAgent();
    setMode(m);
  };

  return (
    <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 z-20">
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 260, damping: 22 }}
      >
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-2xl border border-white/10 bg-black/65 backdrop-blur-xl px-2 py-2 shadow-2xl shadow-black/60">
          <DeckButton icon={ShareNetwork} label="Live" active={mode === "live"} onClick={() => pick("live")} />
          <DeckButton icon={Cube} label="Presentation" active={mode === "presentation"} onClick={() => pick("presentation")} />
          <DeckButton icon={FilmSlate} label="Stage" active={mode === "stage"} onClick={() => pick("stage")} shortcut="⌘⇧P" />
          {/* Theatre.js choreography studio — always available (also ⌘E). It choreographs the
              Presentation cinematic, but the editor is a global overlay so it opens from any mode. */}
          <span className="mx-0.5 h-7 w-px bg-white/10" />
          <DeckButton icon={Sliders} label="Choreo" active={studioOn} onClick={() => setStudioOn(toggleStudio())} shortcut="⌘E" />
          {studioOn && (
            <DeckButton icon={FloppyDisk} label="Save" onClick={() => void onSaveChoreo()} shortcut="⌘S" />
          )}
        </div>
      </motion.div>
    </div>
  );
}

/* --------------------------- Button --------------------------------------- */

type IconType = typeof FilmSlate;

function DeckButton({
  icon: Icon,
  label,
  active,
  onClick,
  shortcut,
}: {
  icon: IconType;
  label: string;
  active?: boolean;
  onClick: () => void;
  shortcut?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cn(
        "group relative flex items-center gap-2 rounded-xl px-3.5 h-11 text-sm font-medium transition-all",
        "border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/60",
        "active:scale-[0.97]",
        active
          ? "border-accent-400/60 bg-gradient-to-b from-accent-500/30 to-accent-500/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_28px_-6px_rgba(167,139,250,0.85)]"
          : "border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.01] text-zinc-300 hover:from-white/[0.09] hover:to-white/[0.02] hover:border-white/20 hover:text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_1px_4px_rgba(0,0,0,0.4)]"
      )}
    >
      <Icon
        size={16}
        weight="duotone"
        className={cn("transition", active ? "text-accent-200" : "text-zinc-400 group-hover:text-zinc-200")}
      />
      <span className="tracking-tight">{label}</span>
      {shortcut && (
        <span
          className={cn(
            "ml-1 text-[9px] font-mono uppercase tracking-[0.12em] px-1.5 py-0.5 rounded border transition",
            active ? "border-accent-300/30 bg-accent-500/20 text-accent-200/90" : "border-white/10 bg-black/40 text-zinc-500"
          )}
        >
          {shortcut}
        </span>
      )}
    </button>
  );
}
