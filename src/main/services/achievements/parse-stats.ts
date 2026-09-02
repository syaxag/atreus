/**
 * Parser de la página pública de estadísticas de logros de Steam.
 *
 * `steamcommunity.com/stats/<appid>/achievements/` publica la lista completa de
 * un juego —nombre, descripción, icono y qué porcentaje de la gente lo tiene—
 * **sin clave de API y sin poseer el juego**. Es lo que permite que Atreus
 * sepa qué logros hay en un juego que tienes en Xbox, Epic o EA: casi todos
 * existen también en Steam, y su lista es la misma.
 *
 * El archivo es puro: se prueba con una página guardada.
 */

/** Un logro tal como lo publica Steam, sin saber si tú lo tienes. */
export interface CatalogAchievement {
  /** Identificador estable dentro de Atreus. Ver `idFor`. */
  apiName: string;
  displayName: string;
  description: string;
  iconUrl: string | null;
  /** Porcentaje global de jugadores que lo tiene, 0–100. */
  globalPercent: number | null;
}

const ENTITIES: Record<string, string> = {
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
};

function decode(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_a, code: string) => point(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_a, code: string) => point(Number(code)))
    .replace(/&([a-z]+);/gi, (all, name: string) => ENTITIES[name.toLowerCase()] ?? all);
}

function point(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

function text(value: string): string {
  return decode(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * Identificador estable de un logro del catálogo.
 *
 * Steam no publica el `apiName` interno en esta página, y hace falta una clave
 * que sobreviva a releer la página y a que el juego cambie de idioma: el nombre
 * visible no vale porque se traduce. El hash del icono sí es estable, así que
 * es lo que se usa; cuando no hay icono se cae a la posición, que al menos es
 * estable mientras Steam no reordene la lista.
 *
 * Va con prefijo para no confundirse nunca con un `apiName` real de Steam.
 */
export function idFor(iconUrl: string | null, index: number): string {
  const hash = iconUrl ? /\/([0-9a-f]{16,})\.(?:jpg|png)/i.exec(iconUrl)?.[1] : null;
  return hash ? `steamcat:${hash}` : `steamcat:i${index}`;
}

/** Lee la lista completa de logros de la página de estadísticas. */
export function parseAchievementStats(html: string): CatalogAchievement[] {
  const out: CatalogAchievement[] = [];
  // Cada logro es un `<div class="achieveRow">`. Se trocea por ahí en vez de
  // intentar casar los <div> anidados, que Steam reordena de vez en cuando.
  const rows = html.split(/<div class="achieveRow[^"]*"\s*>/).slice(1);

  for (const [index, row] of rows.entries()) {
    const name = text(/<h3>([\s\S]*?)<\/h3>/.exec(row)?.[1] ?? '');
    if (!name) continue;

    const iconUrl = /class="achieveImgHolder"[\s\S]{0,200}?<img src="([^"]+)"/.exec(row)?.[1] ?? null;
    const raw = /class="achievePercent">\s*([\d.,]+)\s*%/.exec(row)?.[1];
    // Steam escribe el porcentaje con punto decimal aunque la página esté en
    // español; aceptar la coma cuesta un carácter y evita un null tonto.
    const percent = raw === undefined ? null : Number(raw.replace(',', '.'));

    out.push({
      apiName: idFor(iconUrl, index),
      displayName: name,
      description: text(/<h5>([\s\S]*?)<\/h5>/.exec(row)?.[1] ?? ''),
      iconUrl,
      globalPercent: percent !== null && Number.isFinite(percent) ? percent : null,
    });
  }
  return out;
}

/** Un resultado de la búsqueda de la tienda de Steam. */
export interface StoreHit {
  appId: string;
  name: string;
}

interface StoreSearchResponse {
  items?: { id?: number; name?: string; type?: string }[];
}

/** Extrae los juegos de la respuesta de `storesearch`, descartando los DLC. */
export function parseStoreSearch(body: unknown): StoreHit[] {
  const items = (body as StoreSearchResponse)?.items;
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => typeof item?.id === 'number' && typeof item.name === 'string')
    .map((item) => ({ appId: String(item.id), name: item.name! }));
}

const EDITIONS = /\b(goty|game of the year|definitive|deluxe|remastered|complete|ultimate|enhanced|anniversary|premium|standard|edition|edicion|bundle|pack|paquete|upgrade|actualizacion|mejora|windows|pc)\b/g;

/**
 * Palabras que delatan que el resultado no es el juego sino algo que lo
 * acompaña. La tienda de Steam devuelve DLC y bandas sonoras con `type: "app"`
 * igual que los juegos, así que no hay forma de distinguirlos por el tipo.
 */
const NOT_A_GAME = /\b(dlc|soundtrack|banda sonora|season pass|art ?book|demo|server|editor|beta|test|trailer)\b/i;

/** Reduce un nombre a lo comparable entre una tienda y otra. */
export function normalizeTitle(name: string): string {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[™®©]/g, ' ')
    .replace(/[:\-–—_,'’]/g, ' ')
    .replace(EDITIONS, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Elige qué resultado de la tienda es el juego que se busca.
 *
 * Solo vale la coincidencia exacta del nombre normalizado. `normalizeTitle` ya
 * quita ediciones, marcas comerciales y coletillas de plataforma, que es lo que
 * de verdad separa un nombre de otro entre tiendas; aflojar más no gana casos
 * reales y sí abre la puerta a colar el DLC o la siguiente entrega de la saga.
 * Enseñar los logros de otro juego como si fueran los tuyos es peor que no
 * enseñar ninguno.
 */
export function pickStoreMatch(gameName: string, hits: StoreHit[]): string | null {
  const target = normalizeTitle(gameName);
  if (!target) return null;
  return hits.find((hit) => !NOT_A_GAME.test(hit.name) && normalizeTitle(hit.name) === target)?.appId ?? null;
}
