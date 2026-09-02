import { net } from 'electron';
import type { GuideDocument, GuideEntry } from '@shared/types';
import { log } from '../../logger';
import { ENDPOINT, parseResults } from './parse';
import { detectLanguage, richText, text } from './parse-steam';

const logger = log('guides:web');

/**
 * Último recurso: un buscador web.
 *
 * Se usa solo cuando ni Steam ni la wiki del juego han dado nada, y sus
 * resultados se marcan como *no legibles*: la mayoría de webs de guías bloquean
 * la extracción, y prometer un texto que luego sale en blanco es peor que decir
 * de entrada que hay que abrirlo fuera. Ese era justo el defecto de la versión
 * anterior de Guías.
 */

const TIMEOUT_MS = 12_000;
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
};

export async function searchWeb(query: string): Promise<GuideEntry[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await net.fetch(ENDPOINT, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ q: query, kl: 'es-es', kp: '1' }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`El buscador devolvió HTTP ${response.status}`);
    const results = parseResults(await response.text());
    return results.map((result) => ({
      id: `web:${result.url}`,
      title: result.title,
      snippet: result.snippet,
      url: result.url,
      source: result.source,
      provider: 'web' as const,
      author: null,
      rating: null,
      language: detectLanguage(`${result.title} ${result.snippet}`),
      // Se comprueba de verdad al abrirla; aquí solo es una expectativa.
      readable: false,
    }));
  } catch (e) {
    logger.warn(`búsqueda web fallida para "${query}":`, e);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Intenta sacar el texto de una página cualquiera.
 *
 * Devuelve siempre algo: si la web no deja extraer, sale el resumen que ya se
 * tenía y `partial: true`, para que la interfaz pueda decir con claridad que
 * hay que abrirla en el navegador en vez de mostrar un hueco vacío.
 */
export async function readWebPage(entry: GuideEntry): Promise<GuideDocument> {
  const fallback: GuideDocument = {
    title: entry.title,
    url: entry.url,
    source: entry.source,
    provider: 'web',
    author: null,
    summary: entry.snippet,
    sections: [],
    partial: true,
    fetchedAt: Date.now(),
  };

  let url: URL;
  try {
    url = new URL(entry.url);
  } catch {
    throw new Error('La fuente no tiene una URL válida');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Solo se permiten fuentes web seguras');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await net.fetch(url.toString(), {
      headers: { ...HEADERS, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`La fuente devolvió HTTP ${response.status}`);
    const html = (await response.text()).slice(0, 1_500_000);

    const title = text(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').slice(0, 180) || entry.title;
    const summary = text(
      /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']/i
        .exec(html)?.[1] ?? '',
    ).slice(0, 700) || entry.snippet;

    const body = html
      .replace(/<(script|style|nav|footer|header|aside)[\s\S]*?<\/\1>/gi, ' ');
    const blocks = [...body.matchAll(/<(h2|h3|p|li)[^>]*>([\s\S]*?)<\/\1>/gi)]
      .map((m) => ({ tag: m[1]!.toLowerCase(), value: richText(m[2]!) }))
      .filter((block) => block.value.length >= 40);

    const sections: GuideDocument['sections'] = [];
    let heading = 'Contenido';
    let buffer: string[] = [];
    const push = () => {
      const joined = buffer.join('\n\n').trim();
      if (joined.length >= 60) sections.push({ heading, body: joined, images: [] });
      buffer = [];
    };
    for (const block of blocks) {
      if (block.tag === 'h2' || block.tag === 'h3') {
        push();
        heading = block.value.slice(0, 120);
      } else {
        buffer.push(block.tag === 'li' ? `· ${block.value}` : block.value);
      }
    }
    push();

    if (sections.length === 0) return { ...fallback, title, summary };
    return { ...fallback, title, summary, sections: sections.slice(0, 30), partial: false };
  } catch (e) {
    logger.warn(`no se pudo extraer ${entry.source}:`, e);
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}
