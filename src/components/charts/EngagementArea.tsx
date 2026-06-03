"use client";

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { LI_MONTHLY, type LIMonthly } from "@/lib/linkedin-charts";
import { CHART, ChartCard, DarkTooltip, kFmt, useChartReady } from "./chart-ui";

export default function EngagementArea({ data = LI_MONTHLY }: { data?: LIMonthly[] }) {
  return (
    <ChartCard title="Engagement over time" subtitle="Reactions + comments, by month">
      <Plot data={data} />
    </ChartCard>
  );
}

function Plot({ data }: { data: LIMonthly[] }) {
  const ready = useChartReady();
  return (
    <ResponsiveContainer>
      <AreaChart data={[...data]} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="li-eng" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART.cyan} stopOpacity={0.5} />
            <stop offset="100%" stopColor={CHART.cyan} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#ffffff" strokeOpacity={0.05} vertical={false} />
        <XAxis dataKey="month" tick={{ fill: "#ffffff66", fontSize: 11 }} axisLine={false} tickLine={false} dy={4} />
        <YAxis tick={{ fill: "#ffffff40", fontSize: 10 }} axisLine={false} tickLine={false} width={46} tickFormatter={kFmt} allowDecimals={false} />
        <Tooltip content={<DarkTooltip />} cursor={{ stroke: "#ffffff22", strokeWidth: 1 }} />
        {/* gated on `ready`: the area sweeps up only after the card shell has formed */}
        {ready && (
          <Area
            type="monotone"
            dataKey="engagement"
            name="Engagement"
            stroke={CHART.cyan}
            strokeWidth={2.5}
            fill="url(#li-eng)"
            dot={false}
            activeDot={{ r: 4, fill: CHART.cyan, stroke: "#0a0a0f", strokeWidth: 2 }}
            isAnimationActive
            animationBegin={0}
            animationDuration={950}
            animationEasing="ease-out"
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
