/**
 * Emparejar un juego de la biblioteca con un mapa publicado.
 *
 * Va aparte del resto del servicio porque no toca red ni disco: así se puede
 * probar con una portada guardada. Equivocarse aquí es peor que no encontrar
 * nada — enseñaría el mapa de otro juego como si fuera el bueno.
 */

/**
 * Extrae los pares slug → título de la portada de MapGenie.
 *
 * Cada tarjeta es un enlace seguido de la imagen del mapa, cuyo `alt` lleva el
 * nombre del juego. Se recorren ambos patrones en el orden en que aparecen y se
 * emparejan; es frágil por naturaleza, así que un fallo aquí solo significa
 * quedarse con el directorio anterior, nunca romper la vista.
 */
export function parseDirectory(html: string): Record<string, string> {
  const games: Record<string, string> = {};
  const pattern = /(?:href="https:\/\/mapgenie\.io\/([a-z0-9-]+)")|(?:alt="([^"]{2,90}?) Map Image")/g;
  let pendingSlug: string | null = null;
  for (const match of html.matchAll(pattern)) {
    if (match[1]) {
      pendingSlug = match[1];
    } else if (match[2] && pendingSlug) {
      games[pendingSlug] = decode(match[2]);
      pendingSlug = null;
    }
  }
  return games;
}

function decode(value: string): string {
  return value
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .trim();
}

// ── Emparejado por nombre ─────────────────────────────────────

const EDITIONS = /\b(goty|game of the year|definitive|deluxe|remastered|remake|complete|ultimate|enhanced|anniversary|director'?s cut|edition|bundle)\b/g;

/** Reduce un nombre a lo comparable: sin acentos, sin marcas comerciales. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[™®©]/g, ' ')
    .replace(/[:\-–—_,'']/g, ' ')
    .replace(EDITIONS, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Busca el slug de MapGenie que corresponde a un juego, o null. */
export function matchSlug(gameName: string, games: Record<string, string>): string | null {
  const target = normalizeName(gameName);
  if (!target) return null;
  const compact = target.replace(/ /g, '');

  let prefix: string | null = null;
  for (const [slug, title] of Object.entries(games)) {
    const candidate = normalizeName(title);
    if (candidate === target) return slug;
    if (slug.replace(/-/g, '') === compact) return slug;
    /*
     * Solo se acepta el prefijo en una dirección: cuando el nombre de la
     * tienda es **más largo** que el del mapa ("The Witcher 3: Wild Hunt" →
     * "The Witcher 3"). Al revés sería adivinar: "Halo" no debe llevarse el
     * mapa de "Halo Infinite", ni "Call of Duty" el de un año concreto.
     */
    if (!prefix && target.startsWith(`${candidate} `)) prefix = slug;
  }
  return prefix;
}

