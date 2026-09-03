import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { net } from 'electron';
import type { Game, GameId } from '@shared/types';
import { paths } from '../../paths';
import { log } from '../../logger';
import { localSteamCover, localXboxCover } from './artwork';

const logger = log('catalog:covers');

export { localSteamCover, localXboxCover } from './artwork';

/**
 * Resolución de carátulas, para **todas** las plataformas.
 *
 * Antes solo Steam tenía imagen, y encima mal: se buscaba
 * `librarycache/<appid>/library_header.jpg`, pero desde 2024 el cliente guarda
 * cada imagen en una subcarpeta con hash
 * (`librarycache/<appid>/<sha1>/library_header.jpg`). El resultado era que
 * *ninguna* carátula salía del disco y todas dependían de la CDN, y los juegos
 * de Epic, GOG, Xbox, EA y Battle.net se quedaban con un cuadro vacío.
 *
 * Aquí se resuelve en tres pasos, del más barato al más caro:
 *
 *  1. **Disco.** La caché de Steam para los juegos de Steam; el logo declarado
 *     en `MicrosoftGame.config` para los de Xbox.
 *  2. **Caché propia.** `%APPDATA%/Atreus/cache/covers`, que sobrevive a
 *     reinicios y hace que la biblioteca se pinte sin red.
 *  3. **Red, una sola vez por juego.** La CDN de Steam por AppID, y para lo que
 *     no es de Steam, la búsqueda pública de la tienda por nombre.
 *
 * Todo termina en un archivo local servido por `atreus://cover/...`, así que la
 * interfaz nunca depende de la CSP ni de que haya conexión.
 */

const CACHE_DIR = join(paths.cache, 'covers');
const INDEX_FILE = join(CACHE_DIR, 'index.json');
const USER_AGENT = 'Atreus/0.1 (launcher personal)';
const TIMEOUT_MS = 15_000;
/** Un juego que no tuvo carátula no se vuelve a buscar hasta pasada una semana. */
const MISS_TTL_MS = 7 * 24 * 60 * 60_000;

interface IndexEntry {
  /** Nombre del archivo dentro de CACHE_DIR, o null si no se encontró nada. */
  file: string | null;
  /** De dónde salió, para poder diagnosticar. */
  source: string;
  at: number;
  /**
   * El póster vertical 2:3, que es con lo que se pinta la Colección.
   *
   * Va aparte del banner apaisado porque los dos hacen falta: el póster para
   * la parrilla, que así se lee como una estantería de juegos y no como una
   * tabla de miniaturas, y el banner para la cabecera de la ficha, donde una
   * imagen vertical no cabe. `null` = comprobado y no lo hay.
   */
  poster?: string | null;
}

let index: Record<string, IndexEntry> | null = null;

function loadIndex(): Record<string, IndexEntry> {
  if (index) return index;
  try {
    index = JSON.parse(readFileSync(INDEX_FILE, 'utf8')) as Record<string, IndexEntry>;
  } catch {
    index = {};
  }
  return index;
}

function saveIndex(): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    const tmp = `${INDEX_FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify(index ?? {}, null, 2), 'utf8');
    renameSync(tmp, INDEX_FILE);
  } catch (e) {
    logger.warn('no se pudo guardar el índice de carátulas:', e);
  }
}

/** `steam:3017860` → `steam_3017860`, apto como nombre de archivo. */
function safeName(gameId: GameId): string {
  return gameId.replace(/[^A-Za-z0-9._-]/g, '_');
}

// ── 2 y 3. Caché propia y red ─────────────────────────────────

async function fetchBinary(url: string): Promise<Buffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await net.fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    // Una respuesta minúscula suele ser una página de error, no una imagen.
    return buffer.length > 1024 ? buffer : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface StoreSearchItem {
  id: number;
  name: string;
  type?: string;
}

/**
 * Busca el AppID de Steam de un juego por su nombre.
 *
 * Muchos títulos de Epic, GOG, EA o Battle.net están también en Steam, y su
 * carátula es la misma obra. Se usa el buscador público de la tienda, que no
 * necesita clave, y solo se acepta una coincidencia razonablemente exacta para
 * no colgarle a un juego la portada de otro.
 */
async function steamAppIdByName(name: string): Promise<string | null> {
  const term = name.replace(/[™®©]/g, '').trim();
  if (!term) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await net.fetch(
      `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&cc=us&l=en`,
      { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: controller.signal },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as { items?: StoreSearchItem[] };
    const wanted = normalize(term);
    for (const item of body.items ?? []) {
      if (item.type && item.type !== 'app') continue;
      const candidate = normalize(item.name);
      // Exacta, o una de las dos contiene a la otra: cubre "Titanfall® 2" o
      // "Halo: The Master Chief Collection" frente a la variante del launcher.
      if (candidate === wanted || candidate.includes(wanted) || wanted.includes(candidate)) {
        return String(item.id);
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * El póster vertical de la biblioteca de Steam.
 *
 * Comprobado sobre la biblioteca de prueba: lo tienen cuatro de seis juegos.
 * Los que no son estrenos muy recientes cuyo arte aún no está en el CDN; para
 * esos la parrilla recorta el banner, que es peor pero no es un hueco.
 */
function steamPosterUrls(appId: string): string[] {
  return [
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900_2x.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`,
  ];
}

function steamHeaderUrls(appId: string): string[] {
  return [
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`,
    `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/capsule_616x353.jpg`,
  ];
}

/** Guarda un buffer en la caché y devuelve la ruta del archivo escrito. */
function store(gameId: GameId, buffer: Buffer, sufijo = ''): string {
  mkdirSync(CACHE_DIR, { recursive: true });
  const file = join(CACHE_DIR, `${safeName(gameId)}${sufijo}.jpg`);
  writeFileSync(file, buffer);
  return file;
}

/** Baja el póster vertical, si Steam lo publica para ese juego. */
async function downloadPoster(game: Game): Promise<string | null> {
  const appId = game.platform === 'steam' ? game.nativeId : await steamAppIdByName(game.name);
  if (!appId) return null;
  for (const url of steamPosterUrls(appId)) {
    const buffer = await fetchBinary(url);
    if (buffer) return store(game.id, buffer, '-p');
  }
  return null;
}

/** Descarga la carátula de un juego, si hay alguna forma de encontrarla. */
async function downloadCover(game: Game): Promise<{ file: string; source: string } | null> {
  const appId = game.platform === 'steam' ? game.nativeId : await steamAppIdByName(game.name);
  if (!appId) return null;

  for (const url of steamHeaderUrls(appId)) {
    const buffer = await fetchBinary(url);
    if (buffer) {
      return {
        file: store(game.id, buffer),
        source: game.platform === 'steam' ? 'cdn' : `cdn:${appId}`,
      };
    }
  }
  return null;
}

// ── API pública ───────────────────────────────────────────────

/**
 * Rutas locales de carátula que se pueden resolver **sin red ni espera**.
 *
 * Es lo que se usa al arrancar y justo después de un escaneo, para que la
 * biblioteca aparezca pintada de inmediato.
 */
export function localCovers(games: Game[], steamPath: string | null): Map<GameId, string> {
  const out = new Map<GameId, string>();
  const cached = loadIndex();

  for (const game of games) {
    if (game.platform === 'steam' && steamPath) {
      const local = localSteamCover(steamPath, game.nativeId);
      if (local) { out.set(game.id, local); continue; }
    }
    if (game.platform === 'xbox') {
      const local = localXboxCover(game.installDir);
      if (local) { out.set(game.id, local); continue; }
    }
    const entry = cached[game.id];
    if (entry?.file) {
      const file = join(CACHE_DIR, entry.file);
      if (existsSync(file)) out.set(game.id, file);
    }
  }
  return out;
}

/** Pósters ya cacheados, sin red ni espera. Mismo papel que `localCovers`. */
export function localPosters(games: Game[]): Map<GameId, string> {
  const out = new Map<GameId, string>();
  const cached = loadIndex();
  for (const game of games) {
    const nombre = cached[game.id]?.poster;
    if (!nombre) continue;
    const file = join(CACHE_DIR, nombre);
    if (existsSync(file)) out.set(game.id, file);
  }
  return out;
}

/**
 * Completa las carátulas que faltan bajando lo necesario, una vez por juego.
 *
 * Se llama en segundo plano después del escaneo: la biblioteca ya está en
 * pantalla y las imágenes que falten aparecen cuando llegan. Devuelve el mapa
 * completo solo si algo cambió, para no repintar sin motivo.
 */
export async function completeCovers(
  games: Game[],
  steamPath: string | null,
): Promise<Map<GameId, string> | null> {
  const covers = localCovers(games, steamPath);
  const cached = loadIndex();
  const now = Date.now();
  let changed = false;

  for (const game of games) {
    if (covers.has(game.id)) continue;
    const previous = cached[game.id];
    // Un fallo reciente no se reintenta: si un juego no está en la tienda de
    // Steam, preguntar en cada arranque solo gasta red.
    if (previous && !previous.file && now - previous.at < MISS_TTL_MS) continue;

    try {
      const found = await downloadCover(game);
      if (found) {
        cached[game.id] = { file: `${safeName(game.id)}.jpg`, source: found.source, at: now };
        covers.set(game.id, found.file);
      } else {
        cached[game.id] = { file: null, source: 'sin resultados', at: now };
      }
      changed = true;
    } catch (e) {
      logger.warn(`no se pudo resolver la carátula de ${game.name}:`, e);
    }
  }

  // Los pósters van en su propia pasada: un juego puede tener banner y no
  // póster, y al revés, y no queremos que un fallo de uno tape al otro.
  for (const game of games) {
    const previous = cached[game.id];
    if (previous && previous.poster !== undefined && (previous.poster || now - previous.at < MISS_TTL_MS)) continue;
    try {
      const file = await downloadPoster(game);
      cached[game.id] = {
        ...(previous ?? { file: null, source: 'solo póster', at: now }),
        poster: file ? `${safeName(game.id)}-p.jpg` : null,
        at: now,
      };
      changed = true;
    } catch (e) {
      logger.warn(`no se pudo resolver el póster de ${game.name}:`, e);
    }
  }

  if (changed) {
    saveIndex();
    const resolved = games.filter((g) => covers.has(g.id)).length;
    const posters = games.filter((g) => cached[g.id]?.poster).length;
    logger.info(`carátulas: ${resolved}/${games.length} resueltas, ${posters} con póster vertical`);
    return covers;
  }
  return null;
}

/** Borra las imágenes cacheadas de juegos que ya no están en la biblioteca. */
export function pruneCovers(games: Game[]): void {
  const alive = new Set(games.flatMap((g) => [`${safeName(g.id)}.jpg`, `${safeName(g.id)}-p.jpg`]));
  const cached = loadIndex();
  let removed = 0;

  for (const key of Object.keys(cached)) {
    if (games.some((g) => g.id === key)) continue;
    delete cached[key];
    removed++;
  }

  try {
    for (const file of readdirSync(CACHE_DIR)) {
      if (file === 'index.json' || alive.has(file)) continue;
      const full = join(CACHE_DIR, file);
      if (statSync(full).isFile()) {
        writeFileSync(full, Buffer.alloc(0));
      }
    }
  } catch {
    // La caché puede no existir todavía; no es un fallo.
  }
  if (removed > 0) saveIndex();
}
