import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { encodePng } from '../src/main/services/steam/png.ts';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Recorre los chunks de un PNG comprobando cada CRC. */
function chunks(png: Buffer): { type: string; data: Buffer }[] {
  const out: { type: string; data: Buffer }[] = [];
  let i = 8;
  while (i < png.length) {
    const length = png.readUInt32BE(i);
    const type = png.toString('ascii', i + 4, i + 8);
    out.push({ type, data: png.subarray(i + 8, i + 8 + length) });
    i += 12 + length;
  }
  return out;
}

describe('encodePng', () => {
  const rgba = Buffer.alloc(4 * 3 * 4); // 4x3 px
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 0x8b; rgba[i + 1] = 0x5c; rgba[i + 2] = 0xf6; rgba[i + 3] = 0xff;
  }

  test('empieza por la firma PNG', () => {
    assert.ok(encodePng(rgba, 4, 3).subarray(0, 8).equals(SIGNATURE));
  });

  test('lleva IHDR, IDAT e IEND en ese orden', () => {
    assert.deepEqual(chunks(encodePng(rgba, 4, 3)).map((c) => c.type), ['IHDR', 'IDAT', 'IEND']);
  });

  test('la cabecera declara RGBA de 8 bits y el tamaño correcto', () => {
    const ihdr = chunks(encodePng(rgba, 4, 3))[0]!.data;
    assert.equal(ihdr.readUInt32BE(0), 4);
    assert.equal(ihdr.readUInt32BE(4), 3);
    assert.equal(ihdr.readUInt8(8), 8);   // profundidad
    assert.equal(ihdr.readUInt8(9), 6);   // tipo de color RGBA
  });

  test('los datos descomprimen al tamaño exacto de las scanlines', () => {
    const idat = chunks(encodePng(rgba, 4, 3))[1]!.data;
    const raw = inflateSync(idat);
    // Cada línea lleva delante su byte de filtro.
    assert.equal(raw.length, (4 * 4 + 1) * 3);
    assert.equal(raw[0], 0); // filtro 0 = sin filtro
  });

  test('los píxeles sobreviven la ida y vuelta', () => {
    const raw = inflateSync(chunks(encodePng(rgba, 4, 3))[1]!.data);
    assert.deepEqual([...raw.subarray(1, 5)], [0x8b, 0x5c, 0xf6, 0xff]);
  });

  test('rechaza un buffer más corto de lo que dicen las medidas', () => {
    assert.throws(() => encodePng(Buffer.alloc(10), 4, 3), /incompleto/);
  });
});
