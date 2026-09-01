import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  TYPE_SIZE, parseHexBytes, encodeValue, decodeValue,
} from '../src/main/services/trainer/codec.ts';

describe('parseHexBytes', () => {
  test('acepta espacios y guiones', () => {
    assert.deepEqual([...parseHexBytes('90 90 EB')], [0x90, 0x90, 0xeb]);
    assert.deepEqual([...parseHexBytes('90-90-EB')], [0x90, 0x90, 0xeb]);
    assert.deepEqual([...parseHexBytes('9090EB')], [0x90, 0x90, 0xeb]);
  });

  test('rechaza una cantidad impar de dígitos', () => {
    assert.throws(() => parseHexBytes('90 9'), /impares/);
  });

  test('rechaza caracteres que no son hex', () => {
    assert.throws(() => parseHexBytes('90 ZZ'), /inválidos/);
  });
});

describe('encodeValue / decodeValue', () => {
  const casos: [Exclude<keyof typeof TYPE_SIZE, never>, number][] = [
    ['i8', -5], ['u8', 200],
    ['i16', -3000], ['u16', 60000],
    ['i32', -2_000_000], ['u32', 4_000_000_000],
    ['i64', -9_007_199_254], ['u64', 9_007_199_254],
    ['f32', 1.5], ['f64', 3.14159265358979],
  ];

  for (const [type, value] of casos) {
    test(`${type} sobrevive la ida y vuelta`, () => {
      const buffer = encodeValue(type, value);
      assert.equal(buffer.length, TYPE_SIZE[type]);
      assert.equal(decodeValue(buffer, type), value);
    });
  }

  test('los enteros se saturan al rango en vez de lanzar', () => {
    // Un valor imposible en un JSON de cheat no debe tumbar la sesión.
    assert.equal(decodeValue(encodeValue('u8', 9999), 'u8'), 255);
    assert.equal(decodeValue(encodeValue('i8', -9999), 'i8'), -128);
    assert.equal(decodeValue(encodeValue('u32', -1), 'u32'), 0);
  });

  test('los decimales NO se truncan', () => {
    // Truncar aquí convertiría un multiplicador de 1.5 en 1.
    assert.equal(decodeValue(encodeValue('f32', 1.5), 'f32'), 1.5);
    assert.equal(decodeValue(encodeValue('f64', 0.25), 'f64'), 0.25);
  });

  test('los enteros sí truncan la parte decimal', () => {
    assert.equal(decodeValue(encodeValue('i32', 7.9), 'i32'), 7);
  });

  test('escribe en little endian, como x86', () => {
    assert.deepEqual([...encodeValue('i32', 1)], [1, 0, 0, 0]);
  });

  test('rechaza lo que no es número', () => {
    assert.throws(() => encodeValue('i32', 'hola'), /no numérico/);
  });

  test('el tipo bytes pasa por parseHexBytes', () => {
    assert.deepEqual([...encodeValue('bytes', '90 90')], [0x90, 0x90]);
  });
});
