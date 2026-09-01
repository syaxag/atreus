import { readFileSync, writeFileSync, renameSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { GameId, Mod, ModProfile } from '@shared/types';
import { paths } from '../../paths';
import { log } from '../../logger';

const logger = log('mods:store');

/**
 * Almacén de mods en disco.
 *
 * Cada juego tiene su carpeta bajo `%APPDATA%/Atreus/mods/<gameId>/`:
 *
 *   <modId>/        árbol extraído del archivo, tal cual
 *   index.json      metadatos de los mods instalados
 *   deployed.json   qué archivos se escribieron en el juego y qué se respaldó
 *   profiles.json   perfiles y su orden de carga
 *
 * El árbol extraído se guarda aparte del juego a propósito: el despliegue es
 * reversible porque el original nunca se pierde.
 */

export interface DeployedFile {
  /** Ruta relativa a la raíz de despliegue. */
  path: string;
  modId: string;
  /** true si había un archivo del juego ahí y se guardó una copia. */
  backedUp: boolean;
}

export interface DeployRecord {
  root: string;
  files: DeployedFile[];
  deployedAt: number;
}

const SUFFIX_BACKUP = '.atreus-backup';
export { SUFFIX_BACKUP };

export function gameDir(gameId: GameId): string {
  // El ':' del id no vale como nombre de carpeta en Windows.
  return join(paths.mods, gameId.replace(':', '.'));
}

export function modDir(gameId: GameId, modId: string): string {
  return join(gameDir(gameId), modId);
}

function file(gameId: GameId, name: string): string {
  return join(gameDir(gameId), name);
}

/** Escritura atómica: se escribe a un temporal y se renombra. */
function writeJson(path: string, value: unknown): void {
  mkdirSync(join(path, '..'), { recursive: true });
  const tmp = `${path}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
    renameSync(tmp, path);
  } catch (e) {
    logger.error(`no se pudo escribir ${path}`, e);
    throw e;
  }
}

function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

// ── Mods ──────────────────────────────────────────────────────
export function listMods(gameId: GameId): Mod[] {
  return readJson<Mod[]>(file(gameId, 'index.json'), []).sort((a, b) => a.order - b.order);
}

export function saveMods(gameId: GameId, mods: Mod[]): void {
  writeJson(file(gameId, 'index.json'), mods);
}

export function removeModFiles(gameId: GameId, modId: string): void {
  const dir = modDir(gameId, modId);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

// ── Registro de despliegue ────────────────────────────────────
export function getDeployRecord(gameId: GameId): DeployRecord | null {
  const record = readJson<DeployRecord | null>(file(gameId, 'deployed.json'), null);
  return record && Array.isArray(record.files) ? record : null;
}

export function saveDeployRecord(gameId: GameId, record: DeployRecord): void {
  writeJson(file(gameId, 'deployed.json'), record);
}

export function clearDeployRecord(gameId: GameId): void {
  const path = file(gameId, 'deployed.json');
  if (existsSync(path)) rmSync(path, { force: true });
}

// ── Perfiles ──────────────────────────────────────────────────
export function listProfiles(gameId: GameId): ModProfile[] {
  return readJson<ModProfile[]>(file(gameId, 'profiles.json'), []);
}

export function saveProfiles(gameId: GameId, profiles: ModProfile[]): void {
  writeJson(file(gameId, 'profiles.json'), profiles);
}
