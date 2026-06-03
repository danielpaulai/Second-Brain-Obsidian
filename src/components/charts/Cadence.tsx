"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { LI_MONTHLY, type LIMonthly } from "@/lib/linkedin-charts";
import { CHART, ChartCard, DarkTooltip, kFmt, useChartReady } from "./chart-ui";

export default function Cadence({ data: monthly = LI_MONTHLY }: { data?: LIMonthly[] }) {
  const data = monthly.map((m) => ({
    month: m.month,
    posts: m.posts,
    avg: m.posts ? Math.round(m.engagement / m.posts) : 0,
  }));
  return (
    <ChartCard title="Cadence vs engagement" subtitle="Posts per month and average engagement each">
      <Plot data={data} />
    </ChartCard>
  );
}

function Plot({ data }: { data: { month: string; posts: number; avg: number }[] }) {
  const ready = useChartReady();
  return (
    <ResponsiveContainer>
      <ComposedChart data={data} margin={{ top: 8, right: 6, left: -14, bottom: 0 }}>
        <defs>
          <linearGradient id="li-posts" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART.violet} stopOpacity={0.7} />
            <stop offset="100%" stopColor={CHART.violet} stopOpacity={0.18} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#ffffff" strokeOpacity={0.05} vertical={false} />
        <XAxis dataKey="month" tick={{ fill: "#ffffff66", fontSize: 11 }} axisLine={false} tickLine={false} dy={4} />
        <YAxis yAxisId="l" tick={{ fill: "#ffffff40", fontSize: 10 }} axisLine={false} tickLine={false} width={22} allowDecimals={false} domain={[0, "dataMax"]} />
        <YAxis yAxisId="r" orientation="right" tick={{ fill: "#ffffff40", fontSize: 10 }} axisLine={false} tickLine={false} width={38} tickFormatter={kFmt} />
        <Tooltip content={<DarkTooltip />} cursor={{ fill: "#ffffff08" }} />
        {/* gated on `ready`: bars grow from the baseline, then the avg line strokes on after them */}
        {ready && (
          <Bar yAxisId="l" dataKey="posts" name="Posts" fill="url(#li-posts)" radius={[4, 4, 0, 0]} barSize={18} isAnimationActive animationBegin={0} animationDuration={800} />
        )}
        {ready && (
          <Line yAxisId="r" type="monotone" dataKey="avg" name="Avg engagement" stroke={CHART.amber} strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: CHART.amber }} isAnimationActive animationBegin={420} animationDuration={900} animationEasing="ease-out" />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
