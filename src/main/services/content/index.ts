import type { ContentAvailability, Game, GameId } from '@shared/types';
import { log } from '../../logger';
import { listGames } from '../catalog';
import { list as listGuides } from '../guides';
import { list as listMaps } from '../maps';
import { discover as discoverMods } from '../mods/providers';

const logger = log('content');

/** La Colección no debe volver a consultar tres catálogos al cambiar de filtro. */
const CACHE_TTL_MS = 10 * 60_000;
/**
 * La caché va por juego, no en bloque.
 *
 * Con una sola marca de tiempo para toda la lista, quitar un juego la dejaba
 * «fresca» sin él: ese juego no se volvía a mirar hasta que expiraba el turno
 * entero, y mientras tanto los filtros lo trataban en silencio como si no
 * tuviera nada. Cada ficha lleva ya su `updatedAt`, así que es él quien manda.
 */
const cache = new Map<GameId, ContentAvailability>();
let pending: Promise<ContentAvailability[]> | null = null;

/** Ejecuta trabajos en paralelo sin abrir una conexión por cada juego a la vez. */
async function pooled<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const output: R[] = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      output[index] = await work(items[index]!);
    }
  });
  await Promise.all(workers);
  return output;
}

async function inspect(game: Game): Promise<ContentAvailability> {
  // Cada fuente ya contiene su propio timeout y caché. Un fallo parcial se
  // representa como cero solo para esa fuente: nunca rompe la Colección.
  const [guides, maps, mods] = await Promise.all([
    listGuides(game.id, 'platinum').catch((error: unknown) => {
      logger.warn(`${game.name}: no se pudieron consultar guías`, error);
      return [];
    }),
    listMaps(game.id).catch((error: unknown) => {
      logger.warn(`${game.name}: no se pudieron consultar mapas`, error);
      return [];
    }),
    discoverMods(game.id).catch((error: unknown) => {
      logger.warn(`${game.name}: no se pudieron consultar mods`, error);
      return [];
    }),
  ]);
  return {
    gameId: game.id,
    guides: guides.length,
    readableGuides: guides.filter((guide) => guide.readable).length,
    maps: maps.length,
    mods: mods.length,
    updatedAt: Math.floor(Date.now() / 1000),
  };
}

async function run(): Promise<ContentAvailability[]> {
  const games = listGames();
  const limite = Date.now() - CACHE_TTL_MS;

  // Solo se miran los que faltan o han caducado: cambiar de filtro con la
  // biblioteca ya comprobada no gasta una sola petición.
  const faltan = games.filter((game) => (cache.get(game.id)?.updatedAt ?? 0) * 1000 < limite);
  if (faltan.length > 0) {
    logger.info(`comprobando el contenido de ${faltan.length} de ${games.length} juegos`);
    for (const item of await pooled(faltan, 3, inspect)) cache.set(item.gameId, item);
  }

  // Un juego que ya no está en la biblioteca tampoco debe seguir aquí.
  const vivos = new Set(games.map((game) => game.id));
  for (const id of [...cache.keys()]) if (!vivos.has(id)) cache.delete(id);

  return games
    .map((game) => cache.get(game.id))
    .filter((item): item is ContentAvailability => item !== undefined);
}

/**
 * Comprueba la disponibilidad real de la biblioteca. Se llama solo al usar un
 * filtro de contenido; hasta entonces Atreus no gasta red en títulos que el
 * usuario quizá nunca abra.
 */
export async function availability(): Promise<ContentAvailability[]> {
  pending ??= run().finally(() => { pending = null; });
  return pending;
}

/** El escaneo puede haber cambiado la biblioteca. */
export function invalidate(gameId?: GameId): void {
  if (gameId) cache.delete(gameId);
  else cache.clear();
}
