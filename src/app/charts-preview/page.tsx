"use client";

import { useEffect, useState } from "react";
import { LI_KPIS } from "@/lib/linkedin-charts";
import EngagementArea from "@/components/charts/EngagementArea";
import TopPosts from "@/components/charts/TopPosts";
import ReactionDonut from "@/components/charts/ReactionDonut";
import Cadence from "@/components/charts/Cadence";
import LinkedInReport, { type LinkedInReportData } from "@/components/LinkedInReport";

/**
 * Standalone preview of the locked-down LinkedIn report charts — open /charts-preview to
 * review/iterate the 4 graphics before wiring them into the demo report.
 */
export default function ChartsPreview() {
  return (
    <main className="min-h-dvh bg-[#02040a] px-10 py-10 text-white">
      <div className="mx-auto max-w-[1100px]">
        <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.32em] text-cyan-300/70">
          LinkedIn performance · last 200 posts
        </div>
        <h1 className="mb-7 text-2xl font-light tracking-tight text-white/90">Report graphics — locked preview</h1>

        {/* KPI tiles */}
        <div className="mb-6 grid grid-cols-4 gap-3">
          <Kpi label="Posts" value={LI_KPIS.posts.toLocaleString()} />
          <Kpi label="Total reactions" value={LI_KPIS.reactions.toLocaleString()} />
          <Kpi label="Total comments" value={LI_KPIS.comments.toLocaleString()} />
          <Kpi label="Avg engagement / post" value={LI_KPIS.avgEngagement.toLocaleString()} />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-2 gap-4">
          <EngagementArea />
          <ReactionDonut />
          <TopPosts />
          <Cadence />
        </div>

        {/* Full report (live API) — in a ~660px panel like the chat */}
        <h2 className="mb-4 mt-12 text-lg font-light tracking-tight text-white/80">Full report (in-chat width)</h2>
        <ReportPreview />
      </div>
    </main>
  );
}

function ReportPreview() {
  const [data, setData] = useState<LinkedInReportData | null>(null);
  useEffect(() => {
    fetch("/api/linkedin-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "Analyze my posts and give me a plan for my next 6 pieces of content with hooks." }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, []);
  if (!data) return <div className="text-sm text-white/40">Loading report…</div>;
  return (
    <div className="w-[660px] rounded-2xl border border-white/5 bg-[#02040a] p-5">
      <LinkedInReport data={data} />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 backdrop-blur-xl">
      <div className="text-[10px] uppercase tracking-[0.16em] text-white/40">{label}</div>
      <div className="mt-1 text-[22px] font-semibold tracking-tight text-white">{value}</div>
    </div>
  );
}
