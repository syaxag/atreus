import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GameId } from '@shared/types';
import { paths } from '../../paths';
import { log } from '../../logger';

const logger = log('platinum:celebrado');

/**
 * Qué platinos ya se han celebrado.
 *
 * Existe por una razón concreta: la celebración tiene que saltar cuando
 * **acabas** de conseguir un platino, no cada vez que abres la aplicación. Y la
 * primera vez que Atreus recorre tu biblioteca se encuentra con los platinos
 * que ya tenías de antes —tres, en una biblioteca normal—, que no deben
 * desfilar uno detrás de otro celebrando algo que hiciste hace meses.
 *
 * De ahí el `sembrado`: en la primera pasada se apuntan todos en silencio. A
 * partir de ahí, cualquier platino nuevo sí es noticia.
 */

const file = join(paths.root, 'platinos.json');

interface Store {
  /** true cuando ya se ha hecho el primer recorrido completo. */
  sembrado: boolean;
  /** gameId → epoch en segundos en que Atreus lo vio completo. */
  juegos: Record<GameId, number>;
}

let store: Store | null = null;

function load(): Store {
  if (store) return store;
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<Store>;
    store = {
      sembrado: raw.sembrado === true,
      juegos: raw.juegos && typeof raw.juegos === 'object' ? raw.juegos : {},
    };
  } catch {
    store = { sembrado: false, juegos: {} };
  }
  return store;
}

function persist(): void {
  if (!store) return;
  try {
    const temp = `${file}.tmp`;
    writeFileSync(temp, JSON.stringify(store, null, 2), 'utf8');
    renameSync(temp, file);
  } catch (e) {
    logger.warn('no se pudo guardar la lista de platinos:', e);
  }
}

/**
 * Apunta que un juego está al 100 %.
 *
 * Devuelve true solo si hay que celebrarlo: es nuevo y la biblioteca ya estaba
 * sembrada. Los de la primera pasada se guardan sin fiesta.
 */
export function registrar(gameId: GameId): boolean {
  const datos = load();
  if (datos.juegos[gameId]) return false;

  datos.juegos[gameId] = Math.floor(Date.now() / 1000);
  persist();

  if (!datos.sembrado) {
    logger.info(`${gameId} ya estaba al 100 % antes de esta instalación; se apunta sin celebrar`);
    return false;
  }
  logger.info(`¡platino nuevo en ${gameId}!`);
  return true;
}

/** Cierra la primera pasada: a partir de aquí los platinos nuevos se celebran. */
export function marcarSembrado(): void {
  const datos = load();
  if (datos.sembrado) return;
  datos.sembrado = true;
  persist();
  logger.info(`biblioteca sembrada con ${Object.keys(datos.juegos).length} platino(s) previos`);
}

/** true si ya se hizo el primer recorrido. */
export function estaSembrado(): boolean {
  return load().sembrado;
}

/** Olvida un juego, para poder volver a ver su celebración. */
export function olvidar(gameId: GameId): void {
  const datos = load();
  if (!(gameId in datos.juegos)) return;
  delete datos.juegos[gameId];
  persist();
}
