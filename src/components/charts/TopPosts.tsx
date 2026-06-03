"use client";

import { LI_TOP_POSTS, type LITopPost } from "@/lib/linkedin-charts";
import { RevealCard, RevealItem, RevealFill } from "@/components/blocks/reveal";

/**
 * Top posts — a clean ranked leaderboard (not a bar chart). Each row: rank, the post hook on
 * its own line, an inline engagement bar, and the number. Forms up with the shared reveal: the
 * glass shell lands, the rows cascade in, and each bar sweeps to width.
 */
export default function TopPosts({ data = LI_TOP_POSTS }: { data?: LITopPost[] }) {
  const max = Math.max(...data.map((p) => p.total), 1);
  return (
    <RevealCard className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-[0_8px_40px_-16px_rgba(0,0,0,0.7)] backdrop-blur-xl">
      <RevealItem className="text-[13px] font-semibold tracking-tight text-white/90">Your top posts</RevealItem>
      <RevealItem className="mt-0.5 text-[11px] text-white/40">Ranked by total engagement</RevealItem>
      <div className="mt-4 space-y-3">
        {data.map((p, i) => (
          <RevealItem key={i} className="flex items-center gap-3">
            <span className="w-4 shrink-0 text-right font-mono text-[11px] text-white/30">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] leading-tight text-white/85">{p.hook}</div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                <RevealFill widthPct={(p.total / max) * 100} className="block h-full rounded-full bg-gradient-to-r from-violet-400 to-cyan-400" />
              </div>
            </div>
            <span className="w-14 shrink-0 text-right font-mono text-[11px] tabular-nums text-white/55">{p.total.toLocaleString()}</span>
          </RevealItem>
        ))}
      </div>
    </RevealCard>
  );
}
