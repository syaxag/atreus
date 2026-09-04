import type { GameId } from '@shared/types';
import { emit } from '../../ipc/emit';
import { log } from '../../logger';
import { listGames } from '../catalog';
import { runningGames } from '../catalog/activity';
import * as webapi from '../steam/webapi';
import { report, summariesFor, SUMMARY_SCHEMA } from './index';
import { recorrer } from './cola';

const logger = log('platinum:warmup');

/**
 * Rellena la biblioteca por detrás.
 *
 * El informe de platino se calculaba solo al abrir la ficha de un juego, así
 * que al arrancar la Biblioteca no sabía nada: sin barras de progreso y con el
 * orden "más cerca del platino" ordenando por nada. Esto lo recorre solo.
 *
 * Va despacio a propósito. Con clave de la Web API cada juego es una petición
 * HTTP y se puede ir rápido; sin ella hay que preguntarle al cliente de Steam,
 * y eso es **un proceso hijo por juego**. Se hace de uno en uno, con pausa, y
 * nunca mientras hay una partida abierta: el informe puede esperar, la partida
 * no.
 */

/** Con la Web API basta un respiro corto entre peticiones. */
const FAST_GAP_MS = 1_500;
/** Sin ella, cada juego arranca un proceso: hay que darle aire. */
const SLOW_GAP_MS = 20_000;
/** Espera inicial: primero que la ventana termine de pintarse. */
const START_DELAY_MS = 8_000;
/** Si hay un juego abierto, se reintenta el mismo juego más tarde. */
const BUSY_RETRY_MS = 60_000;
/**
 * Cuántas esperas por juego antes de aplazarlo.
 *
 * Treinta minutos. Una partida corta no debe costar ningún resumen; una tarde
 * entera no debe dejar la cola parada detrás del primer juego de la lista.
 */
const MAX_BUSY_WAITS = 30;

let timer: NodeJS.Timeout | null = null;
let running = false;
let stopped = false;

const sleep = (ms: number) => new Promise<void>((resolve) => { timer = setTimeout(resolve, ms); });

/**
 * Qué juegos hay que calcular.
 *
 * Los que no se han calculado nunca, los que se calcularon con una versión
 * anterior del resumen, y también aquellos a los que has jugado después del
 * último cálculo y todavía no estaban al 100 %.
 *
 * Sin el tercero, un platino rematado jugando no se notaría hasta que abrieras
 * su ficha a mano, y la celebración no saltaría al volver a la aplicación, que
 * es justo cuando tiene que saltar. Sin el segundo, lo que el resumen aprendió
 * a guardar después solo aparecería en los juegos que volvieras a tocar: la
 * dificultad de la tarjeta habría salido en tres juegos de dieciséis.
 */
function pending(): GameId[] {
  const resumen = new Map(summariesFor().map((s) => [s.gameId, s]));
  return listGames()
    .filter((game) => {
      const s = resumen.get(game.id);
      if (!s || s.updatedAt === null) return true;
      if (s.schema < SUMMARY_SCHEMA) return true;
      if (s.complete) return false;
      return game.lastPlayed !== null && game.lastPlayed > s.updatedAt;
    })
    .map((game) => game.id);
}

/*
 * Aquí había una marca de "biblioteca sembrada" que se cerraba al terminar la
 * primera pasada, y era la que decidía si un platino se celebraba. Se ha ido:
 * una pasada termina igual aunque haya juegos que no se llegaron a calcular —su
 * consulta falla, o se los salta porque hay una partida abierta— y esos juegos,
 * calculados días después, anunciaban como nuevo un platino de hace meses.
 *
 * Ahora la decisión va por juego y vive en `celebrated.ts`, que es donde se
 * sabe si Atreus había calculado ese juego alguna vez. Así tampoco importa que
 * el calentamiento no llegue nunca a terminar del todo.
 */

async function pass(): Promise<void> {
  const queue = pending();
  if (queue.length === 0) {
    logger.info('la biblioteca ya está al día');
    return;
  }

  const fast = webapi.available();
  logger.info(
    `calentando ${queue.length} juego(s) ${fast ? 'por la Web API' : 'con el cliente de Steam, despacio'}`,
  );

  // El recorrido vive en `cola.ts`, sin Electron, para poder probarlo. Aquí
  // queda lo que sí necesita la aplicación: quién juega, qué se calcula y a
  // quién se avisa.
  const resultado = await recorrer(queue, {
    hayPartida: () => runningGames().length > 0,
    parado: () => stopped,
    esperar: sleep,
    pausaMs: fast ? FAST_GAP_MS : SLOW_GAP_MS,
    pausaOcupadoMs: BUSY_RETRY_MS,
    esperasMaximas: MAX_BUSY_WAITS,

    // Sin clave de la Web API hay que preguntarle al cliente: es lento, pero
    // es la única forma de saber el estado real. Evitarlo aquí produciría
    // resúmenes de 0 logros para juegos a medio hacer, que es peor que nada.
    calcular: async (gameId) => { await report(gameId, false, fast); },

    // Se avisa juego a juego: la biblioteca se va rellenando a la vista en vez
    // de dar un salto al final.
    hecho: () => emit('platinum:summaries', summariesFor()),
    fallo: (gameId, e) => logger.warn(`no se pudo calcular el informe de ${gameId}:`, e),
  });

  if (resultado.aplazados > 0) {
    logger.info(
      `${resultado.aplazados} juego(s) aplazados: llevabas jugando más de ` +
      `${(MAX_BUSY_WAITS * BUSY_RETRY_MS) / 60_000} minutos y el cálculo no se cuela delante de una partida`,
    );
  }
  logger.info(
    `calentamiento terminado: ${resultado.hechos} de ${queue.length} juegos` +
    (resultado.interrumpido ? ' (interrumpido al cerrar)' : ''),
  );
}

/** Arranca el calentamiento. Idempotente. */
export function startWarmup(): void {
  if (running) return;
  running = true;
  stopped = false;
  void (async () => {
    await sleep(START_DELAY_MS);
    if (stopped) return;
    try {
      await pass();
    } catch (e) {
      logger.warn('el calentamiento falló:', e);
    } finally {
      running = false;
    }
  })();
}

/** Lo detiene al salir, sin dejar temporizadores colgando. */
export function stopWarmup(): void {
  stopped = true;
  running = false;
  if (timer) clearTimeout(timer);
  timer = null;
}
