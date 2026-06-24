"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Megaphone,
  Target,
  Cpu,
  Gear,
  type Icon as PhIcon,
  ArrowRight,
  Circle,
  PaperPlaneTilt,
  Sparkle,
  Cube,
  ListChecks,
  Trophy,
  MagnifyingGlass,
  CalendarBlank,
  Clock,
  Users,
  VideoCamera,
} from "@phosphor-icons/react";
import {
  ACTIVITY_LOOP,
  CAMPAIGNS,
  DEPARTMENTS,
  KPIS,
  MINI_STATS,
  type ActivityKind,
  type Activity,
  type Kpi,
  type MiniStat,
} from "@/lib/dashboard-data";
import { Counter, Meter, Panel, Sparkline, StatusDot, TrendChip } from "./ui";

/** A KPI for the band — same as the demo KPI but the sparkline is optional (live KPIs have no history) and it can carry its source app. */
type DashKpi = Omit<Kpi, "spark"> & { spark?: number[]; source?: string };

/** A meeting row for the live meetings panel (PII-free: counts, titles, times only). */
export type DashMeeting = { title: string; when: string; durationMins?: number | null; attendees?: number | null; platform?: string | null };

const DEPT_ICON: Record<string, PhIcon> = { Megaphone, Target, Cpu, Gear };
const ACT_ICON: Record<ActivityKind, PhIcon> = {
  route: ArrowRight,
  scrape: MagnifyingGlass,
  content: Sparkle,
  build: Cube,
  ops: ListChecks,
  win: Trophy,
};

/* ─────────────────── hero KPI band ─────────────────── */

export function StatBand({ kpis = KPIS, loading = false }: { kpis?: DashKpi[]; loading?: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Panel key={i} className="min-h-[148px]">
            <div className="lead-shimmer h-3 w-24" />
            <div className="lead-shimmer mt-3.5 h-7 w-28" />
            <div className="lead-shimmer mt-2 h-2.5 w-20" />
            <div className="lead-shimmer mt-auto h-[34px] w-full" />
          </Panel>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {kpis.map((k) => (
        <Panel key={k.key} glow={k.color} className="min-h-[148px]">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[11px] font-medium uppercase tracking-[0.14em] text-white/45">{k.label}</span>
            <div className="flex shrink-0 items-center gap-1.5">
              {k.source && (
                <span className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-medium text-white/40">{k.source}</span>
              )}
              {k.delta !== 0 && <TrendChip delta={k.delta} />}
            </div>
          </div>
          <div className="mt-2 text-[30px] font-bold leading-none tracking-tight text-white">
            <Counter value={k.value} format={k.format} />
          </div>
          <div className="mt-1 text-[11px] text-white/40">{k.caption}</div>
          <div className="mt-auto pt-3">
            {k.spark && k.spark.length > 1 ? <Sparkline data={k.spark} color={k.color} /> : <div className="h-[34px]" />}
          </div>
        </Panel>
      ))}
    </div>
  );
}

/* ─────────────────── secondary mini-stat strip ─────────────────── */

export function MiniStatStrip({ stats = MINI_STATS, loading = false }: { stats?: MiniStat[]; loading?: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-3">
            <div className="lead-shimmer h-4 w-12" />
            <div className="lead-shimmer mt-2.5 h-2.5 w-16" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-3 backdrop-blur-xl"
        >
          <div className="flex items-center justify-between">
            <span className="text-[18px] font-bold leading-none text-white" style={{ textShadow: `0 0 18px ${s.color}40` }}>
              {s.value}
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-1">
            <span className="truncate text-[10.5px] text-white/45">{s.label}</span>
            <TrendChip delta={s.delta} invert={s.label === "Cost / lead"} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────── department (C-suite) grid ─────────────────── */

const STATUS_META: Record<string, { label: string; color: string }> = {
  running: { label: "Running", color: "#34d399" },
  queued: { label: "Queued", color: "#fbbf24" },
  idle: { label: "Standby", color: "#94a3b8" },
};

export function DepartmentGrid() {
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {DEPARTMENTS.map((d) => {
        const Icon = DEPT_ICON[d.icon] ?? Circle;
        const st = STATUS_META[d.status];
        return (
          <Panel key={d.id} glow={d.color}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-xl border"
                  style={{ background: `${d.color}1a`, borderColor: `${d.color}40`, color: d.color }}
                >
                  <Icon size={20} weight="duotone" />
                </span>
                <div>
                  <div className="text-[15px] font-bold leading-tight text-white">{d.title}</div>
                  <div className="text-[11px] text-white/45">{d.role}</div>
                </div>
              </div>
              <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider" style={{ color: st.color }}>
                <StatusDot color={st.color} pulse={d.status === "running"} />
                {st.label}
              </span>
            </div>

            <div className="mt-4 flex items-end justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/35">{d.metricLabel}</div>
                <div className="text-[18px] font-bold text-white">{d.metricValue}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-white/35">Tasks</div>
                <div className="text-[18px] font-bold tabular-nums text-white">{d.tasksDone}</div>
              </div>
            </div>

            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-[10px] text-white/40">
                <span>Workload</span>
                <span className="tabular-nums">{d.load}%</span>
              </div>
              <Meter value={d.load} color={d.color} />
            </div>

            <p className="mt-3 line-clamp-2 text-[11px] leading-relaxed text-white/45">{d.detail}</p>
          </Panel>
        );
      })}
    </div>
  );
}

/* ─────────────────── active campaigns table ─────────────────── */

const CAMP_STATUS: Record<string, string> = { live: "#34d399", scaling: "#22d3ee", paused: "#fb7185" };

export function CampaignsTable() {
  return (
    <Panel title="Active campaigns" subtitle="Across every channel" accent="#22d3ee" glow="#22d3ee" className="h-full">
      <div className="-mx-1 overflow-hidden">
        {/* header */}
        <div className="grid grid-cols-[1.6fr_0.8fr_0.8fr_0.7fr] gap-2 px-1 pb-2 text-[10px] uppercase tracking-wider text-white/35">
          <span>Campaign</span>
          <span className="text-right">Reply</span>
          <span className="text-right">Booked</span>
          <span className="text-right">Progress</span>
        </div>
        <div className="flex flex-col">
          {CAMPAIGNS.map((c, i) => (
            <motion.div
              key={c.name}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * i, duration: 0.4 }}
              className="grid grid-cols-[1.6fr_0.8fr_0.8fr_0.7fr] items-center gap-2 border-t border-white/[0.05] px-1 py-2.5"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <StatusDot color={CAMP_STATUS[c.status]} pulse={c.status !== "paused"} />
                  <span className="truncate text-[12.5px] font-medium text-white/85">{c.name}</span>
                </div>
                <span className="ml-3.5 text-[10.5px] text-white/40">
                  {c.channel} · {c.status}
                </span>
              </div>
              <span className="text-right text-[12px] font-semibold tabular-nums text-white/80">
                {c.replyRate > 0 ? `${c.replyRate}%` : "—"}
              </span>
              <span className="text-right text-[12px] font-semibold tabular-nums text-white/80">{c.booked}</span>
              <div className="flex items-center justify-end gap-2">
                <div className="w-14">
                  <Meter value={c.progress} color={c.color} height={5} />
                </div>
                <span className="w-7 text-right text-[10.5px] tabular-nums text-white/45">{c.progress}%</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

/* ─────────────────── live agent activity feed ─────────────────── */

type FeedItem = { id: number; act: Activity; time: string };

export function LiveFeed({ activity = ACTIVITY_LOOP, loading = false }: { activity?: Activity[]; loading?: boolean }) {
  const [items, setItems] = useState<FeedItem[]>([]);

  useEffect(() => {
    const pool = activity.length ? activity : ACTIVITY_LOOP;
    let idx = 0;
    let id = 0;
    const fmt = () =>
      new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

    // seed a few so the panel isn't empty on first paint
    const seed: FeedItem[] = [];
    for (let s = 0; s < Math.min(4, pool.length); s++) {
      seed.push({ id: id++, act: pool[(idx + s) % pool.length], time: fmt() });
    }
    idx = seed.length;
    setItems(seed.reverse());

    const t = setInterval(() => {
      const act = pool[idx % pool.length];
      idx++;
      setItems((cur) => [{ id: id++, act, time: fmt() }, ...cur].slice(0, 7));
    }, 2600);
    return () => clearInterval(t);
  }, [activity]);

  return (
    <Panel
      title="Live agent activity"
      subtitle="KRONOS · autonomous"
      accent="#a78bfa"
      glow="#a78bfa"
      className="h-full"
      right={
        <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
          <StatusDot color="#34d399" pulse />
          LIVE
        </span>
      }
    >
      {loading ? (
        <div className="flex flex-col gap-3 pt-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <div className="lead-shimmer h-7 w-7 rounded-lg" />
              <div className="flex-1">
                <div className="lead-shimmer h-2.5 w-20" />
                <div className="lead-shimmer mt-1.5 h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : (
      <div className="relative flex-1 overflow-hidden">
        <AnimatePresence initial={false}>
          {items.map((it) => {
            const Icon = ACT_ICON[it.act.kind] ?? PaperPlaneTilt;
            return (
              <motion.div
                key={it.id}
                layout
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-start gap-2.5 border-b border-white/[0.04] py-2.5 last:border-0"
              >
                <span
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border"
                  style={{ background: `${it.act.color}1a`, borderColor: `${it.act.color}40`, color: it.act.color }}
                >
                  <Icon size={14} weight="bold" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold" style={{ color: it.act.color }}>
                      {it.act.agent}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-white/30">{it.time}</span>
                  </div>
                  <p className="mt-0.5 text-[12px] leading-snug text-white/70">{it.act.text}</p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      )}
    </Panel>
  );
}

/* ─────────────────── upcoming + last meetings (live) ─────────────────── */

function fmtWhen(w: string): string {
  const d = new Date(w);
  if (!isNaN(d.getTime())) return d.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return w; // already a human string
}

export function MeetingsPanel({
  meetings,
  loading = false,
}: {
  meetings?: { upcoming: DashMeeting[]; last: DashMeeting | null };
  loading?: boolean;
}) {
  const upcoming = meetings?.upcoming ?? [];
  const last = meetings?.last ?? null;
  const next = upcoming[0];
  const rest = upcoming.slice(1);

  return (
    <Panel
      title="Meetings"
      subtitle="Calendar · Zoom"
      accent="#22d3ee"
      glow="#22d3ee"
      className="h-full"
      right={
        !loading && next ? (
          <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
            <StatusDot color="#34d399" pulse />
            LIVE
          </span>
        ) : undefined
      }
    >
      {loading ? (
        <div className="flex flex-col gap-2.5 pt-1">
          <div className="lead-shimmer h-[88px] w-full rounded-xl" />
          <div className="lead-shimmer h-3 w-3/4" />
          <div className="lead-shimmer h-3 w-2/3" />
        </div>
      ) : next ? (
        <div className="rounded-xl border border-cyan-300/20 bg-cyan-400/[0.05] p-3.5">
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-cyan-200/70">
            <CalendarBlank size={12} weight="fill" /> Next up
          </div>
          <div className="mt-1 text-[15px] font-semibold leading-tight text-white">{next.title}</div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/55">
            <span className="flex items-center gap-1">
              <Clock size={12} /> {fmtWhen(next.when)}
              {next.durationMins ? ` · ${next.durationMins}m` : ""}
            </span>
            {next.attendees != null && (
              <span className="flex items-center gap-1">
                <Users size={12} /> {next.attendees}
              </span>
            )}
            {next.platform && (
              <span className="flex items-center gap-1">
                <VideoCamera size={12} /> {next.platform}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <CalendarBlank size={26} weight="duotone" className="text-white/20" />
          <p className="mt-2 text-[12px] text-white/40">No upcoming meetings</p>
          <p className="text-[10.5px] text-white/25">Connect Calendar / Zoom via Zapier to populate</p>
        </div>
      )}

      {!loading && rest.length > 0 && (
        <div className="mt-3 flex flex-col">
          {rest.map((m, i) => (
            <div key={i} className="flex items-center justify-between gap-2 border-t border-white/[0.05] py-2">
              <div className="min-w-0">
                <div className="truncate text-[12.5px] text-white/85">{m.title}</div>
                <div className="text-[10.5px] text-white/40">
                  {fmtWhen(m.when)}
                  {m.platform ? ` · ${m.platform}` : ""}
                </div>
              </div>
              {m.attendees != null && (
                <span className="flex shrink-0 items-center gap-1 text-[10.5px] text-white/45">
                  <Users size={11} /> {m.attendees}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && last && (
        <div className="mt-3 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2 text-[11px]">
          <span className="text-white/35">Last meeting · </span>
          <span className="text-white/75">{last.title}</span>
          <span className="text-white/40"> · {fmtWhen(last.when)}</span>
        </div>
      )}
    </Panel>
  );
}
