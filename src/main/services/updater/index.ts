import { app } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { log } from '../../logger';
import { emit } from '../../ipc/emit';
import { getSettings } from '../settings';

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
    setFeedURL(options: { provider: 'generic'; url: string }): void;
    checkForUpdates(): Promise<{ updateInfo: { version: string } } | null>;
    downloadUpdate(): Promise<unknown>;
    quitAndInstall(): void;
    on(event: string, handler: (...args: unknown[]) => void): void;
  };
}

let loaded: UpdaterModule['autoUpdater'] | null | undefined;
let configuredFeed: string | null = null;

/** Carga `electron-updater` de forma perezosa: en desarrollo no hace falta. */
function getUpdater(): UpdaterModule['autoUpdater'] | null {
  if (loaded !== undefined) return loaded;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('electron-updater') as UpdaterModule;
    loaded = mod.autoUpdater;
    loaded.autoDownload = false;
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
    loaded.on('update-downloaded', (info) => {
      const version = (info as { version?: string })?.version ?? '?';
      logger.info(`actualización descargada: ${version}`);
      emit('toast', { level: 'success', message: `Atreus ${version} está listo para instalarse al cerrar.` });
      emit('update:downloaded', { version });
    });
    loaded.on('download-progress', (value) => {
      const progress = value as { percent?: number; bytesPerSecond?: number; transferred?: number; total?: number };
      emit('update:progress', {
        percent: progress.percent ?? 0, bytesPerSecond: progress.bytesPerSecond ?? 0,
        transferred: progress.transferred ?? 0, total: progress.total ?? 0,
      });
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

function releaseFeed(): string | null {
  const source = getSettings().updateSource.trim().replace(/\/+$/, '');
  if (!source) return null;
  try {
    const url = new URL(source);
    return url.protocol === 'https:' ? url.toString().replace(/\/$/, '') : null;
  } catch {
    return null;
  }
}

function configureFeed(updater: UpdaterModule['autoUpdater']): boolean {
  const source = releaseFeed();
  if (source) {
    if (configuredFeed !== source) {
      updater.setFeedURL({ provider: 'generic', url: source });
      configuredFeed = source;
      logger.info(`origen de actualizaciones configurado: ${source}`);
    }
    return true;
  }

  // Conserva la compatibilidad con instalaciones antiguas que sí se empaquetaron
  // con publish en electron-builder.
  return existsSync(join(process.resourcesPath, 'app-update.yml'));
}

/**
 * ¿Hay servidor de actualizaciones?
 *
 * electron-builder solo genera `app-update.yml` cuando `package.json` trae un
 * bloque `publish`. Sin ese archivo no hay a quién preguntar.
 */
export function isConfigured(): boolean {
  if (!app.isPackaged) return false;
  return Boolean(releaseFeed()) || existsSync(join(process.resourcesPath, 'app-update.yml'));
}

export async function checkForUpdates(): Promise<UpdateCheck> {
  if (!app.isPackaged) {
    // En desarrollo no hay instalación que sustituir.
    return { available: false, version: null };
  }

  if (!isConfigured()) {
    throw new Error(
      'Configura una URL HTTPS de releases en Ajustes → Actualizaciones. Debe ' +
      'contener latest.yml y el instalador generado por Atreus.',
    );
  }

  const updater = getUpdater();
  if (!updater) throw new Error('El actualizador no está disponible en esta compilación');
  if (!configureFeed(updater)) throw new Error('No se pudo configurar el origen de actualizaciones');

  const result = await updater.checkForUpdates();
  const version = result?.updateInfo?.version ?? null;
  return { available: Boolean(version) && version !== app.getVersion(), version };
}

/** Descarga la actualización y la instala al cerrar. */
export async function downloadAndInstall(): Promise<void> {
  const updater = getUpdater();
  if (!updater) throw new Error('El actualizador no está disponible en esta compilación');
  if (!configureFeed(updater)) throw new Error('Configura una URL HTTPS de releases antes de descargar');
  await updater.downloadUpdate();
  updater.quitAndInstall();
}

/** Busca actualizaciones al arrancar; no bloquea la ventana ni molesta si no hay feed. */
export async function startAutomaticUpdates(): Promise<void> {
  if (!app.isPackaged || !getSettings().checkForAppUpdates || !isConfigured()) return;
  try {
    const result = await checkForUpdates();
    if (result.available && getSettings().autoDownloadUpdates) {
      const updater = getUpdater();
      if (updater) await updater.downloadUpdate();
    }
  } catch (error) {
    // Una red caída no debe mostrar un modal ni impedir que Atreus funcione.
    logger.warn('comprobación automática de actualizaciones falló:', error);
  }
}
