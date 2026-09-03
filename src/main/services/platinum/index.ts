import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import type {
  Achievement, AchievementSet, GameId, PlatinumReport, PlatinumSummary,
} from '@shared/types';
import { join } from 'node:path';
import { paths } from '../../paths';
import { log } from '../../logger';
import { getGame, listGames } from '../catalog';
import * as achievements from '../achievements';
import { steamMinutes, trackedMinutes } from '../playtime';
import { difficultyOf, estimateOf } from './estimate';
import { registrar } from './celebrated';
import { emit } from '../../ipc/emit';

const logger = log('platinum');

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

const summaryFile = join(paths.cache, 'platinum.json');
let summaries: Record<GameId, PlatinumSummary> | null = null;

function loadSummaries(): Record<GameId, PlatinumSummary> {
  if (summaries) return summaries;
  try {
    const raw = JSON.parse(readFileSync(summaryFile, 'utf8')) as unknown;
    summaries = raw && typeof raw === 'object' ? (raw as Record<GameId, PlatinumSummary>) : {};
  } catch {
    summaries = {};
  }
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
function rememberSummary(report: PlatinumReport): void {
  const isSteam = report.gameId.startsWith('steam:');
  if (isSteam && report.tracking !== 'steam') return;

  const store = loadSummaries();
  store[report.gameId] = {
    gameId: report.gameId,
    unlocked: report.unlocked,
    total: report.total,
    percent: report.percent,
    complete: report.complete,
    playtimeMinutes: report.playtimeMinutes,
    tracking: report.tracking,
    updatedAt: report.updatedAt,
  };
  try {
    const temp = `${summaryFile}.tmp`;
    writeFileSync(temp, JSON.stringify(store, null, 2), 'utf8');
    renameSync(temp, summaryFile);
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
    sources: tracked > 0 ? ['Sesiones observadas por Atreus'] : [],
    warning: null,
    // En segundos, como todas las fechas del contrato: la interfaz las pasa
    // por `relative()`, y en milisegundos decía "dentro de mil millones de
    // segundos" donde debía poner "hace un momento".
    updatedAt: Math.floor(Date.now() / 1000),
  };

  let set: AchievementSet;
  try {
    set = await achievements.list(gameId, { avoidClient });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ...base, warning: `No se pudieron leer los logros: ${message}` };
  }

  if (set.items.length === 0) {
    return { ...base, warning: set.note ?? 'Este juego no tiene logros.' };
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
  const sources = [set.source];
  if (hasRarity) sources.push('Steam · estadísticas globales de logros');
  if (game.platform === 'steam' && steamMinutes(game.nativeId) !== null) {
    sources.push('Steam · horas jugadas de la cuenta local');
  }
  if (tracked > 0) sources.push('Sesiones observadas por Atreus');

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
    warning: set.note ?? (hasRarity
      ? null
      : 'Steam no publica la rareza de este juego: la dificultad es una estimación gruesa.'),
  };

  rememberSummary(report);

  /*
   * El momento que da nombre a la aplicación. Solo se anuncia una vez por
   * juego, y nunca en la primera pasada: si no, al instalar Atreus desfilarían
   * seguidas las celebraciones de platinos que conseguiste hace meses.
   */
  if (report.complete && report.total > 0 && registrar(gameId)) {
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
