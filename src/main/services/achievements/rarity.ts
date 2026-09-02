import { net } from 'electron';
import { log } from '../../logger';

const logger = log('achievements:rarity');

/**
 * Rareza global de los logros de un juego de Steam.
 *
 * `GetGlobalAchievementPercentagesForApp` es pública: no lleva clave de API ni
 * identifica a nadie. Devuelve, para cada logro, qué porcentaje de los
 * jugadores del mundo lo tiene. Es el único dato objetivo que existe para decir
 * si un platino es duro o regalado, así que es la base de todo el informe.
 */

const ENDPOINT = 'https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/';
const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 12 * 60 * 60_000;

interface Entry {
  at: number;
  /** apiName → porcentaje 0–100. Vacío si el juego no publica estadísticas. */
  percentages: Map<string, number>;
}

const cache = new Map<string, Entry>();
/** Peticiones en vuelo, para que abrir dos vistas no dispare dos consultas. */
const inflight = new Map<string, Promise<Map<string, number>>>();

interface ApiResponse {
  achievementpercentages?: { achievements?: { name?: string; percent?: number | string }[] };
}

async function fetchPercentages(appId: string): Promise<Map<string, number>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await net.fetch(`${ENDPOINT}?gameid=${encodeURIComponent(appId)}&format=json`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Steam respondió HTTP ${response.status}`);
    const body = (await response.json()) as ApiResponse;
    const list = body.achievementpercentages?.achievements ?? [];
    const out = new Map<string, number>();
    for (const item of list) {
      const name = typeof item?.name === 'string' ? item.name : null;
      const percent = Number(item?.percent);
      if (name && Number.isFinite(percent)) out.set(name, percent);
    }
    return out;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Porcentajes globales del juego. Nunca lanza: si Steam no responde o el juego
 * no publica estadísticas, devuelve un mapa vacío y el informe se apaña sin él.
 */
export async function globalPercentages(appId: string): Promise<Map<string, number>> {
  const cached = cache.get(appId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.percentages;

  const running = inflight.get(appId);
  if (running) return running;

  const promise = fetchPercentages(appId)
    .then((percentages) => {
      cache.set(appId, { at: Date.now(), percentages });
      return percentages;
    })
    .catch((e) => {
      logger.warn(`sin rareza global para ${appId}:`, e);
      // Se cachea el vacío un rato para no reintentar en cada repintado.
      const empty = new Map<string, number>();
      cache.set(appId, { at: Date.now(), percentages: empty });
      return empty;
    })
    .finally(() => inflight.delete(appId));

  inflight.set(appId, promise);
  return promise;
}

/** Etiqueta legible para un porcentaje global. */
export function rarityLabel(percent: number | null): string {
  if (percent === null) return 'Sin datos';
  if (percent < 1) return 'Legendario';
  if (percent < 5) return 'Ultra raro';
  if (percent < 15) return 'Raro';
  if (percent < 40) return 'Poco común';
  return 'Común';
}
