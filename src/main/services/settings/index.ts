import { safeStorage } from 'electron';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import type { Settings } from '@shared/types';
import { paths } from '../../paths';
import { log } from '../../logger';
import { revisar, revisarGuardado } from './validar';
import { cifrar, descifrar } from './secretos';

const logger = log('settings');

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  accent: '#8b5cf6',
  steamPath: null,
  steamWebApiKey: null,
  xboxApiKey: null,
  scanOnStart: true,
  minimizeToTray: true,
  catalogSource: '',
  autoSyncCatalog: true,
  updateSource: '',
  checkForAppUpdates: true,
  autoDownloadUpdates: false,
  achievementRiskAccepted: false,
  celebrationSound: true,
  language: 'es',
};

let cache: Settings | null = null;

/** Lee de disco la primera vez y cachea. Nunca lanza: cae a los valores por defecto. */
export function getSettings(): Settings {
  if (cache) return cache;
  try {
    const raw = readFileSync(paths.settings, 'utf8');
    const parsed = JSON.parse(raw) as unknown;

    /*
     * Lo leído del disco se revisa igual que lo que llega del renderer.
     *
     * Un `settings.json` de una versión anterior, o editado a mano, o traído de
     * otro equipo, puede traer cualquier cosa. Lo que no encaja cae a su valor
     * por defecto en vez de entrar en la aplicación y romper algo más lejos.
     */
    const { limpio, rechazos } = revisarGuardado(parsed);
    for (const { clave, motivo } of rechazos) {
      logger.warn(`settings.json: "${clave}" se ignora — ${motivo}`);
    }

    // Mezclar con los defaults para que las claves nuevas no queden undefined
    // al actualizar la app.
    const { valor, avisos } = descifrar({ ...DEFAULT_SETTINGS, ...limpio }, safeStorage);
    for (const aviso of avisos) logger.warn(aviso);
    cache = valor;
  } catch {
    logger.info('sin settings.json previo, usando valores por defecto');
    cache = { ...DEFAULT_SETTINGS };
  }
  return cache;
}

/**
 * Quién quiere enterarse de que los ajustes han cambiado.
 *
 * Lo pidió el menú de la bandeja: lo construye Electron una vez al arrancar,
 * así que sin avisar seguiría en el idioma anterior hasta reiniciar Atreus.
 */
type Oyente = (settings: Settings) => void;
const oyentes = new Set<Oyente>();

/** Se suscribe a los cambios. Devuelve cómo darse de baja. */
export function onSettingsChanged(oyente: Oyente): () => void {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

/**
 * Aplica un parche parcial y persiste. Devuelve los ajustes ya combinados.
 *
 * El parche viene del renderer y **se revisa**: lo que no encaja se descarta
 * con el motivo en el registro y el resto se aplica igual. Antes se mezclaba
 * sin mirar, así que un valor de otro tipo se quedaba escrito en el disco y
 * sobrevivía al reinicio.
 */
export function setSettings(patch: Partial<Settings>): Settings {
  const { limpio, rechazos } = revisar(patch);
  for (const { clave, motivo } of rechazos) {
    logger.warn(`ajuste rechazado: "${clave}" — ${motivo}`);
  }

  const next: Settings = { ...getSettings(), ...limpio };
  cache = next;
  persist(next);
  for (const oyente of oyentes) oyente(next);
  return next;
}

/**
 * Escritura atómica: se escribe a un temporal y se renombra.
 *
 * Las claves de API se cifran justo aquí, en el borde del disco: en memoria y
 * en el resto de la aplicación siguen siendo cadenas normales.
 */
function persist(value: Settings): void {
  const tmp = `${paths.settings}.tmp`;
  try {
    const { valor, avisos } = cifrar(value, safeStorage);
    for (const aviso of avisos) logger.warn(aviso);
    writeFileSync(tmp, JSON.stringify(valor, null, 2), 'utf8');
    renameSync(tmp, paths.settings);
  } catch (e) {
    logger.error('no se pudo guardar settings.json', e);
  }
}
