"use client";

import { useChat } from "@ai-sdk/react";
import { memo, useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import KronosOrb from "@/components/jarvis/KronosOrb";
import LinkedInProfileReport from "./LinkedInProfileReport";
import LinkedInPostsReport from "./LinkedInPostsReport";
import { BrandMark } from "./BrandMark";
import { BRANDS, brandKey } from "@/lib/brand-marks";
import { useOperatorActivity } from "@/lib/operator-activity";
import { transcribeAudio } from "@/lib/stt";
import { sounds } from "@/lib/sounds";
import { motion } from "motion/react";
import {
  PaperPlaneRight,
  Microphone,
  CircleNotch,
  Brain,
  MagnifyingGlass,
  CheckCircle,
  XCircle,
  Check,
  X,
  Lightning,
  Warning,
  ArrowRight,
  type Icon as PhIcon,
} from "@phosphor-icons/react";

const RISK: Record<string, { label: string; color: string; bg: string }> = {
  low: { label: "Low risk", color: "#6ee7b7", bg: "rgba(52,211,153,0.12)" },
  medium: { label: "Review", color: "#fcd34d", bg: "rgba(245,158,11,0.12)" },
  high: { label: "High impact", color: "#fda4af", bg: "rgba(244,63,94,0.14)" },
};

const SUGGESTIONS = [
  "Analyze my last 20 LinkedIn posts",
  "Summarize what my team is discussing in Slack",
  "What's on my calendar this week?",
  "Draft a follow-up email to my last call",
];

/* ------- humanized tool labels (no raw tech names) ------- */
type Args = Record<string, unknown>;
function humanLabel(name: string, args: Args, done: boolean): string {
  const a = args || {};
  const brand = brandKey(String(a.selected_api || ""));
  const appName = brand ? BRANDS[brand].name : "your apps";
  switch (name) {
    case "listApps":
      return done ? "Connected your apps" : "Connecting your apps";
    case "listActions":
      return `${done ? "Opened" : "Opening"} ${appName}`;
    case "readData":
      return `${done ? "Read" : "Reading"} ${appName}`;
    case "searchBrain":
      return done ? "Searched your second brain" : "Searching your second brain";
    case "readBrainNote":
      return `${done ? "Read note" : "Reading note"}${a.title ? `: ${String(a.title)}` : ""}`;
    case "linkedinProfile":
      return `${done ? "Found profile" : "Looking up profile"}${a.query ? `: ${String(a.query)}` : ""}`;
    case "linkedinPostsReport":
      return done ? "Analyzed your LinkedIn posts" : "Scraping your LinkedIn posts";
    default:
      return done ? "Done" : "Working";
  }
}

type Inv = { toolCallId: string; toolName: string; args: Args; state: string; result?: Record<string, unknown> };
type Part = { type: string; text?: string; toolInvocation?: Inv };

export default function AgentChatPanel() {
  const { messages, input, handleInputChange, handleSubmit, addToolResult, isLoading, append, setInput } = useChat({
    api: "/api/dashboard/agent",
    maxSteps: 12,
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // voice input — record → Whisper (/api/stt) → drop the transcript into the box
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const inputRef = useRef(input);
  inputRef.current = input;

  const toggleMic = async () => {
    if (recording) {
      recRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        if (blob.size < 800) return;
        setTranscribing(true);
        try {
          const text = (await transcribeAudio(blob)).trim();
          if (text) setInput((inputRef.current ? inputRef.current.trim() + " " : "") + text);
        } catch {
          /* transcription failed — silently ignore */
        }
        setTranscribing(false);
      };
      mr.start();
      recRef.current = mr;
      setRecording(true);
    } catch {
      /* mic permission denied / unavailable */
    }
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Light up the matching connected-app card on the dashboard while the agent is
  // actively touching that app (in-flight tool calls).
  const setActive = useOperatorActivity((s) => s.setActive);
  useEffect(() => {
    if (!isLoading) {
      setActive([]);
      return;
    }
    const last = messages[messages.length - 1] as unknown as { role: string; parts?: Part[] };
    if (!last || last.role !== "assistant") {
      setActive([]);
      return;
    }
    const brands = new Set<string>();
    for (const p of last.parts ?? []) {
      const inv = p.toolInvocation;
      if (p.type !== "tool-invocation" || !inv || inv.state === "result") continue;
      const b = brandKey(String(inv.args?.selected_api || "")) || (inv.toolName === "linkedinProfile" || inv.toolName === "linkedinPostsReport" ? "linkedin" : null);
      if (b) brands.add(b);
    }
    setActive([...brands]);
  }, [messages, isLoading, setActive]);
  useEffect(() => () => setActive([]), [setActive]);

  // sound cues: a soft tick as new responses land, a warm chime when a run finishes
  const prevLoadingRef = useRef(false);
  const prevCountRef = useRef(0);
  const lastTickRef = useRef(0);
  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      prevCountRef.current = messages.length;
      if (messages[messages.length - 1]?.role === "assistant") {
        const now = Date.now();
        if (now - lastTickRef.current > 150) {
          lastTickRef.current = now;
          sounds.message();
        }
      }
    }
    if (prevLoadingRef.current && !isLoading) sounds.complete();
    prevLoadingRef.current = isLoading;
  }, [messages, isLoading]);

  const approve = async (inv: Inv) => {
    setBusy(inv.toolCallId);
    try {
      const res = await fetch("/api/dashboard/agent/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected_api: inv.args.selected_api, action: inv.args.action, instructions: inv.args.instructions, params: {} }),
      });
      const j = await res.json().catch(() => ({ ok: false, error: "Bad response" }));
      addToolResult({ toolCallId: inv.toolCallId, result: { approved: true, executed: !!j.ok, status: j.status, result: j.result, error: j.error } });
    } catch (e) {
      addToolResult({ toolCallId: inv.toolCallId, result: { approved: true, executed: false, error: e instanceof Error ? e.message : String(e) } });
    } finally {
      setBusy(null);
    }
  };
  const reject = (inv: Inv) => addToolResult({ toolCallId: inv.toolCallId, result: { approved: false, note: "The user declined this action." } });

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isLoading) {
        sounds.send();
        handleSubmit();
      }
    }
  };

  return (
    <div className="relative flex h-full w-full flex-col bg-gradient-to-b from-white/[0.05] via-white/[0.015] to-transparent backdrop-blur-xl backdrop-saturate-150">
      {/* messages — the header now lives in the unified top bar */}
      <div ref={scrollRef} data-lenis-prevent className="no-scrollbar relative min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-3 pt-4">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          messages.map((m, i) => (
            <MessageRow
              key={m.id}
              role={m.role}
              content={m.content}
              parts={(m as unknown as { parts?: Part[] }).parts}
              busy={busy}
              onApprove={approve}
              onReject={reject}
            />
          ))
        )}
        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex items-center gap-2 text-[12px] text-white/45">
            <CircleNotch size={14} weight="bold" className="animate-spin text-cyan-300" /> Thinking…
          </div>
        )}
      </div>

      {/* suggested questions — only on the empty state, just above the input bar */}
      {messages.length === 0 && (
        <Suggestions
          onPick={(s) => {
            sounds.send();
            append({ role: "user", content: s });
          }}
        />
      )}

      {/* floating composer — an elevated pill above a soft scrim */}
      <div className="relative shrink-0">
        <div className="pointer-events-none absolute inset-x-0 -top-5 h-5 bg-gradient-to-t from-[#04060c] to-transparent" />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim() && !isLoading) {
              sounds.send();
              handleSubmit();
            }
          }}
          className="px-3 pb-3.5 pt-1"
        >
          <div className="flex items-end gap-2 rounded-[20px] border border-white/[0.12] bg-[#0a0f1a]/80 px-3 py-2 shadow-[0_22px_60px_-22px_rgba(0,0,0,0.9),0_0_34px_-14px_rgba(34,211,238,0.3)] ring-1 ring-inset ring-white/[0.05] backdrop-blur-2xl backdrop-saturate-150 transition focus-within:border-cyan-300/45 focus-within:ring-cyan-300/20">
            <textarea
              value={input}
              onChange={handleInputChange}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="Ask the operator to do anything…"
              className="max-h-32 flex-1 resize-none bg-transparent py-1.5 text-[14.5px] leading-relaxed text-white/90 outline-none placeholder:text-white/30"
            />
          <button
            type="button"
            onClick={toggleMic}
            disabled={transcribing || isLoading}
            aria-label={recording ? "Stop recording" : "Voice input"}
            title={recording ? "Stop recording" : "Voice input"}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition disabled:opacity-40 ${
              recording
                ? "border-rose-400/50 bg-rose-500/20 text-rose-200"
                : "border-white/12 bg-white/[0.04] text-white/55 hover:border-cyan-300/40 hover:text-white"
            }`}
          >
            {transcribing ? (
              <CircleNotch size={15} weight="bold" className="animate-spin" />
            ) : recording ? (
              <span className="h-2.5 w-2.5 animate-pulse rounded-[3px] bg-rose-300" />
            ) : (
              <Microphone size={16} weight="fill" />
            )}
          </button>
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            aria-label="Send"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-400/90 text-[#02040a] transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
          >
            {isLoading ? <CircleNotch size={16} weight="bold" className="animate-spin" /> : <PaperPlaneRight size={16} weight="fill" />}
          </button>
          </div>
          <div className="mt-1.5 px-1 text-center text-[10.5px] text-white/30">Reads run instantly · Writes always ask first</div>
        </form>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 pb-6 text-center">
      {/* decorative KRONOS orb — big + centered for beauty; gone once a prompt is sent */}
      <div className="relative h-52 w-52 shrink-0">
        <KronosOrb className="absolute inset-0 h-full w-full" color="#22d3ee" intensity={0.55} />
      </div>
      <div className="-mt-2 text-[16px] font-semibold text-white">Your control centre</div>
      <p className="mt-1.5 max-w-[290px] text-[13px] leading-relaxed text-white/45">
        Read or act across Gmail, Slack, Notion, Calendar, Zoom &amp; LinkedIn, grounded in your second brain. It asks before anything writes.
      </p>
    </div>
  );
}

function Suggestions({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="no-scrollbar flex shrink-0 gap-2 overflow-x-auto px-3 pb-3 pt-1">
      {SUGGESTIONS.map((s) => (
        <button
          key={s}
          onClick={() => onPick(s)}
          className="group flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-[12.5px] text-white/65 transition hover:border-cyan-300/35 hover:bg-white/[0.07] hover:text-white"
        >
          {s}
          <ArrowRight size={12} weight="bold" className="text-white/25 transition group-hover:translate-x-0.5 group-hover:text-cyan-300" />
        </button>
      ))}
    </div>
  );
}

/* --------------------- one message (parts in order) --------------------- */

function MessageRow({
  role,
  content,
  parts,
  busy,
  onApprove,
  onReject,
}: {
  role: string;
  content: string;
  parts?: Part[];
  busy: string | null;
  onApprove: (inv: Inv) => void;
  onReject: (inv: Inv) => void;
}) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] rounded-2xl rounded-br-md bg-cyan-400/[0.12] px-3.5 py-2 text-[15px] leading-relaxed text-white/90 ring-1 ring-inset ring-cyan-300/20">
          {content}
        </div>
      </div>
    );
  }

  // Render the assistant turn as its ORDERED parts (text ↔ tool ↔ text). Fall back
  // to content + toolInvocations only if parts are unavailable.
  const list: Part[] =
    parts && parts.length
      ? parts
      : [...((content ? [{ type: "text", text: content }] : []) as Part[])];

  return (
    <div className="space-y-2">
      {list.map((part, idx) => (
        <PartView key={idx} part={part} busy={busy} onApprove={onApprove} onReject={onReject} />
      ))}
    </div>
  );
}

/* A single part — MEMOIZED so a finished part never re-animates when a later part
 * streams in (kills the "typewriter redoes itself" bug). */
function partSig(p: Part): string {
  if (p.type === "text") return `t:${(p.text || "").length}`;
  if (p.type === "tool-invocation" && p.toolInvocation) return `i:${p.toolInvocation.toolCallId}:${p.toolInvocation.state}`;
  return p.type;
}
const PartView = memo(
  function PartView({ part, busy, onApprove, onReject }: { part: Part; busy: string | null; onApprove: (i: Inv) => void; onReject: (i: Inv) => void }) {
    if (part.type === "text") return part.text?.trim() ? <TextBlock text={part.text} /> : null;
    if (part.type !== "tool-invocation" || !part.toolInvocation) return null;
    const inv = part.toolInvocation;
    if (inv.toolName === "proposeAction") return <ApprovalCard inv={inv} busy={busy === inv.toolCallId} onApprove={onApprove} onReject={onReject} />;
    if (inv.toolName === "linkedinProfile" && inv.state === "result")
      return <LinkedInProfileReport data={inv.result as Parameters<typeof LinkedInProfileReport>[0]["data"]} />;
    if (inv.toolName === "linkedinPostsReport" && inv.state === "result")
      return <LinkedInPostsReport data={inv.result as Parameters<typeof LinkedInPostsReport>[0]["data"]} />;
    // a read with actual rows → branded source card; an empty read → just a chip (no empty card)
    if (inv.toolName === "readData" && inv.state === "result") {
      const recs = (inv.result as { records?: unknown[] })?.records;
      return Array.isArray(recs) && recs.length > 0 ? <SourceResultCard inv={inv} /> : <ToolChip inv={inv} />;
    }
    return <ToolChip inv={inv} />;
  },
  // Re-render ONLY when this part's own content grows or its approval state changes.
  // (Deliberately ignore `streaming` flips so a finished part never re-animates when
  // a LATER part starts streaming — that was the "typewriter redoes itself" bug.)
  (a, b) => partSig(a.part) === partSig(b.part) && a.busy === b.busy
);

// Plain, instant Markdown — NO typewriter/form-up (Streamdown re-renders the full
// current text on each chunk, so streaming just reveals more, never re-types).
function TextBlock({ text }: { text: string }) {
  return (
    <div className="text-[15px] leading-relaxed text-white/[0.88] [&_a]:text-cyan-300 [&_a]:underline [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_code]:text-[12px] [&_h1]:mb-1 [&_h1]:mt-1.5 [&_h1]:text-[14.5px] [&_h1]:font-semibold [&_h1]:text-white [&_h2]:mb-1 [&_h2]:mt-2.5 [&_h2]:text-[10px] [&_h2]:font-semibold [&_h2]:uppercase [&_h2]:tracking-[0.14em] [&_h2]:text-cyan-300/80 [&_h3]:mb-0.5 [&_h3]:mt-2 [&_h3]:text-[12.5px] [&_h3]:font-semibold [&_h3]:text-white/90 [&_li]:my-1 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-[1.1rem] [&_p]:my-1.5 [&_strong]:font-semibold [&_strong]:text-white [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-[1.1rem] [&_ul]:marker:text-cyan-300/50">
      <Streamdown controls={false}>{text}</Streamdown>
    </div>
  );
}

function ToolChip({ inv }: { inv: Inv }) {
  const done = inv.state === "result";
  const brand = brandKey(String(inv.args?.selected_api || "")) || (inv.toolName === "linkedinProfile" || inv.toolName === "linkedinPostsReport" ? "linkedin" : null);
  const isBrain = inv.toolName === "searchBrain" || inv.toolName === "readBrainNote";
  return (
    <div className="flex items-center gap-2 px-1 text-[11.5px] text-white/50">
      {done ? <Check size={12} weight="bold" className="text-emerald-400/80" /> : <CircleNotch size={12} weight="bold" className="animate-spin text-cyan-300/80" />}
      {brand ? (
        <BrandMark brand={brand} size={16} radius={5} />
      ) : (
        <span className="flex h-4 w-4 items-center justify-center rounded-[5px] bg-white/[0.06] text-white/45">
          {isBrain ? <Brain size={11} weight="fill" /> : inv.toolName === "readData" ? <MagnifyingGlass size={11} weight="bold" /> : <Lightning size={11} weight="fill" />}
        </span>
      )}
      <span>{humanLabel(inv.toolName, inv.args, done)}</span>
    </div>
  );
}

/* --------------------- branded "source" result card --------------------- */

function recLines(rec: unknown): { title: string; sub: string } {
  if (rec == null) return { title: "", sub: "" };
  if (typeof rec !== "object") return { title: String(rec).slice(0, 120), sub: "" };
  const r = rec as Record<string, unknown>;
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const v = r[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };
  const title =
    get("subject", "title", "name", "summary", "topic", "text", "message", "displayName", "fullName") ||
    (Object.values(r).find((v) => typeof v === "string" && (v as string).trim()) as string) ||
    "Item";
  const sub = get("from", "fromName", "sender", "author", "channel", "date", "time", "startTime", "start", "when", "email", "snippet", "preview", "status", "location");
  return { title: title.slice(0, 120), sub: sub.slice(0, 90) };
}

function SourceResultCard({ inv }: { inv: Inv }) {
  const key = brandKey(String(inv.args?.selected_api || ""));
  const b = key ? BRANDS[key] : null;
  const result = (inv.result || {}) as { count?: number; records?: unknown[] };
  const records = Array.isArray(result.records) ? result.records : [];
  const count = result.count ?? records.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl border border-white/[0.12] bg-white/[0.045] shadow-[0_16px_44px_-26px_rgba(0,0,0,0.8)] backdrop-blur-xl"
    >
      <div
        className="flex items-center gap-2.5 px-3.5 py-2.5"
        style={{ background: b ? `linear-gradient(90deg, ${b.color}26, transparent 80%)` : undefined }}
      >
        {key ? <BrandMark brand={key} size={22} radius={6} /> : <span className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-white/10 text-white/60"><MagnifyingGlass size={12} weight="bold" /></span>}
        <span className="text-[12.5px] font-semibold text-white">{b?.name ?? "Results"}</span>
        <span className="ml-auto rounded-full bg-white/[0.06] px-2 py-0.5 text-[10.5px] font-medium tabular-nums text-white/55">
          {count} {count === 1 ? "result" : "results"}
        </span>
      </div>
      {records.length > 0 ? (
        <div className="divide-y divide-white/[0.05]">
          {records.slice(0, 6).map((rec, i) => {
            const { title, sub } = recLines(rec);
            return (
              <div key={i} className="flex items-start gap-2.5 px-3.5 py-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: b?.color ?? "#9ca3af" }} />
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] font-medium text-white/90">{title}</div>
                  {sub && <div className="truncate text-[11px] text-white/45">{sub}</div>}
                </div>
              </div>
            );
          })}
          {records.length > 6 && <div className="px-3.5 py-1.5 text-[11px] text-white/35">+ {records.length - 6} more</div>}
        </div>
      ) : (
        <div className="px-3.5 py-3 text-[12px] text-white/45">No results.</div>
      )}
    </motion.div>
  );
}

/* --------------------- approval card (writes) --------------------- */

function ApprovalCard({ inv, busy, onApprove, onReject }: { inv: Inv; busy: boolean; onApprove: (i: Inv) => void; onReject: (i: Inv) => void }) {
  const a = inv.args as { app?: string; title?: string; summary?: string; details?: { label: string; value: string }[]; risk?: string };
  const key = brandKey(String(a.app || inv.args?.selected_api || ""));
  const risk = RISK[a.risk ?? "medium"] ?? RISK.medium;
  const resolved = inv.state === "result" && inv.result;
  const r = (inv.result ?? {}) as { approved?: boolean; executed?: boolean; error?: string };

  if (resolved) {
    const ok = r.approved && r.executed;
    return (
      <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[12px]">
        {r.approved === false ? (
          <>
            <XCircle size={15} weight="fill" className="text-white/45" />
            <span className="text-white/55">Declined · {a.title}</span>
          </>
        ) : ok ? (
          <>
            <CheckCircle size={15} weight="fill" className="text-emerald-400" />
            <span className="text-white/80">Done · {a.title}</span>
          </>
        ) : (
          <>
            <Warning size={15} weight="fill" className="text-rose-400" />
            <span className="text-rose-200/80">Failed · {r.error || a.title}</span>
          </>
        )}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl border border-white/[0.14] bg-white/[0.05] shadow-[0_18px_50px_-26px_rgba(0,0,0,0.85)] backdrop-blur-xl"
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.07] px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          {key ? <BrandMark brand={key} size={26} /> : <span className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-cyan-400/15 text-cyan-300 ring-1 ring-inset ring-cyan-300/30"><Lightning size={14} weight="fill" /></span>}
          <div className="min-w-0">
            <div className="truncate text-[12.5px] font-semibold text-white">{a.title}</div>
            <div className="text-[10px] uppercase tracking-wider text-white/35">{a.app} · needs approval</div>
          </div>
        </div>
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-semibold" style={{ background: risk.bg, color: risk.color }}>
          {risk.label}
        </span>
      </div>

      <div className="px-3.5 py-3">
        {a.summary && <p className="mb-2.5 text-[12.5px] leading-relaxed text-white/75">{a.summary}</p>}
        {a.details?.length ? (
          <div className="space-y-1.5 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5">
            {a.details.map((d, i) => (
              <div key={i} className="flex gap-2 text-[12px]">
                <span className="w-20 shrink-0 text-white/40">{d.label}</span>
                <span className="min-w-0 flex-1 break-words text-white/80">{d.value}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex gap-2 border-t border-white/[0.07] px-3.5 py-2.5">
        <button
          onClick={() => onApprove(inv)}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-cyan-400/90 px-3 py-2 text-[12.5px] font-semibold text-[#02040a] transition hover:bg-cyan-300 disabled:opacity-60"
        >
          {busy ? <CircleNotch size={14} weight="bold" className="animate-spin" /> : <Check size={14} weight="bold" />}
          {busy ? "Running…" : "Approve & run"}
        </button>
        <button
          onClick={() => onReject(inv)}
          disabled={busy}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-[12.5px] font-medium text-white/65 transition hover:border-rose-400/40 hover:text-rose-200 disabled:opacity-40"
        >
          <X size={14} weight="bold" /> Decline
        </button>
      </div>
    </motion.div>
  );
}
