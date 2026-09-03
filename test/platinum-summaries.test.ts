import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  guardarResumenes, leerResumenes, resumenDe, SUMMARY_SCHEMA, VENTANA_DIAS,
} from '../src/main/services/platinum/summaries.ts';

/**
 * Lo que se guarda entre arranques.
 *
 * Estas pruebas existen por un fallo concreto: el archivo de resúmenes vivía
 * en la carpeta que Chromium limpia y desaparecía en cada arranque. Ni el
 * typecheck ni los 153 tests de entonces podían verlo, porque **ninguno tocaba
 * disco**. Aquí se toca, en un directorio temporal, que es donde se puede
 * romper a propósito sin miedo.
 */

const DIA = 86_400;
let dir: string;
let archivo: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atreus-resumenes-'));
  archivo = join(dir, 'platinum.json');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Un resumen mínimo pero completo, para escribirlo y volver a leerlo. */
function resumen(gameId: string, extra: Record<string, unknown> = {}) {
  return {
    gameId,
    tracking: 'steam',
    unlocked: 5,
    total: 10,
    percent: 50,
    complete: false,
    playtimeMinutes: 120,
    difficulty: { score: 6, tier: 'demanding' },
    next: { name: 'Un logro', hidden: false, percent: 40 },
    rarest: { name: 'El raro', percent: 1.2 },
    lastUnlockAt: 1_700_000_000,
    unlockDays: [19_600, 19_601],
    schema: SUMMARY_SCHEMA,
    updatedAt: 1_700_000_100,
    ...extra,
  };
}

/** Un logro conseguido, con la rareza y la fecha que hagan falta. */
function logro(name: string, globalPercent: number | null, unlockTime: number | null) {
  return {
    apiName: name,
    displayName: name,
    description: '',
    iconUrl: null,
    iconGrayUrl: null,
    hidden: false,
    unlocked: true,
    unlockTime,
    protected: false,
    globalPercent,
  };
}

/** Un informe con lo justo para recortar de él un resumen. */
function informe(extra: Record<string, unknown> = {}) {
  return {
    gameId: 'steam:1',
    gameName: 'Juego',
    unlocked: 2,
    total: 5,
    percent: 40,
    complete: false,
    tracking: 'steam',
    playtimeMinutes: 300,
    trackedMinutes: 0,
    firstUnlockAt: null,
    lastUnlockAt: 1_700_000_000,
    estimate: null,
    difficulty: null,
    remaining: [],
    sources: [],
    warning: null,
    updatedAt: 1_700_000_100,
    ...extra,
  };
}

describe('leer y escribir resúmenes', () => {
  test('un archivo que no existe no es noticia', () => {
    const { resumenes, ilegible } = leerResumenes(archivo);
    assert.deepEqual(resumenes, {});
    assert.equal(ilegible, null);
  });

  test('lo guardado se vuelve a leer igual', () => {
    const store = { 'steam:1': resumen('steam:1') };
    guardarResumenes(archivo, store as never);
    const { resumenes } = leerResumenes(archivo);
    assert.deepEqual(resumenes, store);
  });

  test('escribir no deja el temporal por medio', () => {
    guardarResumenes(archivo, { 'steam:1': resumen('steam:1') } as never);
    assert.deepEqual(readdirSync(dir), ['platinum.json']);
  });

  /*
   * Este es el que sujeta el fallo de verdad. Antes, un archivo ilegible se
   * descartaba en silencio **con todos los resúmenes dentro**, y la siguiente
   * escritura lo sobrescribía: no quedaba ni rastro de qué había pasado.
   */
  test('un archivo ilegible se aparta en vez de borrarse, y se dice', () => {
    writeFileSync(archivo, '{ esto no es json', 'utf8');
    const { resumenes, ilegible } = leerResumenes(archivo);

    assert.deepEqual(resumenes, {}, 'se empieza de cero');
    assert.ok(ilegible, 'se avisa de que había algo y no se pudo leer');
    assert.equal(ilegible.apartadoEn, `${archivo}.roto`);
    assert.ok(!existsSync(archivo), 'el original ya no está donde se sobrescribiría');
    assert.equal(readFileSync(`${archivo}.roto`, 'utf8'), '{ esto no es json');
  });

  test('un archivo que no es un objeto se trata como vacío', () => {
    writeFileSync(archivo, '"una cadena suelta"', 'utf8');
    const { resumenes, ilegible } = leerResumenes(archivo);
    assert.deepEqual(resumenes, {});
    assert.equal(ilegible, null);
  });
});

describe('resúmenes de una versión anterior', () => {
  /*
   * El resumen fue creciendo. Lo guardado antes se completa **al leer**: si no,
   * cada sitio que lo mire tendría que acordarse de que hay campos que pueden
   * faltar, y el contrato dice que no faltan.
   */
  test('se rellenan los campos que la versión vieja no guardaba', () => {
    writeFileSync(archivo, JSON.stringify({
      'steam:1': {
        gameId: 'steam:1',
        tracking: 'steam',
        unlocked: 3,
        total: 9,
        percent: 33.3,
        complete: false,
        playtimeMinutes: 60,
        updatedAt: 1_699_000_000,
      },
    }), 'utf8');

    const { resumenes } = leerResumenes(archivo);
    const uno = resumenes['steam:1']!;
    assert.equal(uno.difficulty, null);
    assert.equal(uno.next, null);
    assert.equal(uno.rarest, null);
    assert.equal(uno.lastUnlockAt, null);
    assert.deepEqual(uno.unlockDays, []);
    assert.equal(uno.unlocked, 3, 'lo que sí traía se respeta');
  });

  test('sin versión marcada se considera la primera, para que se recalcule', () => {
    writeFileSync(archivo, JSON.stringify({ 'steam:1': { gameId: 'steam:1', total: 4 } }), 'utf8');
    assert.equal(leerResumenes(archivo).resumenes['steam:1']!.schema, 1);
    assert.ok(1 < SUMMARY_SCHEMA, 'y por tanto queda por debajo de la actual');
  });

  test('lo guardado con la versión actual se queda como está', () => {
    guardarResumenes(archivo, { 'steam:1': resumen('steam:1') } as never);
    assert.equal(leerResumenes(archivo).resumenes['steam:1']!.schema, SUMMARY_SCHEMA);
  });
});

describe('recortar el resumen del informe', () => {
  test('lleva la versión actual, para no recalcularse en balde', () => {
    assert.equal(resumenDe(informe() as never, []).schema, SUMMARY_SCHEMA);
  });

  test('el siguiente logro es el primero de los que faltan', () => {
    const salida = resumenDe(informe({
      remaining: [
        { apiName: 'a', displayName: 'El común', description: '', iconUrl: null, globalPercent: 80, hidden: false },
        { apiName: 'b', displayName: 'El raro', description: '', iconUrl: null, globalPercent: 2, hidden: false },
      ],
    }) as never, []);
    assert.equal(salida.next?.name, 'El común');
    assert.equal(salida.next?.percent, 80);
  });

  /*
   * La vitrina, no la lista de la compra: el más raro **de los conseguidos**.
   * El informe solo guardaba la rareza de los que faltan, y confundirlos haría
   * que el perfil presumiera de un logro que no tienes.
   */
  test('el más raro sale de los conseguidos, no de los que faltan', () => {
    const salida = resumenDe(
      informe({
        remaining: [
          { apiName: 'x', displayName: 'Falta y es rarísimo', description: '', iconUrl: null, globalPercent: 0.1, hidden: false },
        ],
      }) as never,
      [logro('Tengo este', 12, null), logro('Y este', 3.5, null)],
    );
    assert.equal(salida.rarest?.name, 'Y este');
    assert.equal(salida.rarest?.percent, 3.5);
  });

  test('sin rareza publicada no hay vitrina que enseñar', () => {
    const salida = resumenDe(informe() as never, [logro('Sin rareza', null, null)]);
    assert.equal(salida.rarest, null);
  });

  test('los días de actividad van sin repetir y en orden', () => {
    const hoy = Math.floor(Date.now() / 1000 / DIA);
    const salida = resumenDe(informe() as never, [
      logro('a', 50, (hoy - 1) * DIA + 3600),
      logro('b', 50, (hoy - 1) * DIA + 7200),
      logro('c', 50, hoy * DIA + 60),
    ]);
    assert.deepEqual(salida.unlockDays, [hoy - 1, hoy], 'dos días, no tres logros');
  });

  /*
   * Una racha se cuenta hacia atrás desde hoy, así que lo viejo no la cambia y
   * guardarlo engordaría el archivo sin que nadie lo mire.
   */
  test('lo de hace más de la ventana no se guarda', () => {
    const hoy = Math.floor(Date.now() / 1000 / DIA);
    const salida = resumenDe(informe() as never, [
      logro('viejo', 50, (hoy - VENTANA_DIAS - 5) * DIA),
      logro('nuevo', 50, hoy * DIA),
    ]);
    assert.deepEqual(salida.unlockDays, [hoy]);
  });

  test('un logro sin fecha no cuenta como día', () => {
    const salida = resumenDe(informe() as never, [logro('a', 50, null), logro('b', 50, 0)]);
    assert.deepEqual(salida.unlockDays, []);
  });
});
