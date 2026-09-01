import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { splitArgs } from '../src/main/services/catalog/args.ts';

// Las rutas se componen para no depender de escapes en literales.
const SEP = String.fromCharCode(92);
const RUTA = `C:${SEP}Mis Mods${SEP}x.pak`;

describe('splitArgs', () => {
  test('vacío o ausente da lista vacía', () => {
    assert.deepEqual(splitArgs(undefined), []);
    assert.deepEqual(splitArgs(''), []);
    assert.deepEqual(splitArgs('   '), []);
  });

  test('separa por espacios', () => {
    assert.deepEqual(splitArgs('-a -b -c'), ['-a', '-b', '-c']);
  });

  test('respeta las comillas dobles', () => {
    // Este era el fallo: partir por espacios rompe cualquier ruta de Windows.
    assert.deepEqual(splitArgs(`--mod "${RUTA}"`), ['--mod', RUTA]);
  });

  test('respeta las comillas simples', () => {
    assert.deepEqual(splitArgs("--name 'dos palabras'"), ['--name', 'dos palabras']);
  });

  test('admite un argumento que es cadena vacía', () => {
    assert.deepEqual(splitArgs('--flag ""'), ['--flag', '']);
  });

  test('colapsa espacios de sobra', () => {
    assert.deepEqual(splitArgs('  -a    -b  '), ['-a', '-b']);
  });

  test('las comillas pegadas al texto no lo parten', () => {
    assert.deepEqual(splitArgs(`--path="C:${SEP}a b"`), [`--path=C:${SEP}a b`]);
  });

  test('separa también por tabuladores', () => {
    assert.deepEqual(splitArgs('-a\t-b'), ['-a', '-b']);
  });
});
