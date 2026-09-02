import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hostCandidates } from '../src/main/services/guides/wiki-host.ts';

/**
 * Adivinar el host de la wiki de un juego.
 *
 * No hay buscador público que se pueda consultar —el de Fandom está detrás de
 * Cloudflare—, así que el host se deduce del nombre. Aquí se comprueba que se
 * generen las variantes que de verdad existen y ninguna absurda.
 */

describe('hostCandidates', () => {
  test('prueba wiki.gg antes que Fandom', () => {
    const out = hostCandidates('Terraria');
    assert.deepEqual(out, ['terraria.wiki.gg', 'terraria.fandom.com']);
  });

  test('recorta el subtítulo, que la wiki no suele llevar', () => {
    const out = hostCandidates('DOOM: The Dark Ages');
    assert.ok(out.includes('doomthedarkages.wiki.gg'));
    assert.ok(out.includes('doom.fandom.com'), `faltaba doom.fandom.com en ${out.join(', ')}`);
  });

  test('recorta el número de entrega, que comparte wiki con la saga', () => {
    const out = hostCandidates('Resident Evil 4');
    assert.ok(out.includes('residentevil4.wiki.gg'));
    assert.ok(out.includes('residentevil.fandom.com'), `faltaba residentevil.fandom.com en ${out.join(', ')}`);
    // El específico va antes que el genérico: si existe, gana.
    assert.ok(out.indexOf('residentevil4.wiki.gg') < out.indexOf('residentevil.fandom.com'));
  });

  test('no genera candidatos demasiado cortos, que acertarían por casualidad', () => {
    assert.deepEqual(hostCandidates('V'), []);
    assert.ok(hostCandidates('Halo 3').includes('halo.wiki.gg'));
  });

  test('quita acentos y símbolos', () => {
    assert.ok(hostCandidates('Ōkami HD').includes('okamihd.wiki.gg'));
  });

  test('no repite un candidato cuando las variantes coinciden', () => {
    const out = hostCandidates('Balatro');
    assert.equal(new Set(out).size, out.length);
  });
});
