import {
  readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync,
} from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { net } from 'electron';
import { paths } from '../../paths';
import { log } from '../../logger';
import { getSettings } from '../settings';
import { refreshDefinitions } from './index';
import { emit } from '../../ipc/emit';
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
  version?: string;
  publishedAt?: number;
}

interface CatalogManifest {
  schema: 'atreus.catalog/v1';
  version: string;
  publishedAt: number;
  definitions: { file: string; url: string; sha256?: string }[];
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

/**
 * Descarga con timeout.
 *
 * La sincronización corre sola en segundo plano y se reprograma sola: sin
 * cortar, un origen que acepta la conexión y no contesta nunca dejaría la
 * tarea colgada hasta cerrar la aplicación, sin ruido y sin reintento.
 */
const DOWNLOAD_TIMEOUT_MS = 30_000;

async function downloadBuffer(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await net.fetch(url, { redirect: 'follow', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} al descargar el catálogo`);
    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

async function download(url: string, destination: string): Promise<void> {
  writeFileSync(destination, await downloadBuffer(url));
}

function manifest(value: unknown): value is CatalogManifest {
  const item = value as Partial<CatalogManifest>;
  return item?.schema === 'atreus.catalog/v1' && typeof item.version === 'string' &&
    typeof item.publishedAt === 'number' && Array.isArray(item.definitions);
}

function adoptBuffer(file: string, content: Buffer, expectedHash?: string): boolean {
  const name = basename(file);
  if (!name.endsWith('.json') || name.startsWith('_')) return false;
  if (expectedHash) {
    const actual = createHash('sha256').update(content).digest('hex');
    if (actual.toLowerCase() !== expectedHash.toLowerCase()) throw new Error(`${name}: SHA-256 no coincide`);
  }
  const temp = join(tmpdir(), `atreus-definition-${Date.now().toString(36)}-${name}`);
  try { writeFileSync(temp, content); return adoptFile(temp); } finally { rmSync(temp, { force: true }); }
}

async function syncManifest(source: string, value: CatalogManifest): Promise<{ updated: number; meta: CatalogMeta }> {
  const base = new URL(source);
  let updated = 0;
  for (const definition of value.definitions) {
    if (!definition || typeof definition.file !== 'string' || typeof definition.url !== 'string') continue;
    const url = new URL(definition.url, base);
    if (url.protocol !== 'https:') throw new Error('El catálogo solo admite definiciones por HTTPS');
    if (adoptBuffer(definition.file, await downloadBuffer(url.href), definition.sha256)) updated++;
  }
  return { updated, meta: { source, updatedAt: Math.floor(Date.now() / 1000), count: countUserDefs(), version: value.version, publishedAt: value.publishedAt } };
}

async function syncFromUrl(url: string): Promise<{ updated: number; meta?: CatalogMeta }> {
  const work = join(tmpdir(), `atreus-catalog-${Date.now().toString(36)}`);
  mkdirSync(work, { recursive: true });

  try {
    if (url.toLowerCase().endsWith('.json')) {
      const file = join(work, basename(new URL(url).pathname) || 'catalog.json');
      const content = await downloadBuffer(url);
      writeFileSync(file, content);
      const parsed = JSON.parse(content.toString('utf8')) as unknown;
      if (manifest(parsed)) return syncManifest(url, parsed);
      return { updated: adoptFile(file) ? 1 : 0 };
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
    return { updated };
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

/**
 * ¿Es una dirección de red, y de las que se admiten?
 *
 * Devuelve `null` para una carpeta local —que es la otra forma válida de
 * origen— y lanza si es una URL pero no es HTTPS.
 *
 * Aceptaba `http://` y era el hueco por el que entraba todo lo demás: una
 * definición decide qué ejecutable se lanza, con qué argumentos y a qué
 * carpeta se despliegan mods. Por HTTP plano eso lo escribe cualquiera que
 * esté en medio de la conexión. El actualizador ya exigía HTTPS y el
 * manifiesto del catálogo también; faltaba el origen del propio catálogo, que
 * es justo el que trae las definiciones.
 */
export function origenRemoto(source: string): URL | null {
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(source)) return null; // una carpeta

  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new Error(`El origen no es una dirección válida: ${source}`);
  }

  if (url.protocol !== 'https:') {
    throw new Error(
      `El catálogo solo se sincroniza por HTTPS, y este origen es ${url.protocol.replace(':', '')}. ` +
      'Las definiciones deciden qué se ejecuta y dónde se escriben los mods: ' +
      'por HTTP plano las puede cambiar cualquiera que esté en medio.',
    );
  }
  return url;
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

  const remote = origenRemoto(trimmed) ? await syncFromUrl(trimmed) : null;
  const updated = remote ? remote.updated : syncFromFolder(trimmed);

  const total = countUserDefs();
  writeMeta(remote?.meta ?? { source: trimmed, updatedAt: Math.floor(Date.now() / 1000), count: total });

  // Las definiciones ya en memoria se quedarían obsoletas.
  reloadDefinitions();

  logger.info(`sincronización terminada: ${updated} actualizadas, ${total} en total`);
  return { updated, total };
}

export function version(): { version: string; updatedAt: number } {
  const meta = readMeta();
  const count = countUserDefs();
  return {
    version: meta?.version ? `catálogo ${meta.version} · ${count} definiciones` : meta ? `${count} definiciones` : `${count} definiciones (sin sincronizar)`,
    updatedAt: meta?.updatedAt ?? 0,
  };
}

const AUTO_SYNC_MS = 6 * 60 * 60_000;
let autoSyncTimer: NodeJS.Timeout | null = null;

async function automaticSync(): Promise<void> {
  const settings = getSettings();
  if (!settings.autoSyncCatalog || !settings.catalogSource.trim()) return;
  try {
    const result = await sync(settings.catalogSource);
    const games = refreshDefinitions();
    emit('library:updated', games);
    if (result.updated > 0) {
      emit('toast', {
        level: 'success',
        notice: { kind: 'catalogUpdated', definitions: result.updated },
      });
    }
  } catch (error) {
    // El contenido remoto es opcional: una red caída no debe bloquear Atreus.
    logger.warn('sincronización automática falló:', error);
  }
}

/** Sincroniza al arrancar y luego cada seis horas. Es idempotente. */
export function startAutomaticSync(): void {
  if (autoSyncTimer) return;
  void automaticSync();
  autoSyncTimer = setInterval(() => void automaticSync(), AUTO_SYNC_MS);
  logger.info('sincronización automática del catálogo iniciada');
}

export function stopAutomaticSync(): void {
  if (autoSyncTimer) clearInterval(autoSyncTimer);
  autoSyncTimer = null;
}
