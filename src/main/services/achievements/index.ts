import type { Achievement, AchievementPatch, AchievementSet, GameId } from '@shared/types';
import { log } from '../../logger';
import { getGame } from '../catalog';
import { getDefinition } from '../catalog/definitions';
import * as steam from '../steam/session';
import * as webapi from '../steam/webapi';
import * as xbox from '../xbox';
import { achievementCatalog, forgetCatalog, resolveAppId } from './catalog';
import { marksFor, mark as markManual } from './manual';

const logger = log('achievements');

/**
 * Los logros de un juego, sea de la tienda que sea.
 *
 * Hay tres caminos, en orden de preferencia, y la aplicación siempre dice cuál
 * está usando:
 *
 *  1. **Cliente de Steam** — estado real con sus fechas, y Atreus puede además
 *     escribirlo. Cuesta un proceso hijo por juego.
 *  2. **Steam Web API** — estado igual de real, en una petición HTTP, si el
 *     usuario ha puesto su clave en Ajustes. No permite escribir, pero es lo
 *     bastante barato como para recorrer la biblioteca entera.
 *  3. **OpenXBL** — para los juegos de Xbox, si el usuario ha generado su
 *     clave. Estado real, con fechas y con la rareza que publica Xbox.
 *  4. **Catálogo público de Steam** — la lista sí (cubre casi todo lo que hay
 *     en Epic, EA o la Store), el estado lo marcas tú. Ninguna de esas
 *     plataformas publica tus logros sin autenticarte, y Atreus no va a
 *     pedirte la contraseña de nada.
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

export interface ListOptions {
  /**
   * No arrancar el cliente de Steam aunque se pueda.
   *
   * Lo usa el calentamiento de la biblioteca: recorrer trece juegos abriendo un
   * proceso hijo por cada uno es justo lo que no debe pasar en segundo plano.
   */
  avoidClient?: boolean;
}

export async function list(gameId: GameId, options: ListOptions = {}): Promise<AchievementSet> {
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
  if (game.platform === 'steam' && !options.avoidClient) {
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

  // ── Xbox: OpenXBL, si el usuario ha generado su clave ──
  if (game.platform === 'xbox') {
    const fromXbox = await xbox.achievementsFor(game.name);
    if (fromXbox && fromXbox.length > 0) {
      return {
        gameId,
        tracking: 'steam',
        // Xbox Live no acepta escrituras de terceros: se lee, no se toca.
        writable: false,
        source: 'Xbox Live · OpenXBL',
        note: 'Estos son tus logros reales de Xbox, con sus fechas. Xbox no permite ' +
          'desbloquearlos desde fuera del juego: no existe ninguna API para eso, ni oficial ' +
          'ni de terceros, así que aquí solo se leen.',
        items: fromXbox,
      };
    }
  }

  // ── Segundo camino: la Web API, si hay clave ──
  const appId = await resolveAppId(game);
  if (appId && game.platform === 'steam') {
    const fromApi = await webapi.playerAchievements(appId);
    if (fromApi && fromApi.length > 0) {
      /*
       * La Web API no manda iconos ni rareza. El catálogo público sí, y ya está
       * cacheado casi siempre, así que se cruzan por el nombre visible: es lo
       * único que comparten, porque los identificadores de uno y otro no son
       * los mismos.
       */
      const art = new Map(
        (await achievementCatalog(appId)).map((entry) => [entry.displayName.toLowerCase(), entry]),
      );
      return {
        gameId,
        tracking: 'steam',
        writable: false,
        source: 'Steam Web API',
        note: options.avoidClient
          ? null
          : 'Steam no está abierto, así que el progreso viene de la Web API. Es el real, pero para ' +
            'escribir logros hace falta el cliente.',
        items: fromApi.map((item) => {
          const extra = art.get(item.displayName.toLowerCase());
          return extra
            ? { ...item, iconUrl: extra.iconUrl, globalPercent: extra.globalPercent }
            : item;
        }),
      };
    }
  }

  // ── Último camino: el catálogo público, con tu registro ──
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
      : manualNote(game.platform),
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
  if (appId) {
    forgetCatalog(appId);
    webapi.forgetPlayerAchievements(appId);
  }
}

/**
 * Por qué el progreso lo pone el usuario, dicho de forma que se pueda actuar.
 *
 * En Xbox hay salida —una clave de OpenXBL— y merece la pena decirlo aquí, que
 * es donde el usuario se está encontrando el problema, y no escondido en
 * Ajustes.
 */
function manualNote(platform: string): string {
  const base = `${platformName(platform)} no publica tus logros sin iniciar sesión, así que la lista ` +
    'es la de la versión de Steam y el progreso lo marcas tú.';
  return platform === 'xbox'
    ? `${base} Si quieres que se lean solos, genera una clave de OpenXBL y pégala en Ajustes.`
    : base;
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
