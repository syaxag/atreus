import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { StatType } from '@shared/types';
import {
  parseBinaryKv, asObject, asString, asNumber,
  type BinKvObject, type BinKvValue,
} from './binkv';
import { log } from '../../logger';

const logger = log('steam:schema');

/**
 * Lee `UserGameStatsSchema_<appid>.bin` de la caché de Steam.
 *
 * De aquí salen las estadísticas (nombre, tipo, si es increment-only) y, como
 * refuerzo, los textos localizados de los logros. Los logros en sí se leen por la
 * API plana, que no necesita este archivo.
 */

/**
 * Tipos tal como los codifica el esquema.
 *
 * Steam los escribe como cadena (`"INT"`, `"ACHIEVEMENTS"`) — comprobado sobre
 * los 151 esquemas de esta máquina. Se aceptan además los códigos numéricos
 * antiguos por si aparece un archivo viejo en la caché.
 */
const STAT_TYPE: Record<string, StatType> = {
  INT: 'int',
  FLOAT: 'float',
  AVGRATE: 'avgrate',
  '1': 'int',
  '2': 'float',
  '3': 'avgrate',
};

const ACHIEVEMENT_TYPES = new Set(['ACHIEVEMENTS', '4']);

/** Los flags vienen unas veces como número y otras como cadena. */
function isTrue(value: BinKvValue | undefined): boolean {
  const s = asString(value);
  return s === '1' || s?.toLowerCase() === 'true';
}

export interface SchemaStat {
  apiName: string;
  displayName: string;
  type: StatType;
  incrementOnly: boolean;
  permission: number;
  min: number | null;
  max: number | null;
}

export interface SchemaAchievement {
  apiName: string;
  displayName: string;
  description: string;
  hidden: boolean;
}

export interface GameSchema {
  stats: SchemaStat[];
  achievements: SchemaAchievement[];
}

export function schemaPath(steamPath: string, appId: string): string {
  return join(steamPath, 'appcache', 'stats', `UserGameStatsSchema_${appId}.bin`);
}

export function hasSchema(steamPath: string, appId: string): boolean {
  return existsSync(schemaPath(steamPath, appId));
}

/**
 * Saca el texto en el idioma pedido de un bloque `display`.
 * El esquema trae cada cadena en veinte idiomas; se prefiere el del usuario y
 * se cae a inglés, que siempre está.
 */
function localized(
  display: BinKvObject | undefined,
  key: string,
  language: string,
): string | undefined {
  const block = asObject(display?.[key]);
  if (!block) return undefined;
  return (
    asString(block[language]) ??
    asString(block['english']) ??
    // Último recurso: el primer idioma que haya.
    asString(Object.values(block).find((v) => typeof v === 'string'))
  );
}

/**
 * Parsea el esquema.
 *
 * Estructura: raíz `<appid>` → `stats` → `<índice>` → o bien una estadística
 * normal (con `type` 1/2/3), o bien un contenedor de logros (`type` 4) cuyos
 * `bits` son los logros individuales.
 */
export function readSchema(
  steamPath: string,
  appId: string,
  language = 'spanish',
): GameSchema {
  const empty: GameSchema = { stats: [], achievements: [] };
  const file = schemaPath(steamPath, appId);
  if (!existsSync(file)) {
    logger.info(`sin esquema local para ${appId}`);
    return empty;
  }

  let root: BinKvObject;
  try {
    root = parseBinaryKv(readFileSync(file));
  } catch (e) {
    logger.warn(`esquema de ${appId} ilegible:`, e);
    return empty;
  }

  const stats = asObject(asObject(root[appId])?.['stats']);
  if (!stats) {
    logger.warn(`esquema de ${appId} sin bloque "stats"`);
    return empty;
  }

  const out: GameSchema = { stats: [], achievements: [] };

  for (const entry of Object.values(stats)) {
    const node = asObject(entry);
    if (!node) continue;

    const type = asString(node['type'])?.toUpperCase();

    // Contenedor de logros: cada bit es un logro individual.
    if (type && ACHIEVEMENT_TYPES.has(type)) {
      const bits = asObject(node['bits']);
      if (!bits) continue;
      for (const bitEntry of Object.values(bits)) {
        const bit = asObject(bitEntry);
        const apiName = asString(bit?.['name']);
        if (!bit || !apiName) continue;
        const display = asObject(bit['display']);
        out.achievements.push({
          apiName,
          displayName: localized(display, 'name', language) ?? apiName,
          description: localized(display, 'desc', language) ?? '',
          hidden: isTrue(display?.['hidden']),
        });
      }
      continue;
    }

    // Estadística normal.
    const apiName = asString(node['name']);
    if (!apiName || !type) continue;
    const statType = STAT_TYPE[type];
    if (!statType) continue;

    const display = asObject(node['display']);
    out.stats.push({
      apiName,
      displayName: localized(display, 'name', language) ?? apiName,
      type: statType,
      incrementOnly: isTrue(node['incrementonly']),
      permission: asNumber(node['permission']) ?? 0,
      min: asNumber(node['min']),
      max: asNumber(node['max']),
    });
  }

  logger.info(
    `esquema de ${appId}: ${out.stats.length} estadísticas, ${out.achievements.length} logros`,
  );
  return out;
}
