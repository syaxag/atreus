import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GameId } from '@shared/types';
import { paths } from '../../paths';
import { log } from '../../logger';

const logger = log('achievements:manual');

/**
 * Tu registro de logros para las plataformas que no lo publican.
 *
 * Xbox, Epic y EA guardan el estado de tus logros en su cuenta y no ofrecen
 * ninguna forma de consultarlo sin autenticarse. Atreus **no** va a pedirte la
 * contraseña de nada, así que ahí el estado lo pones tú: marcas lo que llevas y
 * la aplicación calcula el resto igual que con Steam.
 *
 * Marcar aquí no toca la plataforma. Es tu cuaderno, no un desbloqueo.
 */

const file = join(paths.root, 'manual-achievements.json');

interface Store {
  /** gameId → apiName → epoch en segundos de cuándo lo marcaste. */
  [gameId: GameId]: Record<string, number>;
}

let store: Store | null = null;

function load(): Store {
  if (store) return store;
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as unknown;
    store = raw && typeof raw === 'object' ? (raw as Store) : {};
  } catch {
    store = {};
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
    logger.warn('no se pudo guardar el registro manual de logros:', e);
  }
}

/** Lo que has marcado en ese juego: apiName → cuándo. */
export function marksFor(gameId: GameId): Record<string, number> {
  return load()[gameId] ?? {};
}

/**
 * Marca o desmarca logros. Devuelve el registro actualizado del juego.
 *
 * Se conserva la fecha de la primera vez que se marcó: es lo que hace que el
 * informe pueda decir cuánto llevas persiguiendo el platino.
 */
export function mark(
  gameId: GameId,
  patches: { apiName: string; unlocked: boolean }[],
): Record<string, number> {
  if (!gameId) throw new Error('Hace falta el id del juego');
  const all = load();
  const current = { ...(all[gameId] ?? {}) };
  const now = Math.floor(Date.now() / 1000);

  for (const patch of patches) {
    if (!patch?.apiName || typeof patch.apiName !== 'string') continue;
    if (patch.unlocked) current[patch.apiName] ??= now;
    else delete current[patch.apiName];
  }

  all[gameId] = current;
  store = all;
  persist();
  return current;
}

/** Borra el registro de un juego entero. */
export function clear(gameId: GameId): void {
  const all = load();
  delete all[gameId];
  store = all;
  persist();
}
