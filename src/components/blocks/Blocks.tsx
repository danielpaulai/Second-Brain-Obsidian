"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from "react";
import { motion } from "motion/react";
import { Streamdown } from "streamdown";
import {
  Sparkle,
  TrendUp,
  TrendDown,
  Warning,
  Info,
  CheckCircle,
  ArrowRight,
  ArrowDown,
  Quotes,
  LinkedinLogo,
  FileText,
  GitBranch,
  UsersThree,
  BookOpen,
  type Icon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  parseBlocks,
  parseStats,
  parseChips,
  parseBullets,
  parseIdea,
  parseTimeline,
  parseSteps,
  parseDecision,
  parsePeople,
  parseKpi,
  parseMeter,
  parseBars,
  parseTable,
  isNumericCell,
  accentFromName,
  initials,
  fmtVal,
  type Accent,
  type Block,
  type ChartName,
} from "./parse";
import { RevealCard, RevealGroup, RevealStagger, RevealItem, RevealFill, useReveal, EASE_OUT } from "./reveal";

export { parseBlocks };
export type { Block, ChartName };

/* ============================ typing / sequencing engine ============================ */
const TICK = 24; // ms per typewriter frame

/** Reveal the chrome (card + icons via framer), then signal completion after `ms`. For blocks
 *  whose content "reveals" rather than types (data tiles, charts, rosters). */
function useDoneAfter(play: boolean, ms: number, onDone?: () => void) {
  useEffect(() => {
    if (!play) return;
    const id = setTimeout(() => onDone?.(), ms);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play]);
}

/** Typewriter for one or more text REGIONS, typed in order (region 0 fully, then 1, …). Returns the
 *  visible char-count per region. While `play` is false (a finished/static block) every region is
 *  shown in full. Fires `onDone` once the last region finishes — this is how a block tells the
 *  sequencer it is fully populated so the NEXT block may start. */
function useRowTyper(
  regions: string[],
  play: boolean,
  opts: { cpt?: number; startDelay?: number; onDone?: () => void } = {}
): number[] {
  const { cpt = 5, startDelay = 440, onDone } = opts;
  const full = useMemo(() => regions.map((r) => r.length), [regions]);
  const key = regions.join("");
  const [counts, setCounts] = useState<number[]>(() => (play ? regions.map(() => 0) : full));
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!play) {
      setCounts(full);
      return;
    }
    setCounts(regions.map(() => 0));
    let waited = 0;
    let row = 0;
    let n = 0;
    let fired = false;
    const id = setInterval(() => {
      if (waited < startDelay) {
        waited += TICK;
        return;
      }
      while (row < full.length && full[row] === 0) row += 1; // skip empty regions
      if (row >= full.length) {
        clearInterval(id);
        if (!fired) {
          fired = true;
          onDoneRef.current?.();
        }
        return;
      }
      n += cpt;
      const r = row;
      if (n >= full[r]) {
        setCounts((p) => {
          const c = p.slice();
          c[r] = full[r];
          return c;
        });
        row += 1;
        n = 0;
      } else {
        const nn = n;
        setCounts((p) => {
          const c = p.slice();
          c[r] = nn;
          return c;
        });
      }
    }, TICK);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play, key]);

  return counts;
}

/* ============================ shared Streamdown styling ============================ */
type MdProps = { node?: unknown; children?: ReactNode; [k: string]: unknown };
const strip = ({ node: _n, ...rest }: MdProps) => rest;
type SD = ComponentProps<typeof Streamdown>["components"];

// [[Note Title]] / [[Title|alias]] / [[Title#heading]] → a markdown link with a #note href so
// the `a` renderer below can show it as a pretty source chip instead of raw brackets.
export function linkifyCitations(md: string): string {
  return md.replace(/\[\[([^[\]\n]+)\]\]/g, (m, inner: string) => {
    const parts = inner.split("|");
    const disp = (parts[1] ?? parts[0]).split("#")[0].trim();
    return disp ? `[${disp}](#note)` : m;
  });
}

function Anchor(p: MdProps) {
  const href = typeof p.href === "string" ? p.href : "";
  if (href === "#note") {
    return (
      <span className="mx-[0.12em] inline-flex translate-y-[0.06em] items-center gap-[0.28em] rounded-[0.45em] border border-cyan-300/25 bg-cyan-400/[0.12] px-[0.45em] py-[0.08em] text-[0.84em] font-medium leading-none text-cyan-100/90">
        <FileText size="1em" weight="fill" className="text-cyan-300/70" />
        {p.children}
      </span>
    );
  }
  return <a className="text-cyan-300 underline-offset-2 hover:underline" {...strip(p)} />;
}

// A high-end glass markdown TABLE (overrides Streamdown's default table + its download toolbar).
const mdTable = {
  table: (p: MdProps) => (
    <div className="my-[0.7em] overflow-x-auto rounded-xl border border-white/10 bg-white/[0.025]" data-lenis-prevent>
      <table className="w-full border-collapse text-[0.92em]" {...strip(p)} />
    </div>
  ),
  thead: (p: MdProps) => <thead {...strip(p)} />,
  tbody: (p: MdProps) => <tbody {...strip(p)} />,
  tr: (p: MdProps) => <tr className="border-b border-white/[0.06] last:border-0 transition-colors hover:bg-white/[0.03]" {...strip(p)} />,
  th: (p: MdProps) => (
    <th className="border-b border-white/10 px-3.5 py-2 text-left text-[0.78em] font-semibold uppercase tracking-[0.1em] text-cyan-300/70" {...strip(p)} />
  ),
  td: (p: MdProps) => <td className="px-3.5 py-2 align-top leading-snug text-white/80" {...strip(p)} />,
};

// Flowing prose for plain text blocks. Em-based so a parent font-size scales it.
const proseMd = {
  h1: (p: MdProps) => (
    <h1 className="mb-[0.35em] mt-[0.7em] bg-gradient-to-br from-white via-cyan-50 to-cyan-200/80 bg-clip-text text-[1.7em] font-light leading-[1.15] tracking-tight text-transparent first:mt-0" {...strip(p)} />
  ),
  h2: (p: MdProps) => (
    <h2 className="mb-[0.5em] mt-[1.3em] text-[0.72em] font-semibold uppercase tracking-[0.18em] text-cyan-300/80 first:mt-0" {...strip(p)} />
  ),
  h3: (p: MdProps) => <h3 className="mb-[0.2em] mt-[0.9em] text-[1.02em] font-semibold text-white/90" {...strip(p)} />,
  p: (p: MdProps) => <p className="my-[0.5em] text-[1em] leading-[1.5] text-white/85" {...strip(p)} />,
  ul: (p: MdProps) => <ul className="my-[0.5em] list-disc space-y-[0.3em] pl-[1.25em] text-[1em] marker:text-cyan-300/70" {...strip(p)} />,
  ol: (p: MdProps) => <ol className="my-[0.5em] list-decimal space-y-[0.3em] pl-[1.25em] text-[1em] marker:text-cyan-400/60" {...strip(p)} />,
  li: (p: MdProps) => <li className="text-[1em] leading-[1.5] text-white/85" {...strip(p)} />,
  strong: (p: MdProps) => <strong className="font-semibold text-white" {...strip(p)} />,
  em: (p: MdProps) => <em className="italic text-white/85" {...strip(p)} />,
  a: Anchor,
  blockquote: (p: MdProps) => <blockquote className="my-[0.5em] border-l-2 border-cyan-300/30 pl-[0.75em] text-white/70" {...strip(p)} />,
  hr: () => <hr className="my-[0.8em] border-white/10" />,
  ...mdTable,
};

const tightMd = {
  p: (p: MdProps) => <p className="my-[0.25em] text-[0.95em] leading-relaxed first:mt-0 last:mb-0" {...strip(p)} />,
  strong: (p: MdProps) => <strong className="font-semibold text-white" {...strip(p)} />,
  em: (p: MdProps) => <em className="italic" {...strip(p)} />,
  a: Anchor,
};

const detailMd = {
  p: (p: MdProps) => <p className="my-0 text-[1em] leading-[1.45]" {...strip(p)} />,
  strong: (p: MdProps) => <strong className="font-semibold text-white/90" {...strip(p)} />,
  em: (p: MdProps) => <em className="italic" {...strip(p)} />,
  a: Anchor,
};

const rowMd = {
  p: (p: MdProps) => <p className="my-0 text-[13.5px] leading-relaxed text-white/80" {...strip(p)} />,
  strong: (p: MdProps) => <strong className="font-semibold text-white" {...strip(p)} />,
  em: (p: MdProps) => <em className="italic text-white/85" {...strip(p)} />,
  a: Anchor,
};

type MdMap = Record<string, unknown>;
// controls={false} strips Streamdown's copy/download toolbars (the "downloadable table" chrome) so
// markdown tables/code render clean on the cinematic stage; mdTable above gives them the glass look.
const Prose = ({ text, components = proseMd }: { text: string; components?: MdMap }) => (
  <Streamdown controls={false} components={components as unknown as SD}>
    {linkifyCitations(text)}
  </Streamdown>
);
// Prose typed to `chars` (a growing slice). Streamdown renders partial markdown gracefully.
const Typed = ({ text, chars, components }: { text: string; chars: number; components?: MdMap }) => (
  <Prose text={text.slice(0, chars)} components={components} />
);

// Independent fade-up — used for content that should appear LATER than the shell's stagger (e.g. a
// subtitle that must wait until a title has finished typing). Animates on its own mount.
function FadeUp({ children, className }: { children: ReactNode; className?: string }) {
  const { reduce } = useReveal();
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0.2 : 0.4, ease: EASE_OUT }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ============================ free text ============================ */
function TextBlock({ text, play, onDone }: { text: string; play: boolean; onDone: () => void }) {
  const [n] = useRowTyper([text], play, { onDone, cpt: 6, startDelay: 60 });
  return (
    <div>
      <Typed text={text} chars={n} />
    </div>
  );
}

/* ============================ callout ============================ */
const CALLOUT: Record<string, { Icon: Icon; bar: string; ring: string; glow: string; chipBg: string; chipFg: string }> = {
  insight: { Icon: Sparkle, bar: "from-cyan-400 to-sky-400", ring: "border-cyan-300/25", glow: "bg-cyan-400/10", chipBg: "bg-cyan-400/15", chipFg: "text-cyan-200" },
  win: { Icon: TrendUp, bar: "from-emerald-400 to-teal-400", ring: "border-emerald-300/25", glow: "bg-emerald-400/10", chipBg: "bg-emerald-400/15", chipFg: "text-emerald-200" },
  risk: { Icon: Warning, bar: "from-amber-400 to-orange-400", ring: "border-amber-300/25", glow: "bg-amber-400/10", chipBg: "bg-amber-400/15", chipFg: "text-amber-200" },
  note: { Icon: Info, bar: "from-violet-400 to-indigo-400", ring: "border-violet-300/25", glow: "bg-violet-400/10", chipBg: "bg-violet-400/15", chipFg: "text-violet-200" },
};

function Callout({ variant, body, play, onDone }: { variant: string; body: string; play: boolean; onDone: () => void }) {
  const c = CALLOUT[variant] ?? CALLOUT.insight;
  const [n] = useRowTyper([body], play, { onDone });
  return (
    <RevealCard className={cn("relative overflow-hidden rounded-2xl border bg-white/[0.04] p-4 pl-5 backdrop-blur-xl", c.ring)}>
      <RevealItem variant="rail" as="span" className={cn("absolute inset-y-0 left-0 w-[3px] origin-top bg-gradient-to-b", c.bar)} />
      <RevealItem variant="glow" as="span" className={cn("pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl", c.glow)} />
      <RevealStagger className="flex items-start gap-3">
        <RevealItem className={cn("mt-px grid h-7 w-7 shrink-0 place-items-center rounded-xl ring-1 ring-white/10", c.chipBg, c.chipFg)}>
          <c.Icon size={15} weight="fill" />
        </RevealItem>
        <RevealItem className="min-w-0 flex-1 text-white/80">
          <Typed text={body} chars={n} components={tightMd} />
        </RevealItem>
      </RevealStagger>
    </RevealCard>
  );
}

/* ============================ key points / action items ============================ */
function ListPanel({
  title,
  body,
  Icon,
  color,
  accent,
  play,
  onDone,
}: {
  title: string;
  body: string;
  Icon: Icon;
  color: string;
  accent: string;
  play: boolean;
  onDone: () => void;
}) {
  const rows = parseBullets(body);
  const counts = useRowTyper(rows, play, { onDone });
  if (!rows.length) return null;
  return (
    <RevealCard className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
      <RevealItem className={cn("mb-3 text-[11px] font-semibold uppercase tracking-[0.18em]", accent)}>{title}</RevealItem>
      <RevealStagger className="space-y-2" stagger={0.045}>
        {rows.map((r, i) => (
          <RevealItem key={i} className="flex items-start gap-2.5">
            <Icon size={15} weight="fill" className={cn("mt-[3px] shrink-0", color)} />
            <div className="min-w-0 flex-1">
              <Typed text={r} chars={counts[i] ?? r.length} components={rowMd} />
            </div>
          </RevealItem>
        ))}
      </RevealStagger>
    </RevealCard>
  );
}

/* ============================ stat tiles ============================ */
function StatTiles({ body, play, onDone }: { body: string; play: boolean; onDone: () => void }) {
  const stats = parseStats(body);
  useDoneAfter(play, 320 + stats.length * 70, onDone);
  if (!stats.length) return null;
  return (
    <RevealGroup className="grid grid-cols-2 gap-2.5">
      {stats.map((s, i) => (
        <RevealItem key={i} className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 backdrop-blur-xl">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/40">{s.label}</div>
          <div className="mt-0.5 text-[19px] font-semibold tabular-nums tracking-tight text-white">{s.value}</div>
          {s.sub && <div className="mt-0.5 text-[11px] text-white/45">{s.sub}</div>}
        </RevealItem>
      ))}
    </RevealGroup>
  );
}

/* ============================ quote ============================ */
function Quote({ attr, body, play, onDone }: { attr: string; body: string; play: boolean; onDone: () => void }) {
  const [n] = useRowTyper([body], play, { onDone });
  return (
    <RevealCard className="relative overflow-hidden rounded-2xl border border-violet-300/20 bg-gradient-to-br from-violet-500/[0.08] to-white/[0.02] p-5 backdrop-blur-xl">
      <RevealItem>
        <Quotes size={26} weight="fill" className="mb-1 text-violet-300/50" />
      </RevealItem>
      <RevealItem className="text-[15px] font-light italic leading-relaxed text-white/90">
        <Typed text={body} chars={n} components={tightMd} />
      </RevealItem>
      {attr && <RevealItem className="mt-2 text-[12px] font-medium text-violet-200/70">— {attr}</RevealItem>}
    </RevealCard>
  );
}

/* ============================ chips ============================ */
function Chips({ title, body, play, onDone }: { title: string; body: string; play: boolean; onDone: () => void }) {
  const items = parseChips(body);
  useDoneAfter(play, 240 + items.length * 55, onDone);
  if (!items.length) return null;
  return (
    <RevealGroup className="flex flex-wrap items-center gap-2" stagger={0.04}>
      {title && (
        <RevealItem as="span" className="mr-0.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/40">
          {title}
        </RevealItem>
      )}
      {items.map((c, i) => (
        <RevealItem as="span" key={i} className="rounded-full border border-white/12 bg-white/[0.06] px-2.5 py-1 text-[12px] text-white/75 backdrop-blur-md">
          {c}
        </RevealItem>
      ))}
    </RevealGroup>
  );
}

/* ============================ timeline (chronology) ============================ */
function Timeline({ title, body, play, onDone }: { title: string; body: string; play: boolean; onDone: () => void }) {
  const events = parseTimeline(body);
  const counts = useRowTyper(events.map((e) => e.detail || ""), play, { onDone });
  if (!events.length) return null;
  return (
    <RevealCard className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
      {title && <RevealItem className="mb-[0.9em] text-[0.72em] font-semibold uppercase tracking-[0.18em] text-cyan-300/80">{title}</RevealItem>}
      <RevealStagger className="relative pl-[1.6em]">
        <RevealItem variant="rail" as="span" className="absolute bottom-[0.4em] left-[0.55em] top-[0.4em] w-[1.5px] origin-top bg-gradient-to-b from-cyan-400/60 via-cyan-300/25 to-transparent" />
        {events.map((e, i) => (
          <RevealItem key={i} className="relative py-[0.55em]">
            <span className="absolute -left-[1.34em] top-[0.85em] grid h-[0.7em] w-[0.7em] place-items-center rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.7)] ring-4 ring-cyan-400/15">
              {i === 0 && <span className="absolute inset-0 animate-ping rounded-full bg-cyan-300/60" />}
            </span>
            {e.when && <div className="text-[0.66em] font-semibold uppercase tracking-[0.1em] tabular-nums text-cyan-300/70">{e.when}</div>}
            <div className="text-[0.95em] font-medium leading-snug text-white/90">{e.title}</div>
            {e.detail && (
              <div className="mt-[0.15em] text-[0.8em] leading-[1.45] text-white/55">
                <Typed text={e.detail} chars={counts[i] ?? e.detail.length} components={detailMd} />
              </div>
            )}
          </RevealItem>
        ))}
      </RevealStagger>
    </RevealCard>
  );
}

/* ============================ steps (framework / playbook) ============================ */
function Steps({ title, body, play, onDone }: { title: string; body: string; play: boolean; onDone: () => void }) {
  const steps = parseSteps(body);
  const counts = useRowTyper(steps.map((s) => s.desc || ""), play, { onDone });
  if (!steps.length) return null;
  return (
    <RevealCard className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
      {title && (
        <RevealItem className="mb-[0.9em] bg-gradient-to-r from-violet-300/90 to-cyan-300/80 bg-clip-text text-[0.72em] font-semibold uppercase tracking-[0.18em] text-transparent">
          {title}
        </RevealItem>
      )}
      <RevealStagger>
        {steps.map((s, i) => (
          <RevealItem key={i} className="relative flex items-start gap-[0.8em] pb-[0.9em] last:pb-0">
            {i < steps.length - 1 && (
              <span className="absolute left-[0.9em] top-[1.8em] h-[calc(100%-1.8em)] w-[1.5px] bg-gradient-to-b from-violet-400/40 to-cyan-400/10" />
            )}
            <RevealItem variant="medallion" className="relative z-10 grid h-[1.8em] w-[1.8em] shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500/25 to-cyan-400/15 text-[0.85em] font-semibold tabular-nums text-white shadow-[0_0_10px_rgba(167,139,250,0.25)] ring-1 ring-white/15">
              {i + 1}
            </RevealItem>
            <div className="min-w-0 flex-1 pt-[0.15em]">
              <div className="text-[0.95em] font-semibold text-white/95">{s.title}</div>
              {s.desc && (
                <div className="mt-[0.15em] text-[0.82em] leading-[1.45] text-white/60">
                  <Typed text={s.desc} chars={counts[i] ?? s.desc.length} components={detailMd} />
                </div>
              )}
            </div>
          </RevealItem>
        ))}
      </RevealStagger>
    </RevealCard>
  );
}

/* ============================ decision rule (when → then) ============================ */
function Decision({ title, body, play, onDone }: { title: string; body: string; play: boolean; onDone: () => void }) {
  const { when, then, because } = parseDecision(body);
  const counts = useRowTyper([when || "", then || "", because || ""], play, { onDone });
  return (
    <RevealCard className="relative overflow-hidden rounded-2xl border border-amber-300/20 bg-white/[0.03] p-4 backdrop-blur-xl">
      <RevealItem variant="glow" as="span" className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-amber-400/10 blur-2xl" />
      {title && <RevealItem className="mb-[0.7em] text-[0.7em] font-semibold uppercase tracking-[0.16em] text-amber-200/70">{title}</RevealItem>}
      {when && (
        <RevealItem className="flex items-start gap-[0.6em]">
          <span className="mt-[0.1em] grid shrink-0 place-items-center rounded-md bg-amber-400/15 p-[0.3em] text-amber-200 ring-1 ring-white/10">
            <GitBranch size="1em" weight="fill" />
          </span>
          <div className="min-w-0">
            <div className="text-[0.6em] font-semibold uppercase tracking-[0.16em] text-amber-200/70">When</div>
            <div className="text-[0.92em] leading-snug text-white/85">
              <Typed text={when} chars={counts[0] ?? when.length} components={detailMd} />
            </div>
          </div>
        </RevealItem>
      )}
      {when && then && (
        <RevealItem className="my-[0.6em] flex items-center justify-center border-t border-white/[0.08] pt-[0.6em]">
          <ArrowDown size="1em" className="text-white/25" />
        </RevealItem>
      )}
      {then && (
        <RevealItem className="flex items-start gap-[0.6em]">
          <span className="mt-[0.1em] grid shrink-0 place-items-center rounded-md bg-emerald-400/15 p-[0.3em] text-emerald-200 ring-1 ring-white/10">
            <ArrowRight size="1em" weight="bold" />
          </span>
          <div className="min-w-0">
            <div className="text-[0.6em] font-semibold uppercase tracking-[0.16em] text-emerald-200/70">Then</div>
            <div className="text-[0.92em] font-medium leading-snug text-white/90">
              <Typed text={then} chars={counts[1] ?? then.length} components={detailMd} />
            </div>
          </div>
        </RevealItem>
      )}
      {because && (
        <RevealItem className="mt-[0.5em] border-l border-white/10 pl-[0.6em] text-[0.8em] italic leading-[1.45] text-white/45">
          <Typed text={because} chars={counts[2] ?? because.length} components={detailMd} />
        </RevealItem>
      )}
    </RevealCard>
  );
}

/* ============================ people roster ============================ */
const AVATAR_GRAD: Record<Accent, string> = {
  cyan: "from-cyan-400/80 to-violet-500/80",
  violet: "from-violet-400/80 to-fuchsia-500/80",
  emerald: "from-emerald-400/80 to-teal-500/80",
  amber: "from-amber-400/80 to-orange-500/80",
  sky: "from-sky-400/80 to-cyan-500/80",
  rose: "from-rose-400/80 to-pink-500/80",
};

function PersonCard({ p }: { p: { name: string; role?: string; note?: string } }) {
  return (
    <RevealItem className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-xl">
      <RevealItem
        variant="medallion"
        className={cn(
          "grid h-[2.4em] w-[2.4em] shrink-0 place-items-center rounded-full bg-gradient-to-br text-[0.85em] font-bold text-white shadow-inner ring-1 ring-white/15",
          AVATAR_GRAD[accentFromName(p.name)]
        )}
      >
        {initials(p.name)}
      </RevealItem>
      <div className="min-w-0 flex-1">
        <div className="text-[0.9em] font-semibold text-white/90">{p.name}</div>
        {p.role && (
          <div className="mt-[0.1em] flex items-center gap-1 text-[0.72em] text-white/50">
            {p.role.includes("@") && <UsersThree size="1em" className="shrink-0 text-white/30" />}
            <span className="truncate">{p.role}</span>
          </div>
        )}
        {p.note && (
          <div className="mt-[0.2em] line-clamp-2 text-[0.78em] leading-snug text-white/45">
            <Prose text={p.note} components={detailMd} />
          </div>
        )}
      </div>
    </RevealItem>
  );
}

function People({ title, body, play, onDone }: { title: string; body: string; play: boolean; onDone: () => void }) {
  const ppl = parsePeople(body);
  useDoneAfter(play, 360 + ppl.length * 130, onDone);
  if (!ppl.length) return null;
  return (
    <RevealGroup className="space-y-2.5">
      {title && <RevealItem className="text-[0.72em] font-semibold uppercase tracking-[0.18em] text-cyan-300/80">{title}</RevealItem>}
      <RevealGroup className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {ppl.map((p, i) => (
          <PersonCard key={i} p={p} />
        ))}
      </RevealGroup>
    </RevealGroup>
  );
}

/* ============================ KPI hero ============================ */
const KPI_ACCENT: Record<Accent, { text: string; orb: string }> = {
  cyan: { text: "from-white via-cyan-50 to-cyan-200/80", orb: "bg-cyan-400/15" },
  violet: { text: "from-white via-violet-50 to-violet-200/80", orb: "bg-violet-400/15" },
  emerald: { text: "from-white via-emerald-50 to-emerald-200/80", orb: "bg-emerald-400/15" },
  amber: { text: "from-white via-amber-50 to-amber-200/80", orb: "bg-amber-400/15" },
  sky: { text: "from-white via-sky-50 to-sky-200/80", orb: "bg-sky-400/15" },
  rose: { text: "from-white via-rose-50 to-rose-200/80", orb: "bg-rose-400/15" },
};

/** Rolls the numeric core of a value 0→target after the tile lands; literal if non-numeric / reduced. */
function CountUp({ value, play }: { value: string; play: boolean }) {
  const { reduce } = useReveal();
  const m = value.match(/^(\D*)([\d.,]+)(.*)$/);
  const [shown, setShown] = useState(() => (reduce || !play || !m ? value : `${m[1]}0${m[3]}`));
  useEffect(() => {
    if (reduce || !play || !m) {
      setShown(value);
      return;
    }
    const prefix = m[1];
    const suffix = m[3];
    const target = parseFloat(m[2].replace(/,/g, ""));
    const decimals = (m[2].split(".")[1] || "").length;
    if (!Number.isFinite(target)) {
      setShown(value);
      return;
    }
    let raf = 0;
    let start = 0;
    const DUR = 850;
    const DELAY = 200;
    const tick = (now: number) => {
      if (!start) start = now;
      const t = now - start - DELAY;
      const p = t <= 0 ? 0 : Math.min(1, t / DUR);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = target * eased;
      const str = decimals > 0 ? cur.toFixed(decimals) : Math.round(cur).toLocaleString();
      setShown(`${prefix}${str}${suffix}`);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce, play]);
  return <span className="tabular-nums">{shown}</span>;
}

function Kpi({ accent, body, play, onDone }: { accent: string; body: string; play: boolean; onDone: () => void }) {
  const { value, label, delta, context } = parseKpi(body);
  const a = KPI_ACCENT[(accent as Accent)] ?? KPI_ACCENT.cyan;
  const down = (delta || "").trim().startsWith("-");
  useDoneAfter(play, 1300, onDone);
  return (
    <RevealCard className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-[1.3em] backdrop-blur-xl">
      <RevealItem variant="glow" as="span" className={cn("pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full blur-2xl", a.orb)} />
      {label && <RevealItem className="text-[0.7em] font-semibold uppercase tracking-[0.18em] text-white/45">{label}</RevealItem>}
      <RevealItem className={cn("mt-[0.15em] whitespace-nowrap bg-gradient-to-br bg-clip-text text-[2.6em] font-light leading-none tracking-tight text-transparent", a.text)}>
        <CountUp value={value} play={play} />
      </RevealItem>
      {(delta || context) && (
        <RevealItem className="mt-[0.5em] flex flex-wrap items-center gap-[0.6em]">
          {delta && (
            <span
              className={cn(
                "inline-flex items-center gap-[0.3em] rounded-full px-[0.55em] py-[0.15em] text-[0.7em] font-semibold ring-1",
                down ? "bg-rose-400/15 text-rose-200 ring-rose-300/25" : "bg-emerald-400/15 text-emerald-200 ring-emerald-300/25"
              )}
            >
              {down ? <TrendDown size="1em" weight="fill" /> : <TrendUp size="1em" weight="fill" />}
              {delta}
            </span>
          )}
          {context && <span className="text-[0.78em] text-white/50">{context}</span>}
        </RevealItem>
      )}
    </RevealCard>
  );
}

/* ============================ meter (progress toward goal) ============================ */
function Meter({ title, body, play, onDone }: { title: string; body: string; play: boolean; onDone: () => void }) {
  const rows = parseMeter(body);
  useDoneAfter(play, 520 + rows.length * 80 + 750, onDone);
  if (!rows.length) return null;
  return (
    <RevealCard className="rounded-2xl border border-white/10 bg-white/[0.04] p-[1.1em] backdrop-blur-xl">
      {title && <RevealItem className="mb-[0.9em] text-[0.72em] font-semibold uppercase tracking-[0.16em] text-white/45">{title}</RevealItem>}
      <RevealStagger className="space-y-[0.8em]">
        {rows.map((r, i) => {
          const pct = r.target ? Math.max(0, Math.min(110, (r.current / r.target) * 100)) : 100;
          const grad = pct < 50 ? "from-amber-400 to-orange-400" : pct < 100 ? "from-cyan-400 to-sky-400" : "from-emerald-400 to-teal-300";
          return (
            <RevealItem key={i}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[0.72em] font-semibold uppercase tracking-[0.14em] text-white/45">{r.label}</span>
                <span>
                  <span className="text-[1.05em] font-semibold tabular-nums text-white">{fmtVal(r.current, r.unit, r.rawCurrent)}</span>
                  {r.target !== undefined && <span className="text-[0.8em] tabular-nums text-white/40"> / {fmtVal(r.target, r.unit)}</span>}
                </span>
              </div>
              <div className="relative mt-[0.4em] h-[0.5em] overflow-hidden rounded-full bg-white/[0.06]">
                <RevealFill widthPct={Math.min(100, pct)} className={cn("block h-full rounded-full bg-gradient-to-r shadow-[0_0_12px_rgba(34,211,238,0.4)]", grad)} />
              </div>
            </RevealItem>
          );
        })}
      </RevealStagger>
    </RevealCard>
  );
}

/* ============================ bars (compare quantities) ============================ */
function Bars({ title, body, play, onDone }: { title: string; body: string; play: boolean; onDone: () => void }) {
  const rows = parseBars(body);
  useDoneAfter(play, 520 + rows.length * 80 + 750, onDone);
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <RevealCard className="rounded-2xl border border-white/10 bg-white/[0.035] p-[1.1em] backdrop-blur-xl">
      {title && <RevealItem className="mb-[0.9em] text-[0.72em] font-semibold uppercase tracking-[0.16em] text-cyan-300/80">{title}</RevealItem>}
      <RevealStagger className="space-y-[0.65em]">
        {rows.map((r, i) => {
          const isMax = r.value === max;
          return (
            <RevealItem key={i} className="flex items-center gap-[0.6em]">
              <span className="w-[7.5em] shrink-0 truncate text-[0.8em] text-white/75">{r.label}</span>
              <div className="relative h-[0.6em] flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                <RevealFill
                  widthPct={(r.value / max) * 100}
                  className={cn(
                    "block h-full rounded-full bg-gradient-to-r",
                    isMax ? "from-cyan-300 to-sky-300 shadow-[0_0_10px_rgba(56,189,248,0.5)]" : "from-violet-400 to-cyan-400"
                  )}
                />
              </div>
              <span className="w-[4.5em] shrink-0 text-right text-[0.78em] tabular-nums text-white/60">{fmtVal(r.value, r.unit, r.raw)}</span>
            </RevealItem>
          );
        })}
      </RevealStagger>
    </RevealCard>
  );
}

/* ============================ define (term spotlight) ============================ */
function Define({ term, body, play, onDone }: { term: string; body: string; play: boolean; onDone: () => void }) {
  const [n] = useRowTyper([body], play, { onDone, startDelay: 520 });
  return (
    <RevealCard className="relative overflow-hidden rounded-2xl border border-sky-300/20 bg-gradient-to-br from-sky-500/[0.07] to-white/[0.02] p-5 backdrop-blur-xl">
      <RevealItem variant="rail" as="span" className="absolute inset-y-0 left-0 w-[3px] origin-top bg-gradient-to-b from-sky-400 to-cyan-400" />
      <RevealItem variant="glow" as="span" className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-sky-400/10 blur-2xl" />
      <RevealItem className="flex items-center gap-[0.4em] text-sky-300/70">
        <BookOpen size="1em" weight="fill" />
        <span className="text-[0.6em] font-semibold uppercase tracking-[0.22em]">Definition</span>
      </RevealItem>
      <RevealItem className="mt-[0.3em] bg-gradient-to-br from-white via-sky-50 to-sky-200/80 bg-clip-text text-[1.5em] font-light leading-[1.15] tracking-tight text-transparent">
        {term}
      </RevealItem>
      <RevealItem variant="railX" as="span" className="mt-[0.35em] block h-[2px] w-[2.2em] origin-left rounded-full bg-gradient-to-r from-sky-400/70 to-transparent" />
      {body && (
        <RevealItem className="mt-[0.5em] text-[0.92em] leading-[1.55] text-white/80">
          <Typed text={body} chars={n} components={tightMd} />
        </RevealItem>
      )}
    </RevealCard>
  );
}

/* ============================ table (relational data) ============================ */
function Table({ title, body, play, onDone }: { title: string; body: string; play: boolean; onDone: () => void }) {
  const { headers, rows } = useMemo(() => parseTable(body), [body]);
  useDoneAfter(play, 420 + rows.length * 80, onDone);
  if (!headers.length) return null;
  return (
    <RevealCard className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
      {title && (
        <RevealItem className="px-4 pt-4 text-[0.72em] font-semibold uppercase tracking-[0.18em] text-cyan-300/80">{title}</RevealItem>
      )}
      <RevealItem className="overflow-x-auto px-1 pb-1 pt-2" data-lenis-prevent>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th
                  key={i}
                  className={cn(
                    "border-b border-white/10 px-3.5 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/40",
                    i > 0 && isNumericCell(rows[0]?.[i] ?? "") ? "text-right" : "text-left"
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="border-b border-white/[0.05] transition-colors last:border-0 hover:bg-white/[0.03]">
                {headers.map((_, ci) => {
                  const cell = r[ci] ?? "";
                  const numeric = ci > 0 && isNumericCell(cell);
                  return (
                    <td
                      key={ci}
                      className={cn(
                        "px-3.5 py-2 align-top leading-snug",
                        numeric ? "text-right font-medium tabular-nums text-white/90" : "text-white/80",
                        ci === 0 && "font-medium text-white/90"
                      )}
                    >
                      <Prose text={cell} components={detailMd} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </RevealItem>
    </RevealCard>
  );
}

/* ============================ LinkedIn post preview ============================ */
function PostIdea({ body, play, onDone }: { body: string; play: boolean; onDone: () => void }) {
  const { hook, angle, format, why } = parseIdea(body);
  const post = hook || body.replace(/\*\*[^*]+\*\*:?/g, "").trim();
  const [n] = useRowTyper([post], play, { onDone, startDelay: 480 });
  // the angle (subtitle) + footer only appear AFTER the hook has finished typing
  const typed = !play || n >= post.length;
  return (
    <RevealCard
      whileHover={{ y: -2 }}
      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-4 shadow-[0_12px_44px_-24px_rgba(0,0,0,0.9)] backdrop-blur-xl transition-colors hover:border-[#0a66c2]/40"
    >
      <RevealItem className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-cyan-400/80 to-violet-500/80 text-[12px] font-bold text-white shadow-inner">
          DP
        </span>
        <div className="min-w-0 leading-tight">
          <div className="text-[13px] font-semibold text-white">Daniel Paul</div>
          <div className="text-[11px] text-white/45">Founder, AI · now</div>
        </div>
        <LinkedinLogo size={18} weight="fill" className="ml-auto text-[#0a66c2]" />
      </RevealItem>

      <RevealItem className="mt-3 min-h-[1.4em] text-[14px] font-medium leading-relaxed text-white/90">{post.slice(0, n)}</RevealItem>
      {typed && angle && <FadeUp className="mt-1.5 text-[12.5px] leading-relaxed text-white/55">{angle}</FadeUp>}

      {typed && (format || why) && (
        <FadeUp className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
          {format && (
            <span className="rounded-full bg-[#0a66c2]/15 px-2.5 py-0.5 text-[11px] font-medium text-sky-200 ring-1 ring-[#0a66c2]/30">{format}</span>
          )}
          {why && <span className="text-[11.5px] text-white/45">{why}</span>}
        </FadeUp>
      )}
    </RevealCard>
  );
}

/* ============================ chart (LinkedIn data viz) ============================ */
function ChartBlock({
  chart,
  play,
  onDone,
  chartFor,
}: {
  chart: ChartName;
  play: boolean;
  onDone: () => void;
  chartFor?: (name: ChartName, key: number) => ReactNode;
}) {
  const node = chartFor ? chartFor(chart, 0) : null;
  // chart shell (~0.5s) + ready gate (~0.48s) + series draw (~0.95s); skip instantly if no chart.
  useDoneAfter(play, node ? 2050 : 0, onDone);
  return node ? <div>{node}</div> : null;
}

/* ============================ dispatcher ============================ */
function BlockView({
  block: b,
  play,
  onDone,
  chartFor,
}: {
  block: Block;
  play: boolean;
  onDone: () => void;
  chartFor?: (name: ChartName, key: number) => ReactNode;
}) {
  switch (b.type) {
    case "text":
      return <TextBlock text={b.text} play={play} onDone={onDone} />;
    case "chart":
      return <ChartBlock chart={b.chart} play={play} onDone={onDone} chartFor={chartFor} />;
    case "callout":
      return <Callout variant={b.variant} body={b.body} play={play} onDone={onDone} />;
    case "keypoints":
      return <ListPanel title="Key points" body={b.body} Icon={CheckCircle} color="text-cyan-300/90" accent="text-cyan-300/80" play={play} onDone={onDone} />;
    case "actions":
      return <ListPanel title="Action items" body={b.body} Icon={ArrowRight} color="text-emerald-300/90" accent="text-emerald-300/80" play={play} onDone={onDone} />;
    case "stats":
      return <StatTiles body={b.body} play={play} onDone={onDone} />;
    case "quote":
      return <Quote attr={b.attr} body={b.body} play={play} onDone={onDone} />;
    case "chips":
      return <Chips title={b.title} body={b.body} play={play} onDone={onDone} />;
    case "idea":
      return <PostIdea body={b.body} play={play} onDone={onDone} />;
    case "timeline":
      return <Timeline title={b.title} body={b.body} play={play} onDone={onDone} />;
    case "steps":
      return <Steps title={b.title} body={b.body} play={play} onDone={onDone} />;
    case "decision":
      return <Decision title={b.title} body={b.body} play={play} onDone={onDone} />;
    case "people":
      return <People title={b.title} body={b.body} play={play} onDone={onDone} />;
    case "kpi":
      return <Kpi accent={b.accent} body={b.body} play={play} onDone={onDone} />;
    case "meter":
      return <Meter title={b.title} body={b.body} play={play} onDone={onDone} />;
    case "bars":
      return <Bars title={b.title} body={b.body} play={play} onDone={onDone} />;
    case "define":
      return <Define term={b.term} body={b.body} play={play} onDone={onDone} />;
    case "table":
      return <Table title={b.title} body={b.body} play={play} onDone={onDone} />;
  }
}

/**
 * Plays the parsed blocks as a strict SEQUENCE: each element forms in (card → icon → typewriter /
 * count / fill / chart-draw) and only when it reports `onDone` does the NEXT element begin — so a
 * chart is never overtaken by the block after it. When `stream` is false everything is shown at
 * once (used for the invisible height-reserve in StageAnswer). `chartFor` injects the LinkedIn
 * data charts (general answers omit it, so chart tokens self-skip).
 */
export function Blocks({
  blocks,
  stream = false,
  scrollRef,
  chartFor,
  className,
}: {
  blocks: Block[];
  stream?: boolean;
  scrollRef?: RefObject<HTMLElement | null>;
  chartFor?: (name: ChartName, key: number) => ReactNode;
  className?: string;
}) {
  const [active, setActive] = useState(stream ? 0 : blocks.length);
  const endRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    setActive(stream ? 0 : blocks.length);
  }, [blocks, stream]);

  const advance = useCallback((i: number) => setActive((a) => (i + 1 > a ? i + 1 : a)), []);

  // Follow the streaming caret to wherever the revealed content currently ENDS (NOT scrollHeight —
  // StageAnswer's invisible reserve makes scrollHeight the full answer height, which would bottom-pin).
  // Stops the moment the user scrolls UP (so they can re-read) and once the stream has fully finished
  // (so the panel never yanks back to the bottom afterwards). Re-arms on a new answer (blocks change).
  useEffect(() => {
    if (!stream) return;
    const el = scrollRef?.current;
    if (!el) return;
    let userScrolledUp = false;
    let lastTop = el.scrollTop;
    const onScroll = () => {
      // auto-follow only ever increases scrollTop; a decrease means the USER dragged the view up.
      if (el.scrollTop < lastTop - 8) userScrolledUp = true;
      lastTop = el.scrollTop;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const id = setInterval(() => {
      if (userScrolledUp || activeRef.current >= blocks.length) return;
      endRef.current?.scrollIntoView({ block: "nearest" });
      lastTop = el.scrollTop;
    }, 140);
    return () => {
      el.removeEventListener("scroll", onScroll);
      clearInterval(id);
    };
  }, [stream, scrollRef, blocks]);

  return (
    <div className={cn("space-y-3.5", className)}>
      {blocks.map((b, i) =>
        i > active ? null : (
          <BlockView key={i} block={b} play={stream && i === active} onDone={() => advance(i)} chartFor={chartFor} />
        )
      )}
      <div ref={endRef} aria-hidden className="h-0" />
    </div>
  );
}
