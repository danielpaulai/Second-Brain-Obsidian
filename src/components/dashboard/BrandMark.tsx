"use client";

import { CalendarBlank } from "@phosphor-icons/react";
import { BRANDS } from "@/lib/brand-marks";

// Each mark's SVG has different internal padding — normalize the optical size so
// none looks smaller than the rest (Slack's symbol sits small in its viewBox).
const LOGO_SCALE: Record<string, number> = { slack: 0.82 };

/** A real brand logo on a clean white app-icon chip (so colored AND monochrome
 *  marks read crisply on the dark UI). Calendar has no clean logo → a tinted glyph. */
export function BrandMark({ brand, size = 26, radius }: { brand: string; size?: number; radius?: number }) {
  const b = BRANDS[brand];
  if (!b) return null;
  const r = radius ?? Math.round(size * 0.28);
  return (
    <span
      className="flex shrink-0 items-center justify-center bg-white shadow-[0_2px_10px_-3px_rgba(0,0,0,0.55)] ring-1 ring-black/[0.06]"
      style={{ width: size, height: size, borderRadius: r }}
      aria-label={b.name}
    >
      {b.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={b.logo}
          alt={b.name}
          style={{ width: Math.round(size * (LOGO_SCALE[brand] ?? 0.64)), height: Math.round(size * (LOGO_SCALE[brand] ?? 0.64)) }}
          className="object-contain"
        />
      ) : (
        <CalendarBlank size={Math.round(size * 0.6)} weight="fill" style={{ color: b.color }} />
      )}
    </span>
  );
}
