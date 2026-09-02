import { net } from 'electron';
import type { GuideDocument, GuideEntry, GuideSection } from '@shared/types';
import { log } from '../../logger';
import { richText, text } from './parse-steam';
import { hostCandidates, slug } from './wiki-host';

export { hostCandidates } from './wiki-host';

const logger = log('guides:wiki');

/**
 * Wikis de juego servidas por MediaWiki (Fandom, wiki.gg).
 *
 * Es la segunda fuente de la que Atreus sabe sacar texto completo, y la única
 * que sirve para los juegos que no están en Steam: Minecraft de la Store, los
 * de EA o los de Epic. La API de MediaWiki devuelve JSON limpio, sin clave y
 * sin raspar HTML, así que no se rompe cada vez que la web cambia de plantilla.
 *
 * El buscador central de Fandom está detrás de Cloudflare, así que el host de
 * cada wiki se adivina a partir del nombre del juego y se comprueba una vez.
 */

const TIMEOUT_MS = 10_000;
const HEADERS = { 'User-Agent': 'Atreus/1.0 (cazador de platinos; contacto vía la aplicación)' };
const HOST_TTL_MS = 24 * 60 * 60_000;

/** Cada juego se resuelve una vez por sesión: acertado o descartado. */
const hosts = new Map<string, { at: number; host: string | null }>();

async function json<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await net.fetch(url, { headers: HEADERS, signal: controller.signal, redirect: 'follow' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

interface SiteInfo { query?: { general?: { sitename?: string } } }

/** Comprueba si un host responde a la API de MediaWiki. */
async function alive(host: string): Promise<boolean> {
  try {
    const info = await json<SiteInfo>(`https://${host}/api.php?action=query&meta=siteinfo&format=json`);
    return typeof info.query?.general?.sitename === 'string';
  } catch {
    return false;
  }
}

/** Host de la wiki del juego, o null si no se encontró ninguna. */
export async function wikiHost(gameName: string): Promise<string | null> {
  const key = slug(gameName);
  if (!key) return null;
  const cached = hosts.get(key);
  if (cached && Date.now() - cached.at < HOST_TTL_MS) return cached.host;

  for (const host of hostCandidates(gameName)) {
    if (await alive(host)) {
      hosts.set(key, { at: Date.now(), host });
      logger.info(`wiki de "${gameName}": ${host}`);
      return host;
    }
  }
  hosts.set(key, { at: Date.now(), host: null });
  logger.info(`sin wiki conocida para "${gameName}"`);
  return null;
}

interface SearchResponse {
  query?: { search?: { title?: string; pageid?: number; snippet?: string; wordcount?: number }[] };
}

/** Busca páginas en la wiki del juego y las devuelve como guías legibles. */
export async function searchWiki(gameName: string, term: string): Promise<GuideEntry[]> {
  const host = await wikiHost(gameName);
  if (!host) return [];

  try {
    const url = `https://${host}/api.php?action=query&list=search&format=json` +
      `&srsearch=${encodeURIComponent(term)}&srlimit=8&srprop=snippet|wordcount`;
    const body = await json<SearchResponse>(url);
    const pretty = host.replace(/\.(fandom\.com|wiki\.gg)$/, '');
    return (body.query?.search ?? [])
      .filter((hit) => typeof hit.title === 'string' && (hit.wordcount ?? 0) > 60)
      .map((hit) => ({
        id: `wiki:${host}:${hit.pageid}`,
        title: hit.title!,
        snippet: text(hit.snippet ?? ''),
        url: `https://${host}/wiki/${encodeURIComponent(hit.title!.replace(/ /g, '_'))}`,
        source: `${pretty} · wiki`,
        provider: 'wiki' as const,
        author: null,
        rating: null,
        language: 'en',
        readable: true,
      }));
  } catch (e) {
    logger.warn(`búsqueda en ${host} fallida:`, e);
    return [];
  }
}

interface ParseResponse {
  parse?: { title?: string; text?: { '*'?: string } };
}

/** Texto completo de una página de wiki, partido por sus encabezados. */
export async function readWikiPage(entry: GuideEntry): Promise<GuideDocument> {
  const match = /^wiki:([^:]+):(\d+)$/.exec(entry.id);
  if (!match) throw new Error('Referencia de wiki no válida');
  const [, host, pageId] = match;

  const body = await json<ParseResponse>(
    `https://${host}/api.php?action=parse&pageid=${pageId}&prop=text&format=json&disableeditsection=1`,
  );
  const html = body.parse?.text?.['*'];
  if (!html) throw new Error('La wiki no devolvió contenido para esta página');

  // Se descartan los adornos que no son texto de la guía y que solo estorban.
  const cleaned = html
    .replace(/<table[\s\S]*?<\/table>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<div class="(?:navbox|toc|mw-references|reference)[\s\S]*?<\/div>/gi, ' ');

  const sections: GuideSection[] = [];
  let heading = 'Introducción';
  let buffer: string[] = [];
  const push = () => {
    const joined = buffer.join('\n\n').trim();
    if (joined.length >= 60) sections.push({ heading, body: joined, images: [] });
    buffer = [];
  };

  for (const block of cleaned.matchAll(/<(h[2-4])[^>]*>([\s\S]*?)<\/\1>|<(p|li)[^>]*>([\s\S]*?)<\/\3>/gi)) {
    if (block[1]) {
      push();
      heading = text(block[2] ?? '').replace(/\[\s*editar?\s*\]/i, '').trim() || heading;
    } else {
      const line = richText(block[4] ?? '');
      if (line.length > 15) buffer.push(block[3]?.toLowerCase() === 'li' ? `· ${line}` : line);
    }
  }
  push();

  if (sections.length === 0) throw new Error('Esta página de la wiki no tiene texto que mostrar');

  return {
    title: body.parse?.title ?? entry.title,
    url: entry.url,
    source: entry.source,
    provider: 'wiki',
    author: null,
    summary: sections[0]!.body.slice(0, 400),
    sections: sections.slice(0, 40),
    partial: false,
    fetchedAt: Date.now(),
  };
}
