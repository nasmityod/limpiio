/**
 * generate-placeholder.mjs — PRD-008
 * Genera public/placeholder-product.png y public/placeholder.png (mismo asset)
 * sin dependencias externas: encoder PNG manual (zlib + CRC32).
 * Diseño: fondo slate-100 con glifo de imagen (marco redondeado, sol y montañas)
 * en tonos slate — neutro, alineado con la paleta de la tienda.
 *
 * Uso: node scripts/generate-placeholder.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public');

const W = 800;
const H = 800;

const BG    = [0xf1, 0xf5, 0xf9]; // slate-100 (igual que bg-slate-50/100 de las tarjetas)
const AREA  = [0xe2, 0xe8, 0xf0]; // slate-200 — "marco de foto"
const GLYPH = [0xcb, 0xd5, 0xe1]; // slate-300 — sol + montañas

const px = Buffer.alloc(W * H * 3);

function set(x, y, c) {
  const i = (y * W + x) * 3;
  px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
}

/** SDF de rectángulo redondeado: <= 0 dentro. */
function roundedRectSDF(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - (hw - r);
  const qy = Math.abs(y - cy) - (hh - r);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

function inTriangle(px_, py, [ax, ay], [bx, by], [cx, cy]) {
  const s1 = (bx - ax) * (py - ay) - (by - ay) * (px_ - ax);
  const s2 = (cx - bx) * (py - by) - (cy - by) * (px_ - bx);
  const s3 = (ax - cx) * (py - cy) - (ay - cy) * (px_ - cx);
  const hasNeg = s1 < 0 || s2 < 0 || s3 < 0;
  const hasPos = s1 > 0 || s2 > 0 || s3 > 0;
  return !(hasNeg && hasPos);
}

// Geometría: marco centrado 340×300, radio 28
const RECT = { cx: 400, cy: 400, hw: 170, hh: 150, r: 28 };
const SUN  = { x: 335, y: 335, r: 28 };
const MOUNTAIN_BIG   = [[245, 522], [380, 372], [515, 522]];
const MOUNTAIN_SMALL = [[400, 522], [482, 428], [564, 522]];

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const sdf = roundedRectSDF(x, y, RECT.cx, RECT.cy, RECT.hw, RECT.hh, RECT.r);
    if (sdf > 0) { set(x, y, BG); continue; }

    // Dentro del marco: glifo sobre área
    const dxs = x - SUN.x, dys = y - SUN.y;
    const inSun = dxs * dxs + dys * dys <= SUN.r * SUN.r;
    const inMnt =
      inTriangle(x, y, ...MOUNTAIN_BIG) || inTriangle(x, y, ...MOUNTAIN_SMALL);
    set(x, y, inSun || inMnt ? GLYPH : AREA);
  }
}

// ── Encoder PNG ──────────────────────────────────────────────────────────────
const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 2;  // color type RGB
// compression / filter / interlace = 0

const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0; // filtro None por scanline
  px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync(OUT_DIR, { recursive: true });
const main = path.join(OUT_DIR, 'placeholder-product.png');
writeFileSync(main, png);
copyFileSync(main, path.join(OUT_DIR, 'placeholder.png'));
console.log(`OK → ${main} (${png.length} bytes) + placeholder.png (alias)`);
