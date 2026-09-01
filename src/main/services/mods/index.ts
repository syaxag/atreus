import { dialog } from 'electron';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync } from 'node:fs';
import type { GameId, Mod, ModProfile, RemoteMod } from '@shared/types';
import { log } from '../../logger';
import { emit } from '../../ipc/emit';
import { getGame } from '../catalog';
import { getDefinition } from '../catalog/definitions';
import { extract, flattenSingleRoot, listFiles, treeSize, SUPPORTED } from './archive';
import { detectMeta, detectPackagedMeta, looksValid } from './detect';
import { deploy as deployFiles, purge as purgeFiles, findConflicts, resolveRoot, isDeployed } from './deploy';
import {
  listMods, saveMods, removeModFiles, modDir,
  listProfiles, saveProfiles,
} from './store';
import { discover as discoverRemote, download, hasProvider } from './providers';

const logger = log('mods');

/**
 * Extensiones que este juego despliega **sin extraer**.
 *
 * Algunos cargadores no quieren un árbol de archivos sino el paquete entero:
 * Geode espera `.geode` en `geode/mods`, y Unreal espera `.pak` en `~mods`.
 * Extraerlos rompería el mod.
 */
function packagedExtensions(gameId: GameId): string[] {
  const list = getDefinition(gameId)?.mods?.packaged ?? [];
  return list.map((e) => (e.startsWith('.') ? e : `.${e}`).toLowerCase());
}

function isPackaged(gameId: GameId, filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return packagedExtensions(gameId).some((ext) => lower.endsWith(ext));
}

/** Raíz de despliegue del juego, o un error explicando por qué no se puede. */
function targetRoot(gameId: GameId): { root: string } | { error: string } {
  const game = getGame(gameId);
  if (!game) return { error: `Juego no encontrado: ${gameId}` };

  const def = getDefinition(gameId);
  const root = resolveRoot(game.installDir, def?.mods?.root);
  if (!root) {
    return {
      error:
        `No se sabe dónde desplegar los mods de "${game.name}". ` +
        `Añade "mods": { "root": "..." } en data/games/${gameId.replace(':', '.')}.json.`,
    };
  }
  return { root };
}

/** Marca conflictos en la lista antes de devolverla a la interfaz. */
function withConflicts(gameId: GameId, mods: Mod[]): Mod[] {
  const active = mods.filter((m) => m.enabled);
  const conflicts = findConflicts(gameId, active);

  const byMod = new Map<string, Set<string>>();
  for (const conflict of conflicts) {
    for (const id of conflict.mods) {
      const others = conflict.mods.filter((other) => other !== id);
      byMod.set(id, new Set([...(byMod.get(id) ?? []), ...others]));
    }
  }
  return mods.map((m) => ({ ...m, conflictsWith: [...(byMod.get(m.id) ?? [])] }));
}

function publish(gameId: GameId, mods: Mod[]): Mod[] {
  const decorated = withConflicts(gameId, mods);
  emit('mods:updated', { gameId, mods: decorated });
  return decorated;
}

export function list(gameId: GameId): Mod[] {
  return withConflicts(gameId, listMods(gameId));
}

export async function install(gameId: GameId, archivePath?: string): Promise<Mod> {
  let source = archivePath;

  if (!source) {
    // El filtro incluye los formatos empaquetados del juego: sin esto, un
    // `.geode` no aparecería en el diálogo aunque el juego los admita.
    const extensions = [
      ...SUPPORTED.map((e) => e.replace('.', '')),
      ...packagedExtensions(gameId).map((e) => e.replace('.', '')),
    ];
    const picked = await dialog.showOpenDialog({
      title: 'Elige el archivo del mod',
      properties: ['openFile'],
      filters: [{ name: 'Archivos de mod', extensions }],
    });
    if (picked.canceled || !picked.filePaths[0]) throw new Error('Instalación cancelada');
    source = picked.filePaths[0];
  }

  if (!existsSync(source)) throw new Error(`No existe el archivo: ${source}`);

  const packaged = isPackaged(gameId, source);
  const lower = source.toLowerCase();
  if (!packaged && !SUPPORTED.some((ext) => lower.endsWith(ext))) {
    const extra = packagedExtensions(gameId);
    throw new Error(
      `Formato no soportado. Se admiten: ${[...SUPPORTED, ...extra].join(', ')}`,
    );
  }

  const mods = listMods(gameId);
  const modId = `m${Date.now().toString(36)}`;
  const staging = modDir(gameId, modId);

  let meta;
  if (packaged) {
    // Se guarda el paquete tal cual: el cargador del juego lo quiere entero.
    try {
      mkdirSync(staging, { recursive: true });
      copyFileSync(source, join(staging, basename(source)));
    } catch (e) {
      removeModFiles(gameId, modId);
      throw new Error(`No se pudo copiar: ${e instanceof Error ? e.message : String(e)}`);
    }
    meta = await detectPackagedMeta(source);
  } else {
    try {
      await extract(source, staging);
      flattenSingleRoot(staging);
    } catch (e) {
      removeModFiles(gameId, modId);
      throw new Error(`No se pudo extraer: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (!looksValid(staging)) {
      removeModFiles(gameId, modId);
      throw new Error('El archivo no contiene ningún archivo utilizable');
    }
    meta = detectMeta(staging, source);
  }
  const mod: Mod = {
    id: modId,
    gameId,
    name: meta.name,
    version: meta.version,
    author: meta.author,
    description: meta.description,
    status: 'staged',
    enabled: false,
    order: mods.length,
    sizeBytes: treeSize(staging),
    installedAt: Math.floor(Date.now() / 1000),
    files: listFiles(staging),
    conflictsWith: [],
    error: null,
  };

  const next = [...mods, mod];
  saveMods(gameId, next);
  publish(gameId, next);
  logger.info(`${gameId}: instalado "${mod.name}" (${mod.files.length} archivos)`);
  return withConflicts(gameId, next).find((m) => m.id === modId) ?? mod;
}

export function uninstall(gameId: GameId, modId: string): void {
  const mods = listMods(gameId);
  const mod = mods.find((m) => m.id === modId);
  if (!mod) throw new Error(`Mod no encontrado: ${modId}`);

  // Si estaba desplegado hay que retirarlo del juego antes de borrar el
  // staging, o quedarían archivos sueltos sin forma de revertirlos.
  if (mod.enabled && isDeployed(gameId)) purgeFiles(gameId);

  removeModFiles(gameId, modId);
  const next = mods.filter((m) => m.id !== modId).map((m, i) => ({ ...m, order: i }));
  saveMods(gameId, next);
  publish(gameId, next);
}

export function setEnabled(gameId: GameId, modId: string, enabled: boolean): Mod {
  const mods = listMods(gameId);
  const mod = mods.find((m) => m.id === modId);
  if (!mod) throw new Error(`Mod no encontrado: ${modId}`);
  if (mod.status === 'error') throw new Error('Este mod está en error y no se puede activar');

  const next = mods.map((m) => (m.id === modId ? { ...m, enabled } : m));
  saveMods(gameId, next);
  const published = publish(gameId, next);
  return published.find((m) => m.id === modId)!;
}

export function reorder(gameId: GameId, modIds: string[]): Mod[] {
  const mods = listMods(gameId);
  const next = mods
    .map((m) => {
      const index = modIds.indexOf(m.id);
      return { ...m, order: index >= 0 ? index : mods.length };
    })
    .sort((a, b) => a.order - b.order);

  saveMods(gameId, next);
  return publish(gameId, next);
}

export function deploy(gameId: GameId): { files: number } {
  const target = targetRoot(gameId);
  if ('error' in target) throw new Error(target.error);

  const mods = listMods(gameId);
  if (!mods.some((m) => m.enabled)) throw new Error('No hay ningún mod activo que desplegar');

  const result = deployFiles(gameId, mods, target.root);

  const next = mods.map((m) => ({
    ...m,
    status: (m.enabled ? 'deployed' : 'staged') as Mod['status'],
  }));
  saveMods(gameId, next);
  publish(gameId, next);

  if (result.conflicts.length > 0) {
    emit('toast', {
      level: 'warn',
      message:
        `${result.conflicts.length} archivo(s) en conflicto: ` +
        'ha ganado el mod que está más abajo en el orden de carga.',
    });
  }
  return { files: result.files };
}

export function purge(gameId: GameId): void {
  purgeFiles(gameId);
  const next = listMods(gameId).map((m) => ({ ...m, status: 'staged' as const }));
  saveMods(gameId, next);
  publish(gameId, next);
}

// ── Perfiles ──────────────────────────────────────────────────
export function profiles(gameId: GameId): ModProfile[] {
  return listProfiles(gameId);
}

export function saveProfile(profile: ModProfile): ModProfile {
  const all = listProfiles(profile.gameId);
  const exists = all.some((p) => p.id === profile.id);
  const next = exists
    ? all.map((p) => (p.id === profile.id ? profile : p))
    : [...all, profile];
  saveProfiles(profile.gameId, next);
  return profile;
}

/** Activa un perfil: aplica su selección de mods y su orden. */
export function activateProfile(gameId: GameId, profileId: string): void {
  const all = listProfiles(gameId);
  const profile = all.find((p) => p.id === profileId);
  if (!profile) throw new Error(`Perfil no encontrado: ${profileId}`);

  saveProfiles(gameId, all.map((p) => ({ ...p, isActive: p.id === profileId })));

  const chosen = new Set(profile.mods);
  const next = listMods(gameId)
    .map((m) => ({
      ...m,
      enabled: chosen.has(m.id),
      order: chosen.has(m.id) ? profile.mods.indexOf(m.id) : Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => a.order - b.order)
    .map((m, i) => ({ ...m, order: i }));

  saveMods(gameId, next);
  publish(gameId, next);
}

export function deleteProfile(gameId: GameId, profileId: string): void {
  saveProfiles(gameId, listProfiles(gameId).filter((p) => p.id !== profileId));
}

// ── Catálogo público ──────────────────────────────────────────
export { hasProvider };

/** Lo que hay disponible para este juego, sin instalar nada. */
export function discover(gameId: GameId): Promise<RemoteMod[]> {
  return discoverRemote(gameId);
}

/**
 * Descarga uno de los mods del catálogo y lo instala.
 *
 * El archivo baja a un temporal y se pasa por el mismo `install` de siempre,
 * así que hereda todo: la protección contra zip slip, los metadatos del
 * manifiesto y la decisión de extraer o dejar el paquete entero.
 */
export async function installRemote(gameId: GameId, mod: RemoteMod): Promise<Mod> {
  const staging = join(tmpdir(), `atreus-dl-${Date.now().toString(36)}`);
  mkdirSync(staging, { recursive: true });
  const file = join(staging, mod.fileName);

  try {
    await download(mod, file);
    const installed = await install(gameId, file);
    logger.info(`${gameId}: "${mod.name}" instalado desde ${mod.source}`);
    return installed;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
