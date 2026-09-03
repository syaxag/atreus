import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { net } from 'electron';
import type { Achievement, SteamKeyStatus } from '@shared/types';
import { log } from '../../logger';
import { getSettings } from '../settings';
import { findSteamPath } from '../catalog/steam';
import { getActiveSteamId } from './locator';

const logger = log('steam:webapi');

/**
 * La Steam Web API, cuando el usuario ha puesto su clave en Ajustes.
 *
 * Es el camino barato: `GetPlayerAchievements` devuelve el estado **real** de
 * tus logros —con nombre, descripción y fecha— en una petición HTTP, sin
 * arrancar un proceso hijo por juego. Eso es lo que permite que la biblioteca
 * entera sepa por dónde vas nada más abrir Atreus, en vez de tener que entrar
 * juego por juego.
 *
 * Lo que no da es escritura: para marcar un logro sigue haciendo falta el
 * cliente. Por eso este camino va por detrás del cliente y por delante del
 * catálogo público.
 *
 * Todo aquí es opcional. Sin clave, sin SteamID o con el perfil en privado,
 * las funciones devuelven null y el resto de la aplicación sigue su camino.
 */

const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 5 * 60_000;

/** Se pide en español; Steam cae al inglés donde no haya traducción. */
const LANGUAGE = 'spanish';

function key(): string | null {
  const value = getSettings().steamWebApiKey?.trim();
  return value && /^[0-9A-F]{32}$/i.test(value) ? value : null;
}

/**
 * SteamID64 del usuario.
 *
 * El registro dice cuál es la cuenta conectada ahora mismo; si Steam nunca se
 * ha abierto en esta sesión, se cae a la única carpeta de `userdata`, que en la
 * inmensa mayoría de equipos es la del dueño.
 */
export function steamId(): string | null {
  const fromRegistry = getActiveSteamId();
  if (fromRegistry) return fromRegistry;

  const steamPath = findSteamPath(getSettings().steamPath);
  if (!steamPath) return null;
  try {
    const accounts = readdirSync(join(steamPath, 'userdata')).filter((name) => /^\d+$/.test(name));
    if (accounts.length !== 1) return null;
    return (76561197960265728n + BigInt(accounts[0]!)).toString();
  } catch {
    return null;
  }
}

/** true si hay clave y SteamID: se puede usar este camino. */
export function available(): boolean {
  return key() !== null && steamId() !== null;
}

async function call<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const apiKey = key();
  const user = steamId();
  if (!apiKey || !user) return null;

  const query = new URLSearchParams({ key: apiKey, steamid: user, format: 'json', ...params });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await net.fetch(`https://api.steampowered.com/${path}?${query}`, {
      signal: controller.signal,
    });
    /*
     * Steam devuelve 403 cuando el perfil está en privado y 400 cuando el juego
     * no publica logros. Ninguno de los dos es un fallo del que avisar a gritos:
     * significan "por aquí no", y quien llama tiene otro camino.
     */
    if (response.status === 403 || response.status === 400) return null;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as T;
  } catch (e) {
    logger.warn(`${path} falló:`, e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Logros de un juego ────────────────────────────────────────

interface PlayerAchievementsResponse {
  playerstats?: {
    success?: boolean;
    achievements?: {
      apiname?: string;
      achieved?: number;
      unlocktime?: number;
      name?: string;
      description?: string;
    }[];
  };
}

const cache = new Map<string, { at: number; items: Achievement[] | null }>();

/**
 * Estado real de los logros de un juego, sin abrir el cliente.
 *
 * Devuelve null cuando no se puede: sin clave, con el perfil en privado, o si
 * el juego no tiene logros. Los iconos no vienen en esta respuesta, así que se
 * dejan en null y los rellena quien los tenga —el catálogo público los trae.
 */
export async function playerAchievements(appId: string): Promise<Achievement[] | null> {
  if (!available()) return null;
  const cached = cache.get(appId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.items;

  const body = await call<PlayerAchievementsResponse>(
    'ISteamUserStats/GetPlayerAchievements/v1/',
    { appid: appId, l: LANGUAGE },
  );

  const raw = body?.playerstats?.success === true ? body.playerstats.achievements : undefined;
  const items = Array.isArray(raw) && raw.length > 0
    ? raw
      .filter((a): a is { apiname: string } & typeof a => typeof a?.apiname === 'string')
      .map((a): Achievement => ({
        apiName: a.apiname,
        displayName: a.name?.trim() || a.apiname,
        description: a.description?.trim() ?? '',
        iconUrl: null,
        iconGrayUrl: null,
        // La Web API no marca los ocultos; una descripción vacía los delata,
        // igual que en la página pública de estadísticas.
        hidden: !a.description?.trim(),
        unlocked: a.achieved === 1,
        unlockTime: a.achieved === 1 && a.unlocktime ? a.unlocktime : null,
        protected: false,
        globalPercent: null,
      }))
    : null;

  cache.set(appId, { at: Date.now(), items });
  return items;
}

export function forgetPlayerAchievements(appId?: string): void {
  if (appId) cache.delete(appId);
  else cache.clear();
}

// ── Comprobación de la clave ──────────────────────────────────

interface SummariesResponse {
  response?: { players?: { personaname?: string; communityvisibilitystate?: number }[] };
}

export interface KeyCheck {
  ok: boolean;
  /** Nombre de la cuenta cuando la clave funciona. */
  persona: string | null;
  /** true si el perfil es público; con uno privado los logros no se leen. */
  publicProfile: boolean;
  /** Qué ha pasado. La frase la escribe Ajustes, que sabe el idioma. */
  status: SteamKeyStatus;
}

/**
 * Comprueba la clave contra Steam y explica qué pasa.
 *
 * Existe porque una clave mal pegada, o un perfil en privado, fallan **en
 * silencio**: los logros simplemente no aparecen y no hay forma de saber por
 * qué. Con esto Ajustes puede decirlo en el momento.
 */
export async function checkKey(): Promise<KeyCheck> {
  if (key() === null) {
    return { ok: false, persona: null, publicProfile: false, status: 'badFormat' };
  }
  const user = steamId();
  if (!user) {
    return { ok: false, persona: null, publicProfile: false, status: 'noSteamId' };
  }

  const body = await call<SummariesResponse>('ISteamUser/GetPlayerSummaries/v2/', { steamids: user });
  const player = body?.response?.players?.[0];
  if (!player) {
    return { ok: false, persona: null, publicProfile: false, status: 'rejected' };
  }

  const publicProfile = player.communityvisibilitystate === 3;
  return {
    ok: true,
    persona: player.personaname ?? null,
    publicProfile,
    status: publicProfile ? 'ok' : 'privateProfile',
  };
}
