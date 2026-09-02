import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CompletionProgress, GameId } from '@shared/types';
import { paths } from '../../paths';
import { fresh, normalize } from './normalize';

/**
 * Checklist y notas por juego. Viven en `%APPDATA%/Atreus/progress/`, fuera
 * del juego y de Steam: marcar algo aquí no toca logros ni partidas.
 */

function fileFor(gameId: GameId): string {
  // El id nunca se usa como ruta: base64url evita caracteres especiales y traversal.
  return join(paths.progress, `${Buffer.from(gameId).toString('base64url')}.json`);
}

export function get(gameId: GameId): CompletionProgress {
  const file = fileFor(gameId);
  if (!existsSync(file)) return fresh(gameId);
  try {
    return normalize(gameId, JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    // Un fichero local corrupto no deja inutilizable el área de guías.
    return fresh(gameId);
  }
}

export function save(value: CompletionProgress): CompletionProgress {
  if (!value || typeof value.gameId !== 'string' || !value.gameId) {
    throw new Error('El progreso necesita el id del juego');
  }
  const result = normalize(value.gameId, value);
  result.updatedAt = Date.now();
  const file = fileFor(result.gameId);
  const temp = `${file}.tmp`;
  writeFileSync(temp, JSON.stringify(result, null, 2), 'utf8');
  renameSync(temp, file);
  return result;
}
