import type { ContentAvailability, Game, GameId } from '@shared/types';
import { log } from '../../logger';
import { listGames } from '../catalog';
import { list as listGuides } from '../guides';
import { list as listMaps } from '../maps';
import { discover as discoverMods } from '../mods/providers';

const logger = log('content');

/** La Colección no debe volver a consultar tres catálogos al cambiar de filtro. */
const CACHE_TTL_MS = 10 * 60_000;
let cache: { at: number; items: ContentAvailability[] } | null = null;
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
    updatedAt: Date.now(),
  };
}

/**
 * Comprueba la disponibilidad real de la biblioteca. Se llama solo al usar un
 * filtro de contenido; hasta entonces Atreus no gasta red en títulos que el
 * usuario quizá nunca abra.
 */
export async function availability(): Promise<ContentAvailability[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.items;
  pending ??= pooled(listGames(), 3, inspect)
    .then((items) => {
      cache = { at: Date.now(), items };
      return items;
    })
    .finally(() => { pending = null; });
  return pending;
}

/** El escaneo puede haber cambiado la biblioteca. */
export function invalidate(gameId?: GameId): void {
  if (!cache || !gameId) { cache = null; return; }
  cache = { ...cache, items: cache.items.filter((item) => item.gameId !== gameId) };
}
