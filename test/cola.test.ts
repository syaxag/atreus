import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { GameId } from '../src/shared/types.ts';
import { recorrer, type Recorrido } from '../src/main/services/platinum/cola.ts';

/**
 * El recorrido de la cola del calentamiento.
 *
 * Se prueba lo que un usuario notaría, no la forma del bucle: **con una partida
 * abierta, ningún juego se pierde**. Ese era el defecto —`continue` sobre un
 * `for...of` avanzaba el iterador— y no lo veía nadie porque hace falta abrir
 * un juego mientras Atreus calienta la biblioteca.
 */

const juegos = (...ids: string[]): GameId[] => ids as GameId[];

/** Un recorrido de mentira: sin relojes, sin Steam, sin esperas de verdad. */
function banco(opciones: Partial<Recorrido> & { partidas?: boolean[] } = {}) {
  const calculados: GameId[] = [];
  const esperas: number[] = [];
  // `partidas` se consume una vez por consulta: así un test dice "hay partida
  // las tres primeras veces que mires, luego no".
  const partidas = opciones.partidas ?? [];
  let consultas = 0;

  const op: Recorrido = {
    hayPartida: () => partidas[consultas++] ?? false,
    parado: () => false,
    esperar: async (ms) => { esperas.push(ms); },
    calcular: async (gameId) => { calculados.push(gameId); },
    pausaMs: 10,
    pausaOcupadoMs: 100,
    esperasMaximas: 5,
    ...opciones,
  };

  return { op, calculados, esperas };
}

describe('recorrer la cola del calentamiento', () => {
  test('sin partidas abiertas, calcula todos en orden', async () => {
    const { op, calculados } = banco();
    const res = await recorrer(juegos('steam:1', 'steam:2', 'steam:3'), op);

    assert.deepEqual(calculados, ['steam:1', 'steam:2', 'steam:3']);
    assert.equal(res.hechos, 3);
    assert.equal(res.aplazados, 0);
  });

  test('una partida abierta NO hace perder el juego: se reintenta el mismo', async () => {
    // Hay partida las dos primeras consultas; a la tercera ya se cerró.
    const { op, calculados } = banco({ partidas: [true, true] });
    const res = await recorrer(juegos('steam:1', 'steam:2'), op);

    // Este es el test que fallaba antes: con `continue` sobre el iterador,
    // 'steam:1' se saltaba y calculados quedaba en ['steam:2'].
    assert.deepEqual(calculados, ['steam:1', 'steam:2']);
    assert.equal(res.hechos, 2);
    assert.equal(res.aplazados, 0);
  });

  test('jugar toda la tarde no descarta la cola entera en silencio', async () => {
    // Siempre hay partida: se agota el tope de esperas de cada juego.
    const { op, calculados } = banco({ partidas: Array(100).fill(true), esperasMaximas: 3 });
    const res = await recorrer(juegos('steam:1', 'steam:2'), op);

    assert.deepEqual(calculados, []);
    assert.equal(res.hechos, 0);
    // Aplazados, no perdidos sin decirlo: el registro lo cuenta y la siguiente
    // pasada los vuelve a coger porque siguen sin resumen.
    assert.equal(res.aplazados, 2);
  });

  test('las esperas por ocupado se cuentan por juego, no para toda la cola', async () => {
    // Dos esperas por el primero, luego libre. El segundo arranca con su
    // cuenta a cero, así que también aguanta sus dos.
    const { op, calculados } = banco({
      partidas: [true, true, false, true, true, false],
      esperasMaximas: 2,
    });
    const res = await recorrer(juegos('steam:1', 'steam:2'), op);

    assert.deepEqual(calculados, ['steam:1', 'steam:2']);
    assert.equal(res.aplazados, 0);
  });

  test('un juego que falla no detiene los siguientes', async () => {
    const calculados: GameId[] = [];
    const fallidos: GameId[] = [];
    const { op } = banco({
      calcular: async (gameId) => {
        if (gameId === 'steam:2') throw new Error('Steam no respondió');
        calculados.push(gameId);
      },
      fallo: (gameId) => fallidos.push(gameId),
    });
    const res = await recorrer(juegos('steam:1', 'steam:2', 'steam:3'), op);

    assert.deepEqual(calculados, ['steam:1', 'steam:3']);
    assert.deepEqual(fallidos, ['steam:2']);
    assert.equal(res.hechos, 2);
    assert.equal(res.fallidos, 1);
  });

  test('cerrar la aplicación corta el recorrido donde esté', async () => {
    let vistos = 0;
    const { op, calculados } = banco({
      parado: () => vistos >= 2,
      calcular: async (gameId) => { vistos++; calculados.push(gameId); },
    });
    const res = await recorrer(juegos('steam:1', 'steam:2', 'steam:3', 'steam:4'), op);

    assert.deepEqual(calculados, ['steam:1', 'steam:2']);
    assert.equal(res.interrumpido, true);
  });

  test('no se duerme después del último juego', async () => {
    const { op, esperas } = banco();
    await recorrer(juegos('steam:1', 'steam:2'), op);

    // Una sola pausa: la de en medio. Dormir al final es retrasar el cierre
    // de la pasada sin que nadie gane nada.
    assert.deepEqual(esperas, [10]);
  });

  test('una cola vacía no hace nada y no se queja', async () => {
    const { op, calculados, esperas } = banco();
    const res = await recorrer([], op);

    assert.deepEqual(calculados, []);
    assert.deepEqual(esperas, []);
    assert.equal(res.hechos, 0);
  });

  test('avisa juego a juego, para que la biblioteca se rellene a la vista', async () => {
    const avisos: GameId[] = [];
    const { op } = banco({ hecho: (gameId) => avisos.push(gameId) });
    await recorrer(juegos('steam:1', 'steam:2'), op);

    assert.deepEqual(avisos, ['steam:1', 'steam:2']);
  });
});
