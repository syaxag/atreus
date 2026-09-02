/**
 * Parser de la versión HTML sin JavaScript de DuckDuckGo. Es puro a propósito:
 * no toca la red, así que se puede probar con una página guardada. El resto
 * (petición, tiempo de espera) vive en `index.ts`.
 */

/** Un resultado crudo del buscador, antes de convertirlo en `GuideEntry`. */
export interface WebResult {
  title: string;
  url: string;
  source: string;
  snippet: string;
}

export const ENDPOINT = 'https://html.duckduckgo.com/html/';
export const MAX_RESULTS = 12;

const ENTITIES: Record<string, string> = {
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ',
};

/** Quita etiquetas y resuelve las entidades HTML habituales. */
export function text(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_all, code: string) => safeCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_all, code: string) => safeCodePoint(Number(code)))
    .replace(/&([a-z]+);/gi, (all, name: string) => ENTITIES[name.toLowerCase()] ?? all)
    .replace(/\s+/g, ' ')
    .trim();
}

function safeCodePoint(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

/**
 * DuckDuckGo envuelve los enlaces en `/l/?uddg=<destino>`. `searchParams` ya
 * devuelve el destino decodificado: decodificarlo otra vez rompería las URL
 * que llevan `%` literales. Solo se aceptan destinos HTTPS.
 */
export function resolveUrl(raw: string): string | null {
  try {
    const url = new URL(text(raw), ENDPOINT);
    const destination = url.searchParams.get('uddg') ?? url.href;
    const parsed = new URL(destination);
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

export function parseResults(html: string): WebResult[] {
  const results: WebResult[] = [];
  const seen = new Set<string>();
  // Cada resultado lleva su enlace principal con la clase `result__a`; el
  // fragmento va justo después con `result__snippet`. Se recorren los enlaces
  // y se busca el fragmento hasta el siguiente enlace, sin depender del cierre
  // exacto de los <div>, que DuckDuckGo cambia de vez en cuando.
  const anchor = /<a[^>]+class="[^"]*\bresult__a\b[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchor.exec(html)) !== null) {
    const url = resolveUrl(match[1]!);
    const title = text(match[2]!);
    if (!url || !title || seen.has(url)) continue;
    seen.add(url);

    const rest = html.slice(anchor.lastIndex);
    const next = rest.search(/<a[^>]+class="[^"]*\bresult__a\b/i);
    const block = next >= 0 ? rest.slice(0, next) : rest;
    const snippet = /class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|span|td)>/i.exec(block);

    results.push({
      title,
      url,
      source: new URL(url).hostname.replace(/^www\./, ''),
      snippet: snippet ? text(snippet[1]!) : '',
    });
    if (results.length === MAX_RESULTS) break;
  }
  return results;
}
