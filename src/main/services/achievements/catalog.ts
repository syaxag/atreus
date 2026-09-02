import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { net } from 'electron';
import type { Game } from '@shared/types';
import { paths } from '../../paths';
import { log } from '../../logger';
import {
  parseAchievementStats, parseStoreSearch, pickStoreMatch, type CatalogAchievement,
} from './parse-stats';

const logger = log('achievements:catalog');

/**
 * La lista de logros de un juego, venga de donde venga tu copia.
 *
 * Steam publica, sin clave y sin exigir que poseas el juego, la lista completa
 * de logros de cualquier AppID junto con la rareza de cada uno. Y casi todo lo
 * que hay en Epic, EA o la Store de Microsoft está también en Steam.
 *
 * Así que para un juego que no es de Steam se busca su AppID por el nombre en
 * la tienda y se lee esa lista. Lo que Atreus **no** puede saber por esa vía es
 * cuáles tienes tú desbloqueados —eso lo guarda cada plataforma en su cuenta—,
 * y ahí entra el registro manual de `manual.ts`.
 */

const TIMEOUT_MS = 12_000;
const LIST_TTL_MS = 12 * 60 * 60_000;
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.7',
};

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await net.fetch(url, { headers: HEADERS, redirect: 'follow', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

// ── AppID de un juego que no es de Steam ──────────────────────

const appIdFile = join(paths.cache, 'steam-appids.json');
/** gameId → AppID, o null si se buscó y no está en Steam. */
let appIds: Record<string, string | null> | null = null;

function loadAppIds(): Record<string, string | null> {
  if (appIds) return appIds;
  try {
    const raw = JSON.parse(readFileSync(appIdFile, 'utf8')) as unknown;
    appIds = raw && typeof raw === 'object' ? (raw as Record<string, string | null>) : {};
  } catch {
    appIds = {};
  }
  return appIds;
}

function rememberAppId(gameId: string, appId: string | null): void {
  const store = loadAppIds();
  store[gameId] = appId;
  try {
    const temp = `${appIdFile}.tmp`;
    writeFileSync(temp, JSON.stringify(store, null, 2), 'utf8');
    renameSync(temp, appIdFile);
  } catch (e) {
    logger.warn('no se pudo guardar la correspondencia de AppIDs:', e);
  }
}

/**
 * AppID de Steam del juego, aunque tu copia sea de otra tienda.
 *
 * El resultado se recuerda en disco, **también cuando es negativo**: un juego
 * que no está en Steam no lo va a estar la próxima vez, y buscarlo en cada
 * visita sería una petición por juego y por sesión para nada.
 */
export async function resolveAppId(game: Game): Promise<string | null> {
  if (game.platform === 'steam') return game.nativeId;

  const cached = loadAppIds();
  if (game.id in cached) return cached[game.id] ?? null;

  try {
    const url = 'https://store.steampowered.com/api/storesearch/' +
      `?term=${encodeURIComponent(game.name)}&cc=es&l=spanish`;
    const hits = parseStoreSearch(JSON.parse(await fetchText(url)));
    const appId = pickStoreMatch(game.name, hits);
    rememberAppId(game.id, appId);
    logger.info(appId
      ? `"${game.name}" (${game.platform}) → AppID ${appId} de Steam`
      : `"${game.name}" (${game.platform}) no existe en Steam: sin lista de logros`);
    return appId;
  } catch (e) {
    // Un fallo de red no se cachea: la próxima vez puede haber conexión.
    logger.warn(`no se pudo buscar "${game.name}" en la tienda de Steam:`, e);
    return null;
  }
}

// ── Lista pública de logros ───────────────────────────────────

const lists = new Map<string, { at: number; items: CatalogAchievement[] }>();
const inflight = new Map<string, Promise<CatalogAchievement[]>>();

async function fetchList(appId: string): Promise<CatalogAchievement[]> {
  const html = await fetchText(
    `https://steamcommunity.com/stats/${encodeURIComponent(appId)}/achievements/?l=spanish`,
  );
  const items = parseAchievementStats(html);
  logger.info(`catálogo de ${appId}: ${items.length} logros`);
  return items;
}

/**
 * Lista completa de logros del AppID. Nunca lanza: si Steam no responde o el
 * juego no tiene logros, devuelve una lista vacía y quien llame lo dirá.
 */
export function achievementCatalog(appId: string): Promise<CatalogAchievement[]> {
  const cached = lists.get(appId);
  if (cached && Date.now() - cached.at < LIST_TTL_MS) return Promise.resolve(cached.items);

  const running = inflight.get(appId);
  if (running) return running;

  const promise = fetchList(appId)
    .catch((e) => {
      logger.warn(`sin catálogo de logros para ${appId}:`, e);
      return [] as CatalogAchievement[];
    })
    .then((items) => {
      lists.set(appId, { at: Date.now(), items });
      return items;
    })
    .finally(() => inflight.delete(appId));

  inflight.set(appId, promise);
  return promise;
}

/** Olvida lo cacheado. Lo usa el botón de actualizar de la ficha. */
export function forgetCatalog(appId?: string): void {
  if (appId) lists.delete(appId);
  else lists.clear();
}

/** Sólo para las pruebas y el arranque: descarta la caché de AppIDs en memoria. */
export function forgetAppIds(): void {
  appIds = null;
}

/** true si ya se ha buscado alguna vez el AppID de este juego. */
export function hasResolvedAppId(gameId: string): boolean {
  return existsSync(appIdFile) && gameId in loadAppIds();
}
