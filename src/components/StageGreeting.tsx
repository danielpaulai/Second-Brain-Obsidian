"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { usePresentation } from "@/lib/presentation-store";
import { useVoice } from "@/lib/voice-store";
import { playClip } from "@/lib/tts";

/**
 * Stage greeting — the first beat of the demo. Once the wake morph finishes and the
 * network has glided left (`expanded`), Danny's opening line types itself in on the
 * right, in lock-step with a PRE-GENERATED voice clip (/audio/greeting.mp3) so the audio
 * starts exactly with the text. Smooth, glassy, deliberately unhurried.
 */
const GREETING = "Hi, I'm AI Danny. What can I help you with?";
const EASE = [0.16, 1, 0.3, 1] as const;

export default function StageGreeting() {
  const show = usePresentation(
    (s) => s.mode === "stage" && s.woken && s.expanded && !s.querying && !s.answer
  );
  return (
    <div className="pointer-events-none absolute inset-y-0 right-[6.5%] z-20 flex w-[42%] max-w-[600px] items-center">
      <AnimatePresence>{show && <GreetingCard key="greeting" />}</AnimatePresence>
    </div>
  );
}

function GreetingCard() {
  const [count, setCount] = useState(0);
  const spoke = useRef(false);

  useEffect(() => {
    // Play the pre-generated clip once, the instant it begins to type (no fetch delay).
    if (!spoke.current) {
      spoke.current = true;
      useVoice.getState().setPhase("speaking");
      playClip("/audio/greeting.mp3", () => useVoice.getState().setPhase("idle"));
    }
    // Typewriter — gentle 40ms/char cadence.
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setCount(i);
      if (i >= GREETING.length) clearInterval(id);
    }, 40);
    return () => clearInterval(id);
  }, []);

  const typed = GREETING.slice(0, count);
  const done = count >= GREETING.length;

  return (
    <motion.div
      initial={{ opacity: 0, x: 48 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 48 }}
      transition={{ duration: 0.9, ease: EASE }}
      className="w-full"
    >
      {/* Headline — full text reserves the layout (invisible), typed text overlays it
          so nothing reflows as characters land. */}
      <p className="relative text-[3.1rem] font-light leading-[1.18] tracking-[-0.01em]">
        <span className="invisible">{GREETING}</span>
        <span className="absolute inset-0 bg-gradient-to-br from-white via-cyan-50 to-cyan-200/80 bg-clip-text text-transparent">
          {typed}
          <motion.span
            aria-hidden
            className="ml-[3px] inline-block h-[0.92em] w-[3px] translate-y-[0.14em] rounded-full bg-cyan-300/90"
            animate={{ opacity: done ? [1, 1, 0, 0] : 1 }}
            transition={
              done
                ? { duration: 1, repeat: Infinity, ease: "linear" }
                : { duration: 0.1 }
            }
          />
        </span>
      </p>
    </motion.div>
  );
}
