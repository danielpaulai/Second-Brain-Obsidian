"use client";

/**
 * Shared "reveal" motion language for every answer block (general + LinkedIn) and the charts.
 *
 * The signature choreography is CARD-FIRST-THEN-CONTENT: a frosted glass SHELL condenses into
 * existence on its own (blur 7→0, slight rise + scale), and only ~160ms later does its inner
 * content (icon, title, list rows, stat tiles, bars) resolve into focus, staggered top-to-bottom.
 *
 * It is one primitive used everywhere so the whole experience shares a single rhythm:
 *   <RevealCard>            the glass shell — variants PARENT (owns the stagger clock)
 *     <RevealItem>…</>      a content atom that rises in (icon, line, row…)
 *     <RevealItem variant="rail" />        an accent rail / spine that "draws" (scaleY)
 *     <RevealItem variant="medallion">…</> a numeral / avatar that pops (spring)
 *     <RevealFill widthPct={62} />         a meter / bar fill that sweeps (scaleX)
 *
 * Children inherit the shell's `animate="show"` through framer context and need no per-child
 * delay — reveal order == the order they're written. Everything animates transform/opacity/filter
 * only (never layout) so the reserve+overlay centering in StageAnswer never drifts while streaming.
 * Respects prefers-reduced-motion (a clean 0.2s cross-fade to the identical final layout).
 */

import { type CSSProperties, type ReactNode } from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";

export const EASE = [0.16, 1, 0.3, 1] as const;
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export type RevealVariant = "shell" | "item" | "rail" | "railX" | "medallion" | "glow";

// Full-motion kit. The shell is the variants parent: it starts condensing in, and delayChildren
// holds the content for ~160ms (so the EMPTY card reads first) before staggerChildren cascades it
// in — overlapping the shell's tail rather than waiting for it to fully finish (no `beforeChildren`,
// which would push content to ~660ms and feel sluggish).
const FULL: Record<RevealVariant, Variants> = {
  shell: {
    hidden: { opacity: 0, y: 14, scale: 0.97, filter: "blur(7px)" },
    show: {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: "blur(0px)",
      transition: { duration: 0.5, ease: EASE, delayChildren: 0.16, staggerChildren: 0.055 },
    },
  },
  // content "resolves into focus" rather than sliding
  item: {
    hidden: { opacity: 0, y: 8, filter: "blur(4px)" },
    show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.38, ease: EASE_OUT } },
  },
  // an accent rail / timeline spine that draws downward
  rail: {
    hidden: { scaleY: 0, opacity: 0 },
    show: { scaleY: 1, opacity: 1, transition: { duration: 0.55, ease: EASE, delay: 0.1 } },
  },
  // a horizontal underline that grows left→right
  railX: {
    hidden: { scaleX: 0, opacity: 0 },
    show: { scaleX: 1, opacity: 1, transition: { duration: 0.55, ease: EASE, delay: 0.1 } },
  },
  // step numerals / people avatars — a confident count-on pop
  medallion: {
    hidden: { scale: 0.6, opacity: 0 },
    show: { scale: 1, opacity: 1, transition: { type: "spring", stiffness: 420, damping: 24 } },
  },
  // a soft accent bloom that arrives just after the shell
  glow: {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { duration: 0.6 } },
  },
};

// Reduced-motion kit: everything is a plain opacity cross-fade to the identical final layout
// (no scale / scaleX / scaleY / translate / blur), so it's fully accessible and never disorients.
const REDUCED: Record<RevealVariant, Variants> = {
  shell: { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } },
  item: { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } },
  rail: { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } },
  railX: { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } },
  medallion: { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } },
  glow: { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } },
};

export function useReveal() {
  const reduce = useReducedMotion();
  return { reduce: !!reduce, kit: reduce ? REDUCED : FULL };
}

type HoverProp = { y?: number; scale?: number };

/** The glass shell. Materializes alone first, then orchestrates its children's stagger. */
export function RevealCard({
  children,
  className,
  whileHover,
  style,
}: {
  children: ReactNode;
  className?: string;
  whileHover?: HoverProp;
  style?: CSSProperties;
}) {
  const { kit } = useReveal();
  return (
    <motion.div
      variants={kit.shell}
      initial="hidden"
      animate="show"
      whileHover={whileHover}
      style={style}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** A transparent stagger PARENT for grids/rows that aren't wrapped in a glass shell
 *  (stat tiles, chips, people cards). Orchestrates its children without any visual of its own. */
export function RevealGroup({
  children,
  className,
  stagger = 0.06,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
}) {
  const { reduce } = useReveal();
  const variants: Variants = {
    hidden: {},
    show: { transition: { when: "beforeChildren", staggerChildren: reduce ? 0 : stagger } },
  };
  return (
    <motion.div variants={variants} initial="hidden" animate="show" className={className}>
      {children}
    </motion.div>
  );
}

/** An INHERITING stagger container — use it for a rows wrapper that also needs layout classes
 *  (a `relative` spine column, a `space-y` list). Unlike RevealGroup it sets no initial/animate,
 *  so it stays part of the shell's clock (it activates in turn, then cascades ITS own children). */
export function RevealStagger({
  children,
  className,
  stagger = 0.055,
  style,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
  style?: CSSProperties;
}) {
  const { reduce } = useReveal();
  const variants: Variants = { hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : stagger } } };
  return (
    <motion.div variants={variants} className={className} style={style}>
      {children}
    </motion.div>
  );
}

/** A content atom that inherits the shell's clock and reveals in turn. */
export function RevealItem({
  children,
  className,
  variant = "item",
  as = "div",
  style,
}: {
  children?: ReactNode;
  className?: string;
  variant?: RevealVariant;
  as?: "div" | "span" | "li";
  style?: CSSProperties;
}) {
  const { kit } = useReveal();
  const v = kit[variant];
  if (as === "span") return <motion.span variants={v} className={className} style={style}>{children}</motion.span>;
  if (as === "li") return <motion.li variants={v} className={className} style={style}>{children}</motion.li>;
  return <motion.div variants={v} className={className} style={style}>{children}</motion.div>;
}

/** A meter / bar fill that sweeps out to `widthPct` (scaleX, GPU-cheap) once its row lands. */
export function RevealFill({
  className,
  widthPct,
  style,
}: {
  className?: string;
  widthPct: number;
  style?: CSSProperties;
}) {
  const { reduce } = useReveal();
  return (
    <motion.span
      className={className}
      style={{ width: `${Math.max(0, Math.min(100, widthPct))}%`, transformOrigin: "left", ...style }}
      variants={{
        hidden: { scaleX: reduce ? 1 : 0 },
        show: { scaleX: 1, transition: { duration: reduce ? 0 : 0.7, ease: EASE, delay: reduce ? 0 : 0.05 } },
      }}
    />
  );
}
