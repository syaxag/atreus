import { net } from 'electron';
import type { GuideDocument, GuideEntry } from '@shared/types';
import { log } from '../../logger';
import { parseGuideDocument, parseGuideList } from './parse-steam';

const logger = log('guides:steam');

const TIMEOUT_MS = 12_000;
/**
 * Steam devuelve la página de guías igual a cualquiera, pero con un
 * `User-Agent` de robot corta a los pocos minutos. El de un navegador normal
 * es lo que espera y no lleva ninguna identificación del usuario.
 */
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.7',
};

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await net.fetch(url, { headers: HEADERS, redirect: 'follow', signal: controller.signal });
    if (!response.ok) throw new Error(`Steam respondió HTTP ${response.status}`);
    return (await response.text()).slice(0, 3_000_000);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Busca guías del juego en la comunidad de Steam.
 *
 * `browsefilter=trend` es lo que convierte la página en un buscador real: sin
 * ella, Steam devuelve siempre el escaparate de guías populares y `searchText`
 * se ignora. Era exactamente por eso por lo que las búsquedas de Atreus no
 * traían nada útil.
 */
export async function searchSteamGuides(appId: string, term: string): Promise<GuideEntry[]> {
  const url = `https://steamcommunity.com/app/${encodeURIComponent(appId)}/guides/` +
    `?browsefilter=trend&browsesort=trend&p=1&searchText=${encodeURIComponent(term)}`;
  try {
    return parseGuideList(await fetchText(url));
  } catch (e) {
    logger.warn(`búsqueda de guías de Steam fallida para ${appId} "${term}":`, e);
    return [];
  }
}

/** Guías destacadas del juego, sin término de búsqueda. */
export async function popularSteamGuides(appId: string): Promise<GuideEntry[]> {
  const url = `https://steamcommunity.com/app/${encodeURIComponent(appId)}/guides/` +
    '?browsefilter=trend&browsesort=trend&p=1';
  try {
    return parseGuideList(await fetchText(url));
  } catch (e) {
    logger.warn(`no se pudieron listar las guías populares de ${appId}:`, e);
    return [];
  }
}

/** Texto completo de una guía de Steam. Lanza si la página no trae secciones. */
export async function readSteamGuide(url: string): Promise<GuideDocument> {
  const html = await fetchText(url);
  const document = parseGuideDocument(html, url);
  if (!document) throw new Error('Esta guía de Steam no tiene secciones de texto que se puedan mostrar');
  return document;
}
