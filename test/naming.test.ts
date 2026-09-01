import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fromFileName, humanize } from '../src/main/services/mods/naming.ts';

describe('humanize', () => {
  test('convierte separadores en espacios', () => {
    assert.equal(humanize('Cool_Mod-final'), 'Cool Mod final');
    assert.equal(humanize('a...b'), 'a b');
  });
});

describe('fromFileName', () => {
  test('saca la versión antes de tocar los separadores', () => {
    // Este era el fallo: "v2.1" se normalizaba a "v2 1" y la versión se perdía.
    assert.deepEqual(fromFileName('OtroMod v2.1.zip'), { name: 'OtroMod', version: '2.1' });
  });

  test('funciona con guiones y con tres componentes', () => {
    assert.deepEqual(fromFileName('CoolMod-1.2.0.zip'), { name: 'CoolMod', version: '1.2.0' });
    assert.deepEqual(fromFileName('Cool_Mod_3.4.7.7z'), { name: 'Cool Mod', version: '3.4.7' });
  });

  test('sin versión devuelve solo el nombre', () => {
    assert.deepEqual(fromFileName('MiMod.zip'), { name: 'MiMod', version: null });
  });

  test('un número suelto no cuenta como versión', () => {
    // Hace falta al menos un punto: "Mod 2" es un nombre, no una versión.
    assert.deepEqual(fromFileName('Mod 2.zip'), { name: 'Mod 2', version: null });
  });

  test('quita las extensiones que conoce', () => {
    for (const ext of ['zip', '7z', 'rar']) {
      assert.equal(fromFileName(`X 1.0.${ext}`).name, 'X');
    }
  });

  test('un nombre que es solo la versión se conserva entero', () => {
    // Sin nombre delante, quedarse con "" sería peor que no extraer nada.
    assert.deepEqual(fromFileName('1.2.3.zip'), { name: '1 2 3', version: null });
  });
});
