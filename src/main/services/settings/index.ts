import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import type { Settings } from '@shared/types';
import { paths } from '../../paths';
import { log } from '../../logger';

const logger = log('settings');

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  accent: '#8b5cf6',
  steamPath: null,
  steamWebApiKey: null,
  scanOnStart: true,
  minimizeToTray: true,
  catalogSource: '',
  autoSyncCatalog: true,
  updateSource: '',
  checkForAppUpdates: true,
  autoDownloadUpdates: false,
  achievementRiskAccepted: false,
  language: 'es',
};

let cache: Settings | null = null;

/** Lee de disco la primera vez y cachea. Nunca lanza: cae a los valores por defecto. */
export function getSettings(): Settings {
  if (cache) return cache;
  try {
    const raw = readFileSync(paths.settings, 'utf8');
    const parsed = JSON.parse(raw) as Partial<Settings>;
    // Mezclar con los defaults para que las claves nuevas no queden undefined
    // al actualizar la app.
    cache = { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    logger.info('sin settings.json previo, usando valores por defecto');
    cache = { ...DEFAULT_SETTINGS };
  }
  return cache;
}

/** Aplica un parche parcial y persiste. Devuelve los ajustes ya combinados. */
export function setSettings(patch: Partial<Settings>): Settings {
  const next: Settings = { ...getSettings(), ...patch };
  cache = next;
  persist(next);
  return next;
}

/** Escritura atómica: se escribe a un temporal y se renombra. */
function persist(value: Settings): void {
  const tmp = `${paths.settings}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
    renameSync(tmp, paths.settings);
  } catch (e) {
    logger.error('no se pudo guardar settings.json', e);
  }
}
