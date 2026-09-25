// Gera os ícones do PWA (PNG) e o favicon (SVG) a partir de um desenho vetorial simples.
// Sem dependências nativas: o PNG é montado à mão (IHDR + IDAT com zlib + IEND).
// Uso: node scripts/generate-icons.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const out = join(dirname(fileURLToPath(import.meta.url)), '../public');
const BLUE = [0x1d, 0x4e, 0xd8];
const WHITE = [0xff, 0xff, 0xff];

// Marca de "check" em coordenadas relativas à área de conteúdo (0..1).
const CHECK = [
  [0.27, 0.53],
  [0.43, 0.69],
  [0.74, 0.34],
];
const STROKE = 0.085;

function distanceToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function roundedRectCoverage(x, y, size, radius) {
  const cx = Math.max(radius, Math.min(size - radius, x));
  const cy = Math.max(radius, Math.min(size - radius, y));
  const d = Math.hypot(x - cx, y - cy);
  return Math.max(0, Math.min(1, radius - d + 0.5));
}

/** @param {{ maskable: boolean }} options */
function render(size, { maskable }) {
  const pixels = Buffer.alloc(size * size * 4);
  // Ícone maskable: fundo sangrado e conteúdo dentro da zona segura (80% central).
  const contentScale = maskable ? 0.62 : 0.8;
  const offset = (1 - contentScale) / 2;
  const radius = size * 0.22;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const background = maskable ? 1 : roundedRectCoverage(x + 0.5, y + 0.5, size, radius);
      const u = ((x + 0.5) / size - offset) / contentScale;
      const v = ((y + 0.5) / size - offset) / contentScale;
      const d = Math.min(
        distanceToSegment(u, v, CHECK[0], CHECK[1]),
        distanceToSegment(u, v, CHECK[1], CHECK[2]),
      );
      const pixel = 1 / (size * contentScale);
      const mark = Math.max(0, Math.min(1, (STROKE / 2 - d) / pixel + 0.5));
      for (let c = 0; c < 3; c++)
        pixels[i + c] = Math.round(BLUE[c] * (1 - mark) + WHITE[c] * mark);
      pixels[i + 3] = Math.round(255 * background);
    }
  }
  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bits por canal
  header[9] = 6; // RGBA
  // Cada linha começa com o byte de filtro 0 (nenhum).
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++)
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true],
];
for (const [name, size, maskable] of targets) {
  writeFileSync(join(out, name), png(size, render(size, { maskable })));
}

const points = CHECK.map(
  ([x, y]) => `${(6.4 + x * 51.2).toFixed(1)} ${(6.4 + y * 51.2).toFixed(1)}`,
);
writeFileSync(
  join(out, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1d4ed8"/><polyline points="${points.join(' ')}" fill="none" stroke="#fff" stroke-width="${(STROKE * 51.2).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/></svg>\n`,
);
process.stdout.write(`Ícones gerados em ${out}\n`);
