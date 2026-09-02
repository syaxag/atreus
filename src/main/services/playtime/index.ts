import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GameId } from '@shared/types';
import { paths } from '../../paths';
import { log } from '../../logger';
import { findSteamPath } from '../catalog/steam';
import { dig, parseVdf, type VdfObject } from '../catalog/vdf';
import { getSettings } from '../settings';

const logger = log('playtime');

/**
 * Cuánto tiempo llevas jugando, y cuánto llevas persiguiendo el platino.
 *
 * Dos fuentes, ninguna de ellas obligatoria:
 *
 *  - **Steam local** — `userdata/<cuenta>/config/localconfig.vdf` guarda los
 *    minutos jugados de cada AppID. Es el dato oficial de Steam y está en el
 *    disco, así que no hace falta clave de API ni conexión.
 *  - **Sesiones de Atreus** — el monitor de actividad apunta cuánto rato ha
 *    estado abierto cada juego. Sirve para las plataformas que no publican
 *    horas (Xbox, EA, Epic) y para saber cuánto llevas *desde que empezaste a
 *    cazar el platino*, que no es lo mismo que las horas totales.
 */

const CACHE_TTL_MS = 60_000;

let steamCache: { at: number; byAppId: Map<string, number> } | null = null;

/** Recorre las cuentas locales y se queda con el mayor tiempo de cada juego. */
function readSteamPlaytime(): Map<string, number> {
  const byAppId = new Map<string, number>();
  const steamPath = findSteamPath(getSettings().steamPath);
  if (!steamPath) return byAppId;

  const userdata = join(steamPath, 'userdata');
  if (!existsSync(userdata)) return byAppId;

  let accounts: string[];
  try {
    accounts = readdirSync(userdata);
  } catch (e) {
    logger.warn('no se pudo listar userdata:', e);
    return byAppId;
  }

  for (const account of accounts) {
    const file = join(userdata, account, 'config', 'localconfig.vdf');
    if (!existsSync(file)) continue;
    try {
      const parsed = parseVdf(readFileSync(file, 'utf8'));
      const apps = dig(parsed, 'UserLocalConfigStore', 'Software', 'Valve', 'Steam', 'apps');
      if (!apps || typeof apps === 'string') continue;
      for (const [appId, entry] of Object.entries(apps as VdfObject)) {
        if (!entry || typeof entry === 'string') continue;
        // Steam guarda los minutos como cadena. `Playtime` es el total y
        // `PlaytimeDisconnected` lo jugado sin conexión, que no está incluido.
        const minutes = Number(entry['Playtime'] ?? 0) + Number(entry['PlaytimeDisconnected'] ?? 0);
        if (!Number.isFinite(minutes) || minutes <= 0) continue;
        // Varias cuentas en el mismo PC: manda la que más ha jugado.
        if ((byAppId.get(appId) ?? 0) < minutes) byAppId.set(appId, minutes);
      }
    } catch (e) {
      logger.warn(`localconfig.vdf de ${account} ilegible:`, e);
    }
  }
  return byAppId;
}

/** Minutos jugados en Steam para un AppID, o null si Steam no lo sabe. */
export function steamMinutes(appId: string): number | null {
  if (!steamCache || Date.now() - steamCache.at > CACHE_TTL_MS) {
    steamCache = { at: Date.now(), byAppId: readSteamPlaytime() };
  }
  return steamCache.byAppId.get(appId) ?? null;
}

/** Mapa completo AppID → minutos. Lo usa el escaneo de la biblioteca. */
export function steamPlaytimeIndex(): Map<string, number> {
  if (!steamCache || Date.now() - steamCache.at > CACHE_TTL_MS) {
    steamCache = { at: Date.now(), byAppId: readSteamPlaytime() };
  }
  return steamCache.byAppId;
}

export function forgetSteamPlaytime(): void {
  steamCache = null;
}

// ── Sesiones observadas por Atreus ────────────────────────────

interface SessionRecord {
  /** Minutos acumulados que Atreus ha visto el juego abierto. */
  minutes: number;
  /** Epoch ms de la última vez que se le vio. */
  lastSeen: number;
  /** Epoch ms de la primera sesión registrada. */
  since: number;
}

let sessions: Record<GameId, SessionRecord> | null = null;

function loadSessions(): Record<GameId, SessionRecord> {
  if (sessions) return sessions;
  try {
    const raw = JSON.parse(readFileSync(paths.sessions, 'utf8')) as unknown;
    sessions = raw && typeof raw === 'object' ? (raw as Record<GameId, SessionRecord>) : {};
  } catch {
    sessions = {};
  }
  return sessions;
}

function persist(): void {
  if (!sessions) return;
  try {
    const temp = `${paths.sessions}.tmp`;
    writeFileSync(temp, JSON.stringify(sessions, null, 2), 'utf8');
    renameSync(temp, paths.sessions);
  } catch (e) {
    logger.warn('no se pudo guardar el registro de sesiones:', e);
  }
}

/** Suma una sesión terminada. Devuelve los minutos que duró. */
export function recordSession(gameId: GameId, startedAt: number, endedAt: number): number {
  const minutes = Math.max(0, Math.round((endedAt - startedAt) / 60_000));
  if (minutes === 0) return 0;
  const store = loadSessions();
  const current = store[gameId];
  store[gameId] = {
    minutes: (current?.minutes ?? 0) + minutes,
    lastSeen: endedAt,
    since: current?.since ?? startedAt,
  };
  persist();
  return minutes;
}

/** Minutos que Atreus ha visto ese juego abierto. */
export function trackedMinutes(gameId: GameId): number {
  return loadSessions()[gameId]?.minutes ?? 0;
}

/** Epoch ms de la primera sesión observada, o null. */
export function trackingSince(gameId: GameId): number | null {
  return loadSessions()[gameId]?.since ?? null;
}
