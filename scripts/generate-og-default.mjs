/**
 * Genera public/og-default.png (1200×630) — imagen Open Graph de respaldo
 * para productos/categorías sin foto. Mismo lenguaje visual que
 * app/opengraph-image.tsx (navy #0B1220 + amarillo #FFD700).
 *
 * Uso: node scripts/generate-og-default.mjs
 */
import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../public/og-default.png');

const svg = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#0B1220"/>

  <!-- trazas tipo circuito (guiño al logo físico de la tienda) -->
  <g stroke="#FFD700" stroke-opacity="0.16" stroke-width="3" fill="none">
    <path d="M-20 110 H 320 L 380 170 H 560"/>
    <path d="M1220 90 H 940 L 880 150 H 760"/>
    <path d="M-20 520 H 260 L 330 460 H 470"/>
    <path d="M1220 540 H 980 L 900 470 H 780"/>
  </g>
  <g fill="#FFD700" fill-opacity="0.28">
    <circle cx="560" cy="170" r="7"/>
    <circle cx="760" cy="150" r="7"/>
    <circle cx="470" cy="460" r="7"/>
    <circle cx="780" cy="470" r="7"/>
  </g>

  <!-- halo dorado -->
  <circle cx="1080" cy="80" r="220" fill="#FFD700" fill-opacity="0.07"/>
  <circle cx="120" cy="560" r="180" fill="#FFD700" fill-opacity="0.05"/>

  <!-- marca -->
  <text x="600" y="300" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="104" font-weight="800">
    <tspan fill="#FFFFFF">Mundo</tspan><tspan fill="#FFD700">Tech</tspan>
  </text>

  <!-- slogan -->
  <text x="600" y="372" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700"
        letter-spacing="10" fill="#FFD700">CONECTADOS CONTIGO</text>

  <!-- ubicación -->
  <text x="600" y="448" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="26" fill="#9CA3AF">
    Tecnología y gadgets · Barquisimeto, Venezuela</text>

  <line x1="440" y1="500" x2="760" y2="500" stroke="#FFD700" stroke-opacity="0.45" stroke-width="3"/>
</svg>
`;

mkdirSync(dirname(OUT), { recursive: true });
const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
writeFileSync(OUT, png);
console.log(`OK → ${OUT} (${(png.length / 1024).toFixed(1)} KB)`);
