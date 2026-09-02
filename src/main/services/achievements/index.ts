import type { Achievement, AchievementPatch, AchievementSet, GameId } from '@shared/types';
import { log } from '../../logger';
import { getGame } from '../catalog';
import { getDefinition } from '../catalog/definitions';
import * as steam from '../steam/session';
import { achievementCatalog, forgetCatalog, resolveAppId } from './catalog';
import { marksFor, mark as markManual } from './manual';

const logger = log('achievements');

/**
 * Los logros de un juego, sea de la tienda que sea.
 *
 * Hay dos caminos y la aplicación siempre dice cuál está usando:
 *
 *  - **Steam conectado** — el cliente da el estado real, con sus fechas, y
 *    Atreus puede además escribirlo.
 *  - **Todo lo demás** — la lista sale del catálogo público de Steam (que
 *    cubre casi todo lo que hay en Epic, EA o la Store) y el estado lo marcas
 *    tú. Ninguna de esas plataformas publica tus logros sin autenticarte, y
 *    Atreus no va a pedirte la contraseña de nada.
 *
 * En los dos casos el resto de la aplicación —el informe de platino, la
 * dificultad, la estimación— funciona igual, porque solo necesita la lista y
 * la rareza, y esas sí están siempre.
 */

function empty(gameId: GameId, note: string): AchievementSet {
  return { gameId, tracking: 'none', writable: false, source: '—', note, items: [] };
}

/** Convierte una entrada del catálogo público en un logro con tu estado. */
function fromCatalog(
  entry: { apiName: string; displayName: string; description: string; iconUrl: string | null; globalPercent: number | null },
  marks: Record<string, number>,
): Achievement {
  const unlockTime = marks[entry.apiName] ?? null;
  return {
    apiName: entry.apiName,
    displayName: entry.displayName,
    description: entry.description,
    iconUrl: entry.iconUrl,
    // El catálogo público solo trae una imagen por logro; no hay versión gris.
    iconGrayUrl: null,
    // Steam oculta la descripción de los logros secretos en esta página, así
    // que una descripción vacía es justamente la señal de que lo es.
    hidden: entry.description.trim().length === 0,
    unlocked: unlockTime !== null,
    unlockTime,
    protected: false,
    globalPercent: entry.globalPercent,
  };
}

export async function list(gameId: GameId): Promise<AchievementSet> {
  const game = getGame(gameId);
  if (!game) throw new Error(`Juego no encontrado: ${gameId}`);
  const definition = getDefinition(gameId);
  if (definition?.achievements?.source === 'none') {
    // Cuando el catálogo dice que un juego no tiene logros suele saber por qué
    // —Fortnite tiene pases, Minecraft avances—, y explicarlo vale más que un
    // "no hay" a secas.
    return empty(gameId, definition.notes ?? 'Este juego no publica logros.');
  }

  // ── Camino bueno: el cliente de Steam ──
  let steamProblem: string | null = null;
  if (game.platform === 'steam') {
    try {
      const items = await steam.achievements(game.nativeId);
      if (items.length > 0) {
        return {
          gameId,
          tracking: 'steam',
          writable: true,
          source: 'Cliente de Steam',
          note: null,
          items,
        };
      }
      steamProblem = 'Steam no devolvió ningún logro para este juego.';
    } catch (e) {
      steamProblem = e instanceof Error ? e.message : String(e);
      logger.info(`${game.name}: Steam no disponible (${steamProblem}), se usa el catálogo público`);
    }
  }

  // ── Camino de repuesto: el catálogo público, con tu registro ──
  const appId = await resolveAppId(game);
  if (!appId) {
    return empty(gameId, game.platform === 'steam'
      ? steamProblem ?? 'No se pudo leer la lista de logros.'
      : `${game.name} no existe en Steam, y ${platformName(game.platform)} no publica sus logros sin ` +
        'iniciar sesión. Puedes seguir usando Guías, Mapas y tu propia lista de objetivos.');
  }

  const catalog = await achievementCatalog(appId);
  if (catalog.length === 0) {
    return empty(gameId, steamProblem ?? 'Steam no publica una lista de logros para este juego.');
  }

  const marks = marksFor(gameId);
  return {
    gameId,
    tracking: 'manual',
    writable: false,
    source: `Catálogo público de Steam (AppID ${appId})`,
    note: game.platform === 'steam'
      ? `No se pudo hablar con el cliente de Steam (${steamProblem}). La lista es la real, ` +
        'pero el progreso es el que hayas marcado tú.'
      : `${platformName(game.platform)} no publica tus logros sin iniciar sesión, así que la lista ` +
        'es la de la versión de Steam y el progreso lo marcas tú.',
    items: catalog.map((entry) => fromCatalog(entry, marks)),
  };
}

/** Marca logros en el registro manual. Falla si la plataforma los da sola. */
export async function mark(gameId: GameId, patches: AchievementPatch[]): Promise<AchievementSet> {
  if (!Array.isArray(patches) || patches.length === 0) return list(gameId);
  const current = await list(gameId);
  if (current.tracking === 'steam') {
    throw new Error('Este juego lleva el progreso desde Steam: usa Guardar en Steam en vez de marcarlo a mano');
  }
  if (current.tracking === 'none') {
    throw new Error('No hay lista de logros que marcar para este juego');
  }
  markManual(gameId, patches);
  logger.info(`${gameId}: ${patches.length} logro(s) actualizados en el registro manual`);
  return list(gameId);
}

/** Olvida lo cacheado de un juego, para forzar una relectura. */
export async function refresh(gameId: GameId): Promise<void> {
  const game = getGame(gameId);
  if (!game) return;
  const appId = game.platform === 'steam' ? game.nativeId : await resolveAppId(game);
  if (appId) forgetCatalog(appId);
}

function platformName(platform: string): string {
  const names: Record<string, string> = {
    epic: 'Epic Games',
    xbox: 'Xbox',
    ea: 'EA',
    gog: 'GOG',
    battlenet: 'Battle.net',
    manual: 'un juego añadido a mano',
    steam: 'Steam',
  };
  return names[platform] ?? platform;
}
