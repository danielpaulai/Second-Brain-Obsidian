"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { PaperPlaneTilt, CircleNotch, Sparkle } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { Streamdown } from "streamdown";
import { toast } from "sonner";
import AgentBar from "./AgentBar";
import AgentIcon from "./AgentIcon";
import { AGENTS, type AgentId } from "@/lib/agents";
import { cn } from "@/lib/utils";
import { sounds } from "@/lib/sounds";
import { usePresentation } from "@/lib/presentation-store";
import { useVoice } from "@/lib/voice-store";
import { speak } from "@/lib/tts";
import {
  submitThump,
  startThinkingSwell,
  stopThinkingSwell,
  replyChime,
} from "@/lib/cinema-audio";
import ThinkingPulse from "@/components/ThinkingPulse";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import VoiceInput from "@/components/VoiceInput";

type Props = {
  /** CITED notes — the [[wikilinks]] the answer actually used. Fired once at the end (emphasis). */
  onBrainQuery: (noteTitles: string[]) => void;
  /** RETRIEVED notes — fired live as each brain tool call resolves (the "actively querying" moment). */
  onResearch?: (noteTitles: string[]) => void;
  /** A new query has begun — reset highlight/ignition state. Receives the user's query text. */
  onQueryStart?: (query: string) => void;
  agent: AgentId;
  onAgentChange: (a: AgentId) => void;
};

export type ChatPanelHandle = {
  ask: (prompt: string) => void;
};

const ChatPanel = forwardRef<ChatPanelHandle, Props>(function ChatPanel(
  { onBrainQuery, onResearch, onQueryStart, agent, onAgentChange },
  ref
) {
  const presentationOn = usePresentation((s) => s.on);
  const stageOn = usePresentation((s) => s.mode === "stage");
  const lastStreamLenRef = useRef(0);
  const seenTools = useRef<Set<string>>(new Set());
  const prevLoading = useRef(false);
  const { messages, input, handleInputChange, handleSubmit, isLoading, setInput, append } =
    useChat({
      api: "/api/chat",
      body: { agentId: agent },
      onFinish: (msg) => {
        // CITED notes = the [[wikilinks]] the model actually used (fallback: retrieved hits).
        const text = typeof msg.content === "string" ? msg.content : "";
        const cited = [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) =>
          m[1].split("|")[0].split("#")[0].trim()
        );
        const toolHits = (msg.toolInvocations || []).flatMap((t: any) =>
          t.result?.results?.map((r: any) => r.title) || (t.result?.title ? [t.result.title] : [])
        );
        const finalCited = cited.length ? cited : toolHits;
        const stage = usePresentation.getState().mode === "stage";
        sounds.reply();
        if (presentationOn) {
          void stopThinkingSwell();
          void replyChime();
        }
        lastStreamLenRef.current = 0;

        if (stage) {
          // Buffer the answer — StageReadthrough reveals it (and speaks it) only AFTER the
          // node read-through has played out, so the answer never races the retrieval.
          usePresentation.getState().setPendingAnswer(text);
          useVoice.getState().setSpeakNext(false); // StageAnswer owns the speech on stage
          return;
        }

        // Live: light the cited notes, toast, and speak if this came from push-to-talk.
        onBrainQuery(finalCited);
        toast.success(`${AGENTS[agent].name} replied`, {
          description:
            finalCited.length > 0
              ? `Cited ${finalCited.length} note${finalCited.length === 1 ? "" : "s"} from your brain`
              : "From context",
        });
        const v = useVoice.getState();
        if (v.speakNext) {
          v.setSpeakNext(false);
          v.setPhase("speaking");
          void speak(text, {
            onEnded: () => useVoice.getState().setPhase("idle"),
            onError: () => useVoice.getState().setPhase("idle"),
          });
        }
      },
      onError: () => {
        // Never leave the voice HUD stuck on "thinking" if the request fails.
        const v = useVoice.getState();
        v.setSpeakNext(false);
        if (v.phase === "thinking" || v.phase === "transcribing") v.setPhase("idle");
        // Stage: unblock the read-through / LinkedIn theater (they wait on a buffered answer).
        const p = usePresentation.getState();
        if (p.mode === "stage" && p.querying && p.pendingAnswer == null) {
          p.setPendingAnswer("Sorry — I hit a snag pulling that together. Mind asking again?");
        }
      },
    });

  // A new query started → reset per-turn ignition bookkeeping. On stage, a LinkedIn
  // "scrape" question runs the post-card theater instead of the normal read-through.
  useEffect(() => {
    if (isLoading && !prevLoading.current) {
      seenTools.current.clear();
      lastStreamLenRef.current = 0;
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      const userText = typeof lastUser?.content === "string" ? lastUser.content : "";
      if (usePresentation.getState().mode === "stage") {
        const txt = userText.toLowerCase();
        const isLinkedIn =
          /linked\s?in/.test(txt) &&
          /(scrape|check|review|look|post|content|publish|next|idea|analy|working|audit|profile)/.test(txt);
        if (isLinkedIn) usePresentation.getState().startLinkedInScrape(userText);
        else usePresentation.getState().startQuery();
      }
      onQueryStart?.(userText);
    }
    prevLoading.current = isLoading;
  }, [isLoading, onQueryStart, messages]);

  // As brain tool calls RESOLVE, collect the retrieved note titles. On stage they're
  // QUEUED for a paced read-through (StageReadthrough reveals them one at a time, lighting
  // one node + showing one card per beat); in the live view they light immediately.
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || !last.toolInvocations) return;
    const fresh: string[] = [];
    for (const t of last.toolInvocations as any[]) {
      if (t.state !== "result" || !t.toolCallId || seenTools.current.has(t.toolCallId)) continue;
      seenTools.current.add(t.toolCallId);
      const titles = Array.isArray(t.result?.results)
        ? t.result.results.map((r: any) => r?.title).filter(Boolean)
        : t.result?.title
          ? [t.result.title]
          : [];
      fresh.push(...titles);
    }
    if (!fresh.length) return;
    if (stageOn) usePresentation.getState().enqueueReads(fresh);
    else onResearch?.(fresh);
  }, [messages, onResearch, stageOn]);

  // Stage-mode thinking swell — starts when isLoading goes true, stops on finish
  useEffect(() => {
    if (!presentationOn) return;
    if (isLoading) void startThinkingSwell();
    else void stopThinkingSwell();
  }, [isLoading, presentationOn]);

  // Stage-mode audio cadence as the answer streams: chime on sentence boundary,
  // ping on each [[wikilink]]. (Node lighting is driven by tool results, not text.)
  useEffect(() => {
    if (!presentationOn) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    const text = last.content;
    const prev = lastStreamLenRef.current;
    if (text.length <= prev) return;
    const delta = text.slice(prev);
    lastStreamLenRef.current = text.length;

    const linkMatches = delta.match(/\[\[[^\]]+\]\]/g);
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (/[.!?](\s|$)/.test(delta)) sounds.cinematicChime();
    if (linkMatches) linkMatches.forEach((_, i) => timers.push(setTimeout(() => sounds.citeNote(), i * 80)));
    return () => { for (const t of timers) clearTimeout(t); };
  }, [messages, presentationOn]);

  useImperativeHandle(ref, () => ({
    ask: (prompt: string) => {
      append({ role: "user", content: prompt });
      sounds.send();
    },
  }));

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const a = AGENTS[agent];

  const suggestions = [
    "What should I focus on this week?",
    "Pull my voice profile and write a hook about workshops",
    "What's my best-performing offer based on the vault?",
    "Find every client objection I've seen and group them",
  ];

  return (
    <div className="flex h-full flex-col bg-ink-900/70 backdrop-blur">
      <div className="border-b border-border px-4 py-3">
        <motion.div
          key={agent}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="flex items-center gap-2 mb-2"
        >
          <AgentIcon id={agent} size={18} weight="duotone" />
          <div className="font-semibold text-foreground tracking-tight">{a.name}</div>
          <div className="text-xs text-muted-foreground">· {a.role}</div>
        </motion.div>
        <AgentBar active={agent} onChange={onAgentChange} />
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center justify-center h-full text-center gap-4 pt-12"
          >
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 18 }}
            >
              <AgentIcon id={agent} size={72} weight="duotone" />
            </motion.div>
            <div>
              <div className="text-foreground font-medium tracking-tight">
                Ask {a.name} anything
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {a.role} · queries your real vault
              </div>
            </div>
            <div className="grid gap-2 w-full max-w-md mt-4">
              {suggestions.map((s, i) => (
                <motion.button
                  key={s}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + i * 0.05 }}
                  whileHover={{ y: -1, transition: { duration: 0.15 } }}
                  onClick={() => setInput(s)}
                  className="text-left text-xs text-muted-foreground hover:text-foreground border border-border hover:border-accent-400/40 rounded-md px-3 py-2 bg-card/60 hover:bg-card transition flex items-center gap-2"
                >
                  <Sparkle size={12} weight="duotone" className="text-accent-300 shrink-0" />
                  <span>{s}</span>
                </motion.button>
              ))}
              <div className="mt-3 text-[10px] text-muted-foreground/70 flex items-center justify-center gap-1.5">
                press <Kbd>⌘</Kbd><Kbd>K</Kbd> for the command palette
              </div>
            </div>
          </motion.div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="space-y-1.5"
              >
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                  {m.role === "user" ? (
                    "You"
                  ) : (
                    <>
                      <AgentIcon id={agent} size={12} weight="duotone" />
                      <span>{a.name}</span>
                    </>
                  )}
                </div>
                {m.toolInvocations?.map((t: any, i) => (
                  <ToolCallChip
                    key={i}
                    query={String(t.args?.query ?? "")}
                    count={t.result?.count}
                  />
                ))}
                <div
                  className={cn(
                    "text-sm leading-relaxed",
                    m.role === "user" ? "text-foreground/80" : "text-foreground"
                  )}
                >
                  {m.role === "user" ? (
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  ) : (
                    <div className="prose prose-invert prose-sm max-w-none prose-p:my-1.5 prose-headings:tracking-tight prose-code:text-accent-300 prose-code:bg-accent-500/10 prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-strong:text-white">
                      <Streamdown>{m.content}</Streamdown>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        {isLoading && (
          <ThinkingPulse
            label={`${AGENTS[agent].name} is thinking`}
            sublabel="scanning the brain…"
          />
        )}
      </div>

      <form
        onSubmit={(e) => {
          if (input.trim()) {
            sounds.send();
            if (presentationOn) void submitThump();
          }
          handleSubmit(e);
        }}
        className="border-t border-border p-3"
      >
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (input.trim()) {
                  sounds.send();
                  if (presentationOn) void submitThump();
                }
                handleSubmit(e as any);
              }
            }}
            placeholder={`Ask ${a.name}…`}
            rows={1}
            className="flex-1 resize-none bg-card border border-border focus:border-accent-400/50 outline-none rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60"
          />
          <VoiceInput
            onTranscript={(text) => {
              setInput((input ? input.trim() + " " : "") + text);
            }}
          />
          <Button type="submit" disabled={!input.trim() || isLoading} size="icon">
            <PaperPlaneTilt size={16} weight="fill" />
          </Button>
        </div>
      </form>
    </div>
  );
});

export default ChatPanel;

function ToolCallChip({ query, count }: { query: string; count?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      className="inline-flex items-center gap-2 text-[11px] font-mono rounded-md border border-accent-500/25 bg-black/40 px-2.5 py-1.5"
    >
      <span className="text-accent-300/70">$</span>
      <span className="text-accent-300">brain</span>
      <span className="text-muted-foreground/60">.</span>
      <span className="text-foreground">query</span>
      <span className="text-muted-foreground/60">(</span>
      <span className="text-emerald-300/90">&quot;{query}&quot;</span>
      <span className="text-muted-foreground/60">)</span>
      {count !== undefined && (
        <>
          <span className="text-muted-foreground/60">→</span>
          <span className="text-foreground tabular-nums">{count}</span>
          <span className="text-muted-foreground/60">{count === 1 ? "hit" : "hits"}</span>
        </>
      )}
    </motion.div>
  );
}
