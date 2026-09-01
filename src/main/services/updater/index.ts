import { app } from 'electron';
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
 * preguntar, así que el comprobador informa de que no está configurado en vez
 * de fallar con un error de red poco claro.
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

export async function checkForUpdates(): Promise<UpdateCheck> {
  if (!app.isPackaged) {
    // En desarrollo no hay instalación que sustituir.
    return { available: false, version: null };
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
