"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { RevealCard, RevealItem, useReveal } from "@/components/blocks/reveal";

/** On-brand cinematic palette for the LinkedIn report charts. */
export const CHART = {
  cyan: "#22d3ee",
  violet: "#a78bfa",
  teal: "#2dd4bf",
  sky: "#38bdf8",
  amber: "#fbbf24",
  rose: "#fb7185",
  emerald: "#34d399",
};

/** Abbreviate big numbers for axis ticks: 1000 → "1k", 1500 → "1.5k". */
export const kFmt = (v: number): string =>
  Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(Math.abs(v) % 1000 === 0 ? 0 : 1)}k`.replace(".0k", "k") : String(v);

/**
 * Chart FORM-UP gate. The glass shell + axes materialize first; this flips true ~480ms later so
 * each chart's data SERIES draws on as a distinct second beat (instead of spawning fully-formed).
 * Charts read it via `useChartReady()` and render their data geometry only once ready.
 */
const ChartReadyCtx = createContext(true);
export const useChartReady = () => useContext(ChartReadyCtx);

/** Glassy dark card wrapper for a chart — reveals as a shell, then releases the data draw. */
export function ChartCard({
  title,
  subtitle,
  children,
  className,
  height = 230,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  height?: number;
}) {
  const { reduce } = useReveal();
  const [ready, setReady] = useState(reduce);
  useEffect(() => {
    if (reduce) {
      setReady(true);
      return;
    }
    const t = setTimeout(() => setReady(true), 480);
    return () => clearTimeout(t);
  }, [reduce]);

  return (
    <ChartReadyCtx.Provider value={ready}>
      <RevealCard
        className={cn(
          "rounded-2xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl shadow-[0_8px_40px_-16px_rgba(0,0,0,0.7)]",
          className
        )}
      >
        <RevealItem className="text-[13px] font-semibold tracking-tight text-white/90">{title}</RevealItem>
        {subtitle && <RevealItem className="mt-0.5 text-[11px] text-white/40">{subtitle}</RevealItem>}
        <div className="mt-4 w-full" style={{ height }}>
          {children}
        </div>
      </RevealCard>
    </ChartReadyCtx.Provider>
  );
}

/** Dark glass tooltip shared by every chart. */
export function DarkTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: Array<{ name?: string; value?: number; color?: string; fill?: string; payload?: any }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-black/85 px-3 py-2 text-[11px] shadow-xl backdrop-blur">
      {label !== undefined && label !== "" && <div className="mb-1 font-medium text-white/80">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-white/65">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span>{p.name}</span>
          <span className="ml-auto font-semibold text-white">{(p.value ?? 0).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
