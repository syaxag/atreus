import { describe, test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * La sincronización del catálogo, de punta a punta y sin salir a la red.
 *
 * Sale de dos fallos que solo se vieron arrancando la aplicación de verdad con
 * la carpeta de definiciones vacía, y ningún test de los que había podía ver:
 *
 *  1. Lo que llegaba por el catálogo se guardaba con el nombre del archivo
 *     temporal por el que había pasado —`atreus-definition-<azar>-steam.1.json`—.
 *     Como el azar cambia en cada sincronización, **cada seis horas se creaba
 *     una copia nueva de cada ficha** en vez de actualizar la que ya estaba.
 *     Al cabo de un día, doce copias de cada juego en la carpeta del usuario.
 *
 *  2. El SHA-256 del manifiesto no cuadraba, porque se sacaba del archivo del
 *     disco (CRLF en Windows) y GitHub sirve lo que guarda git (LF).
 *
 * Lo que se fija aquí es la propiedad que faltaba: **sincronizar dos veces deja
 * la carpeta igual que sincronizar una**.
 */

process.env['ATREUS_TEST_DATA'] = mkdtempSync(join(tmpdir(), 'atreus-sync-'));

const electron = await import('./dobles/electron.ts');
const { paths } = await import('../src/main/paths.ts');
const { sync } = await import('../src/main/services/catalog/sync.ts');

const FICHA = { id: 'steam:999001', name: 'Juego del catálogo' };
const OTRA = { id: 'steam:999002', name: 'Otro juego' };

const cuerpo = (def: unknown) => JSON.stringify(def, null, 2);
const hash = (texto: string) => createHash('sha256').update(Buffer.from(texto, 'utf8')).digest('hex');

const BASE = 'https://ejemplo.test/atreus';

function manifiesto(fichas: { archivo: string; def: unknown }[]) {
  return {
    schema: 'atreus.catalog/v1',
    version: '2026.01.01',
    publishedAt: 1_800_000_000,
    definitions: fichas.map(({ archivo, def }) => ({
      file: archivo,
      url: `${BASE}/games/${archivo}`,
      sha256: hash(cuerpo(def)),
    })),
  };
}

/**
 * Una red de mentira que sirve el manifiesto y sus fichas.
 *
 * El doble de Electron apaga la red a propósito; aquí se enciende solo para
 * estas direcciones, así que un test que pida cualquier otra cosa sigue
 * fallando diciendo qué intentó.
 */
function servir(fichas: { archivo: string; def: unknown }[]): void {
  const rutas = new Map<string, string>([
    [`${BASE}/catalog.json`, JSON.stringify(manifiesto(fichas))],
    ...fichas.map(({ archivo, def }) => [`${BASE}/games/${archivo}`, cuerpo(def)] as const),
  ]);

  (electron.net as { fetch: unknown }).fetch = async (url: string | URL) => {
    const texto = rutas.get(String(url));
    if (texto === undefined) throw new Error(`nadie sirve ${String(url)}`);
    return new Response(texto, { status: 200 });
  };
}

/** Los nombres de las definiciones que hay en la capa del usuario. */
const enCarpeta = () => {
  try {
    return readdirSync(paths.userGameDefs).sort();
  } catch {
    return [];
  }
};

beforeEach(() => {
  rmSync(paths.userGameDefs, { recursive: true, force: true });
  mkdirSync(paths.userGameDefs, { recursive: true });
});

after(() => { rmSync(paths.userGameDefs, { recursive: true, force: true }); });

describe('sincronizar desde un manifiesto', () => {
  test('la ficha se guarda con su nombre, no con el de un temporal', async () => {
    servir([{ archivo: 'steam.999001.json', def: FICHA }]);

    const res = await sync(`${BASE}/catalog.json`);

    assert.equal(res.updated, 1);
    // Este era el fallo: salía `atreus-definition-mtn3g4g1-steam.999001.json`.
    assert.deepEqual(enCarpeta(), ['steam.999001.json']);
  });

  test('el contenido que se guarda es el que se sirvió', async () => {
    servir([{ archivo: 'steam.999001.json', def: FICHA }]);
    await sync(`${BASE}/catalog.json`);

    const guardado = JSON.parse(
      readFileSync(join(paths.userGameDefs, 'steam.999001.json'), 'utf8'),
    );
    assert.deepEqual(guardado, FICHA);
  });

  test('sincronizar dos veces deja la carpeta igual que una', async () => {
    // La propiedad que faltaba. Sin ella, cada pasada dejaba una copia más y en
    // un día la carpeta del usuario tenía doce de cada juego.
    servir([{ archivo: 'steam.999001.json', def: FICHA }, { archivo: 'steam.999002.json', def: OTRA }]);

    await sync(`${BASE}/catalog.json`);
    const primera = enCarpeta();

    const segunda = await sync(`${BASE}/catalog.json`);

    assert.deepEqual(enCarpeta(), primera);
    assert.equal(primera.length, 2);
    // Y la segunda no escribe nada, porque nada cambió.
    assert.equal(segunda.updated, 0);
  });

  test('una ficha que cambia se actualiza en su sitio, sin duplicarla', async () => {
    servir([{ archivo: 'steam.999001.json', def: FICHA }]);
    await sync(`${BASE}/catalog.json`);

    const corregida = { ...FICHA, name: 'Juego del catálogo, corregido' };
    servir([{ archivo: 'steam.999001.json', def: corregida }]);
    const res = await sync(`${BASE}/catalog.json`);

    assert.equal(res.updated, 1);
    assert.deepEqual(enCarpeta(), ['steam.999001.json']);
    const guardado = JSON.parse(
      readFileSync(join(paths.userGameDefs, 'steam.999001.json'), 'utf8'),
    );
    assert.equal(guardado.name, 'Juego del catálogo, corregido');
  });
});

describe('lo que el catálogo no consigue colar', () => {
  test('una ficha cuyo hash no cuadra se rechaza', async () => {
    servir([{ archivo: 'steam.999001.json', def: FICHA }]);
    // Se cambia lo que sirve el servidor sin tocar el manifiesto: es
    // exactamente lo que pasaría si alguien la cambiara por el camino.
    const bueno = manifiesto([{ archivo: 'steam.999001.json', def: FICHA }]);
    (electron.net as { fetch: unknown }).fetch = async (url: string | URL) => {
      const texto = String(url).endsWith('catalog.json')
        ? JSON.stringify(bueno)
        : cuerpo({ ...FICHA, name: 'CAMBIADA POR EL CAMINO' });
      return new Response(texto, { status: 200 });
    };

    await assert.rejects(() => sync(`${BASE}/catalog.json`), /SHA-256/);
    assert.deepEqual(enCarpeta(), []);
  });

  test('una ficha por HTTP plano tumba la sincronización', async () => {
    const inseguro = {
      schema: 'atreus.catalog/v1',
      version: '2026.01.01',
      publishedAt: 1_800_000_000,
      definitions: [{
        file: 'steam.999001.json',
        url: 'http://ejemplo.test/atreus/games/steam.999001.json',
        sha256: hash(cuerpo(FICHA)),
      }],
    };
    (electron.net as { fetch: unknown }).fetch = async () =>
      new Response(JSON.stringify(inseguro), { status: 200 });

    await assert.rejects(() => sync(`${BASE}/catalog.json`), /HTTPS/);
    assert.deepEqual(enCarpeta(), []);
  });

  test('un nombre que empieza por guión bajo no se adopta', async () => {
    // `_schema.json` y los ejemplos no son definiciones; adoptarlos llenaría el
    // arranque de avisos.
    servir([{ archivo: '_plantilla.json', def: FICHA }]);

    const res = await sync(`${BASE}/catalog.json`);

    assert.equal(res.updated, 0);
    assert.deepEqual(enCarpeta(), []);
  });
});
