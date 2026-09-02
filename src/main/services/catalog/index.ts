import { readFileSync, writeFileSync, renameSync, existsSync, statSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { shell } from 'electron';
import type { Game, GameId, ScanProgress } from '@shared/types';
import { paths } from '../../paths';
import { log } from '../../logger';
import { emit } from '../../ipc/emit';
import { setCoverPaths } from '../../protocol';
import { getSettings, setSettings } from '../settings';
import { findSteamPath, scanSteam, guessExe, isSteamGameAppId } from './steam';
import { readUninstallEntries, scanBattleNet, scanEa, scanEpic, scanGog, scanXbox } from './others';
import { forgetSteamPlaytime, recordSession, steamPlaytimeIndex, trackedMinutes } from '../playtime';
import { applyDefinitions } from './definitions';
import { completeCovers, localCovers } from './covers';
import { splitArgs } from './args';

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

/**
 * Aplica favoritos, definiciones y horas jugadas a una lista recién escaneada.
 *
 * Las horas de Steam salen del `localconfig.vdf` de la cuenta local, así que no
 * cuestan una petición ni una clave de API: se pueden refrescar en cada pasada.
 */
function decorate(games: Game[]): Game[] {
  const favs = new Set(state.favorites);
  const played = steamPlaytimeIndex();
  return applyDefinitions(games).map((g) => ({
    ...g,
    favorite: favs.has(g.id),
    playtimeMinutes: g.platform === 'steam'
      ? played.get(g.nativeId) ?? g.playtimeMinutes ?? null
      : g.playtimeMinutes ?? (trackedMinutes(g.id) || null),
  }));
}

/** El caché puede venir de una versión anterior: se limpia también sin reescaneo. */
function onlyGames(games: Game[]): Game[] {
  return games.filter((game) => {
    if (game.platform === 'steam') return isSteamGameAppId(game.nativeId);
    // Minecraft Launcher es sólo el punto de entrada; Minecraft Java conserva
    // su ficha propia, detectada como paquete separado.
    if (game.platform === 'xbox' && /^Microsoft\.4297127D64EC6_/i.test(game.nativeId)) return false;
    return true;
  });
}

/**
 * Une las carátulas que ya se conocen: las que devolvió el escaneo de Steam y
 * las que estén en disco o en la caché propia para el resto de plataformas.
 */
function collectCovers(
  games: Game[],
  fromSteam: Map<string, string>,
  steamPath: string | null,
): Map<string, string> {
  const covers = localCovers(games, steamPath);
  for (const [id, file] of fromSteam) covers.set(id, file);
  setCoverPaths(covers);
  return covers;
}

/**
 * Apunta cada juego a su carátula local.
 *
 * El sello de tiempo del archivo va en la URL a propósito: sin él, una imagen
 * que llega después de pintar la biblioteca no se recargaría, porque para el
 * navegador la dirección no habría cambiado.
 */
function withCovers(games: Game[], covers: Map<string, string>): Game[] {
  return games.map((game) => {
    const file = covers.get(game.id);
    if (!file) return game;
    let stamp = 0;
    try { stamp = Math.floor(statSync(file).mtimeMs); } catch { stamp = 0; }
    return { ...game, headerUrl: `atreus://cover/${game.id.replace(':', '.')}?v=${stamp}` };
  });
}

/** Descarga en segundo plano lo que no estaba en disco y avisa si algo cambió. */
async function fillMissingCovers(steamPath: string | null): Promise<void> {
  try {
    const covers = await completeCovers(state.games, steamPath);
    if (!covers) return;
    setCoverPaths(covers);
    state.games = withCovers(state.games, covers);
    persist();
    emit('library:updated', state.games);
  } catch (e) {
    logger.warn('no se pudieron completar las carátulas:', e);
  }
}

export function listGames(): Game[] {
  load();
  const filtered = onlyGames(state.games);
  if (filtered.length !== state.games.length) {
    state.games = filtered;
    state.manual = onlyGames(state.manual);
    persist();
  }
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
  // Las horas se releen del disco en cada escaneo: si no, un juego recién
  // jugado seguiría saliendo con las de la última vez que se abrió Atreus.
  forgetSteamPlaytime();
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

  // EA App y Battle.net comparten la lista de programas instalados: se lee una
  // sola vez, que es la parte lenta (PowerShell), y se reparte entre los dos.
  step('ea', 'Consultando instalaciones de EA App…');
  const uninstall = readUninstallEntries();
  try { found = found.concat(scanEa(uninstall)); } catch (e) { logger.error('EA App:', e); }

  step('battlenet', 'Consultando instalaciones de Battle.net…');
  try { found = found.concat(scanBattleNet(uninstall)); } catch (e) { logger.error('Battle.net:', e); }

  // ── Consolidar ──
  step('enrich', 'Aplicando definiciones…');
  const manualIds = new Set(state.manual.map((g) => g.id));
  const merged = onlyGames([...found.filter((g) => !manualIds.has(g.id)), ...state.manual]);

  // Qué juegos son nuevos respecto al escaneo anterior. Se calcula antes de
  // pisar el estado, y es lo que dispara la búsqueda automática de mods.
  const known = new Set(state.games.map((g) => g.id));

  const decorated = decorate(merged);
  state.games = withCovers(decorated, collectCovers(decorated, covers, steamPath));
  state.scannedAt = Math.floor(Date.now() / 1000);
  persist();

  // Lo que falte se resuelve en segundo plano: la biblioteca ya está pintada y
  // las imágenes que lleguen después se anuncian con `library:updated`.
  void fillMissingCovers(steamPath);

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
  const { list: listGuides } = await import('../guides');
  const found: { gameId: GameId; name: string; count: number; guides: number }[] = [];

  for (const game of fresh) {
    // Se calienta también la búsqueda de guías: cuando el usuario abre el
    // juego, los resultados ya están en la caché local de Atreus.
    let guideCount = 0;
    try {
      guideCount = (await listGuides(game.id, 'platinum')).length;
    } catch (e) {
      logger.warn(`no se pudieron preparar guías para ${game.name}:`, e);
    }

    if (!hasProvider(game.id)) {
      if (guideCount > 0) found.push({ gameId: game.id, name: game.name, count: 0, guides: guideCount });
      continue;
    }
    try {
      const available = await discover(game.id);
      if (available.length > 0 || guideCount > 0) found.push({ gameId: game.id, name: game.name, count: available.length, guides: guideCount });
    } catch (e) {
      logger.warn(`no se pudo consultar el catálogo de ${game.name}:`, e);
    }
  }

  if (found.length === 0) return;
  emit('mods:available', { games: found });
  emit('toast', {
    level: 'info',
    message: found.length === 1
      ? `${found[0]!.name}: ${found[0]!.count} mods y ${found[0]!.guides} guías preparadas`
      : `${found.length} juegos nuevos con contenido preparado`,
  });
  logger.info(`catálogo: ${found.map((f) => `${f.name} (${f.count} mods, ${f.guides} guías)`).join(', ')}`);
}

/**
 * Restablece el mapa de carátulas sin reescanear las bibliotecas.
 *
 * Antes esto llamaba a `scanSteam()`, que vuelve a leer todos los `.acf` de
 * todas las bibliotecas solo para quedarse con las rutas de imagen: en el
 * arranque sin escaneo era el trabajo más caro que se hacía, y para nada.
 */
export function rehydrateCovers(): void {
  load();
  const steamPath = findSteamPath(getSettings().steamPath);
  try {
    const covers = localCovers(state.games, steamPath);
    setCoverPaths(covers);
    state.games = withCovers(state.games, covers);
    void fillMissingCovers(steamPath);
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
    playtimeMinutes: null,
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

  const child = spawn(exe, splitArgs(args), {
    cwd: dirname(exe),
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  const pid = child.pid ?? 0;
  emit('game:started', { gameId: id, pid });
  const startedAt = Date.now();
  child.on('exit', () => {
    // El monitor de actividad también vería el cierre, pero puede tardar hasta
    // dos segundos y medio; aquí se sabe en el momento exacto.
    const minutes = recordSession(id, startedAt, Date.now());
    emit('game:stopped', { gameId: id, minutes });
  });
  return { pid };
}
