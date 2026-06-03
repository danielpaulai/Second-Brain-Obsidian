"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CircleNotch, Check } from "@phosphor-icons/react";
import { usePresentation, type StageCard } from "@/lib/presentation-store";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/utils";

/**
 * Stage retrieval activity — while a question is being answered, the brain's tool calls
 * stream in as minimal glass cards ("Searching your vault", "Reading <note>") on the
 * right, one at a time. Conveys the heavy lifting happening behind the answer.
 */
const EASE = [0.16, 1, 0.3, 1] as const;

export default function StageActivity() {
  const show = usePresentation((s) => s.mode === "stage" && s.querying && !s.answer && !s.linkedinActive);
  const cards = usePresentation((s) => s.stageCards);

  // Newest few, newest last (cards stack downward).
  const visible = cards.slice(-5);

  return (
    <div className="pointer-events-none absolute inset-y-0 right-[6.5%] z-20 flex w-[40%] max-w-[560px] items-center">
    <AnimatePresence>
      {show && (
        <motion.div
          key="activity"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 40 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="w-full"
        >
          {/* Working indicator */}
          <div className="mb-5 flex items-center gap-2.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-cyan-300/70" />
              <span className="relative h-2 w-2 rounded-full bg-cyan-300" />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-cyan-200/70">
              Reading your second brain
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            <AnimatePresence initial={false} mode="popLayout">
              {visible.length === 0 ? (
                <ActivityCard
                  key="thinking"
                  card={{ id: "thinking", label: "Thinking", state: "running" }}
                  latest
                />
              ) : (
                visible.map((c, i) => (
                  <ActivityCard key={c.id} card={c} latest={i === visible.length - 1} />
                ))
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </div>
  );
}

function ActivityCard({ card, latest }: { card: StageCard; latest: boolean }) {
  const running = card.state === "running";
  // Subtle notification as each tool-call / read card appears.
  useEffect(() => { sounds.notify(); }, []);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 28, scale: 0.97 }}
      animate={{ opacity: running || latest ? 1 : 0.5, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 28, scale: 0.97, transition: { duration: 0.2 } }}
      transition={{ duration: 0.4, ease: EASE }}
      className={cn(
        "flex items-center gap-3 rounded-2xl border px-4 py-3 backdrop-blur-xl",
        "shadow-[0_4px_24px_-10px_rgba(0,0,0,0.7)]",
        running
          ? "border-cyan-300/25 bg-cyan-300/[0.06]"
          : "border-white/10 bg-white/[0.035]"
      )}
    >
      <span
        className={cn(
          "grid h-7 w-7 shrink-0 place-items-center rounded-full border",
          running ? "border-cyan-300/30 bg-cyan-300/10" : "border-emerald-300/25 bg-emerald-300/10"
        )}
      >
        {running ? (
          <CircleNotch size={14} weight="bold" className="animate-spin text-cyan-200" />
        ) : (
          <Check size={13} weight="bold" className="text-emerald-200" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium leading-tight text-white/90">{card.label}</div>
        {card.detail && (
          <div className="mt-0.5 truncate font-mono text-[11px] text-cyan-100/55">{card.detail}</div>
        )}
      </div>
    </motion.div>
  );
}
