"use client";

import { useEffect, useRef, useState } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceRadial,
  forceX,
  forceY,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import type { BrainGraph as GraphData } from "@/lib/vault";

/**
 * Ambient version of the brain graph — runs in the background of /ask.
 * Non-interactive, very subtle, just enough motion to feel alive.
 */

type Props = { data: GraphData | null; highlights?: string[] };

type N = SimulationNodeDatum & { id: string; group: number; val: number };
type L = SimulationLinkDatum<N> & { source: string | N; target: string | N };

const BG_PALETTE = ["#3a4658", "#4a5060", "#5a4a5a", "#4a5a52", "#52524a"];

export default function AmbientBrain({ data, highlights = [] }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([e]) => {
      setSize({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!data || !canvasRef.current || size.w === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    ctx.scale(dpr, dpr);

    const nodes: N[] = data.nodes.map((n) => ({ id: n.id, group: n.group, val: n.val }));
    const links: L[] = data.links.map((l) => ({ ...l }));

    const radialTarget = Math.min(size.w, size.h) * 0.32;
    const cx = size.w / 2;
    const cy = size.h / 2;
    const sim = forceSimulation<N>(nodes)
      .force("link", forceLink<N, L>(links).id((d) => d.id).distance(26).strength(0.1))
      .force(
        "charge",
        forceManyBody<N>()
          .strength((d) => -90 - d.val * 20)
          .distanceMax(380)
      )
      .force("centerX", forceX<N>(cx).strength(0.04))
      .force("centerY", forceY<N>(cy).strength(0.04))
      .force("radial", forceRadial<N>(radialTarget, cx, cy).strength(0.02))
      .force(
        "collide",
        forceCollide<N>().radius((d) => Math.max(3, d.val * 2.4)).iterations(2)
      )
      .alphaDecay(0.012)
      .velocityDecay(0.22)
      .alphaMin(0.0015);

    const reheat = setInterval(() => sim.alphaTarget(0.04).restart(), 5000);
    setTimeout(() => sim.alphaTarget(0), 1500);

    const highlightSet = new Set(highlights);

    let raf: number;
    function draw() {
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#0a0a0f";
      ctx.fillRect(0, 0, size.w, size.h);

      // Massively dim ambient backdrop
      ctx.globalAlpha = 0.22;

      // Links
      ctx.strokeStyle = "rgba(140,140,160,0.07)";
      ctx.lineWidth = 0.4;
      for (const l of links) {
        const s = l.source as N;
        const t = l.target as N;
        if (s.x == null || t.x == null) continue;
        ctx.beginPath();
        ctx.moveTo(s.x!, s.y!);
        ctx.lineTo(t.x!, t.y!);
        ctx.stroke();
      }

      // Nodes
      for (const n of nodes) {
        if (n.x == null) continue;
        const isHot = highlightSet.has(n.id);
        const color = isHot ? "#f5f5f5" : BG_PALETTE[n.group % BG_PALETTE.length];
        const r = Math.max(1.2, n.val * 1.1);
        if (isHot) {
          const g = ctx.createRadialGradient(n.x!, n.y!, 0, n.x!, n.y!, r * 4);
          g.addColorStop(0, "rgba(255,255,255,0.6)");
          g.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(n.x!, n.y!, r * 4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.restore();
      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(reheat);
      sim.stop();
    };
  }, [data, size.w, size.h, highlights]);

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0" />
      {/* Vignette + radial darkening so the chat reads clearly on top */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(10,10,15,0.75)_70%,rgba(10,10,15,0.95)_100%)]" />
    </div>
  );
}
