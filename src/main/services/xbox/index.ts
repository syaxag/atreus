import { net } from 'electron';
import type { Achievement } from '@shared/types';
import { log } from '../../logger';
import { getSettings } from '../settings';
import {
  parseAccount, parseAchievements, parseTitles, pickTitle, type XboxTitle,
} from './parse';

const logger = log('xbox');

/**
 * Logros de Xbox, con tu estado real.
 *
 * La API de Xbox Live no se puede consultar sin autenticarse, y Atreus no va a
 * pedirte la contraseña de Microsoft. El camino de en medio es OpenXBL: tú
 * entras con tu cuenta **en su web**, generas una clave, y la pegas en Ajustes.
 * Atreus solo maneja esa clave, que puedes revocar cuando quieras.
 *
 * Sin clave no pasa nada: los juegos de Xbox siguen usando la lista del
 * catálogo público de Steam con el progreso que marques tú.
 */

const BASE = 'https://xbl.io/api/v2';
const TIMEOUT_MS = 12_000;
const TITLES_TTL_MS = 6 * 60 * 60_000;
const ACHIEVEMENTS_TTL_MS = 15 * 60_000;

function key(): string | null {
  const value = getSettings().xboxApiKey?.trim();
  return value && value.length >= 8 ? value : null;
}

export function available(): boolean {
  return key() !== null;
}

async function call<T>(path: string): Promise<T | null> {
  const apiKey = key();
  if (!apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await net.fetch(`${BASE}${path}`, {
      headers: { 'X-Authorization': apiKey, Accept: 'application/json' },
      signal: controller.signal,
    });
    // 401 es "la clave no vale" y 404 "ese juego no está en tu historial":
    // los dos son respuestas, no averías, y quien llama tiene otro camino.
    if (response.status === 401 || response.status === 404) return null;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as T;
  } catch (e) {
    logger.warn(`${path} falló:`, e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Cuenta ────────────────────────────────────────────────────

let account: { at: number; xuid: string; gamertag: string | null } | null = null;

async function xuid(): Promise<string | null> {
  if (account && Date.now() - account.at < TITLES_TTL_MS) return account.xuid;
  const parsed = parseAccount(await call('/account'));
  if (!parsed) return null;
  account = { at: Date.now(), ...parsed };
  return parsed.xuid;
}

// ── Historial de títulos ──────────────────────────────────────

let titles: { at: number; list: XboxTitle[] } | null = null;

async function titleHistory(): Promise<XboxTitle[]> {
  if (titles && Date.now() - titles.at < TITLES_TTL_MS) return titles.list;
  const list = parseTitles(await call('/titles'));
  titles = { at: Date.now(), list };
  logger.info(`historial de Xbox: ${list.length} juegos`);
  return list;
}

// ── Logros de un juego ────────────────────────────────────────

const cache = new Map<string, { at: number; items: Achievement[] | null }>();

/**
 * Logros de un juego de Xbox, con tu estado. null si no se puede: sin clave,
 * si el juego no está en tu historial, o si Xbox no responde.
 */
export async function achievementsFor(gameName: string): Promise<Achievement[] | null> {
  if (!available()) return null;
  const cached = cache.get(gameName);
  if (cached && Date.now() - cached.at < ACHIEVEMENTS_TTL_MS) return cached.items;

  const user = await xuid();
  if (!user) return null;

  const titleId = pickTitle(gameName, await titleHistory());
  if (!titleId) {
    logger.info(`"${gameName}" no aparece en tu historial de Xbox`);
    cache.set(gameName, { at: Date.now(), items: null });
    return null;
  }

  const raw = parseAchievements(await call(`/achievements/player/${user}/${titleId}`));
  const items = raw.length > 0
    ? raw.map((achievement): Achievement => ({
      apiName: `xbox:${achievement.id}`,
      displayName: achievement.name,
      description: achievement.description,
      iconUrl: achievement.iconUrl,
      iconGrayUrl: null,
      hidden: achievement.hidden,
      unlocked: achievement.unlocked,
      unlockTime: achievement.unlockTime,
      protected: false,
      globalPercent: achievement.rarityPercent,
    }))
    : null;

  if (items) logger.info(`${gameName}: ${items.filter((a) => a.unlocked).length}/${items.length} logros de Xbox`);
  cache.set(gameName, { at: Date.now(), items });
  return items;
}

export function forget(gameName?: string): void {
  if (gameName) cache.delete(gameName);
  else {
    cache.clear();
    titles = null;
    account = null;
  }
}

// ── Comprobación de la clave ──────────────────────────────────

export interface XboxKeyCheck {
  ok: boolean;
  gamertag: string | null;
  /** Cuántos juegos ve Atreus en tu historial. */
  titles: number;
  message: string;
}

/**
 * Comprueba la clave y dice qué se ve con ella.
 *
 * Sin esto, una clave mal pegada se traduce en "este juego no tiene logros",
 * que es exactamente el mensaje que no ayuda.
 */
export async function checkKey(): Promise<XboxKeyCheck> {
  if (!available()) {
    return { ok: false, gamertag: null, titles: 0, message: 'No hay ninguna clave de OpenXBL guardada.' };
  }
  forget();

  const parsed = parseAccount(await call('/account'));
  if (!parsed) {
    return {
      ok: false,
      gamertag: null,
      titles: 0,
      message: 'OpenXBL no aceptó la clave. Genera una nueva en xbl.io y vuelve a pegarla.',
    };
  }
  account = { at: Date.now(), ...parsed };

  const list = await titleHistory();
  return {
    ok: true,
    gamertag: parsed.gamertag,
    titles: list.length,
    message: list.length > 0
      ? `Conectado como ${parsed.gamertag ?? parsed.xuid}: ${list.length} juegos en tu historial de Xbox.`
      : `Conectado como ${parsed.gamertag ?? parsed.xuid}, pero tu historial de juegos viene vacío. ` +
        'Comprueba en la privacidad de tu cuenta que el historial de juego sea visible.',
  };
}
