import { app } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { log } from '../../logger';
import { emit } from '../../ipc/emit';

/**
 * Auto-actualización de la app.
 *
 * Ojo con lo que actualiza y lo que no: esto trae **versiones nuevas del
 * programa**, que sí exigen empaquetar una release. El contenido —juegos,
 * cheats, mods— va por otro camino que no necesita reempaquetar nada:
 * la capa de usuario y `catalog.sync`. Ver docs/ARCHITECTURE.md.
 *
 * Sin `publish` configurado en electron-builder no hay servidor al que
 * preguntar. Se detecta por la ausencia de `app-update.yml` y se dice
 * claramente, en vez de dejar que electron-updater lance un error interno que
 * no le sirve a nadie.
 */

const logger = log('updater');

interface UpdaterModule {
  autoUpdater: {
    autoDownload: boolean;
    autoInstallOnAppQuit: boolean;
    logger: unknown;
    checkForUpdates(): Promise<{ updateInfo: { version: string } } | null>;
    downloadUpdate(): Promise<unknown>;
    quitAndInstall(): void;
    on(event: string, handler: (...args: unknown[]) => void): void;
  };
}

let loaded: UpdaterModule['autoUpdater'] | null | undefined;

/** Carga `electron-updater` de forma perezosa: en desarrollo no hace falta. */
function getUpdater(): UpdaterModule['autoUpdater'] | null {
  if (loaded !== undefined) return loaded;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('electron-updater') as UpdaterModule;
    loaded = mod.autoUpdater;
    loaded.autoDownload = false; // descargar solo si el usuario acepta
    loaded.autoInstallOnAppQuit = true;
    loaded.logger = {
      info: (m: unknown) => logger.info(String(m)),
      warn: (m: unknown) => logger.warn(String(m)),
      error: (m: unknown) => logger.error(String(m)),
      debug: () => undefined,
    };
    loaded.on('update-available', (info) => {
      const version = (info as { version?: string })?.version ?? '?';
      logger.info(`actualización disponible: ${version}`);
      emit('update:available', { version });
    });
    loaded.on('error', (e) => logger.error('fallo del actualizador:', e));
  } catch (e) {
    logger.warn('electron-updater no disponible:', e);
    loaded = null;
  }
  return loaded;
}

export interface UpdateCheck {
  available: boolean;
  version: string | null;
}

/**
 * ¿Hay servidor de actualizaciones?
 *
 * electron-builder solo genera `app-update.yml` cuando `package.json` trae un
 * bloque `publish`. Sin ese archivo no hay a quién preguntar.
 */
export function isConfigured(): boolean {
  if (!app.isPackaged) return false;
  return existsSync(join(process.resourcesPath, 'app-update.yml'));
}

export async function checkForUpdates(): Promise<UpdateCheck> {
  if (!app.isPackaged) {
    // En desarrollo no hay instalación que sustituir.
    return { available: false, version: null };
  }

  if (!isConfigured()) {
    throw new Error(
      'No hay servidor de actualizaciones configurado, así que la app no puede ' +
      'buscarse a sí misma. Se actualiza reinstalando desde el .exe. ' +
      'Los juegos, cheats y mods sí se actualizan solos: van por la carpeta de ' +
      'definiciones y por Ajustes → Catálogo, sin tocar la instalación.',
    );
  }

  const updater = getUpdater();
  if (!updater) throw new Error('El actualizador no está disponible en esta compilación');

  const result = await updater.checkForUpdates();
  const version = result?.updateInfo?.version ?? null;
  return { available: Boolean(version) && version !== app.getVersion(), version };
}

/** Descarga la actualización y la instala al cerrar. */
export async function downloadAndInstall(): Promise<void> {
  const updater = getUpdater();
  if (!updater) throw new Error('El actualizador no está disponible en esta compilación');
  await updater.downloadUpdate();
  updater.quitAndInstall();
}
