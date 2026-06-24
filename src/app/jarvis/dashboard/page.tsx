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
  FolderSimple,
  LinkedinLogo,
  type Icon as PhIcon,
} from "@phosphor-icons/react";
import { Panel, Rise, StatusDot } from "@/components/dashboard/ui";
import { LiveFeed, MeetingsPanel, MiniStatStrip, StatBand } from "@/components/dashboard/panels";
import { BRAND, type ActivityKind } from "@/lib/dashboard-data";

/**
 * `/jarvis/dashboard` — a REAL-data cockpit. Everything except the financial
 * metrics is pulled live from the founder's connected apps via Zapier MCP
 * (Gmail, Calendar, Slack, Notion, Zoom, Drive, LinkedIn). The financials are
 * the only placeholders — they'd need a Stripe connection we deliberately skip.
 */

/* ─── live data from the connected apps (Zapier MCP) ─── */

type DashMeeting = { title: string; when: string; durationMins?: number | null; attendees?: number | null; platform?: string | null };
type LiveResp = {
  live: boolean;
  error?: string;
  cached?: boolean;
  note?: string;
  data?: {
    kpis: { key: string; label: string; value: number; format: "currency" | "compact" | "number" | "percent"; delta: number; caption: string; source: string }[];
    miniStats: { label: string; value: string; delta: number }[];
    meetings: { upcoming: DashMeeting[]; last: DashMeeting | null };
    activity: { source: string; text: string }[];
  };
};

const KPI_COLORS = [BRAND.cyan, BRAND.violet, BRAND.amber, BRAND.emerald];
const MINI_COLORS = [BRAND.cyan, BRAND.amber, BRAND.emerald, BRAND.violet, BRAND.fuchsia, BRAND.sky];
const SRC: Record<string, { color: string; kind: ActivityKind }> = {
  Calendar: { color: BRAND.cyan, kind: "route" },
  Gmail: { color: BRAND.amber, kind: "ops" },
  Slack: { color: BRAND.violet, kind: "content" },
  Notion: { color: BRAND.sky, kind: "build" },
  Zoom: { color: BRAND.emerald, kind: "win" },
  LinkedIn: { color: BRAND.fuchsia, kind: "content" },
  Drive: { color: BRAND.gold, kind: "build" },
  Other: { color: BRAND.cyan, kind: "route" },
};

/* fake financials — the ONLY placeholder data (Stripe deliberately not connected) */
const FINANCIALS = [
  { label: "MRR", value: "$284.9k", sub: "Recurring revenue", color: BRAND.emerald },
  { label: "Open pipeline", value: "$1.24M", sub: "64 deals", color: BRAND.cyan },
  { label: "ARR", value: "$3.4M", sub: "Annual run-rate", color: BRAND.violet },
  { label: "Avg deal size", value: "$19.4k", sub: "Won deals", color: BRAND.amber },
];

const CONNECTED: { name: string; Icon: PhIcon; color: string }[] = [
  { name: "Gmail", Icon: EnvelopeSimple, color: BRAND.amber },
  { name: "Google Calendar", Icon: CalendarBlank, color: BRAND.cyan },
  { name: "Slack", Icon: ChatCircleDots, color: BRAND.violet },
  { name: "Notion", Icon: Notebook, color: BRAND.sky },
  { name: "Zoom", Icon: VideoCamera, color: BRAND.emerald },
  { name: "Google Drive", Icon: FolderSimple, color: BRAND.gold },
  { name: "LinkedIn", Icon: LinkedinLogo, color: BRAND.fuchsia },
];

export default function DashboardPage() {
  const [resp, setResp] = useState<LiveResp | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback((refresh = false) => {
    setLoading(true);
    fetch(`/api/dashboard/data${refresh ? "?refresh=1" : ""}`)
      .then((r) => r.json())
      .then((j: LiveResp) => setResp(j))
      .catch((e) => setResp({ live: false, error: e instanceof Error ? e.message : String(e) }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const d = resp?.live ? resp.data : undefined;
  const isLive = Boolean(resp?.live);
  const status: "loading" | "live" | "demo" | "error" = loading ? "loading" : isLive ? "live" : resp?.error ? "error" : "demo";
  const kpis = d?.kpis?.length ? d.kpis.map((k, i) => ({ ...k, color: KPI_COLORS[i % KPI_COLORS.length] })) : undefined;
  const miniStats = d?.miniStats?.length ? d.miniStats.map((s, i) => ({ ...s, color: MINI_COLORS[i % MINI_COLORS.length] })) : undefined;
  const activity = d?.activity?.length
    ? d.activity.map((a) => ({ ...(SRC[a.source] ?? SRC.Other), agent: a.source, text: a.text }))
    : undefined;
  const meetings = d?.meetings;

  return (
    <div className="relative min-h-screen w-full bg-[#02040a] text-white">
      <div
        className="pointer-events-none fixed inset-0"
        style={{ background: "radial-gradient(130% 90% at 50% 0%, #070c18 0%, #02040a 55%, #010207 100%)" }}
      />
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.22]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(34,211,238,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.05) 1px, transparent 1px)",
          backgroundSize: "46px 46px",
          maskImage: "radial-gradient(130% 80% at 50% 0%, #000 25%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(130% 80% at 50% 0%, #000 25%, transparent 80%)",
        }}
      />
      <div className="blob-a pointer-events-none fixed -left-32 top-24 h-[420px] w-[420px] rounded-full bg-cyan-500/[0.07] blur-[120px]" />
      <div className="blob-b pointer-events-none fixed -right-28 top-1/3 h-[460px] w-[460px] rounded-full bg-violet-500/[0.07] blur-[130px]" />

      <TopBar status={status} loading={loading} onRefresh={() => load(true)} />

      <main className="relative z-10 mx-auto w-full max-w-[1400px] px-5 pb-16 pt-6 md:px-8">
        {/* live metrics from the connected apps */}
        <SectionHeader title="Live · your connected apps" />
        <Rise>
          <StatBand kpis={kpis} loading={loading} />
        </Rise>
        <Rise delay={0.05} className="mt-4">
          <MiniStatStrip stats={miniStats} loading={loading} />
        </Rise>

        {/* meetings + connected apps */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Rise delay={0.1} className="lg:col-span-2">
            <MeetingsPanel meetings={meetings} loading={loading} />
          </Rise>
          <Rise delay={0.14}>
            <ConnectedApps />
          </Rise>
        </div>

        {/* live activity, spanning every app */}
        <Rise delay={0.18} className="mt-4">
          <LiveFeed activity={activity} loading={loading} />
        </Rise>

        {/* financials — the only placeholders (no Stripe connection) */}
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
          Second Brain · live from your connected apps via Zapier · financials are placeholder until Stripe is connected
        </p>
      </main>
    </div>
  );
}

/* ─────────────────── top bar ─────────────────── */

function TopBar({
  status,
  loading,
  onRefresh,
}: {
  status: "loading" | "live" | "demo" | "error";
  loading: boolean;
  onRefresh: () => void;
}) {
  const [clock, setClock] = useState("");
  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#02040a]/70 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-4 px-5 py-3.5 md:px-8">
        <div className="flex items-center gap-3">
          <Link
            href="/jarvis"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/55 transition hover:border-cyan-300/40 hover:text-white"
            title="Back to mission control"
          >
            <ArrowLeft size={16} weight="bold" />
          </Link>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-400/10 text-cyan-300">
            <Lightning size={18} weight="fill" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-bold tracking-[0.2em] text-cyan-100">SECOND BRAIN</span>
              <span className="rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white/45">
                Mission Control
              </span>
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
            {status === "live"
              ? "Live · connected apps"
              : status === "loading"
                ? "Syncing connected apps…"
                : status === "error"
                  ? "Sync failed"
                  : "Demo data"}
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

/* ─────────────────── small pieces ─────────────────── */

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.2em] text-white/55">{title}</h2>
      <div className="h-px flex-1 bg-gradient-to-r from-white/12 to-transparent" />
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
  return (
    <Panel title="Connected apps" subtitle="Live via Zapier MCP" accent="#34d399" glow="#34d399" className="h-full">
      <div className="flex flex-col gap-2">
        {CONNECTED.map((a) => (
          <div key={a.name} className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
            <span className="flex items-center gap-2.5 text-[12.5px] text-white/75">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border" style={{ background: `${a.color}1a`, borderColor: `${a.color}40`, color: a.color }}>
                <a.Icon size={15} weight="fill" />
              </span>
              {a.name}
            </span>
            <span className="flex items-center gap-1.5 text-[10.5px] font-medium text-emerald-300">
              <StatusDot color="#34d399" pulse />
              Connected
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
