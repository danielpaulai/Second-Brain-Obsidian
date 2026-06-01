"use client";

import { useEffect, useState } from "react";
import AskDanny from "@/components/AskDanny";
import AmbientBrain from "@/components/AmbientBrain";
import PasswordGate from "@/components/PasswordGate";
import type { BrainGraph as GraphData } from "@/lib/vault";

export default function AskPage() {
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [cited, setCited] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/brain")
      .then((r) => r.json())
      .then((d) => setGraph(d.graph))
      .catch(() => {});
  }, []);

  return (
    <PasswordGate>
      <main className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
        {/* Ambient brain backdrop */}
        <AmbientBrain data={graph} highlights={cited} />

        {/* Foreground chat */}
        <div className="relative z-10 h-full w-full grid place-items-center">
          <div className="w-full max-w-3xl h-[min(100vh,860px)] mx-auto bg-background/55 backdrop-blur-xl border border-border/40 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden flex flex-col">
            <AskDanny
              onCited={(titles) => {
                if (!graph) return;
                const byTitle = new Map(graph.nodes.map((n) => [n.name.toLowerCase(), n.id]));
                const ids = titles
                  .map((t) => byTitle.get(t.toLowerCase()))
                  .filter(Boolean) as string[];
                setCited(ids);
                setTimeout(() => setCited([]), 12000);
              }}
            />
          </div>
        </div>
      </main>
    </PasswordGate>
  );
}
