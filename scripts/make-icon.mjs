/**
 * Genera `resources/icon.ico` desde cero.
 *
 * No hay dependencia de imágenes en el proyecto y no quería añadir una por un
 * solo archivo: un ICO moderno admite payloads PNG, y un PNG se codifica con
 * zlib, que ya viene con Node. La marca se rasteriza a mano — un tejado en
 * chevron sobre fondo oscuro, la "A" de Atreus reducida a su forma.
 *
 *   node scripts/make-icon.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'icon.ico');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

// Los mismos tokens que theme.css.
const BG = [0x0a, 0x0a, 0x0d];
const ACCENT = [0x8b, 0x5c, 0xf6];
const ACCENT_HI = [0xa7, 0x8b, 0xfa];

// ── PNG ───────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9); // RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Rasterizado ───────────────────────────────────────────────
/** Distancia con signo a un rectángulo redondeado, para bordes suaves. */
function roundedBox(x, y, half, radius) {
  const dx = Math.abs(x) - half + radius;
  const dy = Math.abs(y) - half + radius;
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - radius;
}

/** Distancia a un segmento, para dibujar el chevron con grosor. */
function segment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)));
  return Math.hypot(wx - t * vx, wy - t * vy);
}

function draw(size) {
  const rgba = Buffer.alloc(size * size * 4);
  // Se muestrea 3×3 por píxel: sin esto los bordes salen dentados en 16px.
  const SS = 3;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          // Coordenadas normalizadas a [-1, 1].
          const u = ((x + (sx + 0.5) / SS) / size) * 2 - 1;
          const v = ((y + (sy + 0.5) / SS) / size) * 2 - 1;

          const inTile = roundedBox(u, v, 0.94, 0.34) <= 0;
          if (!inTile) continue;

          // Chevron: dos trazos que suben al vértice, más el travesaño.
          const thickness = 0.155;
          const d = Math.min(
            segment(u, v, -0.44, 0.46, 0, -0.5),
            segment(u, v, 0.44, 0.46, 0, -0.5),
            segment(u, v, -0.22, 0.12, 0.22, 0.12),
          );
          const onMark = d <= thickness;

          if (onMark) {
            // Degradado sutil de arriba abajo, para que no se vea plano.
            const k = (v + 1) / 2;
            r += ACCENT_HI[0] * (1 - k) + ACCENT[0] * k;
            g += ACCENT_HI[1] * (1 - k) + ACCENT[1] * k;
            b += ACCENT_HI[2] * (1 - k) + ACCENT[2] * k;
          } else {
            r += BG[0]; g += BG[1]; b += BG[2];
          }
          a += 255;
        }
      }

      const samples = SS * SS;
      const covered = a / 255;
      const i = (y * size + x) * 4;
      if (covered > 0) {
        rgba[i] = Math.round(r / covered);
        rgba[i + 1] = Math.round(g / covered);
        rgba[i + 2] = Math.round(b / covered);
      }
      rgba[i + 3] = Math.round(a / samples);
    }
  }
  return rgba;
}

// ── ICO ───────────────────────────────────────────────────────
const images = SIZES.map((size) => ({ size, png: encodePng(draw(size), size) }));

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reservado
header.writeUInt16LE(1, 2); // tipo 1 = icono
header.writeUInt16LE(images.length, 4);

const entries = [];
let offset = 6 + images.length * 16;
for (const { size, png } of images) {
  const e = Buffer.alloc(16);
  // 256 se codifica como 0: el campo es de un byte.
  e.writeUInt8(size === 256 ? 0 : size, 0);
  e.writeUInt8(size === 256 ? 0 : size, 1);
  e.writeUInt8(0, 2); // colores de la paleta
  e.writeUInt8(0, 3); // reservado
  e.writeUInt16LE(1, 4); // planos
  e.writeUInt16LE(32, 6); // bits por píxel
  e.writeUInt32LE(png.length, 8);
  e.writeUInt32LE(offset, 12);
  entries.push(e);
  offset += png.length;
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, Buffer.concat([header, ...entries, ...images.map((i) => i.png)]));

console.log(
  `icon.ico escrito: ${images.length} tamaños (${SIZES.join(', ')}), ` +
  `${(offset / 1024).toFixed(1)} KB`,
);
