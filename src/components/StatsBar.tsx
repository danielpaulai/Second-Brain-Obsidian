"use client";

import NumberFlow from "@number-flow/react";
import { Brain, GraphIcon, Folder, ClockCounterClockwise, type Icon } from "@phosphor-icons/react";
import { formatRelative } from "@/lib/utils";

type Stats = { notes: number; links: number; folders: number; lastEdited: number };

export default function StatsBar({ stats }: { stats: Stats | null }) {
  return (
    <div className="flex items-center gap-5 text-xs">
      <Item icon={Brain} label="notes" value={stats?.notes ?? 0} />
      <Item icon={GraphIcon} label="links" value={stats?.links ?? 0} />
      <Item icon={Folder} label="folders" value={stats?.folders ?? 0} />
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <ClockCounterClockwise size={14} weight="regular" />
        <span className="text-foreground/95 font-medium tabular-nums">
          {stats ? formatRelative(stats.lastEdited) : "—"}
        </span>
        <span>last edit</span>
      </div>
    </div>
  );
}

function Item({
  icon: IconCmp,
  label,
  value,
}: {
  icon: Icon;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-1.5 text-muted-foreground">
      <IconCmp size={14} weight="duotone" className="opacity-90" />
      <span className="text-foreground/95 font-medium tabular-nums">
        <NumberFlow value={value} />
      </span>
      <span>{label}</span>
    </div>
  );
}
