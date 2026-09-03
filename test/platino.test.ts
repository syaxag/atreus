import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { configurarLocale } from '../src/renderer/lib/format.ts';
import {
  DIFICULTAD, explicarDificultad, explicarEstimacion, explicarNota, nombreFuente,
} from '../src/renderer/lib/platino.ts';
import { traducir } from '../src/shared/i18n/index.ts';
import type {
  EstimateReason, Notice, PlatinumDifficulty, PlatinumEstimate,
} from '../src/shared/types.ts';

/**
 * La prosa del informe, que antes venía hecha del backend.
 *
 * Con la interfaz en inglés seguía diciendo *Exigente* y *"Con tus 16,4 h
 * llevas 30 de 38 logros"*, porque llegaban redactadas por el IPC y ninguna
 * traducción del renderer podía tocarlas. Ahora llegan los números y la frase
 * se compone aquí, así que aquí es donde se comprueba —incluido que los
 * números salgan con la coma o el punto que toque, que fue medio problema.
 */

const t = (idioma: 'es' | 'en') =>
  (clave: Parameters<typeof traducir>[1], huecos?: Parameters<typeof traducir>[2]) =>
    traducir(idioma, clave, huecos);

const UNIDADES = {
  hoy: 'hoy', dia: 'día', dias: 'días', mes: 'mes', meses: 'meses',
  anio: 'año', anios: 'años', y: 'y', nunca: 'nunca',
};
const RAREZAS = {
  sinDatos: 'Sin datos', legendario: 'Legendario', ultra: 'Ultra raro',
  raro: 'Raro', poco: 'Poco común', comun: 'Común',
};

beforeEach(() => configurarLocale('es-ES', UNIDADES, RAREZAS));

const dificultad = (campos: Partial<PlatinumDifficulty> = {}): PlatinumDifficulty => ({
  score: 7,
  tier: 'hard',
  rarestPercent: 0.8,
  ultraRare: 0,
  knownPercents: 10,
  total: 10,
  ...campos,
});

describe('la dificultad', () => {
  test('cada tramo tiene su palabra en los dos idiomas', () => {
    assert.equal(t('es')(DIFICULTAD.demanding), 'Exigente');
    assert.equal(t('en')(DIFICULTAD.demanding), 'Demanding');
    assert.equal(t('es')(DIFICULTAD.veryEasy), 'Muy asequible');
  });

  /*
   * El porcentaje se componía a mano en el backend —`toFixed().replace('.',
   * ',')`— así que decía "0,80 %" también con la aplicación en inglés.
   */
  test('el porcentaje del más raro sigue al idioma', () => {
    assert.equal(
      explicarDificultad(t('es'), dificultad({ rarestPercent: 0.8 })),
      'El logro más raro lo tiene el 0,80 % de los jugadores.',
    );
    configurarLocale('en-GB', UNIDADES, RAREZAS);
    assert.ok(explicarDificultad(t('en'), dificultad({ rarestPercent: 0.8 })).includes('0.80 %'));
  });

  test('un solo logro por debajo del cinco por ciento va en singular', () => {
    assert.ok(explicarDificultad(t('es'), dificultad({ ultraRare: 1 }))
      .includes('1 logro está por debajo del 5 %.'));
  });

  test('varios, en plural', () => {
    assert.ok(explicarDificultad(t('es'), dificultad({ ultraRare: 5 }))
      .includes('5 logros están por debajo del 5 %.'));
  });

  test('ninguno: no se dice nada de ellos', () => {
    assert.ok(!explicarDificultad(t('es'), dificultad({ ultraRare: 0 })).includes('por debajo'));
  });

  test('si Steam no publica la rareza de todos, se dice de cuántos habla', () => {
    assert.ok(explicarDificultad(t('es'), dificultad({ knownPercents: 4, total: 31 }))
      .includes('Steam solo publica la rareza de 4 de los 31.'));
  });

  test('y si la publica de todos, no se menciona', () => {
    assert.ok(!explicarDificultad(t('es'), dificultad({ knownPercents: 10, total: 10 }))
      .includes('solo publica'));
  });
});

describe('la estimación', () => {
  const estimacion = (reason: EstimateReason): PlatinumEstimate => ({
    totalHours: 30, remainingHours: 10, basis: 'measured', confidence: 'medium', reason,
  });

  test('con todo hecho, no se explica de dónde sale un cálculo que no hay', () => {
    assert.equal(
      explicarEstimacion(t('es'), estimacion({ kind: 'done' })),
      'Ya están todos los logros. Esto es el tiempo que te ha costado.',
    );
  });

  test('medida, lleva tus horas, tus logros y cuánto más cuesta lo que falta', () => {
    const frase = explicarEstimacion(t('es'), estimacion({
      kind: 'measured', playedHours: 16.4, unlocked: 30, total: 38, costRatio: 2.35,
    }));
    assert.ok(frase.includes('16,4 h'), 'las horas con su coma');
    assert.ok(frase.includes('30 de 38 logros'));
    assert.ok(frase.includes('2,35 veces'));
  });

  test('las mismas horas, en inglés, con punto', () => {
    configurarLocale('en-GB', UNIDADES, RAREZAS);
    const frase = explicarEstimacion(t('en'), estimacion({
      kind: 'measured', playedHours: 16.4, unlocked: 30, total: 38, costRatio: 2.35,
    }));
    assert.ok(frase.includes('16.4 h'));
    assert.ok(frase.includes('2.35 times'));
  });

  test('proyectada, dice que sale de la rareza y no de tu ritmo', () => {
    const frase = explicarEstimacion(t('es'), estimacion({ kind: 'projected', playedHours: 2.4 }));
    assert.ok(frase.includes('2,4 h'));
    assert.ok(frase.includes('no de tu ritmo'));
  });

  test('sin nada tuyo, se nombra el tramo del juego en minúscula', () => {
    assert.ok(explicarEstimacion(t('es'), estimacion({ kind: 'community', tier: 'brutal' }))
      .includes('(brutal)'));
  });

  test('y sin tramo conocido, no se inventa un paréntesis vacío', () => {
    const frase = explicarEstimacion(t('es'), estimacion({ kind: 'community', tier: null }));
    assert.ok(!frase.includes('('));
  });
});

describe('de dónde salen los datos', () => {
  test('el AppID entra en el nombre de la fuente', () => {
    assert.equal(
      nombreFuente(t('es'), { id: 'steam-catalog', appId: '730' }),
      'Catálogo público de Steam (AppID 730)',
    );
  });

  test('la misma fuente se nombra en el idioma activo', () => {
    assert.equal(nombreFuente(t('es'), { id: 'steam-client' }), 'Cliente de Steam');
    assert.equal(nombreFuente(t('en'), { id: 'steam-client' }), 'Steam client');
  });
});

describe('por qué el progreso es como es', () => {
  /*
   * La excepción declarada: la nota de la ficha de un juego la escribió quien
   * hizo esa ficha, y Atreus no traduce lo que encuentra.
   */
  test('la nota del catálogo sale tal cual, sin traducir', () => {
    assert.equal(
      explicarNota(t('en'), { kind: 'definition', text: 'Fortnite tiene pases, no logros' } as Notice),
      'Fortnite tiene pases, no logros',
    );
  });

  test('lo que dice Atreus sí se traduce', () => {
    assert.equal(explicarNota(t('es'), { kind: 'noList' } as Notice),
      'Steam no publica una lista de logros para este juego.');
    assert.equal(explicarNota(t('en'), { kind: 'noList' } as Notice),
      'Steam publishes no achievement list for this game.');
  });

  test('el detalle técnico de un fallo se enseña, pero la frase que lo envuelve es nuestra', () => {
    const frase = explicarNota(t('es'), { kind: 'unreadable', detail: 'ECONNRESET' } as Notice);
    assert.ok(frase.includes('ECONNRESET'));
    assert.ok(frase.startsWith('No se pudo leer'));
  });

  test('sin detalle, no se deja un paréntesis vacío', () => {
    const frase = explicarNota(t('es'), { kind: 'unreadable', detail: null } as Notice);
    assert.ok(!frase.includes('('));
  });

  test('la plataforma se nombra dentro de la frase, no con su identificador', () => {
    const frase = explicarNota(t('es'), { kind: 'manual', platform: 'epic' } as Notice);
    assert.ok(frase.startsWith('Epic Games'));
  });

  /*
   * En Xbox hay salida —una clave de OpenXBL— y merece decirse donde el
   * usuario se está encontrando el problema, no escondido en Ajustes.
   */
  test('en Xbox se añade por dónde salir; en las demás no', () => {
    assert.ok(explicarNota(t('es'), { kind: 'manual', platform: 'xbox' } as Notice)
      .includes('OpenXBL'));
    assert.ok(!explicarNota(t('es'), { kind: 'manual', platform: 'gog' } as Notice)
      .includes('OpenXBL'));
  });
});
