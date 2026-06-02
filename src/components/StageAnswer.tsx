"use client";

import { motion, AnimatePresence } from "motion/react";
import { usePresentation } from "@/lib/presentation-store";
import { cn } from "@/lib/utils";

/**
 * Stage final answer — once the brain has finished retrieving, the answer settles in as
 * the big AI-Danny text on the right (same gradient/voice as the greeting), auto-sized so
 * it sits beautifully whatever its length. `answer` is the pre-cleaned `display` string from
 * the voice-format step (no markdown / em-dashes / slashes), so it's rendered as-is with
 * line breaks preserved. The matching voice is played by the reveal gate.
 */
const EASE = [0.16, 1, 0.3, 1] as const;

/** Scale the type down as the answer gets longer so it always fits the right panel. */
function sizeClass(len: number): string {
  if (len <= 90) return "text-[3rem] leading-[1.18]";
  if (len <= 170) return "text-[2.3rem] leading-[1.24]";
  if (len <= 300) return "text-[1.8rem] leading-[1.32]";
  if (len <= 480) return "text-[1.45rem] leading-[1.45]";
  return "text-[1.2rem] leading-[1.6]";
}

export default function StageAnswer() {
  const raw = usePresentation((s) => (s.mode === "stage" ? s.answer : ""));
  // Full-height flex wrapper vertically centers the block (framer's x-transform would
  // otherwise override a Tailwind -translate-y-1/2, leaving the first line at center).
  return (
    <div className="pointer-events-none absolute inset-y-0 right-[6.5%] z-20 flex w-[42%] max-w-[620px] items-center">
      <AnimatePresence>{raw && <AnswerBlock key="answer" raw={raw} />}</AnimatePresence>
    </div>
  );
}

function AnswerBlock({ raw }: { raw: string }) {
  const text = raw; // already clean `display` text (line breaks preserved)
  // NB: speech is pre-fetched and played by the reveal gate (StageReadthrough / StageLinkedIn)
  // so the text appears exactly when the audio is ready — see prepareSpeech().
  return (
    <motion.div
      initial={{ opacity: 0, x: 44 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 44 }}
      transition={{ duration: 0.85, ease: EASE }}
      className="max-h-[80vh] w-full overflow-hidden"
    >
      <motion.p
        initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ delay: 0.15, duration: 0.9, ease: EASE }}
        className={cn(
          "whitespace-pre-line bg-gradient-to-br from-white via-cyan-50 to-cyan-200/80 bg-clip-text font-light tracking-[-0.01em] text-transparent",
          sizeClass(text.length)
        )}
      >
        {text}
      </motion.p>
    </motion.div>
  );
}
