import type { GameId, GuideCategory, GuideDocument, GuideEntry } from '@shared/types';
import { log } from '../../logger';
import { getGame } from '../catalog';
import { popularSteamGuides, readSteamGuide, searchSteamGuides } from './steam';
import { readWikiPage, searchWiki } from './wiki';
import { readWebPage, searchWeb } from './web';

const logger = log('guides');

/**
 * Guías del juego, buscadas solas.
 *
 * El usuario no teclea nada: elige un juego, elige qué quiere (el platino, los
 * coleccionables, un jefe) y Atreus va a buscarlo. Se consultan tres fuentes en
 * paralelo y se mezclan poniendo delante las que se pueden **leer enteras
 * dentro de la aplicación**, que es lo que se pedía y lo que antes no pasaba.
 */

const CACHE_TTL_MS = 15 * 60_000;
const MAX_RESULTS = 24;

/** Qué buscar en cada fuente para cada categoría. */
const TERMS: Record<GuideCategory, { es: string; en: string; wiki: string; web: string }> = {
  platinum: {
    es: 'logros 100%',
    en: '100% achievement guide',
    wiki: 'achievements',
    web: 'guía platino 100% todos los logros',
  },
  achievements: {
    es: 'logros',
    en: 'achievement guide',
    wiki: 'achievements list',
    web: 'guía de logros',
  },
  collectibles: {
    es: 'coleccionables',
    en: 'collectibles locations',
    wiki: 'collectibles',
    web: 'guía coleccionables localizaciones',
  },
  walkthrough: {
    es: 'guía completa',
    en: 'walkthrough',
    wiki: 'walkthrough',
    web: 'walkthrough guía completa',
  },
  bosses: {
    es: 'jefes',
    en: 'boss guide',
    wiki: 'bosses',
    web: 'guía de jefes cómo derrotar',
  },
};

const cache = new Map<string, { at: number; entries: GuideEntry[] }>();

/**
 * Orden de la lista. Manda poder leerla aquí dentro; después el idioma, y
 * dentro de cada grupo, la valoración de la comunidad.
 */
function rank(a: GuideEntry, b: GuideEntry): number {
  const readable = Number(b.readable) - Number(a.readable);
  if (readable !== 0) return readable;
  const lang = languageScore(b.language) - languageScore(a.language);
  if (lang !== 0) return lang;
  const provider = providerScore(b.provider) - providerScore(a.provider);
  if (provider !== 0) return provider;
  return (b.rating ?? 0) - (a.rating ?? 0);
}

const languageScore = (language: string): number => (language === 'es' ? 2 : language === 'en' ? 1 : 0);
const providerScore = (provider: GuideEntry['provider']): number =>
  provider === 'steam' ? 2 : provider === 'wiki' ? 1 : 0;

export async function list(
  gameId: GameId,
  category: GuideCategory,
  query?: string,
): Promise<GuideEntry[]> {
  const game = getGame(gameId);
  if (!game) throw new Error(`Juego no encontrado: ${gameId}`);
  if (!(category in TERMS)) throw new Error('Categoría de guía desconocida');

  const extra = (query ?? '').trim().slice(0, 120);
  const key = `${gameId}|${category}|${extra.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.entries;

  const terms = TERMS[category];
  const steamAppId = game.platform === 'steam' ? game.nativeId : null;

  /*
   * Se lanzan las tres fuentes a la vez. Ninguna es obligatoria: cada una
   * devuelve lista vacía si falla, y el resultado se juzga por lo que llegue.
   * Con el término del usuario se busca eso literalmente; sin él, se buscan las
   * dos variantes de idioma para que salgan guías en castellano y en inglés.
   */
  const searches: Promise<GuideEntry[]>[] = [];
  if (steamAppId) {
    if (extra) {
      searches.push(searchSteamGuides(steamAppId, extra));
    } else {
      searches.push(searchSteamGuides(steamAppId, terms.es));
      searches.push(searchSteamGuides(steamAppId, terms.en));
    }
  }
  searches.push(searchWiki(game.name, extra || terms.wiki));
  searches.push(searchWeb(`${game.name} ${extra || terms.web}`));

  const settled = await Promise.all(searches);
  const merged = new Map<string, GuideEntry>();
  for (const group of settled) {
    for (const entry of group) if (!merged.has(entry.url)) merged.set(entry.url, entry);
  }

  // Si el juego es de Steam y nada ha dado resultados, al menos las guías
  // destacadas de su comunidad: es mejor una lista genérica que un hueco.
  if (merged.size === 0 && steamAppId) {
    for (const entry of await popularSteamGuides(steamAppId)) {
      if (!merged.has(entry.url)) merged.set(entry.url, entry);
    }
  }

  const entries = [...merged.values()].sort(rank).slice(0, MAX_RESULTS);
  logger.info(`${game.name} · ${category}: ${entries.length} guías (${entries.filter((e) => e.readable).length} legibles aquí)`);
  cache.set(key, { at: Date.now(), entries });
  return entries;
}

const documents = new Map<string, { at: number; document: GuideDocument }>();

/** Texto completo de una guía. */
export async function read(entry: GuideEntry): Promise<GuideDocument> {
  if (!entry?.url || typeof entry.url !== 'string') throw new Error('La guía no tiene una URL válida');
  const cached = documents.get(entry.url);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.document;

  const document = entry.provider === 'steam'
    ? await readSteamGuide(entry.url)
    : entry.provider === 'wiki'
      ? await readWikiPage(entry)
      : await readWebPage(entry);

  documents.set(entry.url, { at: Date.now(), document });
  return document;
}
