"use client";

import { useMemo, type ReactNode, type RefObject } from "react";
import type { LIMonthly, LITopPost, LIReaction } from "@/lib/linkedin-charts";
import EngagementArea from "@/components/charts/EngagementArea";
import TopPosts from "@/components/charts/TopPosts";
import ReactionDonut from "@/components/charts/ReactionDonut";
import Cadence from "@/components/charts/Cadence";
import { Blocks, parseBlocks, type ChartName } from "./blocks/Blocks";
import { RevealGroup, RevealItem } from "./blocks/reveal";

export type LinkedInReportData = {
  kpis: { posts: number; reactions: number; comments: number; shares: number; avgEngagement: number };
  monthly: LIMonthly[];
  topPosts: LITopPost[];
  reactionMix: LIReaction[];
  /** GPT-authored markdown with [[chart:NAME]] tokens + the shared answer-block tokens inline. */
  document: string;
};

export default function LinkedInReport({
  data,
  stream = false,
  scrollRef,
}: {
  data: LinkedInReportData;
  stream?: boolean;
  scrollRef?: RefObject<HTMLElement | null>;
}) {
  const blocks = useMemo(() => parseBlocks(data.document), [data.document]);

  const chartFor = (name: ChartName): ReactNode => {
    switch (name) {
      case "engagement":
        return <EngagementArea data={data.monthly} />;
      case "topPosts":
        return <TopPosts data={data.topPosts} />;
      case "reactions":
        return <ReactionDonut data={data.reactionMix} />;
      case "cadence":
        return <Cadence data={data.monthly} />;
    }
  };

  return (
    <div className="space-y-3.5 text-[14px]">
      {/* KPI strip — staggers in with the shared reveal */}
      <RevealGroup className="grid grid-cols-2 gap-2.5">
        <Kpi label="Posts" value={data.kpis.posts.toLocaleString()} />
        <Kpi label="Avg engagement" value={data.kpis.avgEngagement.toLocaleString()} />
        <Kpi label="Reactions" value={data.kpis.reactions.toLocaleString()} />
        <Kpi label="Comments" value={data.kpis.comments.toLocaleString()} />
      </RevealGroup>

      {/* Report body — shared answer blocks, with charts injected by token */}
      <Blocks blocks={blocks} stream={stream} scrollRef={scrollRef} chartFor={chartFor} />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <RevealItem className="rounded-xl border border-white/10 bg-white/[0.035] px-3.5 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.14em] text-white/40">{label}</div>
      <div className="mt-0.5 text-[18px] font-semibold tabular-nums tracking-tight text-white">{value}</div>
    </RevealItem>
  );
}
