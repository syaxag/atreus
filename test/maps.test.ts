import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { matchSlug, normalizeName, parseDirectory } from '../src/main/services/maps/match.ts';

/**
 * El emparejado entre la biblioteca y el directorio de mapas.
 *
 * Es lo que hace que un mapa aparezca solo, sin que nadie añada el juego a
 * mano. Equivocarse aquí es peor que no encontrar nada: enseñaría el mapa de
 * otro juego como si fuera el bueno.
 */

const HOME = `
<a href="https://mapgenie.io/cyberpunk-2077"><img alt="Cyberpunk 2077 Map Image" /></a>
<a href="https://mapgenie.io/baldurs-gate-3"><img alt="Baldur&#039;s Gate 3 Map Image" /></a>
<a href="https://mapgenie.io/witcher-3"><img alt="The Witcher 3 Map Image" /></a>
<a href="https://mapgenie.io/elden-ring"><img alt="Elden Ring Map Image" /></a>
<a href="https://mapgenie.io/yakuza-0"><img alt="Yakuza 0 Map Image" /></a>
<a href="https://mapgenie.io/about">sin imagen</a>
`;

describe('parseDirectory', () => {
  const games = parseDirectory(HOME);

  test('empareja cada slug con el nombre de su tarjeta', () => {
    assert.equal(games['cyberpunk-2077'], 'Cyberpunk 2077');
    assert.equal(games['witcher-3'], 'The Witcher 3');
    assert.equal(games['elden-ring'], 'Elden Ring');
  });

  test('resuelve las entidades HTML del nombre', () => {
    assert.equal(games['baldurs-gate-3'], "Baldur's Gate 3");
  });

  test('los enlaces que no son tarjetas de juego no entran', () => {
    assert.equal(games['about'], undefined);
  });

  test('una portada que cambia de forma no devuelve basura', () => {
    assert.deepEqual(parseDirectory('<html><body></body></html>'), {});
  });
});

describe('normalizeName', () => {
  test('quita acentos, símbolos y marcas comerciales', () => {
    assert.equal(normalizeName('Assassin’s Creed™: Valhalla'), 'assassins creed valhalla');
  });

  test('quita las coletillas de edición, que no cambian el mapa', () => {
    assert.equal(normalizeName('The Witcher 3 - Game of the Year Edition'), 'the witcher 3');
    assert.equal(normalizeName('Skyrim Special Edition'), 'skyrim special');
  });
});

describe('matchSlug', () => {
  const games = parseDirectory(HOME);

  test('encuentra la coincidencia exacta por nombre', () => {
    assert.equal(matchSlug('Cyberpunk 2077', games), 'cyberpunk-2077');
    assert.equal(matchSlug('The Witcher 3', games), 'witcher-3');
  });

  test('acepta el nombre con adornos de la tienda', () => {
    assert.equal(matchSlug('ELDEN RING™', games), 'elden-ring');
    assert.equal(matchSlug("Baldur's Gate 3", games), 'baldurs-gate-3');
  });

  test('encuentra por slug cuando el nombre publicado difiere', () => {
    assert.equal(matchSlug('Witcher 3', games), 'witcher-3');
  });

  test('acepta el subtítulo de la tienda sobre un nombre más corto', () => {
    assert.equal(matchSlug('Cyberpunk 2077: Phantom Liberty', games), 'cyberpunk-2077');
  });

  test('un juego que no está en el directorio no se empareja con otro', () => {
    assert.equal(matchSlug('Hollow Knight', games), null);
    assert.equal(matchSlug('Halo Infinite', games), null);
  });

  test('no adivina hacia el lado peligroso: un nombre corto no se lleva un mapa más específico', () => {
    // "Yakuza" a secas no debe abrir el mapa de "Yakuza 0", que es otro juego.
    assert.equal(matchSlug('Yakuza', games), null);
    assert.equal(matchSlug('Elden', games), null);
  });

  test('un nombre vacío no devuelve el primer mapa que pille', () => {
    assert.equal(matchSlug('   ', games), null);
  });
});
