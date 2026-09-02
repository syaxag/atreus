import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  epochOf, parseAccount, parseAchievements, parseTitles, pickTitle,
} from '../src/main/services/xbox/parse.ts';

/**
 * Lectura de OpenXBL.
 *
 * Las respuestas de aquí están copiadas del OpenAPI que publica el propio
 * servicio (`api.xbl.io/swagger.json`), no inventadas. La misma API devuelve
 * los logros en dos formas según el endpoint, así que las dos se prueban: si
 * el parser solo entendiera una, un juego entero se quedaría sin logros y sin
 * decir por qué.
 */

const ACCOUNT = {
  content: {
    profileUsers: [{
      id: '2533274792093122',
      settings: [
        { id: 'Gamerscore', value: '45678' },
        { id: 'Gamertag', value: 'ExamplePlayer' },
      ],
    }],
  },
  code: 200,
};

describe('parseAccount', () => {
  test('saca el XUID y el gamertag de la lista de ajustes', () => {
    assert.deepEqual(parseAccount(ACCOUNT), { xuid: '2533274792093122', gamertag: 'ExamplePlayer' });
  });

  test('acepta la respuesta sin el envoltorio content', () => {
    assert.equal(parseAccount(ACCOUNT.content)?.xuid, '2533274792093122');
  });

  test('una respuesta vacía o rara no revienta', () => {
    for (const body of [null, {}, { content: {} }, { content: { profileUsers: [] } }]) {
      assert.equal(parseAccount(body), null);
    }
  });
});

const TITLES = {
  content: {
    xuid: '2533274798129181',
    titles: [
      {
        titleId: '1144039928',
        name: 'Halo: The Master Chief Collection',
        achievement: { currentAchievements: 138, totalAchievements: 0, progressPercentage: 17 },
      },
      { titleId: '1810924247', name: 'Halo Infinite', achievement: { currentAchievements: 12, totalAchievements: 119 } },
      { name: 'Sin id, se descarta' },
    ],
  },
};

describe('parseTitles', () => {
  const list = parseTitles(TITLES);

  test('descarta lo que no tiene id o nombre', () => {
    assert.equal(list.length, 2);
  });

  test('lee el resumen de logros', () => {
    assert.equal(list[1]!.unlocked, 12);
    assert.equal(list[1]!.total, 119);
  });

  test('un total de 0 es "no lo sé", no "no tiene"', () => {
    assert.equal(list[0]!.total, null);
    assert.equal(list[0]!.unlocked, 138);
  });
});

/** Forma corta, la de `/v2/achievements`. */
const SHORT = {
  content: {
    titles: [{
      titleId: '1810924247',
      name: 'Halo Infinite',
      achievements: [
        { id: '1', name: 'Legendary Warrior', description: 'Complete the campaign on Legendary', isUnlocked: true, timeUnlocked: '2024-01-15T18:30:00.0000000Z', gamerscore: 100 },
        { id: '2', name: 'Rookie', description: 'Finish the tutorial', isUnlocked: false },
      ],
    }],
  },
};

/** Forma de Xbox Live, la de `/v3/achievements/player/{xuid}`. */
const LONG = {
  content: {
    achievements: [
      {
        id: '57',
        name: 'Activated',
        progressState: 'Achieved',
        progression: { requirements: [], timeUnlocked: '2016-03-14T21:37:25.8148693Z' },
        mediaAssets: [{ name: 'icono', type: 'Icon', url: 'https://images-eds-ssl.xboxlive.com/image?url=abc' }],
        isSecret: true,
        description: 'Get to Manhattan.',
        lockedDescription: 'Secreto.',
        rarity: { currentCategory: 'Rare', currentPercentage: 4.2 },
      },
      {
        id: '58',
        name: 'Todavía no',
        progressState: 'NotStarted',
        progression: { requirements: [] },
        mediaAssets: [],
        isSecret: true,
        description: 'Lo que sea.',
        lockedDescription: 'Sigue jugando.',
      },
    ],
  },
};

describe('parseAchievements', () => {
  test('entiende la forma corta, con los logros dentro de titles', () => {
    const items = parseAchievements(SHORT);
    assert.equal(items.length, 2);
    assert.equal(items[0]!.unlocked, true);
    assert.equal(items[1]!.unlocked, false);
    assert.equal(items[0]!.unlockTime, Math.floor(Date.parse('2024-01-15T18:30:00Z') / 1000));
  });

  test('entiende la forma de Xbox Live, con progressState', () => {
    const items = parseAchievements(LONG);
    assert.equal(items.length, 2);
    assert.equal(items[0]!.unlocked, true);
    assert.equal(items[1]!.unlocked, false);
    assert.equal(items[1]!.unlockTime, null, 'un logro bloqueado no puede tener fecha');
  });

  test('coge el icono y la rareza cuando vienen', () => {
    const [first, second] = parseAchievements(LONG);
    assert.ok(first!.iconUrl?.startsWith('https://images-eds-ssl.xboxlive.com/'));
    assert.equal(first!.rarityPercent, 4.2);
    assert.equal(second!.iconUrl, null);
    assert.equal(second!.rarityPercent, null);
  });

  test('un secreto sin sacar enseña la descripción censurada, y la buena al sacarlo', () => {
    const [conseguido, pendiente] = parseAchievements(LONG);
    assert.equal(conseguido!.description, 'Get to Manhattan.');
    assert.equal(pendiente!.description, 'Sigue jugando.');
    assert.equal(pendiente!.hidden, true);
  });

  test('una respuesta vacía devuelve lista vacía', () => {
    for (const body of [null, {}, { content: {} }, { content: { achievements: [] } }]) {
      assert.deepEqual(parseAchievements(body), []);
    }
  });
});

describe('epochOf', () => {
  test('convierte la fecha de Xbox a segundos', () => {
    assert.equal(epochOf('2016-03-14T21:37:25.8148693Z'), Math.floor(Date.parse('2016-03-14T21:37:25Z') / 1000));
  });

  test('lo que no es una fecha da null', () => {
    for (const value of [null, undefined, '', 'ayer', 0, {}]) assert.equal(epochOf(value), null);
  });
});

describe('pickTitle', () => {
  const titles = parseTitles(TITLES);

  test('empareja por nombre exacto', () => {
    assert.equal(pickTitle('Halo Infinite', titles), '1810924247');
    assert.equal(pickTitle('Halo: The Master Chief Collection', titles), '1144039928');
  });

  test('tolera las coletillas de la tienda', () => {
    assert.equal(pickTitle('Halo Infinite (Windows)', titles), '1810924247');
  });

  test('un nombre corto no se lleva el título largo', () => {
    assert.equal(pickTitle('Halo', titles), null);
  });

  test('un juego que no está en el historial no se empareja', () => {
    assert.equal(pickTitle('Minecraft: Java Edition', titles), null);
    assert.equal(pickTitle('  ', titles), null);
  });
});
