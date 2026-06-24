"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Lightning,
  Pulse,
  ArrowsClockwise,
  EnvelopeSimple,
  CalendarBlank,
  ChatCircleDots,
  Notebook,
  VideoCamera,
  LinkedinLogo,
  Heart,
  ChatCircle,
  ShareNetwork,
  type Icon as PhIcon,
} from "@phosphor-icons/react";
import { Panel, Rise, StatusDot } from "@/components/dashboard/ui";
import { MeetingsPanel, MiniStatStrip, StatBand } from "@/components/dashboard/panels";
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

const CONNECTED: { name: string; Icon: PhIcon; color: string }[] = [
  { name: "LinkedIn", Icon: LinkedinLogo, color: BRAND.fuchsia },
  { name: "Gmail", Icon: EnvelopeSimple, color: BRAND.amber },
  { name: "Google Calendar", Icon: CalendarBlank, color: BRAND.cyan },
  { name: "Slack", Icon: ChatCircleDots, color: BRAND.violet },
  { name: "Notion", Icon: Notebook, color: BRAND.sky },
  { name: "Zoom", Icon: VideoCamera, color: BRAND.emerald },
];

const CACHE_KEY = "sb_dashboard_live_v2"; // persists across page loads; Refresh re-pulls

export default function DashboardPage() {
  const [resp, setResp] = useState<LiveResp | null>(null);
  const [loading, setLoading] = useState(true);

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
  const status: "loading" | "live" | "demo" | "error" = loading ? "loading" : resp?.live ? "live" : resp?.error ? "error" : "demo";

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
    <div className="relative min-h-screen w-full bg-[#02040a] text-white">
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

      <TopBar status={status} loading={loading} onRefresh={() => load(true)} />

      <main className="relative z-10 mx-auto w-full max-w-[1400px] px-5 pb-16 pt-6 md:px-8">
        {/* LinkedIn engagement — real data from the scraped post set */}
        <SectionHeader title="LinkedIn engagement · last 200 posts" />
        <Rise>
          <StatBand kpis={heroKpis} loading={loading && !li} />
        </Rise>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Rise delay={0.06} className="lg:col-span-2">
            <TopPostPanel li={li} loading={loading && !li} />
          </Rise>
          <Rise delay={0.1}>
            <MeetingsPanel meetings={meetings} loading={loading} />
          </Rise>
        </div>

        {/* live from the connected apps (Zapier MCP) */}
        {liveMini && (
          <>
            <div className="mt-7">
              <SectionHeader title="Live · your connected apps" />
            </div>
            <Rise delay={0.14}>
              <MiniStatStrip stats={liveMini} />
            </Rise>
          </>
        )}

        <Rise delay={0.18} className="mt-4">
          <ConnectedApps />
        </Rise>

        {/* financials — the only placeholders (no Stripe) */}
        <div className="mt-8 mb-3 flex items-center gap-2.5">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.2em] text-white/55">Financials</h2>
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
  );
}

/* ─────────────────── top bar ─────────────────── */

function TopBar({ status, loading, onRefresh }: { status: "loading" | "live" | "demo" | "error"; loading: boolean; onRefresh: () => void }) {
  const [clock, setClock] = useState("");
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#02040a]/70 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-4 px-5 py-3.5 md:px-8">
        <div className="flex items-center gap-3">
          <Link href="/jarvis" className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/55 transition hover:border-cyan-300/40 hover:text-white" title="Back to mission control">
            <ArrowLeft size={16} weight="bold" />
          </Link>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-400/10 text-cyan-300">
            <Lightning size={18} weight="fill" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-bold tracking-[0.2em] text-cyan-100">SECOND BRAIN</span>
              <span className="rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white/45">Mission Control</span>
            </div>
            <div className="text-[10.5px] text-white/35">Live operating dashboard</div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <span
            className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-medium sm:flex ${
              status === "live"
                ? "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300"
                : status === "loading"
                  ? "border-amber-400/25 bg-amber-400/[0.08] text-amber-300"
                  : status === "error"
                    ? "border-rose-400/30 bg-rose-400/[0.08] text-rose-300"
                    : "border-white/15 bg-white/[0.05] text-white/55"
            }`}
          >
            <Pulse size={12} weight="bold" className={status === "loading" ? "animate-pulse" : ""} />
            {status === "live" ? "Live · connected apps" : status === "loading" ? "Syncing connected apps…" : status === "error" ? "Apps offline · LinkedIn live" : "LinkedIn live · apps idle"}
          </span>
          <span className="hidden font-mono text-[12px] tabular-nums tracking-widest text-cyan-200/75 md:block">{clock}</span>
          <button
            onClick={onRefresh}
            disabled={loading}
            title="Re-pull live data from your connected apps"
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11.5px] text-white/65 transition hover:border-cyan-300/40 hover:text-white disabled:opacity-50"
          >
            <ArrowsClockwise size={13} weight="bold" className={loading ? "animate-spin" : ""} />
            {loading ? "Syncing" : "Refresh"}
          </button>
        </div>
      </div>
    </header>
  );
}

/* ─────────────────── pieces ─────────────────── */

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.2em] text-white/55">{title}</h2>
      <div className="h-px flex-1 bg-gradient-to-r from-white/12 to-transparent" />
    </div>
  );
}

function TopPostPanel({ li, loading }: { li?: LinkedInMetrics; loading?: boolean }) {
  return (
    <Panel title="Top LinkedIn post" subtitle="Highest engagement" accent="#d946ef" glow="#d946ef" className="h-full">
      {loading || !li ? (
        <div className="flex flex-col gap-3 pt-1">
          <div className="lead-shimmer h-16 w-full rounded-xl" />
          <div className="lead-shimmer h-3 w-1/2" />
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-fuchsia-300/15 bg-fuchsia-400/[0.04] p-3.5">
            <p className="text-[13.5px] font-medium leading-relaxed text-white/85">“{li.topPost.hook}…”</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-white/55">
              <span className="flex items-center gap-1.5">
                <Heart size={13} weight="fill" className="text-rose-300/80" /> {li.topPost.reactions.toLocaleString()}
              </span>
              <span className="flex items-center gap-1.5">
                <ChatCircle size={13} weight="fill" className="text-cyan-300/80" /> {li.topPost.comments.toLocaleString()}
              </span>
              <span className="flex items-center gap-1.5">
                <ShareNetwork size={13} weight="fill" className="text-emerald-300/80" /> {li.topPost.shares.toLocaleString()}
              </span>
            </div>
          </div>
          <div className="mt-auto grid grid-cols-3 gap-2.5 pt-3">
            {[
              { l: "Posts", v: li.posts.toLocaleString() },
              { l: "Total engagement", v: fmtCompact(li.totalEngagement) },
              { l: "Reposts", v: fmtCompact(li.shares) },
            ].map((s) => (
              <div key={s.l} className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
                <div className="text-[17px] font-bold leading-none text-white">{s.v}</div>
                <div className="mt-1 text-[10.5px] text-white/40">{s.l}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
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
  return (
    <Panel title="Connected apps" subtitle="Live via Zapier MCP" accent="#34d399" glow="#34d399">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {CONNECTED.map((a) => (
          <div key={a.name} className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
            <span className="flex items-center gap-2.5 text-[12.5px] text-white/75">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border" style={{ background: `${a.color}1a`, borderColor: `${a.color}40`, color: a.color }}>
                <a.Icon size={15} weight="fill" />
              </span>
              {a.name}
            </span>
            <StatusDot color="#34d399" pulse />
          </div>
        ))}
      </div>
    </Panel>
  );
}
