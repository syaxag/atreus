import { readFileSync, readdirSync, existsSync, watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';
import type { CheatDef, Game, GameId } from '@shared/types';
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

/** Una definición de `data/games/<id>.json`. Ver `data/games/_schema.json`. */
export interface GameDefinition {
  id: GameId;
  name: string;
  exe?: string;
  multiplayer?: boolean;
  achievements?: { source?: 'steam' | 'none' };
  cheats?: CheatDef[];
  mods?: {
    root?: string;
    loader?: string;
    packaged?: string[];
    /** Catálogo público del que sacar los mods disponibles. Ver mods/providers.ts. */
    provider?: { kind: 'thunderstore'; community: string } | { kind: 'geode' };
  };
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

  if (typeof d.id !== 'string' || !/^(steam|epic|gog|xbox|manual):[\w.-]+$/.test(d.id)) {
    logger.warn(`${file}: "id" ausente o con formato inválido (esperado "steam:123")`);
    return null;
  }
  if (typeof d.name !== 'string' || !d.name.trim()) {
    logger.warn(`${file}: falta "name"`);
    return null;
  }
  if (d.cheats !== undefined && !Array.isArray(d.cheats)) {
    logger.warn(`${file}: "cheats" debe ser una lista`);
    return null;
  }

  // Un cheat sin `resolve` o sin `write` reventaría más tarde y lejos de aquí,
  // así que se descarta ya, dejando el resto del juego utilizable.
  const cheats = (d.cheats ?? []).filter((c) => {
    const ok = c && typeof c.id === 'string' && c.resolve && c.write;
    if (!ok) logger.warn(`${file}: cheat descartado por incompleto`);
    return ok;
  });

  return { ...(d as GameDefinition), cheats };
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
  blockedCache = null;
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
 * Marca en cada juego si tiene definición y si es multijugador.
 *
 * `hasDefinition` solo es true si el juego trae cheats **utilizables**: una
 * definición de plantilla, con patrones sin resolver, no debe anunciarse en la
 * biblioteca como si funcionara.
 */
export function applyDefinitions(games: Game[]): Game[] {
  const defs = getDefinitions();

  return games.map((g) => {
    const def = defs.get(g.id);
    const multiplayer = def?.multiplayer === true || isBlocked(g);

    return {
      ...g,
      name: def?.name ?? g.name,
      hasDefinition: (def?.cheats ?? []).some(isUsableCheat),
      multiplayer,
    };
  });
}

/**
 * Un cheat cuya resolución es un patrón de relleno (todo ceros o todo
 * comodines) no puede funcionar: es una plantilla a medio rellenar.
 */
function isUsableCheat(cheat: CheatDef): boolean {
  if (cheat.resolve.kind !== 'aob') return true;
  const tokens = cheat.resolve.pattern.trim().split(/\s+/);
  const fixed = tokens.filter((t) => t !== '??' && t !== '?');
  return fixed.length > 0 && fixed.some((t) => t !== '00');
}

// ── Lista de bloqueo ──────────────────────────────────────────
interface Blocklist {
  appIds: Set<string>;
  names: string[];
}

let blockedCache: Blocklist | null = null;

/** Normaliza para comparar: minúsculas, sin acentos ni símbolos. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function mergeBlocklist(file: string, into: Blocklist): boolean {
  if (!existsSync(file)) return false;
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as {
      appIds?: Record<string, string>;
      names?: string[];
    };
    for (const id of Object.keys(raw.appIds ?? {})) into.appIds.add(id);
    for (const name of raw.names ?? []) {
      const n = normalize(name);
      if (n) into.names.push(n);
    }
    return true;
  } catch (e) {
    logger.warn(`lista de bloqueo ilegible en ${file}:`, e);
    return false;
  }
}

/**
 * Lista de bloqueo del trainer. Ver docs/SCOPE.md.
 *
 * Las dos capas se **suman**: el usuario puede añadir títulos, nunca quitar los
 * de fábrica. Es la única parte del contenido que no se puede sobrescribir, y a
 * propósito: es una barrera de alcance, no una preferencia.
 */
export function getBlocklist(): Blocklist {
  if (blockedCache) return blockedCache;
  blockedCache = { appIds: new Set(), names: [] };

  const builtin = mergeBlocklist(paths.builtinBlocklist, blockedCache);
  const user = mergeBlocklist(paths.userBlocklist, blockedCache);

  if (!builtin) {
    // Sin la lista de fábrica la barrera por nombre se quedaría vacía y
    // títulos como Fortnite dejarían de estar cubiertos: hay que enterarse.
    logger.error(
      `NO se encontró la lista de bloqueo de fábrica en ${paths.builtinBlocklist}. ` +
      'La protección por nombre queda reducida.',
    );
  }
  logger.info(
    `lista de bloqueo: ${blockedCache.appIds.size} AppIDs y ${blockedCache.names.length} nombres` +
    `${user ? ' (incluye añadidos del usuario)' : ''}`,
  );
  return blockedCache;
}

/**
 * Decide si un juego queda fuera del motor de cheats.
 *
 * Steam se cruza por AppID, que es exacto. El resto de plataformas no tienen un
 * identificador estable compartido, así que se cruza por nombre normalizado: es
 * más tosco, pero prefiero un falso positivo (un juego single-player bloqueado
 * de más) que un falso negativo en un título competitivo.
 */
export function isBlocked(game: Game): boolean {
  const list = getBlocklist();
  if (game.platform === 'steam' && list.appIds.has(game.nativeId)) return true;
  const name = normalize(game.name);
  return list.names.some((blocked) => name.includes(blocked));
}
