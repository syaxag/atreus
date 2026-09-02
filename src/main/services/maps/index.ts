import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { net } from 'electron';
import type { GameId, InteractiveMap } from '@shared/types';
import { paths } from '../../paths';
import { log } from '../../logger';
import { getGame } from '../catalog';
import { getDefinition } from '../catalog/definitions';
import { searchWiki } from '../guides/wiki';
import { addMap, removeMap } from '../catalog/user-defs';
import { matchSlug, parseDirectory } from './match';

export { matchSlug, normalizeName, parseDirectory } from './match';

const logger = log('maps');

/**
 * Mapas interactivos de verdad.
 *
 * Atreus no dibuja el mapa: abre el del proveedor dentro de una pestaña
 * integrada, con sus marcadores, sus filtros y su progreso. Dibujarlo nosotros
 * era lo que había antes y por eso "no funcionaba": solo existía para los dos
 * juegos cuyo atlas alguien había escrito a mano en el catálogo.
 *
 * El directorio de MapGenie se lee de su portada una vez al día y se guarda en
 * caché. Es la lista pública de juegos con mapa, así que un juego que aparezca
 * ahí funciona sin que nadie tenga que añadirlo a Atreus.
 */

const DIRECTORY_TTL_MS = 24 * 60 * 60_000;
const TIMEOUT_MS = 12_000;
const directoryFile = join(paths.cache, 'mapgenie.json');

interface Directory {
  at: number;
  /** slug → nombre del juego tal como lo publica MapGenie. */
  games: Record<string, string>;
}

let memory: Directory | null = null;
let loading: Promise<Directory> | null = null;

function readCachedDirectory(): Directory | null {
  if (memory) return memory;
  if (!existsSync(directoryFile)) return null;
  try {
    const parsed = JSON.parse(readFileSync(directoryFile, 'utf8')) as Directory;
    if (parsed && typeof parsed.at === 'number' && parsed.games) {
      memory = parsed;
      return parsed;
    }
  } catch { /* caché ilegible: se vuelve a descargar */ }
  return null;
}

function writeCachedDirectory(directory: Directory): void {
  memory = directory;
  try {
    const temp = `${directoryFile}.tmp`;
    writeFileSync(temp, JSON.stringify(directory), 'utf8');
    renameSync(temp, directoryFile);
  } catch (e) {
    logger.warn('no se pudo guardar el directorio de mapas:', e);
  }
}

async function fetchDirectory(): Promise<Directory> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await net.fetch('https://mapgenie.io/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!response.ok) throw new Error(`MapGenie respondió HTTP ${response.status}`);
    const games = parseDirectory(await response.text());
    if (Object.keys(games).length === 0) throw new Error('la portada de MapGenie no traía ningún juego');
    const directory = { at: Date.now(), games };
    writeCachedDirectory(directory);
    logger.info(`directorio de mapas actualizado: ${Object.keys(games).length} juegos`);
    return directory;
  } finally {
    clearTimeout(timer);
  }
}

async function directory(): Promise<Directory> {
  const cached = readCachedDirectory();
  if (cached && Date.now() - cached.at < DIRECTORY_TTL_MS) return cached;
  loading ??= fetchDirectory()
    .catch((e) => {
      logger.warn('no se pudo refrescar el directorio de mapas:', e);
      // Un directorio viejo sigue siendo útil; uno vacío evita reintentos.
      return cached ?? { at: 0, games: {} };
    })
    .finally(() => { loading = null; });
  return loading;
}

// ── API ───────────────────────────────────────────────────────

/**
 * Añade un mapa a mano y devuelve la lista ya actualizada.
 *
 * Es la salida para los juegos que MapGenie no cubre y cuya wiki no tiene una
 * página decente: pegas la dirección del mapa que uses y se queda en la ficha,
 * en la capa del usuario, sobreviviendo a las actualizaciones de Atreus.
 */
export async function add(
  gameId: GameId,
  input: { title: string; url: string; description?: string },
): Promise<InteractiveMap[]> {
  addMap(gameId, input);
  return list(gameId);
}

/** Quita un mapa añadido a mano. Devuelve la lista ya actualizada. */
export async function remove(gameId: GameId, mapId: string): Promise<InteractiveMap[]> {
  removeMap(gameId, mapId);
  return list(gameId);
}

/** Mapas interactivos disponibles para el juego. Nunca lanza por la red. */
export async function list(gameId: GameId): Promise<InteractiveMap[]> {
  const game = getGame(gameId);
  if (!game) throw new Error(`Juego no encontrado: ${gameId}`);

  const out: InteractiveMap[] = [];

  // 1. Lo que declare el catálogo manda: es lo revisado a mano.
  for (const entry of getDefinition(gameId)?.guides?.maps ?? []) {
    if (!/^https:\/\//i.test(entry.url)) continue;
    out.push({
      id: entry.id,
      title: entry.title,
      description: entry.description ?? '',
      url: entry.url,
      provider: entry.provider ?? 'Catálogo de Atreus',
      // Solo se pueden quitar los que están escritos en la ficha; los que
      // vienen de una búsqueda automática no existen en ningún archivo.
      removable: true,
    });
  }

  // 2. MapGenie, emparejado por nombre contra su directorio público.
  const slug = matchSlug(game.name, (await directory()).games);
  if (slug && !out.some((map) => map.url.includes(`mapgenie.io/${slug}`))) {
    out.push({
      id: `mapgenie:${slug}`,
      title: `${game.name} · mapa interactivo`,
      description: 'Mapa completo con coleccionables, secretos y filtros por categoría. Puedes marcar lo que ya tengas.',
      url: `https://mapgenie.io/${slug}`,
      provider: 'MapGenie',
    });
  }

  /*
   * 3. La wiki del juego, como red de seguridad.
   *
   * MapGenie cubre unos doscientos juegos: para todo lo demás, la página de
   * mapas de la wiki es lo que hay, y es infinitamente mejor que un hueco
   * vacío. Solo se busca cuando no ha aparecido nada antes, para no llenar la
   * vista de enlaces de segunda cuando ya existe un mapa de verdad.
   */
  if (out.length === 0) {
    const fromWiki = (await searchWiki(game.name, 'map'))
      .filter((hit) => /\b(map|mapa|world|atlas)\b/i.test(hit.title))
      .slice(0, 3);
    for (const hit of fromWiki) {
      out.push({
        id: hit.id,
        title: `${game.name} · ${hit.title}`,
        description: hit.snippet || 'Página de mapas de la wiki del juego.',
        url: hit.url,
        provider: hit.source,
      });
    }
  }

  return out;
}
