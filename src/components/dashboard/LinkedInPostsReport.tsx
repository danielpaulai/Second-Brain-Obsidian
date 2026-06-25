"use client";

import { LinkedinLogo, Warning } from "@phosphor-icons/react";
import { motion } from "motion/react";
import LinkedInReport, { type LinkedInReportData } from "@/components/LinkedInReport";
import { DeliverableEyebrow } from "@/components/jarvis/DeliverableEyebrow";

type Data = LinkedInReportData & {
  scopeLabel?: string;
  live?: boolean;
  postsScraped?: number;
  configured?: boolean;
  note?: string;
};

/**
 * Renders the live "scrape my own posts" report as a deliverable card inside the operator chat —
 * the shared LinkedInReport (KPIs + 4 charts + block narrative) wrapped in the standard
 * DeliverableEyebrow header, with an honest live/cached badge + a note when we fell back to cache.
 */
export default function LinkedInPostsReport({ data }: { data: Data }) {
  if (!data || !data.kpis) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[12px] text-white/55">
        <Warning size={15} weight="fill" className="text-amber-300/80" />
        Couldn&apos;t build your LinkedIn report.
      </div>
    );
  }

  const badge = data.live ? `${data.postsScraped} posts scraped` : "Cached posts";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl border border-white/[0.14] bg-white/[0.05] p-4 shadow-[0_18px_50px_-26px_rgba(0,0,0,0.85)] backdrop-blur-xl backdrop-saturate-150"
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <DeliverableEyebrow />
        <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/30 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-white/70">
          <span className={`h-1.5 w-1.5 rounded-full ${data.live ? "bg-emerald-400" : "bg-amber-400"}`} />
          <LinkedinLogo size={11} weight="fill" style={{ color: "#5fa8ec" }} /> {badge}
        </span>
      </div>

      <h3 className="text-[15px] font-bold leading-tight text-white">
        LinkedIn report{data.scopeLabel ? <span className="font-medium text-white/55"> · {data.scopeLabel}</span> : null}
      </h3>

      {data.note && (
        <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-amber-300/20 bg-amber-400/[0.06] px-3 py-2 text-[11.5px] leading-snug text-amber-100/80">
          <Warning size={14} weight="fill" className="mt-px shrink-0 text-amber-300/80" />
          {data.note}
        </div>
      )}

      <div className="mt-3.5">
        <LinkedInReport data={data} />
      </div>
    </motion.div>
  );
}
