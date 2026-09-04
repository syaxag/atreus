import { describe, test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GameId } from '../src/shared/types.ts';

/**
 * El portero de las definiciones de juego.
 *
 * La fase 2 cerró el origen —solo HTTPS— y el destino —`mods.root` tiene que
 * caer en una carpeta tuya—. Lo que quedaba sin probar era lo de en medio: qué
 * JSON se acepta como definición.
 *
 * Importa porque estos archivos **no siempre los escribe quien usa Atreus**: se
 * sincronizan de un catálogo remoto y caen en la carpeta del usuario, donde
 * mandan sobre las de fábrica. Deciden el nombre del juego, sus mapas y de
 * dónde salen sus mods.
 *
 * Se prueba dejando archivos donde los deja el catálogo y releyendo, en vez de
 * llamar a la función de validación: así se ejercita también lo que la rodea
 * —qué archivos se miran, qué pasa con un JSON roto, qué capa gana—, que es
 * donde de verdad se puede colar algo.
 */

process.env['ATREUS_TEST_DATA'] = mkdtempSync(join(tmpdir(), 'atreus-defs-'));

const { paths } = await import('../src/main/paths.ts');
const { reloadDefinitions, getDefinition, getDefinitions } =
  await import('../src/main/services/catalog/definitions.ts');

/** Escribe una definición en la capa del usuario, tal cual la dejaría el catálogo. */
function dejar(archivo: string, contenido: unknown): void {
  mkdirSync(paths.userGameDefs, { recursive: true });
  writeFileSync(
    join(paths.userGameDefs, archivo),
    typeof contenido === 'string' ? contenido : JSON.stringify(contenido),
    'utf8',
  );
}

/** Vacía la capa del usuario entre pruebas. */
function limpiar(): void {
  try {
    for (const f of readdirSync(paths.userGameDefs)) {
      rmSync(join(paths.userGameDefs, f), { force: true });
    }
  } catch { /* aún no existe */ }
}

beforeEach(() => { limpiar(); reloadDefinitions(); });
after(() => { limpiar(); });

const ID = 'steam:9999001' as GameId;

describe('lo que se acepta', () => {
  test('una definición mínima: id y nombre', () => {
    dejar('steam.9999001.json', { id: ID, name: 'Juego de prueba' });
    reloadDefinitions();

    const def = getDefinition(ID);
    assert.equal(def?.name, 'Juego de prueba');
    // Queda marcada como del usuario, que es lo que la hace mandar.
    assert.equal(def?.origin, 'user');
  });

  test('los cinco identificadores de plataforma', () => {
    const plataformas = ['steam:1', 'epic:Fortnite', 'gog:2', 'xbox:Algo.Cosa_1', 'ea:3'];
    for (const [i, id] of plataformas.entries()) {
      dejar(`p${i}.json`, { id, name: `Juego ${i}` });
    }
    reloadDefinitions();

    for (const id of plataformas) {
      assert.ok(getDefinition(id as GameId), `${id} debería aceptarse`);
    }
  });

  test('un mapa con URL https se conserva', () => {
    dejar('steam.9999001.json', {
      id: ID,
      name: 'Con mapa',
      guides: { maps: [{ id: 'm1', title: 'Mapa', url: 'https://mapgenie.io/x' }] },
    });
    reloadDefinitions();

    assert.equal(getDefinition(ID)?.guides?.maps?.length, 1);
  });
});

describe('lo que se rechaza', () => {
  test('sin id', () => {
    dejar('malo.json', { name: 'Sin identificador' });
    reloadDefinitions();
    assert.equal([...getDefinitions().values()].some((d) => d.name === 'Sin identificador'), false);
  });

  test('sin nombre, o con un nombre vacío', () => {
    dejar('a.json', { id: ID });
    dejar('b.json', { id: 'steam:9999002', name: '   ' });
    reloadDefinitions();

    assert.equal(getDefinition(ID), null);
    assert.equal(getDefinition('steam:9999002' as GameId), null);
  });

  test('un id con una plataforma inventada', () => {
    dejar('malo.json', { id: 'piratebay:123', name: 'No' });
    reloadDefinitions();
    assert.equal(getDefinition('piratebay:123' as GameId), null);
  });

  test('un id con caracteres que no valen en un nombre de carpeta', () => {
    // El id se convierte en carpeta —`gameDir()` cambia el ':' por un '.'—, así
    // que lo que entre aquí acaba siendo una ruta.
    for (const id of ['steam:../../etc', 'steam:a/b', 'steam:a\\b', 'steam:']) {
      dejar('x.json', { id, name: 'Intento' });
      reloadDefinitions();
      assert.equal(getDefinition(id as GameId), null, `${id} no debería aceptarse`);
      limpiar();
    }
  });

  test('un JSON roto no impide cargar los demás', () => {
    dejar('roto.json', '{ esto no cierra');
    dejar('bueno.json', { id: ID, name: 'El bueno' });
    reloadDefinitions();

    assert.equal(getDefinition(ID)?.name, 'El bueno');
  });

  test('una raíz que no es un objeto', () => {
    dejar('lista.json', [{ id: ID, name: 'En una lista' }]);
    dejar('texto.json', '"solo una cadena"');
    dejar('nulo.json', 'null');
    dejar('bueno.json', { id: ID, name: 'El bueno' });
    reloadDefinitions();

    assert.equal(getDefinition(ID)?.name, 'El bueno');
  });

  test('un mapa sin https se descarta, y el juego sigue sirviendo', () => {
    dejar('steam.9999001.json', {
      id: ID,
      name: 'Con mapa malo',
      guides: {
        maps: [
          { id: 'm1', title: 'Inseguro', url: 'http://mapgenie.io/x' },
          { id: 'm2', title: 'Peor', url: 'file:///C:/Windows/System32' },
          { id: 'm3', title: 'Bueno', url: 'https://mapgenie.io/x' },
        ],
      },
    });
    reloadDefinitions();

    const def = getDefinition(ID);
    // El juego entra igual: un mapa malo no debe costar la ficha entera.
    assert.equal(def?.name, 'Con mapa malo');
    assert.equal(def?.guides?.maps?.length, 1);
    assert.equal(def?.guides?.maps?.[0]?.title, 'Bueno');
  });

  test('un mapa al que le falta algo tampoco cuela', () => {
    dejar('steam.9999001.json', {
      id: ID,
      name: 'Mapas a medias',
      guides: { maps: [{ url: 'https://mapgenie.io/x' }, { id: 'm', title: 'Sin url' }] },
    });
    reloadDefinitions();

    assert.deepEqual(getDefinition(ID)?.guides?.maps, []);
  });
});

describe('qué archivos se miran', () => {
  test('los que no son .json se ignoran', () => {
    dejar('notas.txt', 'lo que sea');
    dejar('steam.9999001.json.bak', JSON.stringify({ id: ID, name: 'Copia vieja' }));
    reloadDefinitions();

    assert.equal(getDefinition(ID), null);
  });

  test('los que empiezan por guión bajo se saltan', () => {
    // Es como se marca el esquema y los ejemplos: `_schema.json` no es una
    // definición y cargarlo llenaría el registro de avisos en cada arranque.
    dejar('_ejemplo.json', { id: ID, name: 'Plantilla' });
    reloadDefinitions();

    assert.equal(getDefinition(ID), null);
  });
});
