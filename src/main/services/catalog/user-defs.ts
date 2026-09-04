import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GameId } from '@shared/types';
import { paths } from '../../paths';
import { log } from '../../logger';
import { getDefinition, reloadDefinitions, type GameDefinition, type MapEntry } from './definitions';
import { getGame } from './index';

const logger = log('catalog:user-defs');

/**
 * Escritura en la **capa del usuario** de las fichas de juego.
 *
 * Siempre se escribe en `%APPDATA%/Atreus/data/games`, nunca sobre la capa de
 * fábrica: así una actualización de Atreus no se lleva por delante lo que hayas
 * añadido, y borrar el archivo devuelve el juego a como venía.
 */

/** `steam:3017860` → `steam.3017860.json`, la convención de `data/games`. */
export function userDefFile(gameId: GameId): string {
  return join(paths.userGameDefs, `${gameId.replace(':', '.')}.json`);
}

/** Lo que se guarda en disco: sin `origin`, que lo pone el cargador. */
function forDisk(definition: GameDefinition): Omit<GameDefinition, 'origin'> {
  const { origin: _origin, ...rest } = definition;
  return rest;
}

function save(gameId: GameId, definition: GameDefinition): void {
  const file = userDefFile(gameId);
  try {
    mkdirSync(paths.userGameDefs, { recursive: true });
    const temp = `${file}.tmp`;
    writeFileSync(temp, `${JSON.stringify(forDisk(definition), null, 2)}\n`, 'utf8');
    renameSync(temp, file);
  } catch (e) {
    throw new Error(`No se pudo guardar en ${file}: ${e instanceof Error ? e.message : String(e)}`);
  }
  // El vigilante de la carpeta también lo detectaría, pero con retardo: se
  // recarga ya para que la vista lo vea al volver.
  reloadDefinitions();
}

/**
 * Base sobre la que escribir: la ficha efectiva del juego si existe, y si no
 * una nueva con lo mínimo. Partir de la efectiva evita que guardar un mapa se
 * lleve por delante el proveedor de mods o el nombre corregido.
 */
function baseFor(gameId: GameId): GameDefinition {
  const existing = getDefinition(gameId);
  if (existing) return existing;
  const game = getGame(gameId);
  if (!game) throw new Error(`Juego no encontrado: ${gameId}`);
  return { id: gameId, name: game.name };
}

/** Añade un mapa a la ficha del juego. Devuelve el que se guardó. */
export function addMap(gameId: GameId, input: { title: string; url: string; description?: string }): MapEntry {
  const title = input?.title?.trim();
  const url = input?.url?.trim();
  if (!title) throw new Error('El mapa necesita un nombre');
  if (!url || !/^https:\/\//i.test(url)) throw new Error('La dirección tiene que empezar por https://');
  try {
    new URL(url);
  } catch {
    throw new Error('La dirección no es una URL válida');
  }

  const base = baseFor(gameId);
  const maps = base.guides?.maps ?? [];
  if (maps.some((map) => map.url.toLowerCase() === url.toLowerCase())) {
    throw new Error('Ese mapa ya está en la lista');
  }

  const entry: MapEntry = {
    id: `user-${Date.now().toString(36)}`,
    title: title.slice(0, 120),
    description: input.description?.trim().slice(0, 300) || 'Mapa añadido por ti.',
    url,
    provider: new URL(url).hostname.replace(/^www\./, ''),
  };

  save(gameId, { ...base, guides: { ...base.guides, maps: [...maps, entry] } });
  logger.info(`mapa "${entry.title}" añadido a ${gameId}`);
  return entry;
}

/** Quita un mapa de la ficha. Solo puede quitar los que estén en el archivo. */
export function removeMap(gameId: GameId, mapId: string): void {
  const base = baseFor(gameId);
  const maps = base.guides?.maps ?? [];
  const next = maps.filter((map) => map.id !== mapId);
  if (next.length === maps.length) {
    throw new Error('Ese mapa no está en la ficha del juego: viene de una búsqueda automática');
  }
  save(gameId, { ...base, guides: { ...base.guides, maps: next } });
  logger.info(`mapa ${mapId} quitado de ${gameId}`);
}

/** Lee la ficha del usuario tal cual está en disco, o null. */
export function readUserDefinition(gameId: GameId): GameDefinition | null {
  try {
    return JSON.parse(readFileSync(userDefFile(gameId), 'utf8')) as GameDefinition;
  } catch {
    return null;
  }
}
