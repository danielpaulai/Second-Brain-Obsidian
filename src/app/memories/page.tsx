"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Brain, Trash, MagnifyingGlass, ArrowLeft, Spinner } from "@phosphor-icons/react";
import Link from "next/link";
import { toast } from "sonner";

type Memory = {
  id: string;
  text: string;
  kind: string;
  created_at: string;
};

const KIND_COLORS: Record<string, string> = {
  fact: "border-sky-400/30 bg-sky-500/10 text-sky-300",
  preference: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
  context: "border-accent-400/30 bg-accent-500/10 text-accent-300",
  commitment: "border-amber-400/30 bg-amber-500/10 text-amber-300",
};

export default function MemoriesPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  async function refresh() {
    setLoading(true);
    try {
      const r = await fetch("/api/memories");
      const j = await r.json();
      if (j.ok) setMemories(j.memories);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  async function remove(id: string) {
    const previous = memories;
    setMemories((m) => m.filter((x) => x.id !== id));
    const r = await fetch(`/api/memories?id=${id}`, { method: "DELETE" });
    const j = await r.json();
    if (!j.ok) {
      setMemories(previous);
      toast.error("Couldn't delete memory");
    } else {
      toast.success("Memory removed");
    }
  }

  const filtered = search.trim()
    ? memories.filter((m) =>
        m.text.toLowerCase().includes(search.toLowerCase())
      )
    : memories;

  const byKind = filtered.reduce<Record<string, Memory[]>>((acc, m) => {
    (acc[m.kind] ||= []).push(m);
    return acc;
  }, {});

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 bg-background/85 backdrop-blur-xl border-b border-border px-6 py-3 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition"
        >
          <ArrowLeft size={14} weight="bold" />
          Brain
        </Link>
        <div className="flex items-center gap-3">
          <div className="grid place-items-center w-8 h-8 rounded-lg bg-gradient-to-br from-accent-500/30 to-accent-500/5 border border-accent-500/30">
            <Brain size={16} weight="duotone" className="text-accent-300" />
          </div>
          <div>
            <div className="font-semibold tracking-tight text-sm">Memory</div>
            <div className="text-[10px] text-muted-foreground -mt-0.5">
              what AI Danny remembers about you
            </div>
          </div>
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {memories.length} {memories.length === 1 ? "memory" : "memories"}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="relative mb-6">
          <MagnifyingGlass
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter memories…"
            className="w-full bg-card/60 border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm outline-none focus:border-accent-400/50 placeholder:text-muted-foreground/60"
          />
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
            <Spinner size={14} className="animate-spin" />
            Loading memories…
          </div>
        ) : memories.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-8">
            {(["context", "preference", "commitment", "fact"] as const).map((kind) => {
              const items = byKind[kind] || [];
              if (items.length === 0) return null;
              return (
                <section key={kind}>
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className={`text-[10px] uppercase tracking-[0.18em] font-medium px-2 py-1 rounded-md border ${KIND_COLORS[kind] || ""}`}
                    >
                      {kind}
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {items.length}
                    </span>
                  </div>
                  <AnimatePresence initial={false}>
                    <ul className="space-y-2">
                      {items.map((m) => (
                        <motion.li
                          key={m.id}
                          layout
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -10 }}
                          transition={{ duration: 0.2 }}
                          className="group flex items-start gap-2 rounded-xl border border-border bg-card/40 hover:bg-card hover:border-accent-400/30 p-3 transition"
                        >
                          <div className="flex-1 text-sm text-foreground/90">
                            {m.text}
                          </div>
                          <div className="text-[10px] text-muted-foreground/60 whitespace-nowrap">
                            {new Date(m.created_at).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                            })}
                          </div>
                          <button
                            onClick={() => remove(m.id)}
                            title="Forget this"
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-400 transition"
                          >
                            <Trash size={14} weight="duotone" />
                          </button>
                        </motion.li>
                      ))}
                    </ul>
                  </AnimatePresence>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16">
      <div className="inline-grid place-items-center w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-500/30 to-accent-500/5 border border-accent-500/30 mb-5">
        <Brain size={28} weight="duotone" className="text-accent-300" />
      </div>
      <h2 className="text-xl font-semibold tracking-tight">Nothing yet</h2>
      <p className="text-sm text-muted-foreground max-w-md mx-auto mt-2">
        Memories get extracted automatically from your chats with AI Danny. Have a few conversations and they&apos;ll start showing up here.
      </p>
    </div>
  );
}
