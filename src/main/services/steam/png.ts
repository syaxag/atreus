import { deflateSync } from 'node:zlib';

/**
 * Codificador PNG mínimo para RGBA de 8 bits.
 *
 * Steam entrega los iconos de logros como buffers RGBA en crudo
 * (`GetImageRGBA`), no como archivos. Se codifican a PNG para poder cachearlos
 * en disco y servirlos al renderer por el protocolo `atreus://`. Es la única
 * conversión que hace falta, así que no merece una dependencia entera.
 */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let c = -1;
  for (let i = 0; i < buffer.length; i++) {
    c = CRC_TABLE[(c ^ buffer[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);

  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));

  return Buffer.concat([length, body, crc]);
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Codifica un buffer RGBA (`width * height * 4` bytes) a PNG. */
export function encodePng(rgba: Buffer, width: number, height: number): Buffer {
  const expected = width * height * 4;
  if (rgba.length < expected) {
    throw new Error(`RGBA incompleto: ${rgba.length} bytes, se esperaban ${expected}`);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // profundidad de bits
  ihdr.writeUInt8(6, 9); // tipo de color: RGBA
  ihdr.writeUInt8(0, 10); // compresión
  ihdr.writeUInt8(0, 11); // filtro
  ihdr.writeUInt8(0, 12); // entrelazado

  // Cada línea lleva delante su byte de filtro; se usa 0 (sin filtro), que es
  // suficiente para iconos pequeños y mantiene el codificador trivial.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
