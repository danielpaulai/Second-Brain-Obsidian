"use client";

import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { AGENTS, type AgentId } from "@/lib/agents";
import { Sparkle, FileText, ArrowRight } from "@phosphor-icons/react";
import { toast } from "sonner";
import AgentIcon from "./AgentIcon";
import type { BrainGraph } from "@/lib/vault";

type Props = {
  graph: BrainGraph | null;
  activeAgent: AgentId;
  onSetAgent: (a: AgentId) => void;
  onAsk: (prompt: string) => void;
  onFocusNote: (id: string) => void;
};

const PRESET_QUERIES = [
  "What should I focus on this week?",
  "Pull my voice profile and write a hook about workshops",
  "Find every client objection I've seen and group them",
  "Summarize my last 5 client calls",
  "What's my best-performing offer based on the vault?",
  "Brain dump: today's wins, tomorrow's priorities",
];

export default function CommandPalette({
  graph,
  activeAgent,
  onSetAgent,
  onAsk,
  onFocusNote,
}: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search notes, switch agents, run a brain query…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>

        <CommandGroup heading="Agents">
          {(Object.keys(AGENTS) as AgentId[]).map((id) => {
            const a = AGENTS[id];
            const isActive = id === activeAgent;
            return (
              <CommandItem
                key={id}
                value={`agent ${a.name} ${a.role}`}
                onSelect={() => {
                  onSetAgent(id);
                  toast.success(`Switched to ${a.name}`, { description: a.role });
                  setOpen(false);
                }}
              >
                <AgentIcon id={id} size={16} weight="duotone" />
                <span className="font-medium">{a.name}</span>
                <span className="text-xs text-muted-foreground">{a.role}</span>
                {isActive && <CommandShortcut>active</CommandShortcut>}
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Run a brain query">
          {PRESET_QUERIES.map((q) => (
            <CommandItem
              key={q}
              value={`query ${q}`}
              onSelect={() => {
                onAsk(q);
                setOpen(false);
              }}
            >
              <Sparkle size={14} weight="duotone" className="text-accent-300" />
              <span className="truncate">{q}</span>
              <CommandShortcut>
                <ArrowRight size={12} weight="bold" className="inline" />
              </CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>

        {graph && graph.nodes.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={`Notes · ${graph.nodes.length.toLocaleString()}`}>
              {graph.nodes.slice(0, 200).map((n) => (
                <CommandItem
                  key={n.id}
                  value={`note ${n.name} ${n.folder}`}
                  onSelect={() => {
                    onFocusNote(n.id);
                    setOpen(false);
                  }}
                >
                  <FileText size={14} weight="regular" className="text-muted-foreground" />
                  <span className="truncate">{n.name}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground truncate max-w-[180px]">
                    {n.folder}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
