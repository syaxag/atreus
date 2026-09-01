import {
  linkSync, copyFileSync, mkdirSync, rmSync, rmdirSync, existsSync, renameSync, readdirSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type { GameId, Mod } from '@shared/types';
import { log } from '../../logger';
import { listFiles } from './archive';
import {
  modDir, getDeployRecord, saveDeployRecord, clearDeployRecord,
  SUFFIX_BACKUP, type DeployedFile,
} from './store';

const logger = log('mods:deploy');

/**
 * Despliegue reversible de mods al directorio del juego.
 *
 * Se usan **enlaces duros**, no copias: el archivo aparece en el juego sin
 * ocupar espacio otra vez, y borrar el enlace no toca el original del staging.
 * Si el juego está en otra unidad no se puede enlazar y se copia.
 *
 * Todo lo que se escribe queda anotado en `deployed.json`, y si se pisa un
 * archivo del juego se guarda una copia con sufijo `.atreus-backup`. Purgar
 * deshace ambas cosas, así que el juego vuelve exactamente a como estaba.
 */

/**
 * Resuelve la raíz de despliegue de la definición.
 *
 * Admite variables de entorno porque no todos los mods van al directorio del
 * juego: los de Balatro, por ejemplo, van a `%APPDATA%\Balatro\Mods`.
 */
export function resolveRoot(installDir: string | null, root: string | undefined): string | null {
  if (!root) return installDir;

  const expanded = root.replace(/%([^%]+)%/g, (_m, name: string) => process.env[name] ?? '');
  if (/^[a-zA-Z]:[\\/]/.test(expanded) || expanded.startsWith('\\\\')) return expanded;
  if (!installDir) return null;
  return join(installDir, expanded);
}

export interface Conflict {
  path: string;
  mods: string[];
}

/** Archivos que dos o más mods activos quieren escribir en el mismo sitio. */
export function findConflicts(gameId: GameId, mods: Mod[]): Conflict[] {
  const owners = new Map<string, string[]>();

  for (const mod of mods) {
    const dir = modDir(gameId, mod.id);
    if (!existsSync(dir)) continue;
    for (const relative of listFiles(dir)) {
      const key = relative.toLowerCase();
      owners.set(key, [...(owners.get(key) ?? []), mod.id]);
    }
  }

  return [...owners.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([path, list]) => ({ path, mods: list }));
}

/** Enlaza, y si no se puede (otra unidad, sistema de archivos distinto), copia. */
function linkOrCopy(from: string, to: string): void {
  try {
    linkSync(from, to);
  } catch {
    copyFileSync(from, to);
  }
}

export interface DeployResult {
  files: number;
  conflicts: Conflict[];
}

/**
 * Escribe los mods activos en la raíz de despliegue.
 *
 * Se purga antes para partir de un estado limpio: así desactivar un mod y
 * volver a desplegar retira de verdad sus archivos.
 */
export function deploy(gameId: GameId, mods: Mod[], root: string): DeployResult {
  purge(gameId);

  const active = mods.filter((m) => m.enabled && m.status !== 'error')
    .sort((a, b) => a.order - b.order);
  const conflicts = findConflicts(gameId, active);
  const written: DeployedFile[] = [];

  mkdirSync(root, { recursive: true });

  // En orden de carga: el último gana, que es lo que espera cualquiera que
  // haya ordenado su lista de mods.
  for (const mod of active) {
    const source = modDir(gameId, mod.id);
    if (!existsSync(source)) {
      logger.warn(`${mod.name}: falta su carpeta de staging, se salta`);
      continue;
    }

    for (const relative of listFiles(source)) {
      const target = join(root, relative);
      mkdirSync(dirname(target), { recursive: true });

      let backedUp = false;
      if (existsSync(target)) {
        const alreadyOurs = written.some((w) => w.path === relative);
        if (alreadyOurs) {
          // Otro mod del mismo despliegue ya lo puso: se sustituye sin respaldar.
          rmSync(target, { force: true });
        } else {
          // Archivo del juego: se aparta para poder devolverlo al purgar.
          const backup = target + SUFFIX_BACKUP;
          if (!existsSync(backup)) renameSync(target, backup);
          else rmSync(target, { force: true });
          backedUp = true;
        }
      }

      try {
        linkOrCopy(join(source, relative), target);
        const index = written.findIndex((w) => w.path === relative);
        const entry: DeployedFile = { path: relative, modId: mod.id, backedUp };
        if (index >= 0) written[index] = { ...entry, backedUp: written[index]!.backedUp };
        else written.push(entry);
      } catch (e) {
        logger.error(`no se pudo desplegar ${relative} de ${mod.name}:`, e);
      }
    }
  }

  saveDeployRecord(gameId, { root, files: written, deployedAt: Math.floor(Date.now() / 1000) });
  logger.info(`${gameId}: ${written.length} archivos desplegados en ${root}`);
  return { files: written.length, conflicts };
}

/** Deshace el despliegue: borra lo que pusimos y restaura lo que apartamos. */
export function purge(gameId: GameId): number {
  const record = getDeployRecord(gameId);
  if (!record) return 0;

  let removed = 0;
  for (const entry of record.files) {
    const target = join(record.root, entry.path);
    try {
      if (existsSync(target)) { rmSync(target, { force: true }); removed++; }
      if (entry.backedUp) {
        const backup = target + SUFFIX_BACKUP;
        if (existsSync(backup)) renameSync(backup, target);
      }
    } catch (e) {
      logger.warn(`no se pudo retirar ${entry.path}:`, e);
    }
  }

  // Las carpetas que queden vacías eran nuestras; se retiran para no dejar
  // rastro en el directorio del juego.
  removeEmptyDirs(record.root, record.files.map((f) => f.path));
  clearDeployRecord(gameId);
  logger.info(`${gameId}: ${removed} archivos retirados`);
  return removed;
}

function removeEmptyDirs(root: string, relativePaths: string[]): void {
  // De más profundo a menos, para que una carpeta padre pueda quedar vacía
  // después de haber vaciado a sus hijas.
  const dirs = [...new Set(relativePaths.map((p) => dirname(p)).filter((d) => d && d !== '.'))]
    .sort((a, b) => b.split(/[\\/]/).length - a.split(/[\\/]/).length);

  for (const relative of dirs) {
    const full = join(root, relative);
    try {
      // rmdirSync, no rmSync: `rmSync` sobre un directorio exige `recursive`,
      // y con `recursive: true` se llevaría por delante contenido que no es
      // nuestro si la carpeta dejara de estar vacía entre la comprobación y el
      // borrado.
      if (existsSync(full) && readdirSync(full).length === 0) rmdirSync(full);
    } catch {
      // Una carpeta que no se puede borrar no es motivo de fallo.
    }
  }
}

/** ¿Hay un despliegue vivo ahora mismo? */
export function isDeployed(gameId: GameId): boolean {
  return getDeployRecord(gameId) !== null;
}
