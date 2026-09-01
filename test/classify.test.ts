import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../src/main/services/mods/classify.ts';

const item = (name: string, description = '', categories: string[] = []) =>
  ({ name, description, categories });

describe('classify', () => {
  test('reconoce los menús de mods reales de Geometry Dash', () => {
    // Casos sacados del catálogo de Geode, con millones de descargas.
    assert.equal(classify(item('QOLMod', 'The Best Free Geode Mod Menu!')), 'cheat');
    assert.equal(classify(item('Eclipse', 'A next-generation mod menu for Geometry Dash.')), 'cheat');
    assert.equal(classify(item('Mega Hack Installer', 'Mega Hack Universal Installer for Geode')), 'cheat');
  });

  test('reconoce las herramientas de depuración de Balatro', () => {
    // Caso real: "Debug Tools" es como media escena llama a un menú de cheats.
    assert.equal(classify(item('DebugPlus', 'Better Debug Tools for Balatro')), 'cheat');
    assert.equal(classify(item('CheatSheet', 'A cheat sheet for the game')), 'cheat');
  });

  test('"debug" a secas no basta', () => {
    // Un mod de desarrollo de temas no es un cheat.
    assert.equal(classify(item('Palette', 'colour searching to help with mod development, debug')), 'mod');
  });

  test('una señal fuerte basta', () => {
    assert.equal(classify(item('X', 'god mode toggle')), 'cheat');
    assert.equal(classify(item('Y', 'incluye un trainer')), 'cheat');
  });

  test('una señal media sola no basta', () => {
    // "bot" aparece en mods normales; hace falta más para acusar.
    assert.equal(classify(item('Chat Bot', 'a friendly bot')), 'mod');
  });

  test('dos señales medias sí', () => {
    assert.equal(classify(item('Z', 'infinite lives and unlock all levels')), 'cheat');
  });

  test('no confunde anti-cheat con cheat', () => {
    assert.equal(classify(item('AntiCheat Bypass Detector', 'anti-cheat compatibility')), 'mod');
  });

  test('las texturas no son cheats aunque digan hack', () => {
    // Prefiero dejar un cheat entre los mods que anunciar texturas como cheat.
    assert.equal(classify(item('Hack Texture Pack', 'texture pack with hacker theme')), 'mod');
    assert.equal(classify(item('Skin cheat', 'skin')), 'mod');
  });

  test('los mods normales se quedan como mods', () => {
    assert.equal(classify(item('Cryptid', 'Añade más de 200 comodines nuevos')), 'mod');
    assert.equal(classify(item('Steamodded', 'A Balatro Modding Framework')), 'mod');
    assert.equal(classify(item('Jukebox', 'Custom music for your levels')), 'mod');
  });

  test('mira también las categorías', () => {
    assert.equal(classify(item('X', 'algo', ['Mod Menu'])), 'cheat');
  });

  test('no distingue mayúsculas ni acentos', () => {
    assert.equal(classify(item('TRAINER Pro', '')), 'cheat');
    assert.equal(classify(item('Inmortalidad', 'invincibilidad y vida infinita')), 'cheat');
  });
});
