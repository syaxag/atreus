import type { GameId } from '@shared/types';
import { emit } from '../../ipc/emit';
import { log } from '../../logger';
import { listGames } from '../catalog';
import { runningGames } from '../catalog/activity';
import * as webapi from '../steam/webapi';
import { report, summariesFor, SUMMARY_SCHEMA } from './index';

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
/** Si hay un juego abierto, se reintenta más tarde en vez de abandonar. */
const BUSY_RETRY_MS = 60_000;

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

  let done = 0;
  for (const gameId of queue) {
    if (stopped) return;

    // Jugar manda: mientras haya una partida abierta, ni un proceso más.
    if (runningGames().length > 0) {
      logger.info('hay una partida en marcha; el calentamiento espera');
      await sleep(BUSY_RETRY_MS);
      if (stopped) return;
      continue;
    }

    try {
      // Sin clave de la Web API hay que preguntarle al cliente: es lento, pero
      // es la única forma de saber el estado real. Evitarlo aquí produciría
      // resúmenes de 0 logros para juegos a medio hacer, que es peor que nada.
      await report(gameId, false, fast);
      done++;
      // Se avisa juego a juego: la biblioteca se va rellenando a la vista en
      // vez de dar un salto al final.
      emit('platinum:summaries', summariesFor());
    } catch (e) {
      logger.warn(`no se pudo calcular el informe de ${gameId}:`, e);
    }

    await sleep(fast ? FAST_GAP_MS : SLOW_GAP_MS);
  }

  logger.info(`calentamiento terminado: ${done} de ${queue.length} juegos`);
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
