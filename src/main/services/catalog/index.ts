import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { shell } from 'electron';
import type { Game, GameId, ScanProgress } from '@shared/types';
import { paths } from '../../paths';
import { log } from '../../logger';
import { emit } from '../../ipc/emit';
import { setCoverPaths } from '../../protocol';
import { getSettings, setSettings } from '../settings';
import { findSteamPath, scanSteam, guessExe } from './steam';
import { scanEpic, scanGog, scanXbox } from './others';
import { applyDefinitions } from './definitions';

const logger = log('catalog');

interface LibraryCache {
  games: Game[];
  /** Se guardan aparte para que sobrevivan a un reescaneo. */
  favorites: string[];
  /** Juegos añadidos a mano: el escaneo no los conoce. */
  manual: Game[];
  scannedAt: number;
}

let state: LibraryCache = { games: [], favorites: [], manual: [], scannedAt: 0 };
let loaded = false;

function persist(): void {
  const tmp = `${paths.library}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    renameSync(tmp, paths.library);
  } catch (e) {
    logger.error('no se pudo guardar library.json', e);
  }
}

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    const parsed = JSON.parse(readFileSync(paths.library, 'utf8')) as Partial<LibraryCache>;
    state = {
      games: parsed.games ?? [],
      favorites: parsed.favorites ?? [],
      manual: parsed.manual ?? [],
      scannedAt: parsed.scannedAt ?? 0,
    };
    logger.info(`caché cargada: ${state.games.length} juegos`);
  } catch {
    logger.info('sin library.json previo');
  }
}

/** Aplica favoritos y definiciones a una lista recién escaneada. */
function decorate(games: Game[]): Game[] {
  const favs = new Set(state.favorites);
  return applyDefinitions(games).map((g) => ({ ...g, favorite: favs.has(g.id) }));
}

export function listGames(): Game[] {
  load();
  return state.games;
}

/**
 * Reaplica las definiciones a la biblioteca ya escaneada.
 *
 * Se usa cuando cambian los JSON de definiciones: no hace falta volver a
 * recorrer las bibliotecas de Steam, solo recalcular `hasDefinition` y
 * `multiplayer`.
 */
export function refreshDefinitions(): Game[] {
  load();
  state.games = decorate(state.games);
  persist();
  return state.games;
}

export function getGame(id: GameId): Game | null {
  load();
  return state.games.find((g) => g.id === id) ?? null;
}

/** Escaneo completo de todas las plataformas. Emite `library:scan-progress`. */
export async function scan(): Promise<Game[]> {
  load();
  const covers = new Map<string, string>();
  let found: Game[] = [];

  const step = (phase: ScanProgress['phase'], message: string) =>
    emit('library:scan-progress', { phase, found: found.length, message });

  // ── Steam ──
  step('steam', 'Leyendo bibliotecas de Steam…');
  const steamPath = findSteamPath(getSettings().steamPath);
  if (steamPath) {
    // Guardar la ruta detectada para que Ajustes la muestre.
    if (getSettings().steamPath !== steamPath) setSettings({ steamPath });
    try {
      const result = scanSteam(steamPath);
      found = found.concat(result.games);
      for (const [id, file] of result.covers) covers.set(id, file);
    } catch (e) {
      logger.error('el escaneo de Steam falló:', e);
    }
  } else {
    logger.warn('no se encontró la instalación de Steam');
  }

  // ── Resto de plataformas: un fallo en una no detiene las demás ──
  step('epic', 'Buscando manifiestos de Epic…');
  try { found = found.concat(scanEpic()); } catch (e) { logger.error('Epic:', e); }

  step('gog', 'Consultando el registro de GOG…');
  try { found = found.concat(scanGog()); } catch (e) { logger.error('GOG:', e); }

  step('xbox', 'Enumerando paquetes de Xbox…');
  try { found = found.concat(scanXbox()); } catch (e) { logger.error('Xbox:', e); }

  // ── Consolidar ──
  step('enrich', 'Aplicando definiciones…');
  const manualIds = new Set(state.manual.map((g) => g.id));
  const merged = [...found.filter((g) => !manualIds.has(g.id)), ...state.manual];

  // Qué juegos son nuevos respecto al escaneo anterior. Se calcula antes de
  // pisar el estado, y es lo que dispara la búsqueda automática de mods.
  const known = new Set(state.games.map((g) => g.id));

  state.games = decorate(merged);
  state.scannedAt = Math.floor(Date.now() / 1000);
  setCoverPaths(covers);
  persist();

  const fresh = state.games.filter((g) => !known.has(g.id));
  if (fresh.length > 0 && known.size > 0) {
    // Solo a partir del segundo escaneo: en el primero "todo es nuevo" y
    // avisar de dieciséis juegos a la vez no le sirve a nadie.
    void announceNewGames(fresh);
  }

  emit('library:scan-progress', {
    phase: 'done',
    found: state.games.length,
    message: `${state.games.length} juegos`,
  });
  logger.info(`escaneo terminado: ${state.games.length} juegos`);
  return state.games;
}

/**
 * Mira si los juegos recién detectados tienen mods en algún catálogo público
 * y lo anuncia.
 *
 * Es lo que hace que instalar un juego y abrir Atreus baste para ver qué hay
 * disponible, sin buscarlo a mano. Va aparte del escaneo, sin bloquearlo: si un
 * catálogo está caído, el escaneo ya terminó.
 */
async function announceNewGames(fresh: Game[]): Promise<void> {
  const { hasProvider, discover } = await import('../mods/providers');
  const found: { gameId: GameId; name: string; count: number }[] = [];

  for (const game of fresh) {
    if (!hasProvider(game.id)) continue;
    try {
      const available = await discover(game.id);
      if (available.length > 0) {
        found.push({ gameId: game.id, name: game.name, count: available.length });
      }
    } catch (e) {
      logger.warn(`no se pudo consultar el catálogo de ${game.name}:`, e);
    }
  }

  if (found.length === 0) return;
  emit('mods:available', { games: found });
  emit('toast', {
    level: 'info',
    message: found.length === 1
      ? `${found[0]!.name}: ${found[0]!.count} mods disponibles`
      : `${found.length} juegos nuevos con mods disponibles`,
  });
  logger.info(`catálogo: ${found.map((f) => `${f.name} (${f.count})`).join(', ')}`);
}

/** Restablece el mapa de carátulas desde la caché, sin reescanear. */
export function rehydrateCovers(): void {
  load();
  const steamPath = findSteamPath(getSettings().steamPath);
  if (!steamPath) return;
  try {
    const { covers } = scanSteam(steamPath);
    setCoverPaths(covers);
  } catch (e) {
    logger.warn('no se pudieron rehidratar las carátulas:', e);
  }
}

export function addManual(exePath: string): Game {
  load();
  if (!existsSync(exePath)) throw new Error(`No existe el archivo: ${exePath}`);

  const name = basename(exePath).replace(/\.exe$/i, '');
  const id = `manual:${Buffer.from(exePath).toString('base64url').slice(0, 16)}`;

  if (state.games.some((g) => g.id === id)) {
    throw new Error(`"${name}" ya está en la biblioteca`);
  }

  const game: Game = {
    id,
    platform: 'manual',
    nativeId: name,
    name,
    installDir: dirname(exePath),
    exePath,
    iconUrl: null,
    headerUrl: null,
    sizeBytes: null,
    lastPlayed: null,
    hasDefinition: false,
    multiplayer: false,
    favorite: false,
  };

  state.manual.push(game);
  state.games = decorate([...state.games, game]);
  persist();
  emit('library:updated', state.games);
  return state.games.find((g) => g.id === id) ?? game;
}

export function removeGame(id: GameId): void {
  load();
  state.manual = state.manual.filter((g) => g.id !== id);
  state.games = state.games.filter((g) => g.id !== id);
  state.favorites = state.favorites.filter((f) => f !== id);
  persist();
  emit('library:updated', state.games);
}

export function setFavorite(id: GameId, favorite: boolean): void {
  load();
  const set = new Set(state.favorites);
  if (favorite) set.add(id);
  else set.delete(id);
  state.favorites = [...set];
  state.games = state.games.map((g) => (g.id === id ? { ...g, favorite } : g));
  persist();
}

/** Lanza el juego por su plataforma. Devuelve el pid cuando lo hay. */
export async function launch(id: GameId, args?: string): Promise<{ pid: number }> {
  load();
  const game = getGame(id);
  if (!game) throw new Error(`Juego no encontrado: ${id}`);

  // Steam, Epic y Xbox se lanzan por URL: así el launcher hace su trabajo
  // (DRM, overlay, sincronización de partidas) y no lo esquivamos.
  const url =
    game.platform === 'steam' ? `steam://rungameid/${game.nativeId}`
    : game.platform === 'epic' ? `com.epicgames.launcher://apps/${game.nativeId}?action=launch`
    : game.platform === 'xbox' ? `shell:appsFolder\\${game.nativeId}!App`
    : null;

  if (url) {
    await shell.openExternal(url);
    emit('game:started', { gameId: id, pid: 0 });
    return { pid: 0 };
  }

  const exe = game.exePath ?? guessExe(game.installDir, game.name);
  if (!exe) throw new Error(`No se encontró un ejecutable para "${game.name}"`);

  const child = spawn(exe, args ? args.split(' ').filter(Boolean) : [], {
    cwd: dirname(exe),
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  const pid = child.pid ?? 0;
  emit('game:started', { gameId: id, pid });
  child.on('exit', () => emit('game:stopped', { gameId: id }));
  return { pid };
}
