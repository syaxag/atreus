import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GuideDocument, GuideEntry } from '@shared/types';
import { paths } from '../../paths';
import { log } from '../../logger';

const logger = log('guides:store');

/**
 * La caché de guías, en disco.
 *
 * Antes vivía solo en memoria: cerrar Atreus y volver a abrirlo significaba
 * repetir las mismas tres búsquedas y volver a descargar la misma guía de
 * treinta mil caracteres. Guardarla en disco convierte la segunda visita en
 * instantánea y quita tráfico a Steam y a las wikis, que no nos deben nada.
 *
 * Es una caché, no un archivo: si se corrompe o se borra, la aplicación
 * simplemente vuelve a buscar.
 */

const file = join(paths.cache, 'guides.json');
/** Un documento ronda los 30 KB; con este tope la caché no pasa de unos 2 MB. */
const MAX_DOCUMENTS = 60;
const MAX_LISTS = 200;
/** Las escrituras se agrupan: leer una guía no debe costar un guardado. */
const FLUSH_DELAY_MS = 3_000;

interface Shape {
  lists: Record<string, { at: number; entries: GuideEntry[] }>;
  documents: Record<string, { at: number; document: GuideDocument }>;
}

let data: Shape | null = null;
let flushTimer: NodeJS.Timeout | null = null;

function load(): Shape {
  if (data) return data;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<Shape>;
    data = {
      lists: parsed.lists && typeof parsed.lists === 'object' ? parsed.lists : {},
      documents: parsed.documents && typeof parsed.documents === 'object' ? parsed.documents : {},
    };
  } catch {
    data = { lists: {}, documents: {} };
  }
  return data;
}

/** Deja solo lo más reciente, para que el archivo no crezca sin final. */
function prune(store: Shape): void {
  const trim = <T extends { at: number }>(record: Record<string, T>, max: number) => {
    const keys = Object.keys(record);
    if (keys.length <= max) return;
    keys
      .sort((a, b) => (record[b]?.at ?? 0) - (record[a]?.at ?? 0))
      .slice(max)
      .forEach((key) => delete record[key]);
  };
  trim(store.lists, MAX_LISTS);
  trim(store.documents, MAX_DOCUMENTS);
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const store = data;
    if (!store) return;
    prune(store);
    try {
      const temp = `${file}.tmp`;
      writeFileSync(temp, JSON.stringify(store), 'utf8');
      renameSync(temp, file);
    } catch (e) {
      logger.warn('no se pudo guardar la caché de guías:', e);
    }
  }, FLUSH_DELAY_MS);
}

/** Lista cacheada si sigue fresca; null si no hay o ya caducó. */
export function readList(key: string, ttlMs: number): GuideEntry[] | null {
  const entry = load().lists[key];
  return entry && Date.now() - entry.at < ttlMs ? entry.entries : null;
}

export function writeList(key: string, entries: GuideEntry[]): void {
  load().lists[key] = { at: Date.now(), entries };
  scheduleFlush();
}

export function readDocument(url: string, ttlMs: number): GuideDocument | null {
  const entry = load().documents[url];
  return entry && Date.now() - entry.at < ttlMs ? entry.document : null;
}

export function writeDocument(url: string, document: GuideDocument): void {
  load().documents[url] = { at: Date.now(), document };
  scheduleFlush();
}

/** Vuelca lo pendiente. Se llama al salir para no perder el último guardado. */
export function flush(): void {
  if (!flushTimer) return;
  clearTimeout(flushTimer);
  flushTimer = null;
  const store = data;
  if (!store) return;
  prune(store);
  try {
    writeFileSync(file, JSON.stringify(store), 'utf8');
  } catch (e) {
    logger.warn('no se pudo volcar la caché de guías al salir:', e);
  }
}
