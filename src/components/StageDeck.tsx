"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { FilmSlate, Sliders, FloppyDisk, X, Check } from "@phosphor-icons/react";
import { toast } from "sonner";
import { usePresentation } from "@/lib/presentation-store";
import {
  toggleStudio,
  isStudioVisible,
  onStudioVisibilityChange,
  saveChoreoState,
} from "@/lib/theatre";
import { sounds } from "@/lib/sounds";
import { celebrateSave, celebrateStageEnter } from "@/lib/confetti";
import { cn } from "@/lib/utils";

/**
 * Physical control deck — floating glassmorphic dock with chunky buttons.
 * Lives at the bottom of the graph area. Survives in both daily and stage mode.
 */
export default function StageDeck() {
  const { on, toggle } = usePresentation();
  const [studioOn, setStudioOn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  /* Keyboard shortcuts — buttons are the primary path, shortcuts are bonus */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && k === "p") {
        e.preventDefault();
        sounds.switchAgent();
        toggle();
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && k === "e") {
        e.preventDefault();
        const next = toggleStudio();
        setStudioOn(next);
        sounds.switchAgent();
      }
      if ((e.metaKey || e.ctrlKey) && k === "s" && studioOn) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [toggle, studioOn]);

  useEffect(() => {
    setStudioOn(isStudioVisible());
    return onStudioVisibilityChange(setStudioOn);
  }, []);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    const ok = await saveChoreoState();
    setSaving(false);
    if (ok) {
      setSavedFlash(true);
      sounds.reply();
      celebrateSave();
      toast.success("Choreography saved", {
        description: "Persisted to _ai-danny/choreo-state.json in your vault",
      });
      setTimeout(() => setSavedFlash(false), 1500);
    } else {
      toast.error("Couldn't save choreography");
    }
  }

  return (
    <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 z-20">
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 260, damping: 22 }}
      >
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-2xl border border-white/10 bg-black/65 backdrop-blur-xl px-2 py-2 shadow-2xl shadow-black/60">
          <DeckButton
            icon={FilmSlate}
            label={on ? "Live" : "Stage"}
            active={on}
            onClick={() => {
              sounds.switchAgent();
              if (!on) celebrateStageEnter();
              toggle();
            }}
            shortcut="⌘⇧P"
            primary
          />

          <AnimatePresence initial={false}>
            {on && (
              <motion.div
                key="choreo"
                initial={{ width: 0, opacity: 0, marginLeft: -6 }}
                animate={{ width: "auto", opacity: 1, marginLeft: 0 }}
                exit={{ width: 0, opacity: 0, marginLeft: -6 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <DeckButton
                  icon={Sliders}
                  label="Choreo"
                  active={studioOn}
                  onClick={() => {
                    const next = toggleStudio();
                    setStudioOn(next);
                    sounds.switchAgent();
                  }}
                  shortcut="⌘E"
                />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {on && studioOn && (
              <motion.div
                key="save"
                initial={{ width: 0, opacity: 0, marginLeft: -6 }}
                animate={{ width: "auto", opacity: 1, marginLeft: 0 }}
                exit={{ width: 0, opacity: 0, marginLeft: -6 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <DeckButton
                  icon={savedFlash ? Check : FloppyDisk}
                  label={savedFlash ? "Saved" : saving ? "Saving…" : "Save"}
                  active={savedFlash}
                  onClick={handleSave}
                  shortcut="⌘S"
                  disabled={saving}
                />
              </motion.div>
            )}
          </AnimatePresence>
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
  primary,
  disabled,
}: {
  icon: IconType;
  label: string;
  active?: boolean;
  onClick: () => void;
  shortcut?: string;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cn(
        "group relative flex items-center gap-2 rounded-xl px-3.5 h-11 text-sm font-medium transition-all",
        "border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/60",
        "active:scale-[0.97]",
        active
          ? "border-accent-400/60 bg-gradient-to-b from-accent-500/30 to-accent-500/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_28px_-6px_rgba(167,139,250,0.85)]"
          : primary
            ? "border-white/15 bg-gradient-to-b from-white/[0.08] to-white/[0.02] text-zinc-100 hover:from-white/[0.12] hover:to-white/[0.04] hover:border-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_2px_8px_rgba(0,0,0,0.5)]"
            : "border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.01] text-zinc-300 hover:from-white/[0.09] hover:to-white/[0.02] hover:border-white/20 hover:text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_1px_4px_rgba(0,0,0,0.4)]",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <Icon
        size={16}
        weight="duotone"
        className={cn(
          "transition",
          active ? "text-accent-200" : "text-zinc-400 group-hover:text-zinc-200"
        )}
      />
      <span className="tracking-tight">{label}</span>
      {shortcut && (
        <span
          className={cn(
            "ml-1 text-[9px] font-mono uppercase tracking-[0.12em] px-1.5 py-0.5 rounded border transition",
            active
              ? "border-accent-300/30 bg-accent-500/20 text-accent-200/90"
              : "border-white/10 bg-black/40 text-zinc-500"
          )}
        >
          {shortcut}
        </span>
      )}
    </button>
  );
}
