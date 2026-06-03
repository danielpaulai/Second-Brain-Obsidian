"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { usePresentation } from "@/lib/presentation-store";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/utils";
import { Blocks, parseBlocks } from "./blocks/Blocks";

/**
 * Stage final answer (NO TTS — silent, on-screen). Two shapes, chosen by the content itself:
 *  • a SHORT, plain reply lands as the big AI-Danny gradient text (auto-sized), like the greeting;
 *  • a RICHER reply (a call recap, a note unpacked, any multi-part answer) streams in as reusable
 *    AI-populated UI blocks (callouts, key-points, action items, stats, quotes, chips) — the SAME
 *    block set the LinkedIn report uses. The model decides which blocks to use; this just renders
 *    whatever it sent. `answer` is raw markdown with inline block tokens.
 */
const EASE = [0.16, 1, 0.3, 1] as const;

/** Does the answer want the rich block layout? (block tokens, markdown structure, or just long.) */
function isStructured(t: string): boolean {
  return /\[\[\w/.test(t) || /(^|\n)\s*(#{1,6}\s|[-*]\s|\d+\.\s)/.test(t) || /\*\*[^*]+\*\*/.test(t) || t.length > 220;
}

/** Scale the big-text type down as a short answer gets longer so it always fits the panel. */
function sizeClass(len: number): string {
  if (len <= 90) return "text-[3rem] leading-[1.18]";
  if (len <= 170) return "text-[2.3rem] leading-[1.24]";
  return "text-[1.8rem] leading-[1.32]";
}

/** Typewriter that returns how many chars to show. */
function useTypewriter(text: string, charsPerTick: number) {
  const [n, setN] = useState(0);
  const ref = useRef(0);
  useEffect(() => {
    ref.current = 0;
    setN(0);
    const id = setInterval(() => {
      ref.current += charsPerTick;
      setN(ref.current);
      if (ref.current >= text.length) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [text, charsPerTick]);
  return Math.min(n, text.length);
}

export default function StageAnswer() {
  const raw = usePresentation((s) => (s.mode === "stage" ? s.answer : ""));
  return (
    <AnimatePresence>
      {raw && (isStructured(raw) ? <Document key="doc" raw={raw} /> : <BigText key="big" raw={raw} />)}
    </AnimatePresence>
  );
}

/* ---------- Short, plain reply — the signature big gradient text ---------- */

function BigText({ raw }: { raw: string }) {
  const n = useTypewriter(raw, 3);
  const shown = raw.slice(0, n);
  const done = n >= raw.length;
  useEffect(() => { sounds.notify(); }, [raw]); // response started generating in the UI
  const finishedRef = useRef(false);
  useEffect(() => { finishedRef.current = false; }, [raw]);
  useEffect(() => {
    if (done && !finishedRef.current) { finishedRef.current = true; sounds.notify(); } // finished
  }, [done]);
  return (
    <div className="pointer-events-none absolute inset-y-0 right-[6.5%] z-20 flex w-[42%] max-w-[620px] items-center">
      <motion.div
        initial={{ opacity: 0, x: 44 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 44 }}
        transition={{ duration: 0.7, ease: EASE }}
        className="w-full"
      >
        <p className={cn("relative whitespace-pre-line font-light tracking-[-0.01em]", sizeClass(raw.length))}>
          <span className="invisible">{raw}</span>
          <span className="absolute inset-0 bg-gradient-to-br from-white via-cyan-50 to-cyan-200/80 bg-clip-text text-transparent">
            {shown}
            {!done && (
              <motion.span
                aria-hidden
                className="ml-[3px] inline-block h-[0.9em] w-[3px] translate-y-[0.12em] rounded-full bg-cyan-300/90"
                animate={{ opacity: [1, 1, 0, 0] }}
                transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
              />
            )}
          </span>
        </p>
      </motion.div>
    </div>
  );
}

/** Base font-size (px) for a BARE prose answer — smaller answers render BIGGER so they fill
 *  the right panel instead of floating tiny. (proseMd is em-based, so this scales everything.) */
function bareFontPx(len: number): number {
  if (len <= 110) return 27;
  if (len <= 220) return 23;
  if (len <= 380) return 19;
  if (len <= 600) return 16;
  return 14.5;
}

/* ---------- Richer reply — reusable AI blocks in a centered, pre-sized panel ----------
   Vertically centered, pre-sized to the FULL answer: an invisible full render reserves the
   height so the block is centered from the first frame and never drifts while it streams; the
   visible streamed copy is overlaid on top. If the answer is taller than the panel it scrolls.
   When the answer is just prose (no rich blocks), the font scales UP for short replies so the
   panel is well used; rich-block answers stay at the standard size (their cards self-size). */
function Document({ raw }: { raw: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const blocks = useMemo(() => parseBlocks(raw), [raw]);
  useEffect(() => { sounds.notify(); }, [raw]); // response started generating in the UI
  const bare = useMemo(() => blocks.length > 0 && !blocks.some((b) => b.type !== "text"), [blocks]);
  const fontSize = bare ? bareFontPx(raw.length) : 14;

  return (
    <div className="pointer-events-none absolute inset-y-0 right-[5.5%] z-20 flex w-[44%] max-w-[640px] items-center">
      <motion.div
        initial={{ opacity: 0, x: 36 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 36 }}
        transition={{ duration: 0.6, ease: EASE }}
        className="w-full"
      >
        <div
          ref={scrollRef}
          data-lenis-prevent
          className="pointer-events-auto max-h-[84vh] overflow-y-auto overscroll-contain pr-3 [scrollbar-color:rgba(255,255,255,0.15)_transparent] [scrollbar-width:thin]"
        >
          <div className="relative pb-2" style={{ fontSize }}>
            {/* reserve: full answer, invisible — locks the height for centering */}
            <div aria-hidden className="invisible">
              <Blocks blocks={blocks} />
            </div>
            {/* visible streamed copy, overlaid */}
            <div className="absolute inset-0">
              <Blocks blocks={blocks} stream onComplete={() => sounds.notify()} scrollRef={scrollRef} />
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
