"use client";

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { LI_REACTION_MIX, type LIReaction } from "@/lib/linkedin-charts";
import { CHART, ChartCard, DarkTooltip, useChartReady } from "./chart-ui";

const COLORS = [CHART.cyan, CHART.violet, CHART.teal, CHART.amber, CHART.sky, CHART.rose];

export default function ReactionDonut({ data: mix = LI_REACTION_MIX }: { data?: LIReaction[] }) {
  const data = [...mix];
  return (
    <ChartCard title="Reaction mix" subtitle="How your audience reacts">
      <div className="flex h-full items-center gap-4">
        <div className="relative h-full w-[55%]">
          <Ring data={data} />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-[20px] font-semibold leading-none text-white">{data[0]?.pct}%</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">{data[0]?.type}</div>
          </div>
        </div>
        {/* Legend */}
        <div className="flex flex-1 flex-col gap-2">
          {data.map((d, i) => (
            <div key={d.type} className="flex items-center gap-2 text-[12px]">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
              <span className="text-white/70">{d.type}</span>
              <span className="ml-auto font-semibold tabular-nums text-white/90">{d.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </ChartCard>
  );
}

// Rendered INSIDE ChartCard so useChartReady() reads the provider; the ring draws once `ready` flips.
function Ring({ data }: { data: LIReaction[] }) {
  const ready = useChartReady();
  return (
    <ResponsiveContainer>
      <PieChart>
        {ready && (
          <Pie
            data={data}
            dataKey="count"
            nameKey="type"
            innerRadius="62%"
            outerRadius="92%"
            paddingAngle={2}
            stroke="none"
            isAnimationActive
            animationBegin={0}
            animationDuration={900}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
        )}
        <Tooltip content={<DarkTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}
