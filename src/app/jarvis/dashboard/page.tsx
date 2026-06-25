"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowsClockwise, Heart, ChatCircle, ShareNetwork, SquaresFour, Faders, CaretRight, type Icon as PhIcon } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { Panel, Rise } from "@/components/dashboard/ui";
import { MeetingsPanel, MiniStatStrip, StatBand } from "@/components/dashboard/panels";
import AgentChatPanel from "@/components/dashboard/AgentChatPanel";
import { BrandMark } from "@/components/dashboard/BrandMark";
import { BRANDS } from "@/lib/brand-marks";
import { useOperatorActivity } from "@/lib/operator-activity";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/dashboard-data";
import type { LinkedInMetrics } from "@/lib/linkedin-metrics";

/**
 * `/jarvis/dashboard` — a real operating dashboard.
 *  • LinkedIn engagement (reactions / comments / reposts, top post) from the real
 *    scraped post dataset — the centrepiece.
 *  • Meetings + email/activity counts from the connected apps via Zapier MCP.
 *  • Financials are the only placeholders (no Stripe connection).
 */

type DashMeeting = { title: string; when: string; durationMins?: number | null; attendees?: number | null; platform?: string | null };
type LiveResp = {
  live: boolean;
  error?: string;
  cached?: boolean;
  note?: string;
  linkedin?: LinkedInMetrics;
  data?: {
    kpis: { key: string; label: string; value: number; format: "currency" | "compact" | "number" | "percent"; delta: number; caption: string; source: string }[];
    miniStats: { label: string; value: string; delta: number }[];
    meetings: { upcoming: DashMeeting[]; last: DashMeeting | null };
  };
};

const MINI_COLORS = [BRAND.cyan, BRAND.amber, BRAND.emerald, BRAND.violet, BRAND.fuchsia, BRAND.sky];
const fmtCompact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

const FINANCIALS = [
  { label: "MRR", value: "$284.9k", sub: "Recurring revenue", color: BRAND.emerald },
  { label: "Open pipeline", value: "$1.24M", sub: "64 deals", color: BRAND.cyan },
  { label: "ARR", value: "$3.4M", sub: "Annual run-rate", color: BRAND.violet },
  { label: "Avg deal size", value: "$19.4k", sub: "Won deals", color: BRAND.amber },
];

const CONNECTED: { name: string; brand: string }[] = [
  { name: "Gmail", brand: "gmail" },
  { name: "Slack", brand: "slack" },
  { name: "Google Calendar", brand: "calendar" },
  { name: "Notion", brand: "notion" },
  { name: "Zoom", brand: "zoom" },
  { name: "LinkedIn", brand: "linkedin" },
];

const CACHE_KEY = "sb_dashboard_live_v3"; // persists across page loads; Refresh re-pulls (v3: linkedin.series added)

export default function DashboardPage() {
  const [resp, setResp] = useState<LiveResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(true);

  const load = useCallback((refresh = false) => {
    setLoading(true);
    fetch(`/api/dashboard/data${refresh ? "?refresh=1" : ""}`)
      .then((r) => r.json())
      .then((j: LiveResp) => {
        setResp(j);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(j));
        } catch {
          /* storage full / disabled — fine */
        }
      })
      .catch((e) => setResp({ live: false, error: e instanceof Error ? e.message : String(e) }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        setResp(JSON.parse(raw) as LiveResp);
        setLoading(false);
        return;
      }
    } catch {
      /* ignore a corrupt cache */
    }
    load();
  }, [load]);

  const d = resp?.live ? resp.data : undefined;
  const li = resp?.linkedin;

  // hero KPIs: LinkedIn engagement (real) + the best live app metric
  const liKpis = li
    ? [
        { key: "li_react", label: "LinkedIn reactions", value: li.reactions, format: "compact" as const, delta: 0, caption: `across ${li.posts} posts`, source: "LinkedIn", color: BRAND.fuchsia },
        { key: "li_comments", label: "LinkedIn comments", value: li.comments, format: "compact" as const, delta: 0, caption: "total", source: "LinkedIn", color: BRAND.violet },
        { key: "li_avg", label: "Avg engagement / post", value: li.avgEngagement, format: "number" as const, delta: 0, caption: "reactions + comments + reposts", source: "LinkedIn", color: BRAND.cyan },
        { key: "li_shares", label: "LinkedIn reposts", value: li.shares, format: "compact" as const, delta: 0, caption: "total", source: "LinkedIn", color: BRAND.amber },
      ]
    : [];
  const liveKpis = d?.kpis?.length ? d.kpis.map((k, i) => ({ ...k, color: MINI_COLORS[i % MINI_COLORS.length] })) : [];
  const heroKpis = liKpis.length ? (liveKpis.length ? [...liKpis.slice(0, 3), ...liveKpis].slice(0, 4) : liKpis.slice(0, 4)) : undefined;

  const liveMini = d?.miniStats?.length ? d.miniStats.map((s, i) => ({ ...s, color: MINI_COLORS[i % MINI_COLORS.length] })) : undefined;
  const meetings = d?.meetings;

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-[#02040a] text-white">
      <div className="pointer-events-none fixed inset-0" style={{ background: "radial-gradient(130% 90% at 50% 0%, #070c18 0%, #02040a 55%, #010207 100%)" }} />
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.22]"
        style={{
          backgroundImage: "linear-gradient(rgba(34,211,238,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.05) 1px, transparent 1px)",
          backgroundSize: "46px 46px",
          maskImage: "radial-gradient(130% 80% at 50% 0%, #000 25%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(130% 80% at 50% 0%, #000 25%, transparent 80%)",
        }}
      />
      <div className="blob-a pointer-events-none fixed -left-32 top-24 h-[420px] w-[420px] rounded-full bg-cyan-500/[0.07] blur-[120px]" />
      <div className="blob-b pointer-events-none fixed -right-28 top-1/3 h-[460px] w-[460px] rounded-full bg-violet-500/[0.07] blur-[130px]" />

      {/* ONE unified full-width header spanning the dashboard + the control centre */}
      <UnifiedHeader loading={loading} onRefresh={() => load(true)} chatOpen={chatOpen} onToggleChat={() => setChatOpen((o) => !o)} />

      <div className="relative z-10 flex min-h-0 flex-1">
        {/* LEFT — dashboard scrolls (data-lenis-prevent so the global smooth-scroll
            doesn't steal the wheel; no-scrollbar hides the bar). */}
        <div data-lenis-prevent className="no-scrollbar min-w-0 flex-1 overflow-y-auto">
        <main className="mx-auto w-full max-w-[1180px] px-5 pb-14 pt-6 md:px-8">
        {/* LinkedIn KPIs */}
        <Rise>
          <StatBand kpis={heroKpis} loading={loading && !li} />
        </Rise>

        {/* connected apps — between the LinkedIn KPIs and the engagement trend; light up as the Operator uses them */}
        <Rise delay={0.06} className="mt-4">
          <ConnectedApps />
        </Rise>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Rise delay={0.1} className="lg:col-span-2">
            <EngagementGraph li={li} loading={loading && !li} />
          </Rise>
          <Rise delay={0.14}>
            <MeetingsPanel meetings={meetings} loading={loading} />
          </Rise>
        </div>

        {/* live from the connected apps (Zapier MCP) */}
        {liveMini && (
          <>
            <div className="mt-7">
              <SectionHeader title="Live · your connected apps" />
            </div>
            <Rise delay={0.16}>
              <MiniStatStrip stats={liveMini} />
            </Rise>
          </>
        )}

        {/* financials — the only placeholders (no Stripe) */}
        <div className="mt-8 mb-3 flex items-center gap-2.5">
          <h2 className="text-[14px] font-semibold uppercase tracking-[0.2em] text-white/55">Financials</h2>
          <span className="rounded-full border border-amber-400/25 bg-amber-400/[0.08] px-2 py-0.5 text-[9.5px] font-medium uppercase tracking-wider text-amber-300">
            Demo · connect Stripe for live
          </span>
          <div className="h-px flex-1 bg-gradient-to-r from-white/12 to-transparent" />
        </div>
        <Rise delay={0.22}>
          <FinancialStrip />
        </Rise>

        <p className="mt-8 text-center text-[11px] text-white/25">
          Second Brain · LinkedIn from real post data · meetings &amp; activity live via Zapier · financials are placeholder until Stripe
        </p>
        </main>
        </div>

        {/* RIGHT — the operator: a full agent over the MCPs + second brain */}
        <aside
          className={cn(
            "hidden h-full shrink-0 overflow-hidden transition-[width] duration-300 ease-out lg:block",
            chatOpen ? "w-[34%] min-w-[360px] max-w-[460px] border-l border-white/[0.08]" : "w-0 border-l-0"
          )}
        >
          <div className="h-full min-w-[360px]">
            <AgentChatPanel />
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ─────────────────── top bar ─────────────────── */

function UnifiedHeader({
  loading,
  onRefresh,
  chatOpen,
  onToggleChat,
}: {
  loading: boolean;
  onRefresh: () => void;
  chatOpen: boolean;
  onToggleChat: () => void;
}) {
  return (
    <header className="relative z-30 flex shrink-0 items-stretch border-b border-white/[0.07] bg-[#02040a]/75 backdrop-blur-xl">
      {/* left — dashboard */}
      <div className="flex flex-1 items-center justify-between gap-4 px-5 py-3 md:px-8">
        <div className="flex items-center gap-3">
          <Link href="/jarvis" className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/55 transition hover:border-cyan-300/40 hover:text-white" title="Back to mission control">
            <ArrowLeft size={16} weight="bold" />
          </Link>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-400/10 text-cyan-300">
            <SquaresFour size={17} weight="fill" />
          </div>
          <span className="text-[16px] font-semibold tracking-tight text-white">Dashboard</span>
        </div>

        <button
          onClick={onRefresh}
          disabled={loading}
          title="Refresh data"
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/65 transition hover:border-cyan-300/40 hover:text-white disabled:opacity-50"
        >
          <ArrowsClockwise size={13} weight="bold" className={loading ? "animate-spin" : ""} />
          {loading ? "Syncing" : "Refresh"}
        </button>
      </div>

      {/* right — Command Centre toggle; the border-l is the separation where the chat panel starts */}
      <button
        onClick={onToggleChat}
        aria-pressed={chatOpen}
        title={chatOpen ? "Collapse the Command Centre" : "Open the Command Centre"}
        className={cn(
          "group hidden items-center gap-2.5 border-l border-white/[0.08] px-4 text-left transition hover:bg-white/[0.03] lg:flex",
          chatOpen && "lg:w-[34%] lg:min-w-[360px] lg:max-w-[460px]"
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-300/25 to-violet-400/20 text-cyan-200 ring-1 ring-inset ring-white/15">
          <Faders size={16} weight="fill" />
        </span>
        <div className="min-w-0">
          <div className="text-[14px] font-semibold leading-tight text-white">Command Centre</div>
          {chatOpen && <div className="text-[10.5px] text-white/40">Acts across your apps &amp; brain</div>}
        </div>
        <span className="ml-auto flex shrink-0 items-center gap-2 pl-2">
          {chatOpen && (
            <span className="hidden items-center gap-1.5 rounded-full bg-emerald-400/[0.08] px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-400/20 xl:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Live
            </span>
          )}
          <CaretRight size={15} weight="bold" className={cn("text-white/45 transition-transform group-hover:text-white", !chatOpen && "rotate-180")} />
        </span>
      </button>
    </header>
  );
}

/* ─────────────────── pieces ─────────────────── */

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <h2 className="text-[14px] font-semibold uppercase tracking-[0.2em] text-white/55">{title}</h2>
      <div className="h-px flex-1 bg-gradient-to-r from-white/12 to-transparent" />
    </div>
  );
}

function EngagementGraph({ li, loading }: { li?: LinkedInMetrics; loading?: boolean }) {
  return (
    <Panel title="Engagement trend" subtitle="Reactions + comments + reposts · last 28 posts" accent="#d946ef" glow="#d946ef" className="h-full">
      {loading || !li ? (
        <div className="flex flex-col gap-3 pt-1">
          <div className="lead-shimmer h-[150px] w-full rounded-xl" />
          <div className="lead-shimmer h-3 w-1/2" />
        </div>
      ) : (
        <>
          <SparkArea series={li.series ?? []} avg={li.avgEngagement} />
          <div className="mt-3 grid grid-cols-3 gap-2.5">
            <GraphStat icon={Heart} color="#fb7185" label="Reactions" value={fmtCompact(li.reactions)} />
            <GraphStat icon={ChatCircle} color="#22d3ee" label="Comments" value={fmtCompact(li.comments)} />
            <GraphStat icon={ShareNetwork} color="#34d399" label="Reposts" value={fmtCompact(li.shares)} />
          </div>
        </>
      )}
    </Panel>
  );
}

function SparkArea({ series, avg }: { series: number[]; avg: number }) {
  const w = 600;
  const h = 156;
  const pad = 8;
  const data = Array.isArray(series) && series.length > 1 ? series : [0, 0];
  const max = Math.max(...data, 1);
  const stepX = (w - pad * 2) / (data.length - 1);
  const pts = data.map((v, i) => [pad + i * stepX, h - pad - (v / max) * (h - pad * 2)] as const);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${h} L${pts[0][0].toFixed(1)},${h} Z`;
  const last = pts[pts.length - 1];
  return (
    <div className="relative h-[156px] w-full overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-b from-fuchsia-500/[0.05] to-transparent">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <linearGradient id="engFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d946ef" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#d946ef" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="engLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#f0abfc" />
          </linearGradient>
        </defs>
        <motion.path d={area} fill="url(#engFill)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.9, delay: 0.25 }} />
        <motion.path
          d={line}
          fill="none"
          stroke="url(#engLine)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.15, ease: [0.4, 0, 0.2, 1] }}
        />
      </svg>
      {/* pulsing marker on the most recent post (positioned in %) */}
      <span
        className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fuchsia-300"
        style={{ left: `${(last[0] / w) * 100}%`, top: `${(last[1] / h) * 100}%`, boxShadow: "0 0 12px 2px rgba(217,70,239,0.7)" }}
      />
      <div className="pointer-events-none absolute right-3 top-2.5 rounded-full bg-black/30 px-2.5 py-1 text-[11px] font-medium text-white/60 backdrop-blur">
        avg {avg.toLocaleString()}/post
      </div>
    </div>
  );
}

function GraphStat({ icon: Icon, color, label, value }: { icon: PhIcon; color: string; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
      <div className="flex items-center gap-1.5">
        <Icon size={14} weight="fill" style={{ color }} />
        <span className="text-[18px] font-bold leading-none text-white">{value}</span>
      </div>
      <div className="mt-1 text-[11.5px] text-white/40">{label}</div>
    </div>
  );
}

function FinancialStrip() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {FINANCIALS.map((f) => (
        <Panel key={f.label} glow={f.color} className="min-h-[110px]">
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/45">{f.label}</span>
          <div className="mt-2 text-[26px] font-bold leading-none tracking-tight text-white" style={{ textShadow: `0 0 22px ${f.color}33` }}>
            {f.value}
          </div>
          <div className="mt-auto pt-3 text-[11px] text-white/40">{f.sub}</div>
        </Panel>
      ))}
    </div>
  );
}

function ConnectedApps() {
  const active = useOperatorActivity((s) => s.active);
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
      {CONNECTED.map((a) => (
        <AppCard key={a.name} app={a} active={active.includes(a.brand)} />
      ))}
    </div>
  );
}

function AppCard({ app, active }: { app: { name: string; brand: string }; active: boolean }) {
  const color = BRANDS[app.brand]?.color ?? "#22d3ee";
  return (
    <div
      className={cn(
        "group relative flex flex-col items-center gap-2.5 overflow-hidden rounded-2xl border bg-white/[0.025] px-3 py-4 transition-all duration-300",
        active ? "border-white/20 bg-white/[0.06]" : "border-white/[0.07] hover:-translate-y-0.5 hover:border-white/15 hover:bg-white/[0.04]"
      )}
      style={{
        boxShadow: active
          ? `0 0 0 1px ${color}80, 0 14px 50px -14px ${color}, inset 0 0 36px -10px ${color}66`
          : `inset 0 0 24px -14px ${color}55`,
      }}
    >
      {/* brand-tinted top bloom; intensifies when the Operator is using the app */}
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-2/3 transition-opacity duration-500"
        style={{ background: `radial-gradient(90% 70% at 50% 0%, ${color}${active ? "33" : "14"}, transparent 72%)` }}
      />
      {/* green "connected" indicator */}
      <span className="absolute right-2.5 top-2.5 flex h-2 w-2 items-center justify-center" title="Connected">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/50" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" style={{ boxShadow: "0 0 7px 1px rgba(52,211,153,0.85)" }} />
      </span>
      <div className="relative">
        <BrandMark brand={app.brand} size={48} radius={14} />
        {active && (
          <motion.span
            className="absolute -inset-1 rounded-[18px]"
            style={{ boxShadow: `0 0 0 2px ${color}` }}
            animate={{ opacity: [0.35, 1, 0.35], scale: [0.96, 1.06, 0.96] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </div>
      <div className="relative text-center">
        <div className="text-[13px] font-semibold text-white/85">{app.name}</div>
        <div
          className={cn("mt-0.5 flex items-center justify-center gap-1 text-[10.5px] font-medium", !active && "text-white/35")}
          style={active ? { color } : undefined}
        >
          {active ? (
            <>
              <span className="h-1 w-1 animate-pulse rounded-full" style={{ background: color }} /> Working
            </>
          ) : (
            "Connected"
          )}
        </div>
      </div>
    </div>
  );
}
