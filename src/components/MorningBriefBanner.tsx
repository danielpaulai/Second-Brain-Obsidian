"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sun, ArrowsClockwise, CaretDown, CaretUp, X, ChartBar, PenNib, Lightbulb } from "@phosphor-icons/react";
import { Streamdown } from "streamdown";

type Brief = {
  id: string;
  kind: "project-pulse" | "content-brief" | "intelligence-brief";
  title: string;
  body: string;
  created_at: string;
};

const TABS: {
  kind: Brief["kind"];
  label: string;
  Icon: React.ElementType;
}[] = [
  { kind: "project-pulse", label: "Pulse", Icon: ChartBar },
  { kind: "content-brief", label: "Content", Icon: PenNib },
  { kind: "intelligence-brief", label: "Intel", Icon: Lightbulb },
];

/**
 * 3-tab morning brief banner. Owner-only. Tabs: Pulse | Content | Intel.
 * Auto-fetches latest brief for each kind on mount. Regen button re-runs all 3.
 */
export default function MorningBriefBanner() {
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [activeKind, setActiveKind] = useState<Brief["kind"]>("project-pulse");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/briefings/latest");
        const j = await r.json();
        if (!cancelled && j.ok && j.briefs?.length) {
          setBriefs(j.briefs);
        }
      } catch {
        // fail silent
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!briefs.length || dismissed) return null;

  const activeBrief = briefs.find((b) => b.kind === activeKind) ?? briefs[0];
  const todayKey = new Date().toISOString().slice(0, 10);
  const briefDay = new Date(activeBrief.created_at).toISOString().slice(0, 10);
  const isStale = briefDay !== todayKey;

  async function regenerate() {
    setLoading(true);
    try {
      const r = await fetch("/api/briefings/latest", { method: "POST" });
      const j = await r.json();
      if (j.ok && j.briefs?.length) {
        setBriefs(j.briefs);
        setExpanded(true);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25 }}
        className="relative w-full max-w-3xl mx-auto mb-4"
      >
        <div className="rounded-xl border border-border/50 bg-popover/70 backdrop-blur-xl shadow-2xl shadow-black/40">
          {/* Header strip */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
            <div className="flex items-center gap-2 text-sm">
              <Sun
                size={16}
                weight="duotone"
                className={isStale ? "text-muted-foreground" : "text-amber-400"}
              />
              <span className="font-medium text-foreground">
                {isStale ? "Yesterday's brief" : "Morning brief"}
              </span>
              <span className="text-muted-foreground text-xs">· {activeBrief.title}</span>
            </div>
            <div className="flex items-center gap-1">
              {isStale && (
                <button
                  onClick={regenerate}
                  disabled={loading}
                  className="text-xs px-2 py-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 transition-colors disabled:opacity-50 inline-flex items-center gap-1"
                  title="Generate today's brief"
                >
                  <ArrowsClockwise size={12} weight="bold" className={loading ? "animate-spin" : ""} />
                  {loading ? "Generating…" : "Generate today"}
                </button>
              )}
              <button
                onClick={() => setExpanded((v) => !v)}
                className="text-muted-foreground hover:text-foreground p-1 rounded"
                title={expanded ? "Collapse" : "Expand"}
              >
                {expanded ? <CaretUp size={14} weight="bold" /> : <CaretDown size={14} weight="bold" />}
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="text-muted-foreground hover:text-foreground p-1 rounded"
                title="Dismiss"
              >
                <X size={14} weight="bold" />
              </button>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex border-b border-border/30 px-2 pt-1">
            {TABS.map(({ kind, label, Icon }) => {
              const hasBrief = briefs.some((b) => b.kind === kind);
              const isActive = activeKind === kind;
              return (
                <button
                  key={kind}
                  onClick={() => { setActiveKind(kind); setExpanded(true); }}
                  disabled={!hasBrief}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors border-b-2 -mb-px
                    ${isActive
                      ? "text-foreground border-primary bg-primary/5"
                      : "text-muted-foreground border-transparent hover:text-foreground hover:border-border/60"
                    }
                    disabled:opacity-30 disabled:cursor-not-allowed`}
                >
                  <Icon size={12} weight={isActive ? "duotone" : "regular"} />
                  {label}
                </button>
              );
            })}
          </div>

          {/* Body */}
          <AnimatePresence initial={false} mode="wait">
            {expanded ? (
              <motion.div
                key={`body-${activeKind}`}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <div className="px-4 py-3 text-sm text-foreground/90 prose prose-sm prose-invert max-w-none">
                  <Streamdown>{activeBrief.body}</Streamdown>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={`preview-${activeKind}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-4 py-2 text-xs text-muted-foreground truncate cursor-pointer"
                onClick={() => setExpanded(true)}
              >
                {firstMeaningfulLine(activeBrief.body)}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function firstMeaningfulLine(body: string): string {
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    return t.replace(/^[\*_]+|[\*_]+$/g, "").slice(0, 140);
  }
function firstMeaningfulLine(body: string): string {
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    return t.replace(/^[\*_]+|[\*_]+$/g, "").slice(0, 140);
  }
  return body.slice(0, 140);
}
