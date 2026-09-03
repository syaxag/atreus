import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  difficultyOf, estimateOf, weightOf,
} from '../src/main/services/platinum/estimate.ts';

/** Los tramos que admite el contrato. Ver `DifficultyTier` en shared/types. */
const TRAMOS = new Set(['veryEasy', 'easy', 'demanding', 'hard', 'brutal']);

/**
 * La aritmética del informe de platino.
 *
 * Se prueba con números a mano porque es la parte que más fácil miente: un
 * número puesto en pantalla parece un hecho aunque sea una corazonada, y aquí
 * se comprueba que al menos la corazonada sea coherente.
 */

describe('weightOf', () => {
  test('un logro raro pesa más que uno común', () => {
    assert.ok(weightOf(0.5) > weightOf(3));
    assert.ok(weightOf(3) > weightOf(20));
    assert.ok(weightOf(20) > weightOf(80));
  });

  test('sin dato de rareza se asume algo intermedio', () => {
    assert.ok(weightOf(null) > weightOf(80));
    assert.ok(weightOf(null) < weightOf(1));
  });
});

describe('difficultyOf', () => {
  test('sin rareza conocida no se inventa una dificultad', () => {
    assert.equal(difficultyOf({ total: 10, percents: [null, null] }), null);
  });

  test('un juego de logros comunes es asequible', () => {
    const result = difficultyOf({ total: 20, percents: [80, 65, 50, 44] });
    assert.ok(result);
    assert.ok(result.score <= 3, `esperaba una puntuación baja, salió ${result.score}`);
  });

  test('un solo logro casi imposible arrastra la puntuación arriba', () => {
    const result = difficultyOf({ total: 20, percents: [90, 85, 80, 0.3] });
    assert.ok(result);
    assert.ok(result.score >= 8, `esperaba una puntuación alta, salió ${result.score}`);
    assert.equal(result.rarestPercent, 0.3);
    assert.equal(result.ultraRare, 1);
  });

  test('una lista corta y común se rebaja: se hace en una tarde', () => {
    const short = difficultyOf({ total: 6, percents: [40, 35, 30, 22, 20, 18] });
    const long = difficultyOf({ total: 60, percents: [40, 35, 30, 22, 20, 18] });
    assert.ok(short && long);
    assert.ok(short.score < long.score);
  });

  test('de aquí no sale ni una frase: el tramo va como identificador', () => {
    const result = difficultyOf({ total: 20, percents: [90, 85, 80, 0.3] });
    assert.ok(result);
    assert.ok(TRAMOS.has(result.tier), `tramo desconocido: ${result.tier}`);
    // El único texto del objeto es ese identificador. Si vuelve a colarse una
    // etiqueta redactada, esto se cae: la palabra la pone el renderer, que es
    // quien sabe en qué idioma está la interfaz.
    const textos = Object.entries(result).filter(([, valor]) => typeof valor === 'string');
    assert.deepEqual(textos, [['tier', result.tier]]);
  });

  test('dice de cuántos logros se conoce la rareza', () => {
    const result = difficultyOf({ total: 10, percents: [40, 12, null, null] });
    assert.ok(result);
    assert.equal(result.knownPercents, 2);
    assert.equal(result.total, 10);
  });

  test('la puntuación nunca se sale de la escala de 1 a 10', () => {
    for (const rarest of [0.01, 0.5, 5, 50, 99]) {
      const result = difficultyOf({ total: 40, percents: Array.from({ length: 40 }, () => rarest) });
      assert.ok(result);
      assert.ok(result.score >= 1 && result.score <= 10, `fuera de escala con ${rarest}: ${result.score}`);
    }
  });
});

describe('estimateOf', () => {
  const base = {
    unlocked: 0, total: 0, playtimeMinutes: null,
    unlockedPercents: [], remainingPercents: [], difficulty: null,
  };

  test('un juego sin logros no produce estimación', () => {
    assert.equal(estimateOf(base), null);
  });

  test('con logros completos no queda nada por hacer', () => {
    const result = estimateOf({
      ...base, unlocked: 10, total: 10, playtimeMinutes: 600,
      unlockedPercents: Array.from({ length: 10 }, () => 50),
    });
    assert.ok(result);
    assert.equal(result.remainingHours, 0);
    assert.equal(result.totalHours, 10);
  });

  test('con horas y logros propios se mide sobre el ritmo del jugador', () => {
    const result = estimateOf({
      ...base,
      unlocked: 10, total: 20, playtimeMinutes: 600,
      unlockedPercents: Array.from({ length: 10 }, () => 50),
      remainingPercents: Array.from({ length: 10 }, () => 50),
    });
    assert.ok(result);
    assert.equal(result.basis, 'measured');
    // Diez logros igual de comunes en diez horas: los otros diez, otras diez.
    assert.equal(result.remainingHours, 10);
    assert.equal(result.totalHours, 20);
  });

  test('lo que falta cuesta más si es más raro que lo ya hecho', () => {
    const facil = estimateOf({
      ...base, unlocked: 5, total: 10, playtimeMinutes: 300,
      unlockedPercents: Array.from({ length: 5 }, () => 60),
      remainingPercents: Array.from({ length: 5 }, () => 60),
    });
    const dificil = estimateOf({
      ...base, unlocked: 5, total: 10, playtimeMinutes: 300,
      unlockedPercents: Array.from({ length: 5 }, () => 60),
      remainingPercents: Array.from({ length: 5 }, () => 0.5),
    });
    assert.ok(facil && dificil);
    assert.ok(dificil.remainingHours > facil.remainingHours * 4);
  });

  test('sin horas jugadas se habla del juego, no del jugador', () => {
    const result = estimateOf({
      ...base, unlocked: 0, total: 10,
      remainingPercents: Array.from({ length: 10 }, () => 50),
    });
    assert.ok(result);
    assert.equal(result.basis, 'community');
    assert.equal(result.confidence, 'low');
  });

  test('con muy pocos logros propios no se presume fiabilidad', () => {
    const result = estimateOf({
      ...base, unlocked: 1, total: 10, playtimeMinutes: 30,
      unlockedPercents: [90],
      remainingPercents: Array.from({ length: 9 }, () => 40),
    });
    assert.ok(result);
    assert.equal(result.basis, 'projected');
    assert.equal(result.confidence, 'low');
  });
});

/**
 * El motivo, que es lo que sustituyó a la explicación redactada.
 *
 * Lo que se comprueba no es cómo queda la frase —eso es del renderer— sino
 * que salgan los datos con los que se escribe, y que no salga texto.
 */
describe('el motivo de la estimación', () => {
  const base = {
    unlocked: 0, total: 0, playtimeMinutes: null,
    unlockedPercents: [], remainingPercents: [], difficulty: null,
  };

  test('con todo hecho no hay nada que explicar', () => {
    const result = estimateOf({
      ...base, unlocked: 10, total: 10, playtimeMinutes: 600,
      unlockedPercents: Array.from({ length: 10 }, () => 50),
    });
    assert.equal(result?.reason.kind, 'done');
  });

  test('medido, lleva las horas, los logros y cuánto más cuesta lo que falta', () => {
    const result = estimateOf({
      ...base, unlocked: 10, total: 20, playtimeMinutes: 600,
      unlockedPercents: Array.from({ length: 10 }, () => 50),
      remainingPercents: Array.from({ length: 10 }, () => 50),
    });
    assert.ok(result && result.reason.kind === 'measured');
    assert.equal(result.reason.playedHours, 10);
    assert.equal(result.reason.unlocked, 10);
    assert.equal(result.reason.total, 20);
    // Diez logros igual de comunes contra otros diez: cuestan lo mismo.
    assert.equal(result.reason.costRatio, 1);
  });

  test('proyectado, lleva solo las horas que llevas', () => {
    const result = estimateOf({
      ...base, unlocked: 1, total: 10, playtimeMinutes: 30,
      unlockedPercents: [90],
      remainingPercents: Array.from({ length: 9 }, () => 40),
    });
    assert.ok(result && result.reason.kind === 'projected');
    assert.equal(result.reason.playedHours, 0.5);
  });

  test('sin nada tuyo, lleva el tramo de dificultad del juego', () => {
    const difficulty = difficultyOf({ total: 10, percents: [3, 40, 60] });
    assert.ok(difficulty);
    const result = estimateOf({
      ...base, unlocked: 0, total: 10, difficulty,
      remainingPercents: Array.from({ length: 10 }, () => 50),
    });
    assert.ok(result && result.reason.kind === 'community');
    assert.equal(result.reason.tier, difficulty.tier);
  });

  test('sin dificultad conocida el tramo va vacío, no inventado', () => {
    const result = estimateOf({
      ...base, unlocked: 0, total: 10,
      remainingPercents: Array.from({ length: 10 }, () => 50),
    });
    assert.ok(result && result.reason.kind === 'community');
    assert.equal(result.reason.tier, null);
  });
});
