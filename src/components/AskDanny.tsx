"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useRef, useState } from "react";
import { PaperPlaneTilt, CircleNotch, Sparkle, Brain } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { Streamdown } from "streamdown";
import { toast } from "sonner";
import Tilt from "react-parallax-tilt";
import Typewriter from "typewriter-effect";
import { cn } from "@/lib/utils";
import ThinkingPulse from "@/components/ThinkingPulse";
import VoiceInput from "@/components/VoiceInput";

type Props = { onCited?: (titles: string[]) => void };

const TEAM_SUGGESTIONS = [
  "How would Danny price a $25K consulting engagement?",
  "What's Danny's framework for a personal-brand client who's stuck?",
  "Write a LinkedIn hook in Danny's voice about AI marketing employees",
  "What would Danny say to a prospect who thinks they need more content?",
  "Pull Danny's invisibility-diagnostic and score this post: 'AI won't replace you. Someone using AI will.'",
  "What's Danny's offer for a workshop and how does he position it?",
];

export default function AskDanny({ onCited }: Props) {
  const { messages, input, handleInputChange, handleSubmit, isLoading, setInput, append } =
    useChat({
      api: "/api/chat",
      // /ask is the team-facing entry — privacy redaction kicks in on the server.
      body: { agentId: "danny", viewerRole: "team" },
      onFinish: async (msg) => {
        const toolHits = (msg.toolInvocations || []).flatMap((t: any) =>
          t.result?.results?.map((r: any) => r.title) || []
        );
        if (toolHits.length) onCited?.(toolHits);
        toast.success("Danny replied", {
          description: toolHits.length
            ? `Cited ${toolHits.length} note${toolHits.length === 1 ? "" : "s"} from the brain`
            : "From context",
        });
        // Log the question for the owner to review (fire-and-forget)
        try {
          const userMsg = [...messages].reverse().find((m) => m.role === "user");
          if (userMsg) {
            fetch("/api/team-question", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                question: userMsg.content,
                answer: msg.content,
                citedNotes: toolHits,
              }),
            }).catch(() => {});
          }
        } catch {}
      },
    });

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const hasConvo = messages.length > 0;

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <header className="relative px-6 py-4 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="grid place-items-center w-10 h-10 rounded-xl bg-gradient-to-br from-accent-500/30 to-accent-500/5 border border-accent-500/30 shadow-[0_0_28px_-6px_rgba(167,139,250,0.55)]">
            <Brain size={22} weight="duotone" className="text-accent-300" />
          </div>
          <div>
            <div className="font-semibold tracking-tight text-foreground">Ask Danny</div>
            <div className="text-[11px] text-muted-foreground -mt-0.5">
              Talks like Danny. Knows his brain. Answers like him.
            </div>
          </div>
        </div>
      </header>

      {/* Conversation */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-6"
      >
        {!hasConvo ? (
          <EmptyState onPick={(s) => setInput(s)} />
        ) : (
          <div className="mx-auto max-w-2xl space-y-6">
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-2"
                >
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] font-medium text-muted-foreground">
                    {m.role === "user" ? (
                      "You"
                    ) : (
                      <>
                        <Brain size={11} weight="duotone" className="text-accent-300" />
                        Danny
                      </>
                    )}
                  </div>

                  {m.toolInvocations?.map((t: any, i) => (
                    <ToolChip
                      key={i}
                      query={String(t.args?.query ?? t.args?.title ?? "")}
                      tool={t.toolName}
                      count={t.result?.count}
                    />
                  ))}

                  <div
                    className={cn(
                      "text-[15px] leading-relaxed",
                      m.role === "user" ? "text-foreground/80" : "text-foreground"
                    )}
                  >
                    {m.role === "user" ? (
                      <div className="whitespace-pre-wrap">{m.content}</div>
                    ) : (
                      <div className="prose prose-invert max-w-none prose-p:my-2 prose-headings:tracking-tight prose-code:text-accent-300 prose-code:bg-accent-500/10 prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-strong:text-white prose-li:my-1">
                        <Streamdown>{m.content}</Streamdown>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {isLoading && <ThinkingPulse label="Danny is thinking" sublabel="searching 1,492 notes…" />}
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-border/60 px-6 py-4"
      >
        <div className="mx-auto max-w-2xl">
          <div className="flex items-end gap-2 rounded-2xl border border-border bg-card/80 p-2 backdrop-blur shadow-2xl shadow-black/30 focus-within:border-accent-400/50 transition">
            <textarea
              value={input}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as any);
                }
              }}
              placeholder="Ask Danny anything…"
              rows={1}
              className="flex-1 resize-none bg-transparent outline-none px-3 py-2.5 text-[15px] text-foreground placeholder:text-muted-foreground/60"
            />
            <VoiceInput
              onTranscript={(text) => {
                setInput((input ? input.trim() + " " : "") + text);
              }}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="rounded-xl bg-accent-500 hover:bg-accent-400 disabled:bg-ink-700 disabled:text-zinc-600 text-white h-10 w-10 grid place-items-center transition shadow-[0_0_24px_-6px_rgba(167,139,250,0.7)]"
            >
              <PaperPlaneTilt size={17} weight="fill" />
            </button>
          </div>
          <div className="mt-2 text-center text-[10px] text-muted-foreground/60">
            Danny answers in his real voice using his second brain. Questions are private to your team.
          </div>
        </div>
      </form>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="mx-auto max-w-2xl pt-16 pb-8 text-center">
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 180, damping: 18 }}
        className="inline-grid place-items-center w-20 h-20 rounded-2xl bg-gradient-to-br from-accent-500/30 to-accent-500/5 border border-accent-500/30 shadow-[0_0_60px_-12px_rgba(167,139,250,0.7)]"
      >
        <Brain size={42} weight="duotone" className="text-accent-300" />
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground min-h-[2.5rem]">
          <Typewriter
            options={{
              strings: ["Ask Danny anything"],
              autoStart: true,
              delay: 50,
              cursor: "▍",
            }}
          />
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto min-h-[3rem]">
          <Typewriter
            options={{
              strings: [
                "Danny's real voice, his actual frameworks, and 1,492 notes of client work — synthesized into an answer he'd give.",
              ],
              autoStart: true,
              delay: 18,
              cursor: "",
              loop: false,
            }}
          />
        </p>
      </motion.div>

      <div className="mt-10 grid gap-2 text-left">
        {TEAM_SUGGESTIONS.map((s, i) => (
          <motion.div
            key={s}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 + i * 0.06 }}
          >
            <Tilt
              tiltMaxAngleX={4}
              tiltMaxAngleY={4}
              perspective={1200}
              transitionSpeed={1400}
              glareEnable
              glareMaxOpacity={0.1}
              glareColor="#c4b5fd"
              glareBorderRadius="12px"
              scale={1.01}
            >
              <button
                onClick={() => onPick(s)}
                className="group w-full flex items-center gap-2.5 rounded-xl border border-border bg-card/40 hover:bg-card hover:border-accent-400/40 px-4 py-3 text-sm text-muted-foreground hover:text-foreground transition"
              >
                <Sparkle size={14} weight="duotone" className="text-accent-300 shrink-0" />
                <span className="flex-1 text-left">{s}</span>
                <span className="text-[10px] text-muted-foreground/50 group-hover:text-muted-foreground transition">
                  ask →
                </span>
              </button>
            </Tilt>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function ToolChip({
  query,
  tool,
  count,
}: {
  query: string;
  tool: string;
  count?: number;
}) {
  const labels: Record<string, string> = {
    queryBrain: "brain.query",
    readNote: "brain.readNote",
    brainStats: "brain.stats",
    recentNotes: "brain.recent",
  };
  const label = labels[tool] ?? tool;
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      className="inline-flex items-center gap-2 text-[11px] font-mono rounded-md border border-accent-500/25 bg-black/40 px-2.5 py-1.5"
    >
      <span className="text-accent-300/70">$</span>
      <span className="text-accent-300">{label}</span>
      <span className="text-muted-foreground/60">(</span>
      <span className="text-emerald-300/90 max-w-[260px] truncate">&quot;{query}&quot;</span>
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
