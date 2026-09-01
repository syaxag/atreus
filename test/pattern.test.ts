import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { compilePattern, findInBuffer } from '../src/main/services/trainer/pattern.ts';

describe('compilePattern', () => {
  test('lee bytes y comodines', () => {
    const p = compilePattern('48 8B ?? 00');
    assert.deepEqual([...p.bytes], [0x48, 0x8b, 0x00, 0x00]);
    assert.deepEqual(p.mask, [true, true, false, true]);
  });

  test('acepta las tres formas de comodín', () => {
    for (const token of ['??', '?', 'xx']) {
      assert.equal(compilePattern(`48 ${token} 8B`).mask[1], false);
    }
  });

  test('no distingue mayúsculas', () => {
    assert.deepEqual([...compilePattern('4a bF').bytes], [0x4a, 0xbf]);
  });

  test('rechaza un patrón vacío', () => {
    assert.throws(() => compilePattern('   '), /vacío/);
  });

  test('rechaza tokens que no son hex', () => {
    assert.throws(() => compilePattern('48 ZZ'), /inválido/);
    assert.throws(() => compilePattern('48 8'), /inválido/);
  });

  test('rechaza un patrón que es todo comodines', () => {
    // Coincidiría en cualquier sitio: no identifica nada.
    assert.throws(() => compilePattern('?? ?? ??'), /comodines/);
  });
});

describe('findInBuffer', () => {
  const hay = Buffer.from([0x00, 0x11, 0x48, 0x8b, 0x9d, 0x00, 0xff, 0x48, 0x8b, 0x42, 0x00]);

  test('encuentra respetando el comodín', () => {
    assert.equal(findInBuffer(hay, compilePattern('48 8B ?? 00')), 2);
  });

  test('devuelve -1 cuando no está', () => {
    assert.equal(findInBuffer(Buffer.alloc(32), compilePattern('48 8B ?? 00')), -1);
  });

  test('continúa desde un offset, para enumerar coincidencias', () => {
    const p = compilePattern('48 8B ?? 00');
    const first = findInBuffer(hay, p);
    const second = findInBuffer(hay, p, first + 1);
    assert.equal(first, 2);
    assert.equal(second, 7);
    assert.equal(findInBuffer(hay, p, second + 1), -1);
  });

  test('no se pasa del final del buffer', () => {
    // El patrón coincide salvo por el último byte, que ya no existe.
    const corto = Buffer.from([0x48, 0x8b, 0x9d]);
    assert.equal(findInBuffer(corto, compilePattern('48 8B ?? 00')), -1);
  });

  test('encuentra en la primera posición', () => {
    assert.equal(findInBuffer(Buffer.from([0xaa, 0xbb]), compilePattern('AA BB')), 0);
  });

  test('un patrón que empieza por comodín también ancla bien', () => {
    // El ancla es el primer byte fijo, no la posición 0.
    assert.equal(findInBuffer(hay, compilePattern('?? 8B 9D')), 2);
  });
});
