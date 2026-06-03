/**
 * brain-visual.ts — single source of truth for the "second brain" graph look.
 *
 * BrainGraph.tsx (both the live view and the stage flow) and the brain-shape layout
 * import ONLY from here so palette, sizing, easing, and ignition timing can never drift.
 *
 * Direction: "Synaptic Bloom" — bioluminescent neural tissue. Vivid on-brand violet/
 * teal/cyan/amber/rose on deep ink, self-luminous nodes, and a staggered cited-node
 * ignition (flash → wobbled ink shockwave → colour flare → action-potential beads →
 * sustained lit glow → fade).
 *
 * Pure functions + lazily-built sprite caches. Sprite builders touch `document` and so
 * are only ever called from client effects; top-level is SSR-safe.
 */

/* ────────────────────────── Colour ────────────────────────── */

/** Jewel-toned bioluminescent ramp — smooth spectral spread, cohesive on deep indigo. */
const BASE_RAMP = [
  "#a78bfa", // 0 violet (brand spine)
  "#818cf8", // 1 indigo
  "#60a5fa", // 2 blue
  "#22d3ee", // 3 cyan
  "#2dd4bf", // 4 teal
  "#34d399", // 5 emerald
  "#fbbf24", // 6 amber
  "#fb7185", // 7 rose
  "#e879f9", // 8 fuchsia
];
export const BASE_RAMP_LEN = BASE_RAMP.length;

const PERSONA: Record<string, string> = {
  danny: "#a78bfa", // violet
  ceo: "#818cf8", // indigo
  coo: "#2dd4bf", // teal
  cfo: "#fbbf24", // amber
  cmo: "#fb7185", // rose
  cro: "#22d3ee", // cyan
};

/**
 * Node colour. Currently a SINGLE uniform colour (brand violet) for every cluster —
 * a calm monochrome map. (BASE_RAMP / overflowHue kept below for an easy revert to
 * per-folder colours: just restore the indexed lookup.)
 */
export function paletteHex(_group: number): string {
  return "#a78bfa";
}

export function personaHex(agent: string): string {
  return PERSONA[agent] ?? "#a78bfa";
}

/** Folder-INDEPENDENT hot colours so "lit" is always distinguishable (a11y + brand). */
export function litCoreHex() {
  return "#ede9fe";
}
export function litHaloHex() {
  return "#c4b5fd";
}
export function pulseHex() {
  return "#22d3ee";
}

/* ── Stage palette (the cinematic full-bleed "neural brain") ──
 * Multi-hue, cyan-dominant bioluminescence on deep navy-black — matches the
 * neural-brain reference. Distinct from the live graph's uniform violet. */
const STAGE_RAMP = [
  "#22d3ee", // cyan (dominant)
  "#38bdf8", // sky
  "#2dd4bf", // teal
  "#22d3ee", // cyan (weight)
  "#60a5fa", // electric blue
  "#5eead4", // aqua
  "#38bdf8", // sky (weight)
  "#818cf8", // indigo
  "#e879f9", // fuchsia accent
  "#22d3ee", // cyan (weight)
  "#f472b6", // pink accent
  "#fbbf24", // gold accent
  "#a78bfa", // violet accent
  "#2dd4bf", // teal (weight)
];
export const STAGE_BG = "#02040a"; // deep navy-black base
export const STAGE_LIT = "#e8fdff"; // white-cyan hot core for cited/lit nodes
export const STAGE_LINK = "#2dd4bf"; // teal-cyan connections

/** Stable per-node stage colour from a seed (id hash). Cyan-weighted spread. */
export function stageColor(seed: number): string {
  return STAGE_RAMP[Math.abs(Math.floor(seed)) % STAGE_RAMP.length];
}

/** Cheap stable string hash → non-negative int (for colour/phase seeding). */
export function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Deterministic vivid hue for prod's hundreds of folders (index ≥ BASE_RAMP_LEN).
 * Golden-angle spread biased ~55% toward the nearer brand anchor (violet 280° / cyan 190°)
 * so it stays on-brand and never goes pastel. Pure HSL — no d3-color dependency.
 */
function overflowHue(i: number): string {
  const k = i - BASE_RAMP.length;
  let hue = (280 + k * 137.508) % 360;
  const dViolet = Math.abs(((hue - 280 + 540) % 360) - 180);
  const dCyan = Math.abs(((hue - 190 + 540) % 360) - 180);
  const anchor = dViolet < dCyan ? 280 : 190;
  hue = hue * 0.45 + anchor * 0.55;
  return hslToHex(hue, 0.78, 0.68);
}

/* ────────────────────────── Colour helpers ────────────────────────── */

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return { r: 255, g: 255, b: 255 };
  const num = parseInt(m[1], 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

/** Drop-in replacement for the old BrainGraph rgba() — same signature. */
export function rgba(hex: string, alpha: number): string {
  if (!hex.startsWith("#")) return hex;
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function toHex(n: number) {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}

/** Snap each RGB channel to a coarse step so the continuously-mixed colours that drive the lit/flare
 *  ramps collapse onto a small, bounded set of sprite-cache keys. Without this every ignition frame
 *  mints a new hex → a new cached <canvas> that's never reused (memory creep + perpetual rebuild
 *  spikes during a cascade). The step is tiny enough to be imperceptible on soft additive glows/discs. */
const SPRITE_QUANT = 8;
export function quantizeHex(hex: string): string {
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const q = (v: number) => Math.min(255, Math.round(v / SPRITE_QUANT) * SPRITE_QUANT);
  return `#${toHex(q((n >> 16) & 255))}${toHex(q((n >> 8) & 255))}${toHex(q(n & 255))}`;
}

export function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const k = clamp01(t);
  return `#${toHex(ca.r + (cb.r - ca.r) * k)}${toHex(ca.g + (cb.g - ca.g) * k)}${toHex(
    ca.b + (cb.b - ca.b) * k
  )}`;
}

export function lightenHex(hex: string, amt: number): string {
  return mixHex(hex, "#ffffff", amt);
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return `#${toHex((r + m) * 255)}${toHex((g + m) * 255)}${toHex((b + m) * 255)}`;
}

/* ────────────────────────── Easing ────────────────────────── */

export const EASE_CSS = "cubic-bezier(0.16,1,0.3,1)";

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
export function easeOutExpo(t: number): number {
  t = clamp01(t);
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}
export function easeInOutCubic(t: number): number {
  t = clamp01(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/* ────────────────────────── Sizing (shared 2D/3D) ────────────────────────── */

/** sqrt(area) mapping — importance reads through size, never colour alone. */
export function nodeRadius2D(val: number): number {
  return Math.max(3, Math.sqrt(Math.max(0.2, val)) * 3.2);
}
export function nodeScale3D(val: number): number {
  return Math.max(1.1, Math.sqrt(Math.max(0.2, val)) * 0.95);
}
/** Idle self-glow floor — hubs glow more. [0.10 .. 0.20]. */
export function haloFloor(degree: number): number {
  return 0.1 + Math.min(0.1, degree / 600);
}

/* ────────────────────────── Constants ────────────────────────── */

export const STAGGER_MS = 75;
export const IGNITE_TOTAL_MS = 2600;
/** Ignition phase boundaries, ms from a node's start time. */
export const PHASE = {
  flashEnd: 120,
  shockStart: 80,
  shockEnd: 600,
  flareUp: 200,
  flareSettle: 1400,
  pulseSpawn: 200,
  pulseHop: 480,
  settleStart: 600,
  sustainHold: 3000,
  fadeOut: 800,
};
export const LERP = 0.18; // focus lerp
export const LERP_GLOW = 0.1; // halo settle lerp
export const PULSE_BUDGET = 120; // max concurrent action-potential beads
export const DUST_DEV = 40;
export const DUST_PROD = 120;
export const BREATHE_RAD_PER_S = 0.6; // ~10s period
export const LOD = { haloCoreOnly: 0.4, addRim: 0.4, addLabels: 1.5 };
export const PROD_NODE_THRESHOLD = 1200;
export const MAX_LABELS = 40;

/** Stagger compressed so a big citation burst still lands in ~1s. */
export function staggerFor(count: number): number {
  return count > 14 ? Math.max(20, Math.floor(1050 / count)) : STAGGER_MS;
}

/* ────────────────────────── Sprite cache (2D) ────────────────────────── */

let _spriteScale = 1; // 1 = 64px glow, used to invalidate on DPR change
const glowCache = new Map<string, HTMLCanvasElement>();
const coreCache = new Map<string, HTMLCanvasElement>();
const spikeCache = new Map<string, HTMLCanvasElement>();
let beadSprite: HTMLCanvasElement | null = null;
let noiseTile: HTMLCanvasElement | null = null;

function makeCanvas(size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  return c;
}

/** Soft additive halo, tinted per folder hue. Drawn under globalCompositeOperation='lighter'. */
export function getGlowSprite(hex: string): HTMLCanvasElement {
  hex = quantizeHex(hex); // bound the cache → build each shade once, then reuse
  const cached = glowCache.get(hex);
  if (cached) return cached;
  const S = 64;
  const c = makeCanvas(S);
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, rgba(lightenHex(hex, 0.35), 0.9));
  g.addColorStop(0.28, rgba(hex, 0.45));
  g.addColorStop(0.6, rgba(hex, 0.14));
  g.addColorStop(1, rgba(hex, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  glowCache.set(hex, c);
  return c;
}

/** Crisp-ish node disc with an inner light. Drawn at 2r in world space. */
export function getCoreSprite(hex: string): HTMLCanvasElement {
  hex = quantizeHex(hex); // bound the cache → build each shade once, then reuse
  const cached = coreCache.get(hex);
  if (cached) return cached;
  const S = 48;
  const c = makeCanvas(S);
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(S * 0.42, S * 0.42, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, lightenHex(hex, 0.5));
  g.addColorStop(0.55, hex);
  g.addColorStop(0.9, mixHex(hex, "#000000", 0.12));
  g.addColorStop(1, rgba(hex, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 0.5, 0, Math.PI * 2);
  ctx.fill();
  coreCache.set(hex, c);
  return c;
}

/** 4-point diffraction flare — gated to hub/lit nodes only. Additive. */
export function getSpikeSprite(hex: string): HTMLCanvasElement {
  const cached = spikeCache.get(hex);
  if (cached) return cached;
  const S = 96;
  const c = makeCanvas(S);
  const ctx = c.getContext("2d")!;
  ctx.translate(S / 2, S / 2);
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    const g = ctx.createLinearGradient(0, 0, 0, -S / 2);
    g.addColorStop(0, rgba(lightenHex(hex, 0.4), 0.85));
    g.addColorStop(0.5, rgba(hex, 0.18));
    g.addColorStop(1, rgba(hex, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-1.4, 0);
    ctx.lineTo(0, -S / 2);
    ctx.lineTo(1.4, 0);
    ctx.closePath();
    ctx.fill();
  }
  spikeCache.set(hex, c);
  return c;
}

/** Action-potential bead — teal→violet glow. One shared sprite. */
export function getBeadSprite(): HTMLCanvasElement {
  if (beadSprite) return beadSprite;
  const S = 16;
  const c = makeCanvas(S);
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(215,210,240,0.85)");
  g.addColorStop(0.4, rgba(pulseHex(), 0.7));
  g.addColorStop(1, rgba(pulseHex(), 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  beadSprite = c;
  return c;
}

/** Static film grain, built once. Composited at low alpha into the cached background. */
export function makeNoiseTile(): HTMLCanvasElement {
  if (noiseTile) return noiseTile;
  const S = 128;
  const c = makeCanvas(S);
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 120 + Math.floor(Math.random() * 80);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  noiseTile = c;
  return c;
}

/** Rebuild sprites after a DPR change so crisp sprites don't blur. */
export function clearSpriteCache(dpr = 1): void {
  if (dpr === _spriteScale && glowCache.size > 0) return;
  _spriteScale = dpr;
  glowCache.clear();
  coreCache.clear();
  spikeCache.clear();
  beadSprite = null;
  // noiseTile is resolution-independent — keep it.
}
