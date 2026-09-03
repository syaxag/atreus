import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { PlatinumSummary } from '../src/shared/types.ts';
import {
  contarRacha, empezado, sumar, sumarEnCurso, VENTANA_DIAS,
} from '../src/renderer/lib/perfil.ts';

/**
 * Las cuentas del Perfil y de la Portada.
 *
 * Vivían dentro de sus vistas y ahí no se podían probar. La racha tiene casos
 * límite de verdad —ayer cuenta, un hueco la rompe, lo viejo no entra— y el
 * bloque de "lo que llevas a medias" ya se equivocó una vez: enseñaba la media
 * de toda la biblioteca debajo de una frase que hablaba de otros juegos.
 */

const DIA = 86_400;

/** Un resumen con lo justo para lo que cuenta cada función. */
function resumen(campos: Partial<PlatinumSummary> = {}): PlatinumSummary {
  return {
    gameId: 'steam:1',
    tracking: 'steam',
    unlocked: 0,
    total: 0,
    percent: 0,
    complete: false,
    playtimeMinutes: null,
    difficulty: null,
    next: null,
    rarest: null,
    lastUnlockAt: null,
    unlockDays: [],
    schema: 2,
    updatedAt: 1,
    ...campos,
  };
}

describe('qué cuenta como empezado', () => {
  test('sin resumen, no', () => {
    assert.equal(empezado(undefined), false);
  });

  test('un juego sin logros no está empezado ni puede estarlo', () => {
    assert.equal(empezado(resumen({ total: 0, unlocked: 0 })), false);
  });

  test('sin ningún logro conseguido, tampoco', () => {
    assert.equal(empezado(resumen({ total: 30, unlocked: 0 })), false);
  });

  test('terminado ya no está empezado: no queda paso siguiente', () => {
    assert.equal(empezado(resumen({ total: 30, unlocked: 30, complete: true })), false);
  });

  test('a medias, sí', () => {
    assert.equal(empezado(resumen({ total: 30, unlocked: 4 })), true);
  });
});

describe('las sumas de la biblioteca', () => {
  const biblioteca = [
    resumen({ gameId: 'a', total: 10, unlocked: 10, complete: true, playtimeMinutes: 600 }),
    resumen({ gameId: 'b', total: 20, unlocked: 5, playtimeMinutes: 120 }),
    resumen({ gameId: 'c', total: 30, unlocked: 0 }),
  ];

  test('cuenta logros y totales de todo lo que tenga', () => {
    const cuenta = sumar(biblioteca);
    assert.equal(cuenta.hechos, 15);
    assert.equal(cuenta.total, 60);
    assert.equal(cuenta.media, 25);
  });

  test('un platino no cuenta además como en curso', () => {
    const cuenta = sumar(biblioteca);
    assert.equal(cuenta.platinos, 1);
    assert.equal(cuenta.enCurso, 1, 'solo el de 5 de 20');
  });

  test('las horas se reparten solo entre los juegos que las tienen', () => {
    const cuenta = sumar(biblioteca);
    assert.equal(cuenta.minutos, 720);
    assert.equal(cuenta.conHoras, 2, 'el tercero no aporta y no se cuenta');
  });

  test('sin nada que sumar, la media es cero y no una división por cero', () => {
    const cuenta = sumar([]);
    assert.equal(cuenta.media, 0);
    assert.ok(Number.isFinite(cuenta.media));
  });
});

describe('lo que llevas a medias, contado aparte', () => {
  /*
   * El fallo que esto sujeta: el bloque decía "N juegos empezados" y debajo
   * enseñaba la media global y los logros que faltan en **toda** la
   * biblioteca, platinos incluidos. Tres números de dos conjuntos distintos.
   */
  const biblioteca = [
    resumen({ gameId: 'a', total: 100, unlocked: 100, complete: true }),
    resumen({ gameId: 'b', total: 10, unlocked: 5 }),
    resumen({ gameId: 'c', total: 30, unlocked: 0 }),
  ];

  test('solo entran los empezados y sin terminar', () => {
    assert.equal(sumarEnCurso(biblioteca).juegos, 1);
  });

  test('lo que falta es lo de esos juegos, no lo de la biblioteca', () => {
    assert.equal(sumarEnCurso(biblioteca).faltan, 5, 'no los 35 de toda la lista');
  });

  test('y la media también es la de esos, no la global', () => {
    assert.equal(sumarEnCurso(biblioteca).media, 50);
    assert.equal(sumar(biblioteca).media, 75, 'la global es otra cosa, y era la que se enseñaba');
  });

  test('sin nada a medias, todo a cero sin romperse', () => {
    assert.deepEqual(sumarEnCurso([]), { juegos: 0, faltan: 0, media: 0 });
  });
});

describe('la racha', () => {
  const hoy = 20_000;
  const ahora = hoy * DIA * 1000;
  const conDias = (dias: number[]) => [resumen({ unlockDays: dias })];

  test('sin días, no hay racha', () => {
    assert.deepEqual(contarRacha([], ahora), { actual: 0, dias: 0 });
  });

  test('hoy cuenta', () => {
    assert.equal(contarRacha(conDias([hoy]), ahora).actual, 1);
  });

  /*
   * Ayer vale como punto de partida. Sin eso la racha se rompería cada
   * medianoche y volvería a existir al conseguir el primer logro del día, que
   * es contar el reloj en vez de contar lo que haces.
   */
  test('ayer también, aunque hoy todavía no hayas jugado', () => {
    assert.equal(contarRacha(conDias([hoy - 1]), ahora).actual, 1);
  });

  test('anteayer ya no arranca una racha', () => {
    assert.equal(contarRacha(conDias([hoy - 2]), ahora).actual, 0);
  });

  test('los días seguidos se encadenan', () => {
    assert.equal(contarRacha(conDias([hoy, hoy - 1, hoy - 2, hoy - 3]), ahora).actual, 4);
  });

  test('un hueco la corta ahí mismo', () => {
    assert.equal(contarRacha(conDias([hoy, hoy - 1, hoy - 3, hoy - 4]), ahora).actual, 2);
  });

  test('se suman los días de todos los juegos, sin contarlos dos veces', () => {
    const dos = [resumen({ gameId: 'a', unlockDays: [hoy, hoy - 1] }),
      resumen({ gameId: 'b', unlockDays: [hoy - 1, hoy - 2] })];
    const racha = contarRacha(dos, ahora);
    assert.equal(racha.actual, 3);
    assert.equal(racha.dias, 3, 'tres días distintos, no cuatro entradas');
  });

  /*
   * El backend guarda noventa días *en el momento de calcular*, así que un
   * juego sin recalcular arrastra días que ya no caben en la frase "en los
   * últimos noventa". Se recortan donde está escrita la frase.
   */
  test('lo de fuera de la ventana no se cuenta ni para el total', () => {
    const racha = contarRacha(conDias([hoy, hoy - VENTANA_DIAS - 10]), ahora);
    assert.equal(racha.actual, 1);
    assert.equal(racha.dias, 1, 'el viejo no engorda "días con algún logro"');
  });

  test('un día viejo no puede alargar la racha por el otro lado', () => {
    assert.equal(contarRacha(conDias([hoy - VENTANA_DIAS - 1]), ahora).actual, 0);
  });
});
