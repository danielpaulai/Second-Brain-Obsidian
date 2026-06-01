"use client";

import { Brain, Compass, Gear, ChartLineUp, Megaphone, Target, type Icon } from "@phosphor-icons/react";
import { AGENTS, type AgentId } from "@/lib/agents";

const ICONS: Record<string, Icon> = {
  Brain,
  Compass,
  Gear,
  ChartLineUp,
  Megaphone,
  Target,
};

type Props = {
  id: AgentId;
  size?: number;
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
  className?: string;
  style?: React.CSSProperties;
};

export default function AgentIcon({
  id,
  size = 16,
  weight = "duotone",
  className,
  style,
}: Props) {
  const a = AGENTS[id];
  const Cmp = ICONS[a.icon] ?? Brain;
  return (
    <Cmp
      size={size}
      weight={weight}
      className={className}
      style={{ color: a.color, ...style }}
    />
  );
}
