"use client";

import { useEffect } from "react";
import Lenis from "lenis";

/**
 * Lenis smooth-scroll wired to the document. Adds momentum + eased deceleration
 * to all wheel/touch scrolling. The chat panel's internal scroll uses a
 * different element with overflow-y-auto and is unaffected.
 */
export default function SmoothScrollProvider() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const lenis = new Lenis({
      duration: 0.95,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.3,
    });
    let raf: number;
    function loop(time: number) {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, []);
  return null;
}
