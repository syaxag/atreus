import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseBinaryKv, asString, asNumber, asObject } from '../src/main/services/steam/binkv.ts';

/** Construye un nodo del KeyValues binario de Valve. */
function node(type: number, key: string, payload: Buffer = Buffer.alloc(0)): Buffer {
  return Buffer.concat([
    Buffer.from([type]),
    Buffer.from(key, 'utf8'),
    Buffer.from([0]),
    payload,
  ]);
}

const cstr = (v: string) => Buffer.concat([Buffer.from(v, 'utf8'), Buffer.from([0])]);
const int32 = (v: number) => { const b = Buffer.alloc(4); b.writeInt32LE(v); return b; };
const float32 = (v: number) => { const b = Buffer.alloc(4); b.writeFloatLE(v); return b; };
const END = Buffer.from([0x08]);

describe('parseBinaryKv', () => {
  test('lee cadenas, enteros y decimales', () => {
    const buf = Buffer.concat([
      node(0x00, 'raiz'),
      node(0x01, 'texto', cstr('hola')),
      node(0x02, 'entero', int32(-7)),
      node(0x03, 'decimal', float32(1.5)),
      END,
    ]);
    const root = parseBinaryKv(buf);
    const r = asObject(root['raiz'])!;
    assert.equal(r['texto'], 'hola');
    assert.equal(r['entero'], -7);
    assert.equal(r['decimal'], 1.5);
  });

  test('lee objetos anidados', () => {
    const buf = Buffer.concat([
      node(0x00, 'a'),
      node(0x00, 'b'),
      node(0x01, 'c', cstr('dentro')),
      END,
      END,
    ]);
    assert.equal(asString(asObject(asObject(parseBinaryKv(buf)['a'])?.['b'])?.['c']), 'dentro');
  });

  test('lee enteros de 64 bits', () => {
    const big = Buffer.alloc(8);
    big.writeBigUInt64LE(1234567890123n);
    const root = parseBinaryKv(Buffer.concat([node(0x00, 'r'), node(0x07, 'v', big), END]));
    assert.equal(asNumber(asObject(root['r'])?.['v']), 1234567890123);
  });

  test('consume las cadenas anchas sin desalinearse', () => {
    // Si el tipo 0x05 no se consumiera bien, todo lo que viene después se
    // leería corrido y el archivo entero saldría mal.
    const wide = Buffer.concat([Buffer.from('ab', 'utf16le'), Buffer.from([0, 0])]);
    const root = parseBinaryKv(Buffer.concat([
      node(0x00, 'r'),
      node(0x05, 'w', wide),
      node(0x01, 'despues', cstr('ok')),
      END,
    ]));
    const r = asObject(root['r'])!;
    assert.equal(r['w'], 'ab');
    assert.equal(r['despues'], 'ok');
  });

  test('rechaza un tipo desconocido en vez de leer basura', () => {
    assert.throws(
      () => parseBinaryKv(Buffer.concat([node(0x00, 'r'), node(0x7f, 'x'), END])),
      /tipo desconocido/,
    );
  });
});

describe('helpers de acceso', () => {
  test('asString acepta números y devuelve texto', () => {
    assert.equal(asString(42), '42');
    assert.equal(asString(undefined), undefined);
    assert.equal(asString({}), undefined);
  });

  test('asNumber convierte lo convertible', () => {
    assert.equal(asNumber('7'), 7);
    assert.equal(asNumber(7n), 7);
    assert.equal(asNumber('hola'), null);
    assert.equal(asNumber({}), null);
  });

  test('asObject solo pasa objetos', () => {
    assert.deepEqual(asObject({ a: '1' }), { a: '1' });
    assert.equal(asObject('x'), undefined);
  });
});
