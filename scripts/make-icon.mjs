/**
 * Genera la marca de Atreus desde cero: `resources/icon.ico` y `resources/icon.png`.
 *
 * No hay dependencia de imágenes en el proyecto y no quería añadir una por dos
 * archivos: un ICO moderno admite payloads PNG, y un PNG se codifica con zlib,
 * que ya viene con Node. Todo se rasteriza a mano con distancias con signo, que
 * es lo que permite que el borde siga limpio a 16 píxeles.
 *
 * La marca: una loseta morada con la **A** calada en negativo y su travesaño
 * inclinado como un rayo. En negativo en vez de en positivo a propósito — a
 * tamaño de pestaña, una silueta llena se distingue de un vistazo y un trazo
 * fino se deshace.
 *
 *   node scripts/make-icon.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RESOURCES = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources');
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const PNG_SIZE = 512;

// Los mismos tokens que theme.css.
const BG = [0x0a, 0x0a, 0x0d];
const ACCENT = [0x8b, 0x5c, 0xf6];
const ACCENT_HI = [0xa7, 0x8b, 0xfa];
const ACCENT_PRESS = [0x6d, 0x33, 0xd7];

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

// ── Geometría ─────────────────────────────────────────────────
/** Distancia con signo a un rectángulo redondeado. Negativa dentro. */
function roundedBox(x, y, half, radius) {
  const dx = Math.abs(x) - half + radius;
  const dy = Math.abs(y) - half + radius;
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - radius;
}

/** Distancia a un segmento, para trazos con grosor uniforme. */
function segment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)));
  return Math.hypot(wx - t * vx, wy - t * vy);
}

const mix = (a, b, t) => a + (b - a) * t;

/**
 * Distancia a la letra: dos patas hasta el vértice y un travesaño inclinado.
 *
 * El travesaño va en diagonal y no recto: es lo que convierte la A en una marca
 * propia en lugar de una letra cualquiera, y a la vez deja el guiño al rayo del
 * icono de cheats sin añadir una forma más que se pierda a 16 píxeles.
 */
function letterDistance(u, v) {
  return Math.min(
    segment(u, v, -0.44, 0.54, -0.02, -0.52),
    segment(u, v, 0.44, 0.54, 0.02, -0.52),
    segment(u, v, -0.245, 0.30, 0.245, 0.16),
  );
}

function draw(size) {
  const rgba = Buffer.alloc(size * size * 4);
  // Se muestrea 4×4 por píxel: a 16 px, con menos, el vértice de la A se dentea.
  const SS = 4;
  const samples = SS * SS;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, covered = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = ((x + (sx + 0.5) / SS) / size) * 2 - 1;
          const v = ((y + (sy + 0.5) / SS) / size) * 2 - 1;

          if (roundedBox(u, v, 0.94, 0.34) > 0) continue;
          covered++;

          const k = (v + 1) / 2; // 0 arriba, 1 abajo

          if (letterDistance(u, v) <= 0.118) {
            // La letra calada: el fondo de la app, con un punto de luz arriba
            // para que no parezca un agujero plano.
            const lift = Math.max(0, 0.35 - k) * 0.5;
            r += mix(BG[0], 0x2a, lift);
            g += mix(BG[1], 0x24, lift);
            b += mix(BG[2], 0x3a, lift);
          } else {
            // Loseta: degradado morado de arriba abajo, más un filo claro en el
            // borde superior que le da volumen sin dibujar una sombra.
            const rim = Math.max(0, 1 - Math.abs(roundedBox(u, v, 0.94, 0.34)) / 0.045) * (v < 0 ? 0.55 : 0.12);
            r += mix(mix(ACCENT_HI[0], ACCENT_PRESS[0], k), 0xff, rim * 0.35);
            g += mix(mix(ACCENT_HI[1], ACCENT_PRESS[1], k), 0xff, rim * 0.35);
            b += mix(mix(ACCENT_HI[2], ACCENT_PRESS[2], k), 0xff, rim * 0.35);
          }
        }
      }

      const i = (y * size + x) * 4;
      if (covered > 0) {
        rgba[i] = Math.round(r / covered);
        rgba[i + 1] = Math.round(g / covered);
        rgba[i + 2] = Math.round(b / covered);
      }
      rgba[i + 3] = Math.round((covered / samples) * 255);
    }
  }
  return rgba;
}

// ── ICO ───────────────────────────────────────────────────────
const images = ICO_SIZES.map((size) => ({ size, png: encodePng(draw(size), size) }));

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

mkdirSync(RESOURCES, { recursive: true });
writeFileSync(join(RESOURCES, 'icon.ico'), Buffer.concat([header, ...entries, ...images.map((i) => i.png)]));

// El PNG grande lo usan la ventana, la bandeja y cualquier empaquetado que no
// entienda ICO. electron-builder exige al menos 256 px.
const png = encodePng(draw(PNG_SIZE), PNG_SIZE);
writeFileSync(join(RESOURCES, 'icon.png'), png);

console.log(
  `icon.ico: ${images.length} tamaños (${ICO_SIZES.join(', ')}), ${(offset / 1024).toFixed(1)} KB\n` +
  `icon.png: ${PNG_SIZE}×${PNG_SIZE}, ${(png.length / 1024).toFixed(1)} KB`,
);
