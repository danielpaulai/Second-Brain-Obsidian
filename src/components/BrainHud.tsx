"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import NumberFlow from "@number-flow/react";
import { usePresentation } from "@/lib/presentation-store";
import { paletteHex } from "@/lib/brain-visual";

/**
 * Glassmorphism overlay that narrates the "brain recall" on a big screen.
 * Reads the presentation store (phase / litCount / recallTotal) + graph stats props.
 * Never blocks canvas interaction: root is pointer-events-none; the store `dragging`
 * flag dims it to 0.3 while the user manipulates the graph.
 */

type Stats = { notes: number; links: number; folders: number } | null;

export default function BrainHud({
  stats,
  folders,
  reducedMotion,
}: {
  stats: Stats;
  folders: string[];
  reducedMotion: boolean;
}) {
  const phase = usePresentation((s) => s.phase);
  const litCount = usePresentation((s) => s.litCount);
  const recallTotal = usePresentation((s) => s.recallTotal);
  const dragging = usePresentation((s) => s.dragging);

  const legend = useMemo(
    () => folders.filter((f) => f && f !== "(root)").slice(0, 9),
    [folders]
  );
  const extra = Math.max(0, folders.filter((f) => f && f !== "(root)").length - legend.length);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 transition-opacity duration-150"
      style={{ opacity: dragging ? 0.3 : 1 }}
    >
      {/* ── Top-left identity ── */}
      <div className="glass pointer-events-auto absolute left-4 top-4 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${reducedMotion ? "" : "dot-breathe"}`}
            style={{ background: "#a78bfa", boxShadow: "0 0 8px #a78bfa" }}
            aria-hidden
          />
          <span className="text-[13px] font-medium tracking-tight text-zinc-100">
            AI Danny <span className="text-zinc-500">· Second Brain</span>
          </span>
        </div>
        {stats && (
          <div className="mt-1 font-mono text-[11px] text-zinc-400 tabular-nums">
            <NumberFlow value={stats.notes} /> notes
            <span className="text-zinc-600"> · </span>
            <NumberFlow value={stats.links} /> links
          </div>
        )}
      </div>

      {/* ── Top-center status pill (self-narrating recall) ── */}
      <div className="absolute left-1/2 top-4 -translate-x-1/2" aria-live="polite" aria-atomic="true">
        <div className="glass px-3 py-1.5">
          <div className="flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.12em]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={phase}
                initial={reducedMotion ? false : { opacity: 0, y: -3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 3 }}
                transition={{ duration: 0.18 }}
                className="flex items-center gap-1.5"
              >
                {phase === "idle" && (
                  <span className="text-teal-400/70">● idle</span>
                )}
                {phase === "thinking" && (
                  <span className="flex items-center gap-1 text-accent-200">
                    <span>◌ thinking</span>
                    <Dots reduced={reducedMotion} />
                  </span>
                )}
                {phase === "recalling" && (
                  <span className="flex items-center gap-1 text-accent-300">
                    <span>◍ recalling</span>
                    <Dots reduced={reducedMotion} />
                  </span>
                )}
                {phase === "recalled" && (
                  <span className="text-accent-300">
                    ✓ {recallTotal} note{recallTotal === 1 ? "" : "s"} recalled
                  </span>
                )}
              </motion.span>
            </AnimatePresence>
            {(phase === "recalling" || phase === "recalled") && (
              <span className="flex items-center gap-1 border-l border-white/10 pl-2.5 text-zinc-400">
                lit <NumberFlow value={litCount} className="text-zinc-100" />
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom-right folder legend (colour key) ── */}
      {legend.length > 0 && (
        <div className="glass pointer-events-auto absolute bottom-5 right-4 max-w-[200px] px-3 py-2.5">
          <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-500">
            clusters
          </div>
          <ul className="space-y-1">
            {legend.map((f) => {
              const group = folders.indexOf(f);
              return (
                <li key={f} className="flex items-center gap-2">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ background: paletteHex(group), boxShadow: `0 0 6px ${paletteHex(group)}` }}
                    aria-hidden
                  />
                  <span className="truncate font-mono text-[10px] text-zinc-300">{f}</span>
                </li>
              );
            })}
            {extra > 0 && (
              <li className="pl-4 font-mono text-[10px] text-zinc-500">+{extra} more</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function Dots({ reduced }: { reduced: boolean }) {
  if (reduced) return <span>…</span>;
  return (
    <span className="inline-flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="inline-block h-1 w-1 rounded-full bg-accent-300"
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}
