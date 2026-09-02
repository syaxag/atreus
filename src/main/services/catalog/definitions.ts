import { readFileSync, readdirSync, existsSync, watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';
import type { Game, GameId } from '@shared/types';
import { paths } from '../../paths';
import { log } from '../../logger';

const logger = log('catalog:defs');

/**
 * Definiciones de juego, en dos capas.
 *
 * Se leen primero las de fábrica y encima las del usuario, que **ganan** si
 * comparten `id`. Así se puede corregir o ampliar un juego que ya venía sin
 * tocar la instalación, y sin perder el cambio en la siguiente actualización.
 *
 * Las carpetas se vigilan: dejar un JSON nuevo se nota en caliente, sin
 * reiniciar la app. Ver docs/ARCHITECTURE.md.
 */

export type ModProviderSpec =
  | { kind: 'thunderstore'; community: string }
  | { kind: 'geode' }
  | { kind: 'gamebanana'; gameId: number }
  /** Mods de Minecraft, filtrados por la versión/cargador detectados localmente. */
  | { kind: 'modrinth'; game: 'minecraft' }
  /** Catálogo público y suscripciones locales; Steam conserva la instalación. */
  | { kind: 'workshop'; appId?: string };

/**
 * Un mapa interactivo declarado a mano para un juego.
 *
 * Es una **dirección**, no un dibujo: Atreus abre la web del proveedor en su
 * pestaña integrada. Solo hace falta para los juegos que MapGenie no cubre o
 * cuando se quiere apuntar a un mapa mejor que el suyo.
 */
export interface MapEntry {
  id: string;
  title: string;
  description?: string;
  /** Debe ser https. */
  url: string;
  provider?: string;
}

/** Una definición de `data/games/<id>.json`. Ver `data/games/_schema.json`. */
export interface GameDefinition {
  id: GameId;
  name: string;
  exe?: string;
  /** Solo informativo: Atreus ya no bloquea nada por ser multijugador. */
  multiplayer?: boolean;
  achievements?: { source?: 'steam' | 'none' };
  mods?: {
    root?: string;
    loader?: string;
    packaged?: string[];
    /**
     * Catálogos públicos de los que sacar los mods disponibles.
     *
     * Admite uno o varios: Balatro tiene 85 mods en Thunderstore y 148 en
     * GameBanana, y son comunidades distintas con contenido distinto.
     * Ver mods/providers.ts.
     */
    provider?: ModProviderSpec | ModProviderSpec[];
  };
  guides?: { maps?: MapEntry[] };
  notes?: string;
  /** Lo rellena el cargador: de qué capa viene. */
  origin?: 'builtin' | 'user';
}

let cache: Map<GameId, GameDefinition> | null = null;
const watchers: FSWatcher[] = [];
let onChange: (() => void) | null = null;

/** Comprobaciones mínimas antes de aceptar un JSON como definición. */
function validate(def: unknown, file: string): GameDefinition | null {
  if (typeof def !== 'object' || def === null) {
    logger.warn(`${file}: la raíz no es un objeto`);
    return null;
  }
  const d = def as Partial<GameDefinition>;

  if (typeof d.id !== 'string' || !/^(steam|epic|gog|xbox|ea|battlenet|manual):[\w.-]+$/.test(d.id)) {
    logger.warn(`${file}: "id" ausente o con formato inválido (esperado "steam:123")`);
    return null;
  }
  if (typeof d.name !== 'string' || !d.name.trim()) {
    logger.warn(`${file}: falta "name"`);
    return null;
  }

  // Un mapa sin URL https reventaría al abrirlo; se descarta ya y el resto del
  // juego sigue sirviendo.
  const maps = (d.guides?.maps ?? []).filter((map) => {
    const valid = map && typeof map.id === 'string' && typeof map.title === 'string' &&
      typeof map.url === 'string' && /^https:\/\//i.test(map.url);
    if (!valid) logger.warn(`${file}: mapa descartado por incompleto o sin URL https`);
    return valid;
  });

  return { ...(d as GameDefinition), guides: { ...d.guides, maps } };
}

function loadFrom(dir: string, origin: 'builtin' | 'user', into: Map<GameId, GameDefinition>): number {
  if (!existsSync(dir)) return 0;

  let count = 0;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json') || file.startsWith('_')) continue;
    try {
      const parsed = JSON.parse(readFileSync(join(dir, file), 'utf8')) as unknown;
      const def = validate(parsed, file);
      if (!def) continue;
      into.set(def.id, { ...def, origin });
      count++;
    } catch (e) {
      logger.warn(`${file}: JSON inválido —`, e instanceof Error ? e.message : e);
    }
  }
  return count;
}

/** Lee ambas capas. Cachea; `reloadDefinitions()` fuerza una relectura. */
export function getDefinitions(): Map<GameId, GameDefinition> {
  if (cache) return cache;
  cache = new Map();

  const builtin = loadFrom(paths.builtinGameDefs, 'builtin', cache);
  const user = loadFrom(paths.userGameDefs, 'user', cache);

  logger.info(
    `definiciones: ${cache.size} (${builtin} de fábrica, ${user} del usuario` +
    `${user > 0 ? ', las del usuario mandan' : ''})`,
  );
  return cache;
}

export function reloadDefinitions(): void {
  cache = null;
  getDefinitions();
}

export function getDefinition(id: GameId): GameDefinition | null {
  return getDefinitions().get(id) ?? null;
}

/**
 * Vigila las carpetas de definiciones y avisa cuando cambian.
 *
 * Es lo que hace que dejar un JSON nuevo aparezca sin reiniciar. Los editores
 * escriben en varios pasos, así que los avisos se agrupan con un pequeño
 * retardo para no recargar tres veces por un solo guardado.
 */
export function watchDefinitions(callback: () => void): void {
  onChange = callback;
  stopWatching();

  let timer: NodeJS.Timeout | null = null;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      logger.info('cambio detectado en las definiciones, recargando');
      reloadDefinitions();
      onChange?.();
    }, 400);
  };

  for (const dir of [paths.userGameDefs, paths.builtinGameDefs]) {
    if (!existsSync(dir)) continue;
    try {
      watchers.push(watch(dir, { persistent: false }, schedule));
    } catch (e) {
      logger.warn(`no se pudo vigilar ${dir}:`, e);
    }
  }
  logger.info(`vigilando ${watchers.length} carpeta(s) de definiciones`);
}

export function stopWatching(): void {
  for (const w of watchers) w.close();
  watchers.length = 0;
}

/**
 * Aplica al listado lo que sepa el catálogo: nombre corregido y si el juego es
 * multijugador. `hasDefinition` dice si Atreus tiene una ficha propia del
 * juego, con sus mapas o su proveedor de mods.
 */
export function applyDefinitions(games: Game[]): Game[] {
  const defs = getDefinitions();

  return games.map((g) => {
    const def = defs.get(g.id);
    return {
      ...g,
      name: def?.name ?? g.name,
      hasDefinition: def !== undefined,
      multiplayer: def?.multiplayer === true,
    };
  });
}
