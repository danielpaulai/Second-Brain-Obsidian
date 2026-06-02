"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CircleNotch } from "@phosphor-icons/react";
import { usePresentation } from "@/lib/presentation-store";
import { useVoice } from "@/lib/voice-store";
import { prepareSpeech, playClip } from "@/lib/tts";
import { formatForStage } from "@/lib/stage-format";
import { LINKEDIN_POSTS } from "@/lib/linkedin-data";
import { cn } from "@/lib/utils";
import LinkedInCard from "./LinkedInCard";

/**
 * Stage LinkedIn "scrape" theater. When Daniel asks to check his LinkedIn / what to post
 * next, this plays the gimmick BEFORE the answer lands:
 *   1. intro — Danny types + speaks a line ("let me look at what you've been posting…"),
 *   2. a 10s loader ("connecting"),
 *   3. his last 10 posts slide through, one at a time (centered under the logo),
 *   4. outro — "I've got everything I need, let's write your next post",
 *   5. it "writes", and once the sub-agent's drafted post + its voice are ready it's revealed.
 * The intro/outro lines use PRE-GENERATED clips so audio + text start together.
 */
const LOADER_MS = 10000;
const CARD_MS = 2600;
const EASE = [0.16, 1, 0.3, 1] as const;
const CARD_AREA_H = 380;

const INTRO_TEXT =
  "Before I suggest anything, let me pull up your recent posts and see what's actually been landing with your audience.";
const OUTRO_TEXT = "Perfect. I've got everything I need. Let's write your next post.";

export default function StageLinkedIn() {
  const active = usePresentation((s) => s.mode === "stage" && s.linkedinActive);
  return <AnimatePresence>{active && <Theater key="linkedin" />}</AnimatePresence>;
}

type Phase = "intro" | "loader" | "scrape" | "outro" | "thinking";

function Theater() {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("intro");

  // 10s loader → scrape.
  useEffect(() => {
    if (phase !== "loader") return;
    const t = setTimeout(() => setPhase("scrape"), LOADER_MS);
    return () => clearTimeout(t);
  }, [phase]);

  // Card slideshow — one post per beat; after the last, the outro line.
  useEffect(() => {
    if (phase !== "scrape") return;
    const id = setInterval(() => {
      setIdx((i) => {
        if (i >= LINKEDIN_POSTS.length - 1) {
          clearInterval(id);
          setTimeout(() => setPhase("outro"), CARD_MS);
          return i;
        }
        return i + 1;
      });
    }, CARD_MS);
    return () => clearInterval(id);
  }, [phase]);

  // Thinking → keep "Writing your post" up until the draft AND its voice are ready, then
  // reveal + speak together. Safety: bail after ~40s.
  useEffect(() => {
    if (phase !== "thinking") return;
    let waited = 0;
    let started = false;
    const id = setInterval(() => {
      if (started) return;
      const s = usePresentation.getState();
      waited += 0.35;
      if (s.pendingAnswer != null) {
        started = true;
        clearInterval(id);
        void revealLinkedIn(s.pendingAnswer);
      } else if (waited > 40) {
        started = true;
        clearInterval(id);
        usePresentation.getState().commitAnswer();
        usePresentation.getState().endLinkedIn();
        useVoice.getState().setPhase("idle");
      }
    }, 350);
    return () => clearInterval(id);
  }, [phase]);

  const showLine = phase === "intro" || phase === "outro";
  const showColumn = phase === "loader" || phase === "scrape" || phase === "thinking";
  const status =
    phase === "loader" ? "Connecting to LinkedIn" : phase === "scrape" ? "Scraping your posts" : "Writing your post";
  const pulsing = phase === "loader" || phase === "scrape";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="pointer-events-none absolute inset-0 z-20"
    >
      {/* Intro / outro spoken-typed line — right-center, like the greeting. */}
      {showLine && (
        <div className="absolute inset-y-0 right-[6.5%] flex w-[42%] max-w-[600px] items-center">
          <StageLine
            key={phase}
            text={phase === "intro" ? INTRO_TEXT : OUTRO_TEXT}
            audioSrc={phase === "intro" ? "/audio/li-intro.mp3" : "/audio/li-outro.mp3"}
            onDone={() => setPhase(phase === "intro" ? "loader" : "thinking")}
          />
        </div>
      )}

      {/* Logo column: loader / cards / writing — everything centered under the logo. */}
      {showColumn && (
        <div className="absolute inset-y-0 right-[5%] flex w-[420px] flex-col items-center justify-center">
          <div className="flex flex-col items-center">
            <motion.img
              src="/linkedin-logo.png"
              alt="LinkedIn"
              className="h-20 w-auto object-contain drop-shadow-[0_0_46px_rgba(10,102,194,0.55)]"
              animate={pulsing ? { scale: [1, 1.1, 1], opacity: [0.92, 1, 0.92] } : { scale: 1, opacity: 1 }}
              transition={
                pulsing ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.4 }
              }
            />
            <div className="mt-5 flex items-center gap-2">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-sky-300/70" />
                <span className="relative h-1.5 w-1.5 rounded-full bg-sky-300" />
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-sky-300/80">{status}</span>
            </div>
          </div>

          <div className="mt-8 flex w-full items-center justify-center" style={{ height: CARD_AREA_H }}>
            {phase === "loader" && <Loader />}

            {phase === "scrape" && (
              <div className="w-[380px]">
                <AnimatePresence mode="popLayout">
                  <motion.div
                    key={idx}
                    initial={{ x: 200, opacity: 0, rotate: 2 }}
                    animate={{ x: 0, opacity: 1, rotate: 0 }}
                    exit={{ x: -300, opacity: 0, rotate: -3 }}
                    transition={{ duration: 0.7, ease: EASE }}
                  >
                    <LinkedInCard post={LINKEDIN_POSTS[idx]} />
                  </motion.div>
                </AnimatePresence>
                <div className="mt-3 text-center font-mono text-[10px] tracking-[0.22em] text-white/40">
                  {idx + 1} / {LINKEDIN_POSTS.length}
                </div>
              </div>
            )}

            {phase === "thinking" && (
              <CircleNotch size={34} weight="bold" className="animate-spin text-sky-300/70" />
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

/* ---------- A typed line spoken via a pre-generated clip ---------- */

function lineSize(len: number): string {
  if (len <= 70) return "text-[2.6rem] leading-[1.22]";
  if (len <= 130) return "text-[2rem] leading-[1.3]";
  return "text-[1.6rem] leading-[1.4]";
}

function StageLine({ text, audioSrc, onDone }: { text: string; audioSrc: string; onDone: () => void }) {
  const [n, setN] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    // Typewriter — OUTSIDE the one-shot guard so it re-runs on StrictMode's double-invoke
    // (the audio/advance below stays one-shot). This is why it types reliably.
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setN(i);
      if (i >= text.length) clearInterval(id);
    }, 38);

    // Audio + phase-advance — fire exactly once.
    let clearFallback = () => {};
    if (!started.current) {
      started.current = true;
      let advanced = false;
      const finish = () => {
        if (advanced) return;
        advanced = true;
        useVoice.getState().setPhase("idle");
        onDone();
      };
      useVoice.getState().setPhase("speaking");
      playClip(audioSrc, finish); // pre-generated → audio starts with the text
      const fallback = setTimeout(finish, Math.max(7000, text.length * 45 + 3000)); // if audio fails
      clearFallback = () => clearTimeout(fallback);
    }

    return () => {
      clearInterval(id);
      clearFallback();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const typed = text.slice(0, n);
  const done = n >= text.length;
  return (
    <motion.div
      initial={{ opacity: 0, x: 44 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 44 }}
      transition={{ duration: 0.7, ease: EASE }}
      className="w-full"
    >
      <p className={cn("relative font-light tracking-[-0.01em]", lineSize(text.length))}>
        <span className="invisible">{text}</span>
        <span className="absolute inset-0 bg-gradient-to-br from-white via-cyan-50 to-cyan-200/80 bg-clip-text text-transparent">
          {typed}
          <motion.span
            aria-hidden
            className="ml-[3px] inline-block h-[0.92em] w-[3px] translate-y-[0.14em] rounded-full bg-cyan-300/90"
            animate={{ opacity: done ? [1, 1, 0, 0] : 1 }}
            transition={done ? { duration: 1, repeat: Infinity, ease: "linear" } : { duration: 0.1 }}
          />
        </span>
      </p>
    </motion.div>
  );
}

/* ---------- 10s loader ---------- */

const LOADER_STEPS = ["Authenticating", "Opening your feed", "Pulling your last 10 posts"];

function Loader() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(
      () => setStep((s) => Math.min(s + 1, LOADER_STEPS.length - 1)),
      LOADER_MS / LOADER_STEPS.length
    );
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex flex-col items-center gap-6">
      <CircleNotch size={36} weight="bold" className="animate-spin text-sky-300/80" />
      <div className="h-1 w-56 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-sky-400 to-sky-300"
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{ duration: LOADER_MS / 1000, ease: "linear" }}
        />
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.3 }}
          className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/45"
        >
          {LOADER_STEPS[step]}…
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** Split into clean display + TTS voice (gpt → JSON), pre-fetch the voice, then reveal + speak together. */
async function revealLinkedIn(text: string) {
  const { display, voice } = await formatForStage(text);
  const play = await prepareSpeech(voice);
  usePresentation.getState().revealAnswer(display);
  usePresentation.getState().endLinkedIn();
  if (play) {
    useVoice.getState().setPhase("speaking");
    play(() => useVoice.getState().setPhase("idle"));
  } else {
    useVoice.getState().setPhase("idle");
  }
}
