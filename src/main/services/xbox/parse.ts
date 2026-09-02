/*
 * Con extensión a propósito: este archivo es puro y se prueba con `node --test`,
 * que resuelve rutas de ESM de verdad y no entiende los imports sin extensión
 * del empaquetador. Vite y tsc la aceptan igual.
 */
import { normalizeTitle } from '../achievements/parse-stats.ts';

/**
 * Lectura de las respuestas de OpenXBL.
 *
 * OpenXBL es un puente hacia la API de Xbox Live: el usuario crea una clave
 * entrando con su cuenta de Microsoft en la web de ellos, y Atreus solo maneja
 * esa clave. Nunca ve ni pide la contraseña.
 *
 * El archivo es puro y **deliberadamente tolerante**: la misma API devuelve los
 * logros en dos formas según el endpoint —una corta con `isUnlocked` y otra,
 * la de Xbox Live, con `progressState` y `progression.timeUnlocked`—, y el
 * envoltorio `content` unas veces está y otras no. Se aceptan todas en vez de
 * apostar por una: fallar aquí significa que un juego entero se queda sin
 * logros y sin decir por qué.
 */

/** Lo mínimo que hace falta de una cuenta: quién eres. */
export interface XboxAccount {
  xuid: string;
  gamertag: string | null;
}

/** Un juego del historial, con su resumen de logros. */
export interface XboxTitle {
  titleId: string;
  name: string;
  /** Logros conseguidos según Xbox, o null si no lo dice. */
  unlocked: number | null;
  total: number | null;
}

export interface XboxAchievement {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
  /** Epoch en segundos, o null. */
  unlockTime: number | null;
  iconUrl: string | null;
  hidden: boolean;
  /** Porcentaje de jugadores que lo tiene, si Xbox lo publica. */
  rarityPercent: number | null;
}

/** Quita el envoltorio `content` cuando lo hay. */
function unwrap(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') return {};
  const outer = body as Record<string, unknown>;
  const inner = outer['content'];
  return inner && typeof inner === 'object' ? (inner as Record<string, unknown>) : outer;
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object') : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** ISO 8601 → epoch en segundos. Devuelve null ante cualquier cosa rara. */
export function epochOf(value: unknown): number | null {
  const raw = text(value);
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : null;
}

export function parseAccount(body: unknown): XboxAccount | null {
  const user = asArray(unwrap(body)['profileUsers'])[0];
  if (!user) return null;
  const xuid = text(user['id']);
  if (!xuid) return null;

  // Los datos del perfil vienen como una lista de pares, no como campos.
  const settings = asArray(user['settings']);
  const gamertag = settings.find((entry) => text(entry['id']) === 'Gamertag');
  return { xuid, gamertag: text(gamertag?.['value']) || null };
}

export function parseTitles(body: unknown): XboxTitle[] {
  return asArray(unwrap(body)['titles'])
    .map((title): XboxTitle | null => {
      const titleId = text(title['titleId']);
      const name = text(title['name']);
      if (!titleId || !name) return null;
      const summary = title['achievement'];
      const stats = summary && typeof summary === 'object' ? (summary as Record<string, unknown>) : {};
      const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
      return {
        titleId,
        name,
        unlocked: num(stats['currentAchievements']),
        // Xbox manda 0 cuando no lo sabe, que no es lo mismo que "no tiene".
        total: num(stats['totalAchievements']) || null,
      };
    })
    .filter((title): title is XboxTitle => title !== null);
}

/** URL del icono entre los `mediaAssets` del logro. */
function iconOf(achievement: Record<string, unknown>): string | null {
  const asset = asArray(achievement['mediaAssets'])
    .find((item) => text(item['type']).toLowerCase() === 'icon' || text(item['name']).toLowerCase() === 'icon')
    ?? asArray(achievement['mediaAssets'])[0];
  const url = text(asset?.['url']);
  return url.startsWith('https://') ? url : null;
}

function rarityOf(achievement: Record<string, unknown>): number | null {
  const rarity = achievement['rarity'];
  if (!rarity || typeof rarity !== 'object') return null;
  const raw = (rarity as Record<string, unknown>)['currentPercentage'];
  const value = typeof raw === 'string' ? Number(raw) : raw;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function parseAchievements(body: unknown): XboxAchievement[] {
  const content = unwrap(body);
  /*
   * Según el endpoint, los logros cuelgan de `achievements` o van repartidos
   * dentro de `titles[].achievements`. Se recogen los dos casos.
   */
  const direct = asArray(content['achievements']);
  const nested = asArray(content['titles']).flatMap((title) => asArray(title['achievements']));
  const all = direct.length > 0 ? direct : nested;

  return all
    .map((achievement): XboxAchievement | null => {
      const name = text(achievement['name']);
      if (!name) return null;

      const progression = achievement['progression'];
      const progressionObject = progression && typeof progression === 'object'
        ? (progression as Record<string, unknown>)
        : {};
      const state = text(achievement['progressState']).toLowerCase();
      // La forma corta dice `isUnlocked`; la de Xbox Live, `progressState`.
      const unlocked = achievement['isUnlocked'] === true || state === 'achieved';
      const unlockTime = unlocked
        ? epochOf(progressionObject['timeUnlocked'] ?? achievement['timeUnlocked'])
        : null;

      const hidden = achievement['isSecret'] === true;
      /*
       * Xbox esconde la descripción de un logro secreto hasta que lo sacas:
       * mientras siga bloqueado se enseña la versión censurada, que es lo que
       * el propio juego enseñaría.
       */
      const description = hidden && !unlocked
        ? text(achievement['lockedDescription']) || text(achievement['description'])
        : text(achievement['description']) || text(achievement['lockedDescription']);

      return {
        id: text(achievement['id']) || name,
        name,
        description,
        unlocked,
        unlockTime,
        iconUrl: iconOf(achievement),
        hidden,
        rarityPercent: rarityOf(achievement),
      };
    })
    .filter((achievement): achievement is XboxAchievement => achievement !== null);
}

/**
 * Qué título del historial de Xbox es el juego de la biblioteca.
 *
 * Solo vale el nombre exacto una vez normalizado. `normalizeTitle` ya se come
 * las coletillas de tienda —ediciones, marcas, "Windows"—, así que aflojar más
 * no gana casos reales y sí abre la puerta a que "Halo" se lleve los logros de
 * "Halo Infinite". Enseñar los de otro juego como si fueran los tuyos es peor
 * que no enseñar ninguno.
 */
export function pickTitle(gameName: string, titles: XboxTitle[]): string | null {
  const target = normalizeTitle(gameName);
  if (!target) return null;
  return titles.find((title) => normalizeTitle(title.name) === target)?.titleId ?? null;
}
