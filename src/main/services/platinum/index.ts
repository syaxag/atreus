import { join } from 'node:path';
import type {
  Achievement, AchievementSet, GameId, PlatinumReport, PlatinumSummary, SourceRef,
} from '@shared/types';
import { paths } from '../../paths';
import { log } from '../../logger';
import { getGame, listGames } from '../catalog';
import * as achievements from '../achievements';
import * as steam from '../steam/session';
import { steamMinutes, trackedMinutes } from '../playtime';
import { difficultyOf, estimateOf } from './estimate';
import { guardarResumenes, leerResumenes, resumenDe, SUMMARY_SCHEMA } from './summaries';
import { registrar } from './celebrated';
import { emit } from '../../ipc/emit';

const logger = log('platinum');

export { SUMMARY_SCHEMA } from './summaries';

/**
 * El informe de platino: cuánto llevas, cuánto falta y cómo de duro es.
 *
 * Cruza cuatro cosas que hasta ahora vivían separadas — la lista de logros con
 * su estado, la rareza global de cada uno, las horas de la cuenta local y el
 * tiempo que Atreus ha visto el juego abierto — y las convierte en la única
 * pregunta que le importa a quien caza platinos: *¿qué me queda?*
 *
 * Funciona igual en cualquier plataforma. Lo único que cambia es de dónde sale
 * el estado de desbloqueo, y el informe lo dice en `tracking`: del cliente de
 * Steam, o de lo que hayas marcado tú. La lista y la rareza —que es lo que
 * alimenta la dificultad y la estimación— están siempre.
 */

const CACHE_TTL_MS = 30 * 60_000;

const reports = new Map<GameId, { at: number; report: PlatinumReport }>();
const inflight = new Map<GameId, Promise<PlatinumReport>>();

// ── Resúmenes persistentes ────────────────────────────────────

/**
 * Junto a `library.json`, no en la caché.
 *
 * Esto **no es una caché**: no se vuelve a descargar, se recalcula abriendo un
 * proceso de Steam por juego. Estaba en la carpeta de caché, que Chromium
 * limpia, así que se perdía en cada arranque y el calentamiento rehacía la
 * biblioteca entera cada vez. Ver la nota de `paths.cache`.
 */
const summaryFile = join(paths.root, 'platinum.json');
let summaries: Record<GameId, PlatinumSummary> | null = null;

/**
 * Los resúmenes guardados, cargados una sola vez.
 *
 * Leerlos y darles forma vive en `summaries.ts`, que no toca Electron y por
 * eso se puede probar con un archivo de mentira. Aquí solo queda la caché en
 * memoria y contar lo que haya que contar.
 */
function loadSummaries(): Record<GameId, PlatinumSummary> {
  if (summaries) return summaries;
  const { resumenes, ilegible } = leerResumenes(summaryFile);
  if (ilegible) {
    logger.warn(ilegible.apartadoEn
      ? `no se pudo leer ${ilegible.archivo}, apartado en ${ilegible.apartadoEn}: ${ilegible.error}`
      : `no se pudo leer ni apartar ${ilegible.archivo}: ${ilegible.error}`);
  }
  summaries = resumenes;
  return summaries;
}

/**
 * Guarda el resumen para la biblioteca, salvo cuando sería mentira.
 *
 * En un juego de Steam, `tracking: 'manual'` significa que **no se pudo leer**
 * tu progreso, no que no tengas ninguno. Guardar ese cero pintaría en la
 * biblioteca un 0/31 para un juego que llevas a medias, que es peor que dejar
 * la casilla vacía. En las demás plataformas el registro manual sí es lo único
 * que hay, y un cero ahí es la verdad: no has marcado nada todavía.
 */
function rememberSummary(report: PlatinumReport, unlocked: Achievement[]): void {
  const isSteam = report.gameId.startsWith('steam:');
  if (isSteam && report.tracking !== 'steam') return;

  const store = loadSummaries();
  store[report.gameId] = resumenDe(report, unlocked);
  try {
    guardarResumenes(summaryFile, store);
  } catch (e) {
    logger.warn('no se pudo guardar el resumen de platinos:', e);
  }
}

/**
 * Estado de toda la biblioteca de un vistazo.
 *
 * Sale de lo ya calculado, no abre sesiones de Steam: pedirle al cliente los
 * logros de ciento cincuenta juegos abriría ciento cincuenta procesos. Las
 * horas sí son siempre frescas, porque se leen de un archivo local.
 */
export function summariesFor(): PlatinumSummary[] {
  const store = loadSummaries();
  return listGames().map((game) => {
    const cached = store[game.id];
    const playtimeMinutes = game.platform === 'steam'
      ? steamMinutes(game.nativeId) ?? cached?.playtimeMinutes ?? null
      : cached?.playtimeMinutes ?? (trackedMinutes(game.id) || null);
    return cached
      ? { ...cached, playtimeMinutes }
      : {
        gameId: game.id,
        tracking: 'none',
        unlocked: 0,
        total: 0,
        percent: 0,
        complete: false,
        playtimeMinutes,
        difficulty: null,
        next: null,
        rarest: null,
        lastUnlockAt: null,
        unlockDays: [],
        schema: SUMMARY_SCHEMA,
        updatedAt: null,
      };
  });
}

// ── Informe completo ──────────────────────────────────────────

function percentsOf(list: Achievement[]): (number | null)[] {
  return list.map((a) => a.globalPercent);
}

async function build(gameId: GameId, avoidClient = false): Promise<PlatinumReport> {
  const game = getGame(gameId);
  if (!game) throw new Error(`Juego no encontrado: ${gameId}`);

  const tracked = trackedMinutes(gameId);
  const base: PlatinumReport = {
    gameId,
    gameName: game.name,
    tracking: 'none',
    unlocked: 0,
    total: 0,
    percent: 0,
    complete: false,
    // Steam publica las horas en un archivo local; el resto de plataformas no
    // publica ninguna, así que ahí valen las sesiones que Atreus ha visto.
    playtimeMinutes: game.platform === 'steam'
      ? steamMinutes(game.nativeId) ?? (tracked || null)
      : (tracked || null),
    trackedMinutes: tracked,
    firstUnlockAt: null,
    lastUnlockAt: null,
    estimate: null,
    difficulty: null,
    remaining: [],
    sources: tracked > 0 ? [{ id: 'atreus-sessions' }] : [],
    warning: null,
    // En segundos, como todas las fechas del contrato: la interfaz las pasa
    // por `relative()`, y en milisegundos decía "dentro de mil millones de
    // segundos" donde debía poner "hace un momento".
    updatedAt: Math.floor(Date.now() / 1000),
  };

  /*
   * Si aquí se abre una sesión de Steam, aquí se cierra.
   *
   * `achievements.list()` arranca una sesión sin decirlo —es la única forma de
   * leer el estado real del cliente— y **nadie la cerraba**: la sesión de cada
   * juego calculado se quedaba viva hasta salir de Atreus. Dos consecuencias,
   * las dos visibles y ninguna evidente desde el código:
   *
   *  1. Steam le decía a tus amigos que estabas jugando a ese juego. Con la
   *     biblioteca entera calculándose al arrancar, a los quince seguidos.
   *  2. Con la sesión abierta, Steam cree que el juego **ya está en marcha** e
   *     ignora `steam://rungameid`. Es decir: el botón de Jugar no hacía nada.
   *
   * Solo se cierra si la abrimos nosotros: si Trofeos ya la tenía puesta, es
   * suya y la necesita para poder escribir.
   */
  const laTeniaAbierta = game.platform === 'steam' && steam.abierta(game.nativeId);

  let set: AchievementSet;
  try {
    set = await achievements.list(gameId, { avoidClient });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ...base, warning: { kind: 'unreadable', detail: message } };
  } finally {
    if (game.platform === 'steam' && !laTeniaAbierta && steam.abierta(game.nativeId)) {
      steam.close(game.nativeId);
      logger.debug(`${gameId}: sesión de Steam liberada tras calcular el informe`);
    }
  }

  if (set.items.length === 0) {
    return { ...base, warning: set.note ?? { kind: 'noAchievements' } };
  }

  const unlockedList = set.items.filter((a) => a.unlocked);
  const remainingList = set.items.filter((a) => !a.unlocked);
  const times = unlockedList.map((a) => a.unlockTime).filter((t): t is number => !!t && t > 0);

  const difficulty = difficultyOf({ total: set.items.length, percents: percentsOf(set.items) });
  const estimate = estimateOf({
    unlocked: unlockedList.length,
    total: set.items.length,
    playtimeMinutes: base.playtimeMinutes,
    unlockedPercents: percentsOf(unlockedList),
    remainingPercents: percentsOf(remainingList),
    difficulty,
  });

  const hasRarity = set.items.some((a) => a.globalPercent !== null);
  const sources: SourceRef[] = [set.source];
  if (hasRarity) sources.push({ id: 'steam-rarity' });
  if (game.platform === 'steam' && steamMinutes(game.nativeId) !== null) {
    sources.push({ id: 'steam-playtime' });
  }
  if (tracked > 0) sources.push({ id: 'atreus-sessions' });

  const report: PlatinumReport = {
    ...base,
    tracking: set.tracking,
    unlocked: unlockedList.length,
    total: set.items.length,
    percent: Math.round((unlockedList.length / set.items.length) * 1000) / 10,
    complete: unlockedList.length === set.items.length,
    firstUnlockAt: times.length > 0 ? Math.min(...times) : null,
    lastUnlockAt: times.length > 0 ? Math.max(...times) : null,
    estimate,
    difficulty,
    // Del más común al más raro: es el orden en que conviene atacarlos.
    remaining: [...remainingList]
      .sort((a, b) => (b.globalPercent ?? -1) - (a.globalPercent ?? -1))
      .map((a) => ({
        apiName: a.apiName,
        displayName: a.displayName,
        description: a.description,
        iconUrl: a.iconGrayUrl ?? a.iconUrl,
        globalPercent: a.globalPercent,
        hidden: a.hidden,
      })),
    sources,
    warning: set.note ?? (hasRarity ? null : { kind: 'noRarity' }),
  };

  /*
   * Si Atreus ya había calculado este juego antes. Hay que mirarlo **antes** de
   * guardar el resumen nuevo, que es justo lo que borra la respuesta.
   */
  const yaConocido = loadSummaries()[gameId]?.updatedAt != null;

  rememberSummary(report, unlockedList);

  /*
   * El momento que da nombre a la aplicación. Solo se anuncia una vez por
   * juego, y nunca la primera vez que se calcula: si no, al instalar Atreus
   * desfilarían seguidas las celebraciones de platinos que conseguiste hace
   * meses. Ver la nota de `celebrated.ts`.
   */
  if (report.complete && report.total > 0 && registrar(gameId, yaConocido)) {
    emit('platinum:achieved', report);
  }
  return report;
}

/**
 * Informe del juego. `refresh` ignora la caché de media hora; `avoidClient`
 * impide arrancar el cliente de Steam, para el calentamiento en segundo plano.
 */
export function report(gameId: GameId, refresh = false, avoidClient = false): Promise<PlatinumReport> {
  const cached = reports.get(gameId);
  if (!refresh && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return Promise.resolve(cached.report);
  }

  const running = inflight.get(gameId);
  if (running && !refresh) return running;

  // Actualizar de verdad significa también olvidar el catálogo público, o el
  // botón de la ficha releería la misma lista cacheada durante doce horas.
  if (refresh) void achievements.refresh(gameId);

  const promise = build(gameId, avoidClient)
    .then((value) => {
      reports.set(gameId, { at: Date.now(), report: value });
      return value;
    })
    .finally(() => inflight.delete(gameId));

  inflight.set(gameId, promise);
  return promise;
}

/** Olvida lo cacheado de un juego. Se llama tras escribir o marcar logros. */
export function invalidate(gameId: GameId): void {
  reports.delete(gameId);
}
