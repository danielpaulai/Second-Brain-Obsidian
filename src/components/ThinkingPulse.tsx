"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";

/**
 * Animated thinking visualization shown while Danny is processing.
 * Replaces the "thinking…" text dead-zone with:
 *   - A pulsing audio-waveform-style canvas
 *   - Soft halo rings expanding outward
 *   - Subtle scale breathing on the wrapper
 *
 * Pure canvas + SVG — no external deps, no audio analyser.
 * Drop it anywhere with `<ThinkingPulse />`.
 */

type Props = {
  size?: number;
  label?: string;
  sublabel?: string;
};

const BARS = 22;

export default function ThinkingPulse({
  size = 96,
  label = "Danny is thinking",
  sublabel = "scanning the brain…",
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    const phase = Array.from({ length: BARS }, () => Math.random() * Math.PI * 2);
    let raf: number;
    const start = performance.now();

    function draw() {
      const now = performance.now();
      const t = (now - start) / 1000;

      ctx.clearRect(0, 0, size, size);
      const cx = size / 2;
      const cy = size / 2;
      const baseR = size * 0.22;
      const maxAmp = size * 0.18;

      // Radial waveform — each bar oscillates at a slightly different phase
      for (let i = 0; i < BARS; i++) {
        const angle = (i / BARS) * Math.PI * 2;
        const amp = Math.abs(Math.sin(t * 2.4 + phase[i])) * maxAmp;
        const r1 = baseR;
        const r2 = baseR + amp;
        const x1 = cx + Math.cos(angle) * r1;
        const y1 = cy + Math.sin(angle) * r1;
        const x2 = cx + Math.cos(angle) * r2;
        const y2 = cy + Math.sin(angle) * r2;

        const grad = ctx.createLinearGradient(x1, y1, x2, y2);
        grad.addColorStop(0, "rgba(167,139,250,0.95)");
        grad.addColorStop(1, "rgba(167,139,250,0.0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // Outer ring — slowly expanding then resetting
      const ringR = baseR + ((t * 24) % maxAmp);
      const ringAlpha = 1 - ((t * 24) % maxAmp) / maxAmp;
      ctx.strokeStyle = `rgba(196,181,253,${0.45 * ringAlpha})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.stroke();

      // Center node — pulsing
      const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);
      const innerR = 4 + pulse * 2;
      const haloGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerR * 4);
      haloGrad.addColorStop(0, "rgba(255,255,255,0.95)");
      haloGrad.addColorStop(0.4, "rgba(196,181,253,0.5)");
      haloGrad.addColorStop(1, "rgba(196,181,253,0)");
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, innerR * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
      ctx.fill();

      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.35 }}
      className="flex items-center gap-3"
    >
      <motion.canvas
        ref={canvasRef}
        animate={{ scale: [1, 1.04, 1] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="flex flex-col">
        <span className="text-[11px] uppercase tracking-[0.18em] text-accent-300 font-medium">
          {label}
        </span>
        <span className="text-xs text-muted-foreground">{sublabel}</span>
      </div>
    </motion.div>
  );
}
