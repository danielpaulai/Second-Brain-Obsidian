"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { BrainGraph as GraphData } from "@/lib/vault";

// The same cinematic "Synaptic Bloom" canvas the /stage page uses. Heavy (d3 +
// canvas), so client-only.
const BrainGraph = dynamic(() => import("@/components/BrainGraph"), { ssr: false });

// Module-level cache so flipping between the deliverable and the idle backdrop
// doesn't re-fetch the whole vault graph each time.
let cachedGraph: GraphData | null = null;

/**
 * The founder's second-brain graph (from Supabase via /api/brain) rendered as the
 * idle backdrop of the /jarvis response panel — replaces the old KronosOrb.
 */
export default function BrainOrb() {
  const [graph, setGraph] = useState<GraphData | null>(cachedGraph);

  useEffect(() => {
    if (cachedGraph) return;
    let cancelled = false;
    fetch("/api/brain")
      .then((r) => r.json())
      .then((d) => {
        cachedGraph = d?.graph ?? null;
        if (!cancelled) setGraph(cachedGraph);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!graph?.nodes?.length) return null;
  return (
    <div className="brain-ambient absolute inset-0">
      <BrainGraph data={graph} />
    </div>
  );
}
