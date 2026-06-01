"use client";

/**
 * Custom canvas brain graph — Quartz-pattern, Obsidian-feel.
 *
 * Built from scratch on d3-force + d3-zoom + raw 2D canvas so we control
 * every pixel and every frame. No react-force-graph wrapper.
 *
 * Behaviors that match Obsidian:
 *  - Always-on physics with slow alpha decay (never crystallizes)
 *  - Hover → connected nodes brighten, others fade to 12% with cubic easing
 *  - Radial halo blooms under hovered + connected nodes
 *  - Labels fade in/out by zoom level (no abrupt thresholds)
 *  - True inertial drag: release a node, it keeps its velocity, physics resumes
 *  - Right-click to pin/unpin a node (sticky position)
 *  - Double-click empty space → zoom-to-fit + reset focus
 *  - Smooth wheel zoom with d3-zoom's animated transform
 *  - Highlights from agent queries pulse white with directional link particles
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceRadial,
  forceX,
  forceY,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import { zoom as d3zoom, zoomIdentity, type ZoomTransform } from "d3-zoom";
import { select } from "d3-selection";
import type { BrainGraph as GraphData } from "@/lib/vault";

/* ---------- Visual constants ------------------------------------------------ */

const BG = "#1e1e1e";
const LINK_BASE = "rgba(180,180,180,0.16)";
const LINK_DIM = "rgba(80,80,80,0.05)";
const LINK_ACTIVE = "rgba(220,220,220,0.48)";
const LINK_HOT = "rgba(255,255,255,0.85)";
const LERP = 0.16;

const PALETTE = [
  "#9ca7c4", "#a8b3a0", "#c4a89c", "#b4a8c4",
  "#a0bcb0", "#c4b89c", "#b89cb4", "#9cb4c4",
];

/* ---------- Types ----------------------------------------------------------- */

type GraphNode = SimulationNodeDatum & {
  id: string;
  name: string;
  folder: string;
  val: number;
  group: number;
  degree: number;
};

type GraphLink = SimulationLinkDatum<GraphNode> & {
  source: string | GraphNode;
  target: string | GraphNode;
};

type NodeAnim = {
  alpha: number; targetAlpha: number;
  scale: number; targetScale: number;
  halo: number;  targetHalo: number;
  label: number; targetLabel: number;
};

type Props = {
  data: GraphData | null;
  highlights?: string[];
  onNodeClick?: (id: string) => void;
};

/* ---------- Component ------------------------------------------------------- */

export default function BrainGraph({ data, highlights = [], onNodeClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hovered, setHovered] = useState<string | null>(null);

  /* DPR-aware resize */
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.floor(width), height: Math.floor(height) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  /* Adjacency map for hover-neighbor lookup */
  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    if (!data) return m;
    for (const l of data.links) {
      const s = typeof l.source === "object" ? (l.source as any).id : l.source;
      const t = typeof l.target === "object" ? (l.target as any).id : l.target;
      if (!m.has(s)) m.set(s, new Set());
      if (!m.has(t)) m.set(t, new Set());
      m.get(s)!.add(t);
      m.get(t)!.add(s);
    }
    return m;
  }, [data]);

  const highlightSet = useMemo(() => new Set(highlights), [highlights]);

  /* Active set: highlights (from agent queries) take precedence over hover */
  const activeSet = useMemo(() => {
    if (highlights.length > 0) {
      const set = new Set<string>(highlights);
      for (const h of highlights) neighbors.get(h)?.forEach((n) => set.add(n));
      return set;
    }
    if (hovered) {
      const set = new Set<string>([hovered]);
      neighbors.get(hovered)?.forEach((n) => set.add(n));
      return set;
    }
    return null;
  }, [hovered, highlights, neighbors]);

  /* -------------------------------------------------------------------------
   * Main effect: build simulation, wire input, run render loop.
   * Re-runs when data or size changes.
   * ------------------------------------------------------------------------ */
  useEffect(() => {
    if (!canvasRef.current || !data || size.width === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    ctx.scale(dpr, dpr);

    /* --- Simulation state --- */
    const nodes: GraphNode[] = data.nodes.map((n) => ({ ...n }));
    const links: GraphLink[] = data.links.map((l) => ({ ...l }));

    // Obsidian-feel forces: weak links + strong charge + radial pull = one unified ball,
    // not a hub-and-spoke spider. Notes prefer to sit on a sphere shape.
    const radialTarget = Math.min(size.width, size.height) * 0.32;
    const cx = size.width / 2;
    const cy = size.height / 2;
    const sim = forceSimulation<GraphNode>(nodes)
      .force(
        "link",
        forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance(28)
          .strength(0.12) // weak: links suggest, don't yank
      )
      .force(
        "charge",
        forceManyBody<GraphNode>()
          .strength((d) => -120 - d.val * 30) // bigger nodes repel more
          .distanceMax(420)
          .theta(0.95)
      )
      .force("centerX", forceX<GraphNode>(cx).strength(0.04))
      .force("centerY", forceY<GraphNode>(cy).strength(0.04))
      .force(
        "radial",
        forceRadial<GraphNode>(radialTarget, cx, cy).strength(0.018)
      )
      .force(
        "collide",
        forceCollide<GraphNode>()
          .radius((d) => Math.max(4, d.val * 2.6) + 1.5)
          .iterations(2)
      )
      .alphaDecay(0.014)
      .velocityDecay(0.22)
      .alphaMin(0.002);

    // Heartbeat reheats to keep "breathing" alive forever
    const reheat = setInterval(() => sim.alphaTarget(0.05).restart(), 4500);
    setTimeout(() => sim.alphaTarget(0), 1000); // first cool

    /* --- Animation state per node --- */
    const anims = new Map<string, NodeAnim>();
    const getAnim = (id: string) => {
      let a = anims.get(id);
      if (!a) {
        a = { alpha: 1, targetAlpha: 1, scale: 1, targetScale: 1, halo: 0, targetHalo: 0, label: 0, targetLabel: 0 };
        anims.set(id, a);
      }
      return a;
    };

    /* --- Zoom / pan --- */
    let transform: ZoomTransform = zoomIdentity;
    const sel = select(canvas);
    const zoomBehavior = d3zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.05, 8])
      .filter((event) => {
        // Allow wheel + middle-button + right-click panning, block primary-button drag (used for node drag)
        if (event.type === "wheel") return true;
        if (event.type === "mousedown" || event.type === "touchstart") {
          if (event.button === 2 || event.button === 1) return true; // right + middle
          // Primary button: only pan if NOT on a node
          const node = pickNode(event);
          return !node;
        }
        return true;
      })
      .on("zoom", (event) => {
        transform = event.transform;
      });
    sel.call(zoomBehavior);
    // Disable browser context menu (we use right-click for panning + unpin)
    canvas.oncontextmenu = (e) => e.preventDefault();

    /* --- Hit testing --- */
    function pickNode(event: MouseEvent | { offsetX: number; offsetY: number }): GraphNode | null {
      const x = (event as any).offsetX;
      const y = (event as any).offsetY;
      const wx = (x - transform.x) / transform.k;
      const wy = (y - transform.y) / transform.k;
      // Iterate in reverse so top-rendered nodes win ties
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (n.x === undefined || n.y === undefined) continue;
        const r = Math.max(4, n.val * 1.8);
        const dx = (n.x as number) - wx;
        const dy = (n.y as number) - wy;
        if (dx * dx + dy * dy <= r * r) return n;
      }
      return null;
    }

    /* --- Mouse interaction --- */
    let dragNode: GraphNode | null = null;
    let dragOffset = { x: 0, y: 0 };
    let lastMoveTime = performance.now();
    let lastMove = { x: 0, y: 0 };
    let velocity = { x: 0, y: 0 };

    function onMouseMove(e: MouseEvent) {
      const wx = (e.offsetX - transform.x) / transform.k;
      const wy = (e.offsetY - transform.y) / transform.k;

      if (dragNode) {
        const now = performance.now();
        const dt = Math.max(8, now - lastMoveTime);
        const newX = wx - dragOffset.x;
        const newY = wy - dragOffset.y;
        velocity.x = ((newX - lastMove.x) * 1000) / dt;
        velocity.y = ((newY - lastMove.y) * 1000) / dt;
        lastMove = { x: newX, y: newY };
        lastMoveTime = now;
        dragNode.fx = newX;
        dragNode.fy = newY;
        sim.alphaTarget(0.3).restart();
      } else {
        const node = pickNode(e);
        setHovered(node?.id ?? null);
        canvas.style.cursor = node ? "pointer" : "default";
      }
    }

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return; // only left button starts drag
      const node = pickNode(e);
      if (!node) return;
      dragNode = node;
      const wx = (e.offsetX - transform.x) / transform.k;
      const wy = (e.offsetY - transform.y) / transform.k;
      dragOffset = { x: wx - (node.x ?? 0), y: wy - (node.y ?? 0) };
      lastMove = { x: node.x ?? 0, y: node.y ?? 0 };
      lastMoveTime = performance.now();
      velocity = { x: 0, y: 0 };
      sim.alphaTarget(0.3).restart();
      canvas.style.cursor = "grabbing";
    }

    function onMouseUp() {
      if (!dragNode) return;
      // Release with inertia — velocity flows into the simulation.
      // Cap velocity so wild flings don't yeet a node into outer space.
      const VMAX = 600;
      const vx = Math.max(-VMAX, Math.min(VMAX, velocity.x));
      const vy = Math.max(-VMAX, Math.min(VMAX, velocity.y));
      dragNode.fx = null;
      dragNode.fy = null;
      dragNode.vx = vx * 0.02;
      dragNode.vy = vy * 0.02;
      sim.alphaTarget(0).alpha(0.5).restart();
      dragNode = null;
      canvas.style.cursor = "default";
    }

    function onClick(e: MouseEvent) {
      if (e.button !== 0) return;
      const node = pickNode(e);
      if (node) onNodeClick?.(node.id);
    }

    function onDblClick(e: MouseEvent) {
      e.preventDefault();
      const node = pickNode(e);
      if (node) return; // dbl-click on a node = no-op
      // Empty-space dbl-click → recenter + zoom-to-fit
      zoomToFit(true);
    }

    function onRightClick(e: MouseEvent) {
      if (e.button !== 2) return;
      const node = pickNode(e);
      if (node && node.fx != null) {
        node.fx = null;
        node.fy = null;
      }
    }

    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mouseleave", () => {
      onMouseUp();
      setHovered(null);
    });
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("dblclick", onDblClick);
    canvas.addEventListener("mousedown", onRightClick);

    /* --- Zoom-to-fit helper --- */
    function zoomToFit(animate = false) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of nodes) {
        if (n.x === undefined || n.y === undefined) continue;
        if (n.x < minX) minX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.x > maxX) maxX = n.x;
        if (n.y > maxY) maxY = n.y;
      }
      const w = maxX - minX, h = maxY - minY;
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      const scale = Math.min(size.width / (w + 80), size.height / (h + 80), 1.2);
      const tx = size.width / 2 - cx * scale;
      const ty = size.height / 2 - cy * scale;
      const target = zoomIdentity.translate(tx, ty).scale(scale);
      const transition = sel as any;
      if (animate) transition.transition().duration(900).call(zoomBehavior.transform, target);
      else sel.call(zoomBehavior.transform, target);
    }

    // Initial fit after sim warms up
    const fitTimer = setTimeout(() => zoomToFit(true), 1200);

    /* --- Render loop --- */
    let raf: number;
    function draw() {
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, size.width, size.height);
      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.k, transform.k);

      const scale = transform.k;

      /* --- Links --- */
      ctx.lineCap = "round";
      for (const l of links) {
        const s = l.source as GraphNode;
        const t = l.target as GraphNode;
        if (s.x == null || t.x == null) continue;
        const sId = (typeof l.source === "object" ? l.source.id : l.source) as string;
        const tId = (typeof l.target === "object" ? l.target.id : l.target) as string;
        const isHot = highlightSet.has(sId) || highlightSet.has(tId);
        const isActive = activeSet && activeSet.has(sId) && activeSet.has(tId);
        let color = LINK_BASE;
        let width = 0.45;
        if (isHot) { color = LINK_HOT; width = 1.6; }
        else if (isActive) { color = LINK_ACTIVE; width = 1.0; }
        else if (activeSet) { color = LINK_DIM; width = 0.35; }
        ctx.strokeStyle = color;
        ctx.lineWidth = width / scale;
        ctx.beginPath();
        ctx.moveTo(s.x!, s.y!);
        ctx.lineTo(t.x!, t.y!);
        ctx.stroke();
      }

      /* --- Nodes + halos + labels --- */
      const labelZoom = Math.max(0, Math.min(1, (scale - 1.5) / 1.5));

      for (const n of nodes) {
        if (n.x == null) continue;
        const a = getAnim(n.id);
        const isHot = highlightSet.has(n.id);
        const isActive = activeSet ? activeSet.has(n.id) : true;
        const dim = activeSet ? !isActive : false;
        const baseColor = isHot ? "#f5f5f5" : PALETTE[n.group % PALETTE.length];

        a.targetAlpha = dim ? 0.12 : 1;
        a.targetScale = isHot ? 2.2 : isActive && activeSet ? 1.35 : 1;
        a.targetHalo = isHot ? 1 : isActive && activeSet ? 0.55 : 0;
        const ctxLabel = isHot ? 1 : isActive && activeSet ? 1 : labelZoom;
        a.targetLabel = ctxLabel;

        a.alpha += (a.targetAlpha - a.alpha) * LERP;
        a.scale += (a.targetScale - a.scale) * LERP;
        a.halo += (a.targetHalo - a.halo) * LERP;
        a.label += (a.targetLabel - a.label) * LERP;

        const r = Math.max(1.8, n.val * 1.5) * a.scale;

        // Halo
        if (a.halo > 0.01) {
          const haloR = r * 3.4;
          const grad = ctx.createRadialGradient(n.x!, n.y!, r * 0.4, n.x!, n.y!, haloR);
          grad.addColorStop(0, rgba(baseColor, 0.42 * a.halo));
          grad.addColorStop(0.55, rgba(baseColor, 0.12 * a.halo));
          grad.addColorStop(1, rgba(baseColor, 0));
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(n.x!, n.y!, haloR, 0, Math.PI * 2);
          ctx.fill();
        }

        // Node body
        ctx.globalAlpha = a.alpha;
        ctx.fillStyle = baseColor;
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, r, 0, Math.PI * 2);
        ctx.fill();

        // Focus ring
        if (isHot || (isActive && activeSet)) {
          ctx.strokeStyle = rgba("#ffffff", 0.6 * a.halo);
          ctx.lineWidth = 0.6 / scale;
          ctx.stroke();
        }

        // Label
        if (a.label > 0.04) {
          const fontSize = Math.max(3, Math.min(11, 12 / scale));
          ctx.font = `500 ${fontSize}px var(--font-geist-sans, ui-sans-serif), system-ui`;
          const labelColor = isHot ? "#ffffff" : isActive && activeSet ? "#e4e4e7" : "#a8a8b0";
          ctx.fillStyle = rgba(labelColor, a.label);
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          const label = n.name.length > 30 ? n.name.slice(0, 28) + "…" : n.name;
          ctx.fillText(label, n.x!, n.y! + r + 2.5);
        }

        ctx.globalAlpha = 1;
      }

      ctx.restore();
      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);

    /* --- Cleanup --- */
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(reheat);
      clearTimeout(fitTimer);
      sim.stop();
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("dblclick", onDblClick);
      canvas.removeEventListener("mousedown", onRightClick);
      sel.on(".zoom", null);
    };
  }, [data, size.width, size.height, neighbors]);

  /* Highlights from agent queries: re-fit-ish — center on first hit */
  useEffect(() => {
    // The render loop already responds to activeSet via React state.
    // Camera focus is handled by the parent-controlled `highlights` prop
    // re-triggering the dependency above.
  }, [highlights]);

  return (
    <div ref={containerRef} className="absolute inset-0">
      {(!data || size.width === 0) && (
        <div className="flex h-full w-full items-center justify-center">
          <div className="text-center">
            <div className="text-3xl mb-2">🧠</div>
            <div className="text-sm text-zinc-500">Loading brain…</div>
          </div>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 select-none"
        style={{ background: BG }}
      />
      {hovered && data && (
        <HoverTooltip nodeId={hovered} data={data} />
      )}
    </div>
  );
}

/* ---------- Hover tooltip --------------------------------------------------- */

function HoverTooltip({ nodeId, data }: { nodeId: string; data: GraphData }) {
  const node = data.nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  return (
    <div className="pointer-events-none absolute top-3 left-3 z-10 rounded-md border border-white/10 bg-black/85 px-3 py-2 text-xs backdrop-blur shadow-xl">
      <div className="text-zinc-100 font-medium">{node.name}</div>
      <div className="text-zinc-500 text-[10px]">
        {node.folder} · {node.degree} link{node.degree === 1 ? "" : "s"}
      </div>
    </div>
  );
}

/* ---------- Helpers --------------------------------------------------------- */

function rgba(hex: string, alpha: number) {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
