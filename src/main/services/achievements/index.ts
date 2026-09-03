import type { Achievement, AchievementPatch, AchievementSet, GameId, Notice } from '@shared/types';
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

/*
 * De aquí no sale prosa.
 *
 * Lo que se le cuenta al usuario —de dónde viene la lista, por qué el progreso
 * no es automático, por qué Steam rechaza una escritura— viaja como caso y
 * datos, y la frase la escribe el renderer. Antes salía redactada de aquí y se
 * quedaba en castellano por mucho que Ajustes dijera otra cosa.
 */

function empty(gameId: GameId, note: Notice): AchievementSet {
  return { gameId, tracking: 'none', writable: false, source: { id: 'none' }, note, items: [] };
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
    return empty(gameId, definition.notes
      ? { kind: 'definition', text: definition.notes }
      : { kind: 'noAchievements' });
  }

  /*
   * ── Camino bueno: el cliente de Steam ──
   *
   * El fallo se apunta en dos piezas: que lo hubo, y el mensaje del sistema si
   * lo dio. Antes iban en una sola cadena, y para poder decir "no se pudo leer
   * la lista" sin detalle había que inventarse una frase que hiciera de aviso.
   */
  let steamFailed = false;
  let steamDetail: string | null = null;
  if (game.platform === 'steam' && !options.avoidClient) {
    try {
      const items = await steam.achievements(game.nativeId);
      if (items.length > 0) {
        const writable = await steam.canWrite(game.nativeId);
        return {
          gameId,
          tracking: 'steam',
          writable,
          source: { id: 'steam-client' },
          note: writable ? null : { kind: 'noWrite' },
          items,
        };
      }
      steamFailed = true;
    } catch (e) {
      steamFailed = true;
      steamDetail = e instanceof Error ? e.message : String(e);
      logger.info(`${game.name}: Steam no disponible (${steamDetail}), se usa el catálogo público`);
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
        source: { id: 'xbox-openxbl' },
        note: { kind: 'xboxReadOnly' },
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
        source: { id: 'steam-webapi' },
        note: options.avoidClient ? null : { kind: 'steamClosed' },
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
      ? { kind: 'unreadable', detail: steamDetail }
      : { kind: 'notOnSteam', game: game.name, platform: game.platform });
  }

  const catalog = await achievementCatalog(appId);
  if (catalog.length === 0) {
    return empty(gameId, steamFailed
      ? { kind: 'unreadable', detail: steamDetail }
      : { kind: 'noList' });
  }

  const marks = marksFor(gameId);
  return {
    gameId,
    tracking: 'manual',
    writable: false,
    source: { id: 'steam-catalog', appId },
    note: game.platform === 'steam'
      ? { kind: 'manualSteamFailed', detail: steamDetail }
      : { kind: 'manual', platform: game.platform },
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
