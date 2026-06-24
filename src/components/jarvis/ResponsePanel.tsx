"use client";

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle } from "@phosphor-icons/react";
import { node } from "@/lib/org";
import { Blocks, parseBlocks } from "@/components/blocks/Blocks";
import CarouselArtifact from "./CarouselArtifact";
import LeadsArtifact from "./LeadsArtifact";
import BrainOrb from "./BrainOrb";
import type { JarvisRunState } from "./useJarvisRun";

/**
 * The right column — reserved for the RESPONSE. Three states, in order:
 *   1. a carousel artifact (rendered slide visuals), when one was produced;
 *   2. a rich, block-formatted report (the shared answer-block stockpile),
 *      streamed in with the same form-up the stage uses;
 *   3. the live KRONOS orb by default — glowing + colour-shifting to whichever
 *      agent is running, pulsing on every event.
 */

type DeliverableKey = "report" | "carousel" | "leads";

export default function ResponsePanel({ state }: { state: JarvisRunState }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const idle = !state.running && state.feed.length === 0;
  const activeNode = state.active ? node(state.active) : null;
  const latest = state.feed[state.feed.length - 1];

  const orbColor = activeNode?.color ?? "#22d3ee";

  // memoize so the streamed reveal doesn't restart on unrelated re-renders
  const blocks = useMemo(() => (state.response ? parseBlocks(state.response) : []), [state.response]);

  // A team run can produce several deliverables — let the user switch between them.
  const deliverables: { key: DeliverableKey; label: string }[] = [];
  if (blocks.length > 0) deliverables.push({ key: "report", label: "Briefing" });
  if (state.artifact) deliverables.push({ key: "carousel", label: "Carousel" });
  if (state.leads) deliverables.push({ key: "leads", label: "Leads" });
  const [tab, setTab] = useState<DeliverableKey | null>(null);
  const activeKey = tab && deliverables.some((d) => d.key === tab) ? tab : deliverables[0]?.key;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[20px] border border-white/12 bg-gradient-to-b from-white/[0.07] via-white/[0.025] to-transparent shadow-[0_30px_80px_-42px_rgba(0,0,0,0.92)] ring-1 ring-inset ring-white/[0.06] backdrop-blur-2xl">
      {/* deliverable tabs — only when the team produced more than one */}
      {deliverables.length > 1 && (
        <div className="flex shrink-0 items-center gap-1 border-b border-white/[0.07] px-3 py-2">
          {deliverables.map((d) => {
            const on = d.key === activeKey;
            return (
              <button
                key={d.key}
                onClick={() => setTab(d.key)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                  on ? "bg-white/10 text-white" : "text-white/45 hover:text-white/80"
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      )}

      {/* body */}
      <div className="relative min-h-0 flex-1">
        <AnimatePresence mode="wait">
          {activeKey === "leads" && state.leads ? (
            <motion.div key="leads" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0">
              <LeadsArtifact data={state.leads} />
            </motion.div>
          ) : activeKey === "carousel" && state.artifact ? (
            <motion.div key="artifact" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0">
              <CarouselArtifact data={state.artifact} />
            </motion.div>
          ) : activeKey === "report" && blocks.length > 0 ? (
            <motion.div key="report" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0">
              <div ref={scrollRef} data-lenis-prevent className="h-full overflow-y-auto bg-gradient-to-b from-white/[0.055] via-white/[0.02] to-transparent px-4 py-4 text-[13.5px] leading-relaxed">
                <Blocks blocks={blocks} stream scrollRef={scrollRef} />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="orb"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0"
            >
              {/* the founder's second brain — the same Synaptic Bloom graph as /stage */}
              <BrainOrb />
              {/* vignette so the status text stays readable over the network */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-[#02040a] via-[#02040a]/75 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-6 pb-6 text-center">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${activeNode?.id ?? "idle"}-${latest?.id ?? 0}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.3 }}
                    className="max-w-[300px]"
                  >
                    {idle ? (
                      <div>
                        <div className="text-[18px] font-bold tracking-tight text-white">CEO</div>
                        <div className="mt-1 text-[12px] leading-relaxed text-white/45">
                          Your AI CEO reads every document and routes every job. Give it one instruction.
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center justify-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ background: orbColor, boxShadow: `0 0 10px ${orbColor}` }} />
                          <span className="text-[12px] font-semibold uppercase tracking-[0.16em]" style={{ color: orbColor }}>
                            {activeNode?.title ?? "CEO"}
                          </span>
                        </div>
                        <div className="mt-1.5 text-[13px] leading-relaxed text-white/70">{latest?.text ?? "Working…"}</div>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* footer state */}
      {(state.done || state.error) && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="shrink-0 border-t border-white/[0.07] px-4 py-2.5"
        >
          {state.error ? (
            <div className="text-[12px] text-rose-300/85">{state.error}</div>
          ) : (
            <div className="flex items-center gap-2 text-[12px] text-emerald-300/85">
              <CheckCircle size={15} weight="fill" />
              Run complete · deliverable ready
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
