#!/usr/bin/env node
/**
 * Generate PWA icons using only Node built-ins (no sharp dependency).
 * Renders a simple purple gradient + brain glyph as PNG via node:zlib + manual PNG
 * encoding. Output is intentionally simple — replace with a designed icon later.
 *
 *   node scripts/generate-icons.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const PUBLIC_DIR = path.resolve(path.dirname(__filename), "..", "public");

function crc32(buf) {
  let crc = ~0 >>> 0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/** Write a square PNG of given size filled with a purple radial gradient + simple white circle. */
function makePNG(size) {
  // Build raw RGBA pixels
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const maxR = Math.hypot(cx, cy);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy) / maxR;
      // Background: ink-950 → ink-900 radial darkening
      const t = Math.min(1, dist * 1.4);
      const r = Math.round(31 * (1 - t) + 10 * t);
      const g = Math.round(22 * (1 - t) + 10 * t);
      const b = Math.round(53 * (1 - t) + 15 * t);
      // Soft purple glow at center
      const glow = Math.max(0, 1 - dist * 1.6);
      const gr = Math.round(r + 167 * glow * 0.55);
      const gg = Math.round(g + 139 * glow * 0.55);
      const gb = Math.round(b + 250 * glow * 0.55);
      // White center dot — ~6% radius
      const centerDist = Math.hypot(dx, dy);
      const dotR = size * 0.045;
      let R = gr, G = gg, B = gb;
      if (centerDist < dotR) {
        const k = 1 - centerDist / dotR;
        R = Math.round(gr + (255 - gr) * k);
        G = Math.round(gg + (255 - gg) * k);
        B = Math.round(gb + (255 - gb) * k);
      }
      // Outer ring at ~38% radius
      const ringR = size * 0.38;
      const ringW = size * 0.02;
      if (Math.abs(centerDist - ringR) < ringW) {
        const k = 1 - Math.abs(centerDist - ringR) / ringW;
        R = Math.round(R + (167 - R) * k * 0.8);
        G = Math.round(G + (139 - G) * k * 0.8);
        B = Math.round(B + (250 - B) * k * 0.8);
      }
      const i = (y * size + x) * 4;
      rgba[i] = R;
      rgba[i + 1] = G;
      rgba[i + 2] = B;
      rgba[i + 3] = 255;
    }
  }

  // PNG filter byte (0) for each row
  const filtered = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    filtered[y * (size * 4 + 1)] = 0;
    rgba.copy(filtered, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const compressed = zlib.deflateSync(filtered, { level: 9 });

  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", compressed), chunk("IEND", Buffer.alloc(0))]);
}

async function main() {
  await fs.mkdir(PUBLIC_DIR, { recursive: true });
  const targets = [
    { name: "icon-192.png", size: 192 },
    { name: "icon-512.png", size: 512 },
    { name: "icon-maskable-512.png", size: 512 },
    { name: "apple-touch-icon.png", size: 180 },
  ];
  for (const t of targets) {
    const png = makePNG(t.size);
    await fs.writeFile(path.join(PUBLIC_DIR, t.name), png);
    console.log(`  ✓ ${t.name} (${t.size}x${t.size}, ${png.length} bytes)`);
  }
  console.log("\nDone. Icons written to public/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
