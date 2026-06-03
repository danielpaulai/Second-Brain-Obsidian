/**
 * sphere-shape.ts — lays N nodes evenly across the surface of a unit sphere
 * (Fibonacci lattice) and returns 3D unit vectors + near-neighbour surface edges.
 *
 * This is the stage's "asleep" layout: a slowly rotating 3D globe of glowing nodes
 * that blooms into the live network on "wake up". A brain silhouette read as a filled
 * blob; a sphere reads as STRUCTURE — an even point cloud, depth-shaded front-to-back,
 * laced with a wireframe that wraps the surface. Tasteful, premium, unmistakably 3D.
 *
 * Returns UNIT vectors (BrainGraph rotates + projects them per-frame for the live 3D
 * look), a fixed screen center + radius, decorative wireframe edges, and a center-out
 * release stagger (drives the wake bloom). Pure + deterministic.
 */

export type Vec3 = { x: number; y: number; z: number };

export type SphereShape = {
  unit: Vec3[]; // unit-sphere positions, length n (input order)
  edges: [number, number][]; // near-neighbour surface edges (wireframe globe)
  center: { x: number; y: number };
  radius: number; // screen-space sphere radius (px)
  releaseDelay: number[]; // 0..1 per node (wake bloom stagger), length n
  radial: number[]; // per-node radial multiplier (~1; a few >1 → tasteful rough silhouette)
};

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ~2.399963 rad

/**
 * @param n   number of nodes to place on the sphere
 * @param W,H viewport size (px) — sets screen center + radius
 */
export function computeSphereShape(n: number, W: number, H: number, _seed = 1): SphereShape {
  const count = Math.max(1, n);

  // Fibonacci sphere — even vertical bands, golden-angle around → no clumps, no poles gap.
  const unit: Vec3[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const y = count === 1 ? 0 : 1 - (i / (count - 1)) * 2; // +1 (top) .. -1 (bottom)
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = i * GOLDEN_ANGLE;
    unit[i] = { x: Math.cos(theta) * r, y, z: Math.sin(theta) * r };
  }

  // Wireframe edges: each node → its K nearest surface neighbours (each edge kept once).
  // The nearest neighbours of a Fibonacci-lattice point lie within a bounded INDEX window (offsets
  // near the Fibonacci numbers ~√n), so for big clouds search a window instead of all-pairs — keeps
  // this O(n·√n) instead of O(n²) (a full 2,500-node globe would otherwise be ~6M ops on mount).
  const K_NEIGH = 3;
  const win = count > 700 ? Math.max(60, Math.round(2.5 * Math.sqrt(count))) : count;
  const seen = new Set<number>();
  const edges: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const a = unit[i];
    const best: { j: number; d: number }[] = []; // worst-first, length ≤ K_NEIGH
    const lo = win >= count ? 0 : Math.max(0, i - win);
    const hi = win >= count ? count : Math.min(count, i + win + 1);
    for (let j = lo; j < hi; j++) {
      if (j === i) continue;
      const b = unit[j];
      const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (best.length < K_NEIGH) {
        best.push({ j, d });
        best.sort((p, q) => q.d - p.d);
      } else if (d < best[0].d) {
        best[0] = { j, d };
        best.sort((p, q) => q.d - p.d);
      }
    }
    for (const { j } of best) {
      const lo = Math.min(i, j), hi = Math.max(i, j);
      const key = lo * 100000 + hi;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([lo, hi]);
    }
  }

  const center = { x: W / 2, y: H * 0.46 };
  const radius = Math.min(W, H) * 0.2; // sits with breathing room — not zoomed in

  // Clean, smooth sphere — every node sits exactly on the surface (no radial roughness).
  const radial: number[] = new Array(count).fill(1);

  // Center-out release: nodes near the silhouette center bloom first, rim last → an
  // outward burst as the globe unspools into the network. (|x,y| of the unit vector,
  // which is exactly the projected distance from center; always 0..1.)
  const releaseDelay: number[] = new Array(count);
  for (let i = 0; i < count; i++) {
    releaseDelay[i] = Math.min(1, Math.hypot(unit[i].x, unit[i].y));
  }

  return { unit, edges, center, radius, releaseDelay, radial };
}
