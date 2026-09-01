import type { Game } from '@shared/types';
import { readFileSync, existsSync } from 'node:fs';
import { paths } from '../../paths';
import { log } from '../../logger';
import { isBlocked } from '../catalog/definitions';
import { listModules } from './win32';

const logger = log('trainer:guard');

/**
 * Barrera del motor de cheats.
 *
 * Atreus no engancha a juegos multijugador competitivos ni a procesos con
 * anti-cheat cargado. Esta comprobación **no es configurable desde la interfaz**
 * a propósito: modificar la memoria de un juego online perjudica a otros
 * jugadores. Ver docs/SCOPE.md.
 */

export interface GuardVerdict {
  allowed: boolean;
  reason: string | null;
}

let antiCheatModules: string[] | null = null;

/**
 * Módulos anti-cheat de las dos capas.
 *
 * Igual que la lista de bloqueo, las capas se **suman**: el usuario puede
 * añadir módulos, nunca quitar los de fábrica. Ver docs/SCOPE.md.
 */
function getAntiCheatModules(): string[] {
  if (antiCheatModules) return antiCheatModules;
  const merged = new Set<string>();

  for (const file of [paths.builtinBlocklist, paths.userBlocklist]) {
    if (!existsSync(file)) continue;
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as { antiCheatModules?: string[] };
      for (const module of raw.antiCheatModules ?? []) merged.add(module.toLowerCase());
    } catch (e) {
      logger.warn(`lista de módulos anti-cheat ilegible en ${file}:`, e);
    }
  }

  antiCheatModules = [...merged];
  if (antiCheatModules.length === 0) {
    logger.error('sin lista de módulos anti-cheat: la segunda barrera queda inactiva');
  }
  return antiCheatModules;
}

/** Primera barrera: por el juego, antes de tocar ningún proceso. */
export function checkGame(game: Game): GuardVerdict {
  if (game.multiplayer || isBlocked(game)) {
    return {
      allowed: false,
      reason:
        'Es un título multijugador. Modificar su memoria afectaría a otros ' +
        'jugadores, así que Atreus no engancha a estos juegos. Los logros sí ' +
        'están disponibles.',
    };
  }
  return { allowed: true, reason: null };
}

/**
 * Segunda barrera: por el proceso ya localizado.
 *
 * Aunque el juego no esté en la lista, si tiene un anti-cheat cargado se aborta.
 * Cubre el caso de un título que añade modo online en una actualización sin que
 * la lista se haya puesto al día.
 */
export function checkProcess(pid: number, gameName: string): GuardVerdict {
  const blocked = getAntiCheatModules();
  if (blocked.length === 0) return { allowed: true, reason: null };

  const loaded = listModules(pid);
  for (const module of loaded) {
    const name = module.name.toLowerCase();
    if (blocked.some((b) => name === b || name.startsWith(b.replace(/\.(dll|sys)$/, '')))) {
      logger.warn(`${gameName} (pid ${pid}): anti-cheat detectado — ${module.name}`);
      return {
        allowed: false,
        reason:
          `El proceso tiene cargado ${module.name}, un sistema anti-cheat. ` +
          'Atreus no engancha a procesos protegidos ni intenta evadirlos.',
      };
    }
  }
  return { allowed: true, reason: null };
}
