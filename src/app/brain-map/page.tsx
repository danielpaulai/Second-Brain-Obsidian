"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Streamdown } from "streamdown";
import {
  Brain,
  CaretRight,
  CaretLeft,
  CheckCircle,
  Circle,
  MagnifyingGlass,
  Spinner,
  ArrowsClockwise,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

type Stats = {
  macros: number;
  total: number;
  distilled: number;
  scaffolded: number;
  pctComplete: number;
};

type Node = {
  slug: string;
  title: string;
  description: string;
  status: "scaffolded" | "distilled" | string;
  lastDistilled: string | null;
};

type Macro = {
  dir: string;
  title: string;
  description: string;
  count: number;
  nodes: Node[];
};

type SelectedNode = {
  macro: string;
  macroTitle: string;
  slug: string;
  title: string;
  description: string;
  status: string;
  lastDistilled: string | null;
  body: string;
  relPath: string;
};

export default function BrainMapPage() {
  const [tree, setTree] = useState<Macro[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selected, setSelected] = useState<SelectedNode | null>(null);
  const [query, setQuery] = useState("");
  const [loadingTree, setLoadingTree] = useState(true);
  const [loadingNode, setLoadingNode] = useState(false);
  const [openMacro, setOpenMacro] = useState<string | null>(null);

  async function refresh() {
    setLoadingTree(true);
    try {
      const r = await fetch("/api/knowledge");
      const j = await r.json();
      if (j.ok) {
        setTree(j.tree);
        setStats(j.stats);
        if (!openMacro && j.tree.length > 0) setOpenMacro(j.tree[0].dir);
      }
    } finally {
      setLoadingTree(false);
    }
  }

  useEffect(() => {
    refresh();
    // Auto-refresh every 8s while a distillation is in progress
    const id = setInterval(refresh, 8000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadNode(macro: string, slug: string) {
    setLoadingNode(true);
    try {
      const r = await fetch(`/api/knowledge/${macro}/${slug}`);
      const j = await r.json();
      if (j.ok) setSelected(j.node);
    } finally {
      setLoadingNode(false);
    }
  }

  const filtered = useMemo(() => {
    if (!query.trim()) return tree;
    const q = query.toLowerCase();
    return tree
      .map((m) => ({
        ...m,
        nodes: m.nodes.filter(
          (n) =>
            n.title.toLowerCase().includes(q) ||
            n.description.toLowerCase().includes(q) ||
            n.slug.toLowerCase().includes(q)
        ),
      }))
      .filter((m) => m.nodes.length > 0 || m.title.toLowerCase().includes(q));
  }, [tree, query]);

  return (
    <main className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Header */}
      <header className="relative flex items-center justify-between px-5 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="grid place-items-center w-9 h-9 rounded-lg bg-gradient-to-br from-accent-500/30 to-accent-500/5 border border-accent-500/30 shadow-[0_0_24px_-6px_rgba(167,139,250,0.5)]">
            <Brain size={20} weight="duotone" className="text-accent-300" />
          </div>
          <div>
            <div className="font-semibold tracking-tight">Brain Map</div>
            <div className="text-[11px] text-muted-foreground -mt-0.5">
              compressed taxonomy of Danny&apos;s thinking
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs">
          {stats && (
            <>
              <Stat label="macros" value={stats.macros} />
              <Stat label="categories" value={stats.total} />
              <Stat
                label="distilled"
                value={`${stats.distilled} / ${stats.total}`}
                accent={stats.pctComplete === 100}
              />
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-card/60">
                <div className="relative w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-accent-500 to-accent-300"
                    initial={{ width: 0 }}
                    animate={{ width: `${stats.pctComplete}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                  />
                </div>
                <span className="text-muted-foreground tabular-nums">
                  {stats.pctComplete}%
                </span>
              </div>
            </>
          )}
          <Link
            href="/"
            className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground transition border border-border rounded-md px-2.5 py-1.5"
          >
            ← Brain
          </Link>
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 grid grid-cols-[360px_1fr] min-h-0">
        {/* Left rail — tree */}
        <aside className="border-r border-border bg-ink-900/40 flex flex-col min-h-0">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <MagnifyingGlass
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter categories…"
                className="w-full bg-card/60 border border-border rounded-md pl-9 pr-3 py-2 text-sm outline-none focus:border-accent-400/50 placeholder:text-muted-foreground/60"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {loadingTree && tree.length === 0 ? (
              <div className="text-xs text-muted-foreground p-4 flex items-center gap-2">
                <Spinner size={12} className="animate-spin" /> loading taxonomy…
              </div>
            ) : (
              filtered.map((m) => (
                <MacroSection
                  key={m.dir}
                  macro={m}
                  open={openMacro === m.dir || !!query.trim()}
                  onToggle={() =>
                    setOpenMacro((c) => (c === m.dir ? null : m.dir))
                  }
                  selectedSlug={selected?.slug}
                  onPick={(slug) => loadNode(m.dir, slug)}
                />
              ))
            )}
          </div>
        </aside>

        {/* Right panel — selected content */}
        <section className="overflow-y-auto p-8 md:p-12">
          {!selected ? (
            <EmptyState />
          ) : (
            <AnimatePresence mode="wait">
              <motion.article
                key={`${selected.macro}-${selected.slug}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
                className="max-w-2xl mx-auto"
              >
                <div className="flex items-center gap-2 mb-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                  <span>{selected.macroTitle}</span>
                  <CaretRight size={10} />
                  <span className="font-mono text-accent-300/70">
                    {selected.slug}
                  </span>
                </div>
                <h1 className="text-3xl font-semibold tracking-tight mb-2">
                  {selected.title}
                </h1>
                <p className="text-sm text-muted-foreground mb-6">
                  {selected.description}
                </p>
                <StatusPill status={selected.status} ts={selected.lastDistilled} />

                {loadingNode ? (
                  <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
                    <Spinner size={14} className="animate-spin" />
                    loading distilled content…
                  </div>
                ) : selected.body ? (
                  <div className="prose prose-invert prose-sm max-w-none mt-8 prose-p:my-2 prose-headings:tracking-tight prose-code:text-accent-300 prose-strong:text-white prose-li:my-1">
                    <Streamdown>{selected.body}</Streamdown>
                  </div>
                ) : (
                  <div className="mt-8 rounded-xl border border-dashed border-border bg-card/40 p-6">
                    <div className="text-sm text-muted-foreground">
                      This category hasn&apos;t been distilled yet.
                    </div>
                    <div className="text-xs text-muted-foreground/70 mt-2">
                      Status: <span className="font-mono">{selected.status}</span>
                    </div>
                  </div>
                )}

                <div className="mt-12 pt-6 border-t border-border/40 text-[10px] text-muted-foreground/70 font-mono">
                  {selected.relPath}
                </div>
              </motion.article>
            </AnimatePresence>
          )}
        </section>
      </div>
    </main>
  );
}

/* ---------- Sub-components ------------------------------------------------- */

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn(
          "tabular-nums font-medium",
          accent ? "text-accent-300" : "text-foreground/95"
        )}
      >
        {value}
      </span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

function MacroSection({
  macro,
  open,
  onToggle,
  onPick,
  selectedSlug,
}: {
  macro: Macro;
  open: boolean;
  onToggle: () => void;
  onPick: (slug: string) => void;
  selectedSlug?: string;
}) {
  const distilledCount = macro.nodes.filter((n) => n.status === "distilled").length;
  const pct = macro.count === 0 ? 0 : Math.round((distilledCount / macro.count) * 100);

  return (
    <div className="mb-1">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-card/60 transition group"
      >
        <CaretRight
          size={11}
          weight="bold"
          className={cn(
            "text-muted-foreground transition",
            open && "rotate-90 text-foreground"
          )}
        />
        <span className="text-sm font-medium text-foreground/90 flex-1 truncate">
          {macro.title}
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {distilledCount}/{macro.count}
        </span>
        <div className="w-10 h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-accent-500 to-accent-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <ul className="pl-7 pb-1.5">
              {macro.nodes.map((n) => {
                const active = selectedSlug === n.slug;
                const done = n.status === "distilled";
                return (
                  <li key={n.slug}>
                    <button
                      onClick={() => onPick(n.slug)}
                      className={cn(
                        "w-full text-left flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition",
                        active
                          ? "bg-accent-500/15 text-accent-200"
                          : "text-muted-foreground hover:bg-card/40 hover:text-foreground"
                      )}
                    >
                      {done ? (
                        <CheckCircle
                          size={11}
                          weight="fill"
                          className={active ? "text-accent-300" : "text-emerald-400/70"}
                        />
                      ) : (
                        <Circle size={11} className="text-muted-foreground/40" />
                      )}
                      <span className="truncate">{n.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="h-full grid place-items-center text-center">
      <div className="max-w-md">
        <div className="inline-grid place-items-center w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-500/30 to-accent-500/5 border border-accent-500/30 mb-5">
          <Brain size={32} weight="duotone" className="text-accent-300" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight mb-2">
          Pick a category
        </h2>
        <p className="text-sm text-muted-foreground">
          The brain map compresses 1,492 vault notes into 266 distilled categories
          across 15 macros. Click any entry on the left to read the synthesised view.
        </p>
      </div>
    </div>
  );
}

function StatusPill({ status, ts }: { status: string; ts: string | null }) {
  const distilled = status === "distilled";
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] font-medium rounded-md px-2 py-1 border",
        distilled
          ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
          : "border-border bg-card/60 text-muted-foreground"
      )}
    >
      {distilled ? (
        <CheckCircle size={11} weight="fill" />
      ) : (
        <ArrowsClockwise size={11} weight="bold" />
      )}
      <span>{distilled ? "distilled" : status}</span>
      {distilled && ts && (
        <span className="font-mono normal-case text-[10px] text-emerald-300/70 ml-1">
          {new Date(ts).toLocaleString("en-GB", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      )}
    </div>
  );
}
