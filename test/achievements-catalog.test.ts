import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  idFor, normalizeTitle, parseAchievementStats, parseStoreSearch, pickStoreMatch,
} from '../src/main/services/achievements/parse-stats.ts';

/**
 * El catálogo público de logros: lo que hace que Atreus sepa qué logros tiene
 * un juego que compraste en Xbox, Epic o EA.
 *
 * Equivocarse emparejando el juego es peor que no encontrarlo: enseñaría los
 * logros de un DLC, o de otra entrega de la saga, como si fueran los tuyos.
 */

const PAGE = `
<div class="achieveRow ">
  <div class="achieveImgHolder">
    <img src="https://shared.fastly.steamstatic.com/community_assets/images/apps/3017860/9d3c9dede6c965503871536ab0de801621a72dc7.jpg" width="64" height="64" />
  </div>
  <div class="achieveTxtHolder">
    <div class="achieveFill" style="width: 84%"></div>
    <div class="achievePercent">84.6%</div>
    <div class="achieveTxt">
      <h3>Un inicio oscuro</h3>
      <h5></h5>
    </div>
  </div>
</div>
<div class="achieveRow ">
  <div class="achieveImgHolder">
    <img src="https://shared.fastly.steamstatic.com/community_assets/images/apps/3017860/5164fa4ade9b37cd34404844568535c03a68cf42.jpg" width="64" height="64" />
  </div>
  <div class="achieveTxtHolder">
    <div class="achievePercent">76.1%</div>
    <div class="achieveTxt">
      <h3>Mejorada</h3>
      <h5>Consigue tu primera mejora de armas &amp; esencia.</h5>
    </div>
  </div>
</div>`;

describe('parseAchievementStats', () => {
  const items = parseAchievementStats(PAGE);

  test('saca un logro por fila', () => {
    assert.equal(items.length, 2);
  });

  test('lee nombre, descripción, icono y rareza', () => {
    const [first, second] = items;
    assert.equal(first!.displayName, 'Un inicio oscuro');
    assert.equal(first!.globalPercent, 84.6);
    assert.ok(first!.iconUrl?.endsWith('.jpg'));
    assert.equal(second!.description, 'Consigue tu primera mejora de armas & esencia.');
    assert.equal(second!.globalPercent, 76.1);
  });

  test('una descripción vacía es la marca de un logro secreto', () => {
    assert.equal(items[0]!.description, '');
    assert.ok(items[1]!.description.length > 0);
  });

  test('los identificadores son estables y distintos entre sí', () => {
    assert.notEqual(items[0]!.apiName, items[1]!.apiName);
    assert.deepEqual(
      parseAchievementStats(PAGE).map((a) => a.apiName),
      items.map((a) => a.apiName),
    );
  });

  test('una página sin logros no revienta', () => {
    assert.deepEqual(parseAchievementStats('<html><body>nada</body></html>'), []);
  });
});

describe('idFor', () => {
  test('usa el hash del icono, que no cambia al traducir el juego', () => {
    const url = 'https://x/apps/1/9d3c9dede6c965503871536ab0de801621a72dc7.jpg';
    assert.equal(idFor(url, 0), 'steamcat:9d3c9dede6c965503871536ab0de801621a72dc7');
    assert.equal(idFor(url, 7), idFor(url, 0), 'la posición no debería influir si hay icono');
  });

  test('sin icono cae a la posición, con prefijo propio', () => {
    assert.equal(idFor(null, 3), 'steamcat:i3');
  });

  test('nunca se confunde con un apiName real de Steam', () => {
    assert.ok(idFor(null, 0).startsWith('steamcat:'));
  });
});

describe('normalizeTitle', () => {
  test('quita marcas comerciales y puntuación', () => {
    assert.equal(normalizeTitle('Call of Duty®'), 'call of duty');
    assert.equal(normalizeTitle('DOOM: The Dark Ages'), 'doom the dark ages');
  });

  test('quita las coletillas de edición en los dos idiomas', () => {
    assert.equal(normalizeTitle('Hogwarts Legacy - Deluxe Edition'), 'hogwarts legacy');
    assert.equal(normalizeTitle('Halo: Campaign Evolved (Edición Premium)'), 'halo campaign evolved');
  });
});

describe('parseStoreSearch', () => {
  test('extrae los juegos de la respuesta de la tienda', () => {
    const hits = parseStoreSearch({ items: [{ type: 'app', id: 2806050, name: 'Halo: Campaign Evolved' }] });
    assert.deepEqual(hits, [{ appId: '2806050', name: 'Halo: Campaign Evolved' }]);
  });

  test('una respuesta rara devuelve lista vacía en vez de reventar', () => {
    assert.deepEqual(parseStoreSearch(null), []);
    assert.deepEqual(parseStoreSearch({ items: 'no' }), []);
    assert.deepEqual(parseStoreSearch({ items: [{ id: 'x' }] }), []);
  });
});

describe('pickStoreMatch', () => {
  const hits = [
    { appId: '2806050', name: 'Halo: Campaign Evolved' },
    { appId: '4073600', name: 'Foundry Armory Pack - Halo: Campaign Evolved' },
    { appId: '4485640', name: 'Halo: Campaign Evolved: actualización a la Edición Premium' },
  ];

  test('prefiere la coincidencia exacta aunque no sea la primera', () => {
    assert.equal(pickStoreMatch('Halo: Campaign Evolved', hits), '2806050');
    assert.equal(pickStoreMatch('Halo: Campaign Evolved', [...hits].reverse()), '2806050');
  });

  test('tolera la edición del nombre de la biblioteca', () => {
    assert.equal(pickStoreMatch('Halo: Campaign Evolved (Windows)', hits), '2806050');
  });

  test('no se lleva un DLC ni una banda sonora por delante', () => {
    const solo = [
      { appId: '1', name: 'Nombre Raro - Soundtrack' },
      { appId: '2', name: 'Nombre Raro DLC: Lo que sea' },
    ];
    assert.equal(pickStoreMatch('Nombre Raro', solo), null);
  });

  test('no adivina cuando lo que hay es otro juego de la saga', () => {
    const saga = [{ appId: '9', name: 'Yakuza 0 Kiwami Remastered Collection Deluxe' }];
    assert.equal(pickStoreMatch('Yakuza', saga), null);
  });

  test('un nombre que no está en la tienda no devuelve nada', () => {
    assert.equal(pickStoreMatch('Minecraft: Java Edition', hits), null);
    assert.equal(pickStoreMatch('   ', hits), null);
  });
});
