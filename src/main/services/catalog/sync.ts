import {
  readFileSync, writeFileSync, copyFileSync, readdirSync, existsSync, mkdirSync, rmSync,
} from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { net } from 'electron';
import { paths } from '../../paths';
import { log } from '../../logger';
import { extract, listFiles } from '../mods/archive';
import { reloadDefinitions } from './definitions';

const logger = log('catalog:sync');

/**
 * Sincroniza las definiciones de juego desde un origen externo.
 *
 * Es el mecanismo que permite **añadir juegos y cheats sin reempaquetar**: las
 * definiciones nuevas caen en la capa del usuario y la app las recoge en
 * caliente.
 *
 * `settings.catalogSource` admite tres formas:
 *  - una **carpeta local** — se copian sus `*.json`;
 *  - una **URL a un .zip** — se descarga y se extraen los `*.json` que haya
 *    dentro, a cualquier profundidad. Sirve tal cual para un repositorio de
 *    GitHub: `.../archive/refs/heads/main.zip`;
 *  - una **URL a un .json** suelto — se guarda ese.
 */

export interface SyncResult {
  updated: number;
  total: number;
}

export interface CatalogMeta {
  source: string;
  updatedAt: number;
  count: number;
}

function readMeta(): CatalogMeta | null {
  try {
    return JSON.parse(readFileSync(paths.catalogMeta, 'utf8')) as CatalogMeta;
  } catch {
    return null;
  }
}

function writeMeta(meta: CatalogMeta): void {
  try {
    writeFileSync(paths.catalogMeta, JSON.stringify(meta, null, 2), 'utf8');
  } catch (e) {
    logger.warn('no se pudo guardar catalog.json:', e);
  }
}

/** Cuenta las definiciones de la capa del usuario. */
function countUserDefs(): number {
  try {
    return readdirSync(paths.userGameDefs)
      .filter((f) => f.endsWith('.json') && !f.startsWith('_')).length;
  } catch {
    return 0;
  }
}

/**
 * Copia un JSON a la capa del usuario si su contenido cambió.
 * Devuelve true si escribió.
 */
function adoptFile(sourcePath: string): boolean {
  const name = basename(sourcePath);
  if (!name.endsWith('.json') || name.startsWith('_')) return false;

  const target = join(paths.userGameDefs, name);
  try {
    const incoming = readFileSync(sourcePath, 'utf8');
    // Se valida antes de adoptarlo: un JSON roto en la carpeta del usuario
    // ensucia el arranque con avisos en cada carga.
    JSON.parse(incoming);

    if (existsSync(target) && readFileSync(target, 'utf8') === incoming) return false;
    mkdirSync(paths.userGameDefs, { recursive: true });
    writeFileSync(target, incoming, 'utf8');
    return true;
  } catch (e) {
    logger.warn(`${name} descartado: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

async function download(url: string, destination: string): Promise<void> {
  const response = await net.fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`HTTP ${response.status} al descargar el catálogo`);
  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(destination, buffer);
}

async function syncFromUrl(url: string): Promise<number> {
  const work = join(tmpdir(), `atreus-catalog-${Date.now().toString(36)}`);
  mkdirSync(work, { recursive: true });

  try {
    if (url.toLowerCase().endsWith('.json')) {
      const file = join(work, basename(new URL(url).pathname) || 'catalog.json');
      await download(url, file);
      return adoptFile(file) ? 1 : 0;
    }

    const archive = join(work, 'catalog.zip');
    await download(url, archive);

    const extracted = join(work, 'extracted');
    await extract(archive, extracted);

    // Los zips de GitHub cuelgan todo de una carpeta con el nombre de la rama,
    // así que se recorre en profundidad en vez de mirar solo la raíz.
    let updated = 0;
    for (const relative of listFiles(extracted)) {
      if (adoptFile(join(extracted, relative))) updated++;
    }
    return updated;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function syncFromFolder(folder: string): number {
  if (!existsSync(folder)) throw new Error(`La carpeta no existe: ${folder}`);

  // Se admite tanto la carpeta de definiciones como su padre, que es lo que
  // uno tiende a elegir en el selector.
  const candidates = [folder, join(folder, 'games'), join(folder, 'data', 'games')]
    .filter((d) => existsSync(d));

  let updated = 0;
  for (const dir of candidates) {
    for (const file of readdirSync(dir)) {
      if (adoptFile(join(dir, file))) updated++;
    }
  }
  return updated;
}

export async function sync(source: string): Promise<SyncResult> {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new Error(
      'No hay origen configurado. Indica una carpeta o una URL en Ajustes → Catálogo.',
    );
  }

  mkdirSync(paths.userGameDefs, { recursive: true });
  logger.info(`sincronizando desde ${trimmed}`);

  const updated = /^https?:\/\//i.test(trimmed)
    ? await syncFromUrl(trimmed)
    : syncFromFolder(trimmed);

  const total = countUserDefs();
  writeMeta({ source: trimmed, updatedAt: Math.floor(Date.now() / 1000), count: total });

  // Las definiciones ya en memoria se quedarían obsoletas.
  reloadDefinitions();

  logger.info(`sincronización terminada: ${updated} actualizadas, ${total} en total`);
  return { updated, total };
}

export function version(): { version: string; updatedAt: number } {
  const meta = readMeta();
  const count = countUserDefs();
  return {
    version: meta ? `${count} definiciones` : `${count} definiciones (sin sincronizar)`,
    updatedAt: meta?.updatedAt ?? 0,
  };
}
