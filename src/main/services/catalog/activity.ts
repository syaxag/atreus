import { basename } from 'node:path';
import type { Game, GameId } from '@shared/types';
import { emit } from '../../ipc/emit';
import { log } from '../../logger';
import { getDefinition } from './definitions';
import { getGame, listGames, scan } from './index';
import { guessExe } from './steam';
import { listProcesses } from '../system/processes';
import { recordSession } from '../playtime';

const logger = log('catalog:activity');

/**
 * Observa dos cosas sin inyectar ni abrir los procesos de los juegos:
 *
 * - procesos de los títulos ya descubiertos, para saber si se abrieron desde
 *   Steam, Epic, el acceso directo o Atreus;
 * - cambios de instalación mediante un reescaneo periódico. Steam, Epic y
 *   Xbox no ofrecen una única notificación local fiable para todas las rutas,
 *   por lo que el reescaneo es la fuente de verdad y no toca ningún juego.
 */
const PROCESS_POLL_MS = 2_500;
/**
 * El reescaneo completo lanza PowerShell dos veces (paquetes de la Store y
 * programas instalados) y tarda segundos. Cada cinco minutos era una sacudida
 * constante mientras se juega; cada cuarto de hora basta para enterarse de una
 * instalación nueva, y además se salta si hay un juego abierto.
 */
const LIBRARY_REFRESH_MS = 15 * 60_000;

let processTimer: NodeJS.Timeout | null = null;
let libraryTimer: NodeJS.Timeout | null = null;
let refreshing = false;
/** gameId → { pid, cuándo se le vio arrancar }. */
const active = new Map<GameId, { pid: number; startedAt: number }>();

/**
 * Ejecutable de cada juego, cacheado.
 *
 * Resolverlo implica `guessExe()`, que lista la carpeta del juego y mide cada
 * `.exe`. Hacerlo para toda la biblioteca **cada 2,5 segundos** era el trabajo
 * de disco más caro de la app en reposo: con treinta juegos, treinta listados
 * de carpeta y un `stat` por ejecutable, veinticuatro veces por minuto. El mapa
 * solo se rehace cuando cambia la lista de juegos.
 */
let exeIndex: { key: string; byExe: Map<string, Game> } | null = null;

function executableName(game: Game): string | null {
  const declared = getDefinition(game.id)?.exe;
  const path = game.exePath ?? declared ?? guessExe(game.installDir, game.name);
  return path ? basename(path).toLowerCase() : null;
}

function executableIndex(): Map<string, Game> {
  const games = listGames();
  const key = games.map((game) => game.id).join('|');
  if (exeIndex?.key === key) return exeIndex.byExe;

  const byExe = new Map<string, Game>();
  for (const game of games) {
    const exe = executableName(game);
    if (exe && !byExe.has(exe)) byExe.set(exe, game);
  }
  exeIndex = { key, byExe };
  return byExe;
}

function checkProcesses(): void {
  const byExe = executableIndex();

  const now = new Map<GameId, number>();
  for (const process of listProcesses()) {
    const game = byExe.get(process.name.toLowerCase());
    if (game && !now.has(game.id)) now.set(game.id, process.pid);
  }

  for (const [gameId, pid] of now) {
    if (active.has(gameId)) continue;
    const game = getGame(gameId);
    active.set(gameId, { pid, startedAt: Date.now() });
    emit('game:started', { gameId, pid });
    if (game) emit('toast', { level: 'info', message: `${game.name} se ha iniciado` });
  }

  for (const [gameId, session] of active) {
    if (now.has(gameId)) continue;
    const game = getGame(gameId);
    active.delete(gameId);
    /*
     * Aquí se apunta el tiempo de sesión. Es lo que permite decir "llevas X
     * cazando este platino" en las plataformas que no publican horas —Xbox,
     * EA, Epic—, donde Steam no puede ayudar.
     */
    const minutes = recordSession(gameId, session.startedAt, Date.now());
    emit('game:stopped', { gameId, minutes });
    if (game) {
      emit('toast', {
        level: 'info',
        message: minutes >= 1
          ? `${game.name} se ha cerrado · ${minutes} min de sesión`
          : `${game.name} se ha cerrado`,
      });
    }
  }
}

async function refreshLibrary(): Promise<void> {
  if (refreshing) return;
  // Reescanear mientras se juega roba CPU justo cuando más molesta.
  if (active.size > 0) return;
  refreshing = true;
  try {
    const games = await scan();
    emit('library:updated', games);
  } catch (error) {
    logger.warn('el reescaneo periódico falló:', error);
  } finally {
    refreshing = false;
  }
}

/** Inicia la detección automática. Es idempotente para que no cree dos timers. */
export function startActivityMonitor(): void {
  if (processTimer || libraryTimer) return;
  checkProcesses();
  processTimer = setInterval(checkProcesses, PROCESS_POLL_MS);
  libraryTimer = setInterval(() => void refreshLibrary(), LIBRARY_REFRESH_MS);
  logger.info('detección automática de juegos iniciada');
}

/** Detiene la detección al salir y limpia el estado de procesos observado. */
export function stopActivityMonitor(): void {
  if (processTimer) clearInterval(processTimer);
  if (libraryTimer) clearInterval(libraryTimer);
  processTimer = null;
  libraryTimer = null;
  exeIndex = null;
  active.clear();
}
