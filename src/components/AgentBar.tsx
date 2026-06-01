"use client";

import { AGENTS, type AgentId } from "@/lib/agents";
import { cn } from "@/lib/utils";
import { sounds } from "@/lib/sounds";
import AgentIcon from "./AgentIcon";

type Props = { active: AgentId; onChange: (a: AgentId) => void };

export default function AgentBar({ active, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(Object.keys(AGENTS) as AgentId[]).map((id) => {
        const a = AGENTS[id];
        const isActive = id === active;
        return (
          <button
            key={id}
            onClick={() => {
              if (id !== active) sounds.switchAgent();
              onChange(id);
            }}
            className={cn(
              "group relative flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition",
              isActive
                ? "moving-border border-transparent bg-popover text-white"
                : "border-white/5 bg-ink-800/60 text-zinc-400 hover:border-white/10 hover:text-zinc-200"
            )}
          >
            <AgentIcon id={id} size={14} weight={isActive ? "duotone" : "regular"} />
            <span>{a.name}</span>
            <span className="hidden sm:inline text-[10px] text-zinc-500 group-hover:text-zinc-400">
              {a.role}
            </span>
          </button>
        );
      })}
    </div>
  );
}
