import type { GuideDocument, GuideEntry, GuideSection } from '@shared/types';

/**
 * Parsers de las guías de la comunidad de Steam.
 *
 * Son puros a propósito: no tocan la red, así que se pueden probar con una
 * página guardada. Steam es la fuente principal de guías de Atreus porque es la
 * única grande cuyo HTML permite sacar el **texto entero** de la guía, no un
 * extracto. Ahí estaba el fallo de antes: se enseñaba una lista de enlaces y al
 * abrirlos no salía nada, porque la web de destino no dejaba extraer nada.
 */

const ENTITIES: Record<string, string> = {
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
};

/** Resuelve entidades HTML sin quitar etiquetas. */
export function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_a, code: string) => codePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_a, code: string) => codePoint(Number(code)))
    .replace(/&([a-z]+);/gi, (all, name: string) => ENTITIES[name.toLowerCase()] ?? all);
}

function codePoint(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

/** Quita etiquetas, resuelve entidades y normaliza espacios. */
export function text(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * Igual que `text`, pero conservando los saltos de párrafo.
 *
 * En el cuerpo de una guía los saltos son información: separan un paso del
 * siguiente. Aplastarlos a un espacio convertía una lista de veinte logros en
 * un muro ilegible.
 */
export function richText(value: string): string {
  return decodeEntities(
    value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<li[^>]*>/gi, '· ')
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

// Alfabetos que descartan la guía de entrada (cirílico, griego, árabe, CJK…)
// y letras propias de otras lenguas latinas, que si no se colarían como
// castellano o inglés por tener las mismas palabras cortas.
const NON_LATIN = /[Ѐ-ӿͰ-Ͽ֐-ۿ฀-๿぀-ヿ一-鿿가-힯]/;
const OTHER_LATIN = /[ąęłżźćńśğşıİășțđčšžő]/i;
const SPANISH = /\b(el|la|los|las|de|para|con|cómo|como|logros|guía|juego|todos|hay|que|una|más)\b/gi;
const ENGLISH = /\b(the|and|for|with|how|achievements|guide|game|all|this|you|your|from)\b/gi;

/** Idioma aproximado de un texto: 'es', 'en' u 'otro'. */
export function detectLanguage(value: string): string {
  if (NON_LATIN.test(value)) return 'otro';
  if (OTHER_LATIN.test(value)) return 'otro';
  const es = (value.match(SPANISH) ?? []).length;
  const en = (value.match(ENGLISH) ?? []).length;
  if (es === 0 && en === 0) return 'otro';
  return es >= en ? 'es' : 'en';
}

/** `.../4-star.png` → 4. `not-yet.png` → null. */
export function parseRating(html: string): number | null {
  const match = /class="fileRating"\s+src="[^"]*?\/(\d)-star\.png/i.exec(html);
  return match ? Number(match[1]) : null;
}

/**
 * Lista de guías de `steamcommunity.com/app/<id>/guides/?browsefilter=trend&searchText=…`.
 *
 * Cada tarjeta va dentro de un `<a class="workshopItemCollection …">`, así que
 * se trocea por ahí en lugar de intentar casar los `<div>` anidados, que Steam
 * reordena cada pocos meses.
 */
export function parseGuideList(html: string): GuideEntry[] {
  const out: GuideEntry[] = [];
  const seen = new Set<string>();
  const cards = html.split(/<a class="workshopItemCollection/g).slice(1);

  for (const card of cards) {
    const id = /data-publishedfileid="(\d+)"/.exec(card)?.[1];
    if (!id || seen.has(id)) continue;

    const title = text(/class="workshopItemTitle[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(card)?.[1] ?? '');
    if (!title) continue;
    seen.add(id);

    const author = text(/class="workshopItemAuthorName"[^>]*>([\s\S]*?)<\/span>/.exec(card)?.[1] ?? '') || null;
    const snippet = text(/class="workshopItemShortDesc"[^>]*>([\s\S]*?)<\/div>/.exec(card)?.[1] ?? '');

    out.push({
      id: `steam:${id}`,
      title,
      snippet,
      url: `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`,
      source: { kind: 'steam' },
      provider: 'steam',
      author,
      rating: parseRating(card),
      language: detectLanguage(`${title} ${snippet}`),
      readable: true,
    });
  }
  return out;
}

const MIN_SECTION_CHARS = 20;

/** Extrae el texto completo de una guía de Steam, sección a sección. */
export function parseGuideDocument(html: string, url: string): GuideDocument | null {
  const title =
    text(/<div class="workshopItemTitle"[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1] ?? '') ||
    text(/<title[^>]*>([\s\S]*?)<\/title>/.exec(html)?.[1] ?? '').replace(/^Steam Community\s*::\s*/i, '');
  const author =
    text(/class="friendBlockContent"[^>]*>([\s\S]*?)<br/.exec(html)?.[1] ?? '') ||
    text(/class="workshopItemAuthorName"[^>]*>([\s\S]*?)<\/a>/.exec(html)?.[1] ?? '') ||
    null;

  const sections: GuideSection[] = [];
  const blocks = [...html.matchAll(
    /<div class="subSectionTitle"[^>]*>([\s\S]*?)<\/div>\s*<div class="subSectionDesc">([\s\S]*?)<\/div>/g,
  )];

  for (const block of blocks) {
    const heading = text(block[1] ?? '') || 'Sin título';
    const raw = block[2] ?? '';
    const body = richText(raw);
    const images = [...raw.matchAll(/<img[^>]+src="(https:\/\/[^"]+)"/g)]
      .map((m) => m[1]!)
      .filter((src) => !/emoticon|\/badges\/|award/i.test(src))
      .slice(0, 6);
    if (body.length < MIN_SECTION_CHARS && images.length === 0) continue;
    sections.push({ heading, body, images });
  }

  if (sections.length === 0) return null;

  const summary =
    text(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/.exec(html)?.[1] ?? '') ||
    sections[0]!.body.slice(0, 400);

  return {
    title,
    url,
    source: { kind: 'steam' },
    provider: 'steam',
    author,
    summary,
    sections,
    partial: false,
    fetchedAt: Date.now(),
  };
}
