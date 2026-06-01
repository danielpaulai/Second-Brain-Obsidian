"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { FilmSlate, X, Sliders } from "@phosphor-icons/react";
import { usePresentation } from "@/lib/presentation-store";
import {
  toggleStudio,
  isStudioVisible,
  onStudioVisibilityChange,
} from "@/lib/theatre";

export default function PresentationToggle() {
  const { on, toggle } = usePresentation();
  const [studioOn, setStudioOn] = useState(false);

  // Stage toggle keyboard shortcut (⌘+Shift+P)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && k === "p") {
        e.preventDefault();
        toggle();
      }
      // Choreo editor shortcut (⌘+E)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && k === "e") {
        e.preventDefault();
        const next = toggleStudio();
        setStudioOn(next);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggle]);

  // Sync state if studio is toggled elsewhere
  useEffect(() => {
    setStudioOn(isStudioVisible());
    return onStudioVisibilityChange(setStudioOn);
  }, []);

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          onClick={toggle}
          title="Toggle presentation mode (⌘+Shift+P)"
          className="group relative flex items-center gap-1.5 rounded-md border border-border bg-card/60 hover:bg-card hover:border-accent-400/40 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition"
        >
          <FilmSlate size={13} weight="duotone" className={on ? "text-accent-300" : ""} />
          <span>{on ? "Live" : "Stage"}</span>
        </button>
        {on && (
          <button
            onClick={() => {
              const next = toggleStudio();
              setStudioOn(next);
            }}
            title="Edit cinematic choreography (⌘+E)"
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition ${
              studioOn
                ? "border-accent-400/50 bg-accent-500/15 text-accent-300"
                : "border-border bg-card/60 hover:bg-card hover:border-accent-400/40 text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sliders size={13} weight="duotone" />
            <span>Choreo</span>
          </button>
        )}
      </div>

      <AnimatePresence>
        {on && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="fixed inset-0 z-30 pointer-events-none"
          >
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.65)_90%,rgba(0,0,0,0.9)_100%)]" />
            <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-auto">
              <motion.div
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -20, opacity: 0 }}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-black/70 backdrop-blur-md px-4 py-1.5 shadow-2xl shadow-black/60"
              >
                <FilmSlate size={13} weight="fill" className="text-accent-300 animate-pulse_soft" />
                <span className="text-[11px] uppercase tracking-[0.18em] text-white/90 font-medium">
                  Presentation Mode
                </span>
                <button
                  onClick={toggle}
                  className="ml-2 text-white/50 hover:text-white/90 transition"
                  title="Exit (⌘+Shift+P)"
                >
                  <X size={12} weight="bold" />
                </button>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
