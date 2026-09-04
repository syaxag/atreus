import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, symlinkSync, readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sanearArbol } from '../src/main/services/mods/archive.ts';

/**
 * El repaso de lo que sale de un `.7z`.
 *
 * El camino del `.zip` ya tenía su comprobación contra el zip slip. El del
 * `.7z` delegaba todo en `7za x`, así que lo que hubiera dentro entraba tal
 * cual: aquí se comprueba lo que se descarta después.
 */

const temporales: string[] = [];

function carpeta(): string {
  const dir = mkdtempSync(join(tmpdir(), 'atreus-extraccion-'));
  temporales.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temporales.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('sanear lo extraído', () => {
  test('un árbol normal se queda entero', () => {
    const destino = carpeta();
    mkdirSync(join(destino, 'scripts'), { recursive: true });
    writeFileSync(join(destino, 'mod.dll'), 'binario');
    writeFileSync(join(destino, 'scripts', 'main.lua'), 'print()');

    assert.equal(sanearArbol(destino), 0);
    assert.ok(existsSync(join(destino, 'mod.dll')));
    assert.ok(existsSync(join(destino, 'scripts', 'main.lua')));
    // Y sin tocar el contenido.
    assert.equal(readFileSync(join(destino, 'scripts', 'main.lua'), 'utf8'), 'print()');
  });

  test('una carpeta vacía no molesta', () => {
    const destino = carpeta();
    mkdirSync(join(destino, 'vacia'));
    assert.equal(sanearArbol(destino), 0);
    assert.ok(existsSync(join(destino, 'vacia')));
  });

  test('un destino que no existe no revienta', () => {
    assert.equal(sanearArbol(join(tmpdir(), 'atreus-no-existe-' + Date.now())), 0);
  });

  test('un enlace simbólico a fuera se borra', (t) => {
    const destino = carpeta();
    const fuera = carpeta();
    writeFileSync(join(fuera, 'secreto.txt'), 'no me lleves');
    writeFileSync(join(destino, 'mod.dll'), 'binario');

    try {
      symlinkSync(join(fuera, 'secreto.txt'), join(destino, 'atajo.txt'), 'file');
    } catch {
      // Windows sin modo desarrollador ni permisos de administrador no deja
      // crear enlaces. El código sí los borra; aquí no se puede montar el caso.
      t.skip('este sistema no deja crear enlaces simbólicos');
      return;
    }

    assert.equal(sanearArbol(destino), 1);
    assert.equal(existsSync(join(destino, 'atajo.txt')), false);
    // El archivo apuntado no se toca: se borra el enlace, no el destino.
    assert.ok(existsSync(join(fuera, 'secreto.txt')));
    // Y lo legítimo sigue ahí.
    assert.ok(existsSync(join(destino, 'mod.dll')));
  });

  test('un enlace a una carpeta de fuera también se borra', (t) => {
    const destino = carpeta();
    const fuera = carpeta();
    mkdirSync(join(fuera, 'sistema'), { recursive: true });

    try {
      symlinkSync(join(fuera, 'sistema'), join(destino, 'enlace'), 'dir');
    } catch {
      t.skip('este sistema no deja crear enlaces simbólicos');
      return;
    }

    assert.equal(sanearArbol(destino), 1);
    assert.equal(existsSync(join(destino, 'enlace')), false);
    assert.ok(existsSync(join(fuera, 'sistema')));
  });

  test('los enlaces anidados también se ven', (t) => {
    const destino = carpeta();
    const fuera = carpeta();
    writeFileSync(join(fuera, 'x.txt'), 'x');
    mkdirSync(join(destino, 'a', 'b'), { recursive: true });
    writeFileSync(join(destino, 'a', 'b', 'bueno.txt'), 'ok');

    try {
      symlinkSync(join(fuera, 'x.txt'), join(destino, 'a', 'b', 'malo.txt'), 'file');
    } catch {
      t.skip('este sistema no deja crear enlaces simbólicos');
      return;
    }

    assert.equal(sanearArbol(destino), 1);
    assert.equal(existsSync(join(destino, 'a', 'b', 'malo.txt')), false);
    assert.ok(existsSync(join(destino, 'a', 'b', 'bueno.txt')));
  });
});
