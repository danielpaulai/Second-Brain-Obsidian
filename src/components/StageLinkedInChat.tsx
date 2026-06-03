"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, LinkedinLogo, ChartBar } from "@phosphor-icons/react";
import { usePresentation } from "@/lib/presentation-store";
import { sounds } from "@/lib/sounds";
import { parseLinkedInScope } from "@/lib/linkedin-scope";
import { cn } from "@/lib/utils";
import LinkedInReport, { type LinkedInReportData } from "./LinkedInReport";

/**
 * Stage LinkedIn "scrape & analyse" — a ChatGPT/Claude-style response (NO TTS, no header/avatar,
 * no user bubble). It opens with a LARGE line of text (greeting-size), then stacks clean tool-call
 * cards beneath it: a mock 70s `scrape_linkedin` (LinkedIn-logo card, percentage) → an
 * `analyze_engagement` card whose "running" IS the genuine thinking wait (the gpt-5.5 high-reasoning
 * report is fetched here). Then the report STREAMS in (typewriter text, charts pop as reached).
 */
const SCRAPE_MS = 70_000;
const MIN_ANALYZE_MS = 7_000;
const EASE = [0.16, 1, 0.3, 1] as const;
const INTRO = "Let me pull up your LinkedIn and see what's actually been landing.";

const ORDER = ["intro", "scrape", "analyze", "report"] as const;
type Phase = (typeof ORDER)[number];
const at = (p: Phase, min: Phase) => ORDER.indexOf(p) >= ORDER.indexOf(min);

export default function StageLinkedInChat() {
  const active = usePresentation((s) => s.mode === "stage" && s.linkedinActive);
  // keyed by run-id so asking for a new scope ("now do last week") fully remounts → re-runs the flow.
  const runId = usePresentation((s) => s.linkedinRunId);
  return (
    <AnimatePresence mode="wait">{active && <Chat key={runId} runId={runId} />}</AnimatePresence>
  );
}

function Chat({ runId }: { runId: number }) {
  const query =
    usePresentation((s) => s.linkedinQuery) ||
    "Scrape my LinkedIn and tell me what's working and what to post next.";
  const scope = useMemo(() => parseLinkedInScope(query), [query]);
  // a re-run (the posts are already pulled) skips the long scrape and re-cuts the new window fast.
  const isRerun = runId > 1;
  const intro = isRerun ? `On it — re-cutting that for ${scope.label}.` : INTRO;
  const scrapeMs = isRerun ? 9_000 : SCRAPE_MS;
  const [phase, setPhase] = useState<Phase>("intro");
  // Phase-transition cue: scrape, analyze, and the report appearing each get the notification tick.
  useEffect(() => {
    if (phase === "scrape" || phase === "analyze" || phase === "report") sounds.notify();
  }, [phase]);
  const [progress, setProgress] = useState(0); // 0..1
  const [report, setReport] = useState<LinkedInReportData | null>(null);
  const reportRef = useRef<LinkedInReportData | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // intro headline plays → scrape
  useEffect(() => {
    if (phase !== "intro") return;
    const t = setTimeout(() => setPhase("scrape"), intro.length * 28 + 1100);
    return () => clearTimeout(t);
  }, [phase, intro]);

  // scrape (percentage) → analyze
  useEffect(() => {
    if (phase !== "scrape") return;
    const t0 = performance.now();
    const id = setInterval(() => {
      const p = Math.min(1, (performance.now() - t0) / scrapeMs);
      setProgress(p);
      if (p >= 1) {
        clearInterval(id);
        setPhase("analyze");
      }
    }, 140);
    return () => clearInterval(id);
  }, [phase, scrapeMs]);

  // analyze = real thinking: fetch the high-reasoning report here → report
  useEffect(() => {
    if (phase !== "analyze") return;
    const t0 = performance.now();
    let cancelled = false;
    fetch("/api/linkedin-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j) reportRef.current = j as LinkedInReportData;
      })
      .catch(() => {});
    const id = setInterval(() => {
      if (reportRef.current && performance.now() - t0 >= MIN_ANALYZE_MS) {
        clearInterval(id);
        setReport(reportRef.current);
        setPhase("report");
      }
    }, 250);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [phase, query]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [phase]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="pointer-events-none absolute inset-0 z-20"
    >
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(to left, #02040a 0%, #02040a 48%, rgba(2,4,10,0) 80%)" }}
      />

      <motion.div
        initial={{ x: 36, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: EASE }}
        className="pointer-events-auto absolute bottom-[6%] right-[4%] top-[6%] flex w-[46%] max-w-[660px] flex-col"
      >
        <div
          ref={scrollRef}
          data-lenis-prevent
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2.5 [scrollbar-color:rgba(255,255,255,0.15)_transparent] [scrollbar-width:thin]"
        >
          <div className="space-y-5 pb-10">
            {/* Big opening line */}
            <Headline text={intro} done={at(phase, "scrape")} />

            {/* Tool calls */}
            <div className="space-y-2.5">
              {at(phase, "scrape") && (
                <ToolCard
                  icon={
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#0a66c2]">
                      <LinkedinLogo size={18} weight="fill" className="text-white" />
                    </span>
                  }
                  name="scrape_linkedin"
                  running={phase === "scrape"}
                  detail={
                    phase === "scrape"
                      ? `${isRerun ? "Re-checking your posts" : "Pulling your posts"} · ${Math.round(progress * 100)}%`
                      : isRerun
                        ? "Working from your post history"
                        : "Pulled your posts · 9 months of history"
                  }
                  progress={phase === "scrape" ? progress : undefined}
                />
              )}

              {at(phase, "analyze") && (
                <ToolCard
                  icon={
                    <span className="grid h-8 w-8 place-items-center rounded-lg border border-cyan-300/25 bg-cyan-300/10">
                      <ChartBar size={16} weight="bold" className="text-cyan-200" />
                    </span>
                  }
                  name="analyze_engagement"
                  running={phase === "analyze"}
                  detail={
                    phase === "analyze"
                      ? `Analysing ${scope.label} · finding what works, what doesn't…`
                      : `Trends, top posts, reactions & cadence across ${scope.label}`
                  }
                  shimmer={phase === "analyze"}
                />
              )}
            </div>

            {/* Streamed report */}
            {phase === "report" && report && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }} className="pt-1">
                <LinkedInReport data={report} stream scrollRef={scrollRef} />
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ---------- Big opening line (greeting-size) ---------- */

function Headline({ text, done }: { text: string; done: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (done) {
      setN(text.length);
      return;
    }
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setN(i);
      if (i >= text.length) clearInterval(id);
    }, 28);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);
  const shown = done ? text : text.slice(0, n);
  return (
    <p className="relative text-[2.3rem] font-light leading-[1.18] tracking-[-0.01em]">
      <span className="invisible">{text}</span>
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
  );
}

/* ---------- Tool-call card ---------- */

function ToolCard({
  icon,
  name,
  running,
  detail,
  progress,
  shimmer,
}: {
  icon: ReactNode;
  name: string;
  running: boolean;
  detail: string;
  progress?: number;
  shimmer?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: EASE }}
      className={cn(
        "rounded-2xl border p-4 backdrop-blur-xl shadow-[0_8px_32px_-16px_rgba(0,0,0,0.7)]",
        running ? "border-cyan-300/20 bg-cyan-300/[0.04]" : "border-white/10 bg-white/[0.035]"
      )}
    >
      <div className="flex items-center gap-3">
        {icon}
        <span className="font-mono text-[13px] text-white/85">{name}</span>
        <span className="ml-auto">{running ? <RunningBadge /> : <DoneBadge />}</span>
      </div>
      <div className="mt-2.5 truncate pl-11 text-[12.5px] text-white/55">{detail}</div>
      {progress !== undefined && (
        <div className="ml-11 mt-3 h-1 overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-sky-300 transition-[width] duration-150 ease-linear"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}
      {shimmer && (
        <div className="ml-11 mt-3 h-1 overflow-hidden rounded-full bg-white/[0.06]">
          <motion.div
            className="h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent"
            animate={{ x: ["-120%", "320%"] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      )}
    </motion.div>
  );
}

function RunningBadge() {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-200/90">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inset-0 animate-ping rounded-full bg-cyan-300/70" />
        <span className="relative h-1.5 w-1.5 rounded-full bg-cyan-300" />
      </span>
      running
    </span>
  );
}

function DoneBadge() {
  return (
    <span className="flex items-center gap-1 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-200/90">
      <Check size={10} weight="bold" /> done
    </span>
  );
}
