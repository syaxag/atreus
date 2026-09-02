import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localSteamCover, localXboxCover } from '../src/main/services/catalog/artwork.ts';

/**
 * El motivo de estas pruebas: Steam cambió `appcache/librarycache` de archivos
 * planos a una carpeta por juego, y luego a una subcarpeta con hash por imagen.
 * El código solo miraba la forma intermedia, así que en una instalación actual
 * **ninguna** carátula salía del disco y todas dependían de la CDN.
 */

let root: string;

before(() => { root = mkdtempSync(join(tmpdir(), 'atreus-art-')); });
after(() => { rmSync(root, { recursive: true, force: true }); });

function steamLibrary(name: string): string {
  const path = join(root, name);
  mkdirSync(join(path, 'appcache', 'librarycache'), { recursive: true });
  return path;
}

function put(file: string): void {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, 'jpeg');
}

describe('localSteamCover', () => {
  test('encuentra la imagen en la subcarpeta con hash (disposición actual)', () => {
    const steam = steamLibrary('nueva');
    const expected = join(steam, 'appcache', 'librarycache', '3017860', 'c2f558a1', 'library_header.jpg');
    put(expected);
    assert.equal(localSteamCover(steam, '3017860'), expected);
  });

  test('encuentra la imagen suelta en la carpeta del juego', () => {
    const steam = steamLibrary('intermedia');
    const expected = join(steam, 'appcache', 'librarycache', '2379780', 'library_header.jpg');
    put(expected);
    assert.equal(localSteamCover(steam, '2379780'), expected);
  });

  test('encuentra la disposición plana antigua', () => {
    const steam = steamLibrary('antigua');
    const expected = join(steam, 'appcache', 'librarycache', '588650_header.jpg');
    put(expected);
    assert.equal(localSteamCover(steam, '588650'), expected);
  });

  test('prefiere library_header sobre el póster vertical', () => {
    const steam = steamLibrary('preferencia');
    const dir = join(steam, 'appcache', 'librarycache', '440');
    put(join(dir, 'aaa', 'library_600x900.jpg'));
    const header = join(dir, 'bbb', 'library_header.jpg');
    put(header);
    assert.equal(localSteamCover(steam, '440'), header);
  });

  test('devuelve null cuando el cliente no ha descargado nada', () => {
    const steam = steamLibrary('vacia');
    assert.equal(localSteamCover(steam, '999999'), null);
  });
});

describe('localXboxCover', () => {
  test('saca el logo declarado en MicrosoftGame.config', () => {
    const install = join(root, 'xbox-juego');
    mkdirSync(install, { recursive: true });
    writeFileSync(
      join(install, 'MicrosoftGame.config'),
      '<Game><ShellVisuals DefaultDisplayName="Prueba" Square480x480Logo="Assets\\logo.png" /></Game>',
    );
    put(join(install, 'Assets', 'logo.png'));
    assert.equal(localXboxCover(install), join(install, 'Assets', 'logo.png'));
  });

  test('ignora los atributos de ejemplo que el GDK deja comentados', () => {
    const install = join(root, 'xbox-comentado');
    mkdirSync(install, { recursive: true });
    writeFileSync(
      join(install, 'MicrosoftGame.config'),
      '<Game><!-- <ShellVisuals Square480x480Logo="no-existe.png" /> --></Game>',
    );
    assert.equal(localXboxCover(install), null);
  });

  test('sin config o sin carpeta devuelve null en vez de lanzar', () => {
    assert.equal(localXboxCover(join(root, 'no-existe')), null);
    assert.equal(localXboxCover(null), null);
  });
});
