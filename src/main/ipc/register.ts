import { app, dialog, ipcMain, shell, BrowserWindow } from 'electron';
import type { CompletionProgress, GuideCategory, GuideEntry, Result, Settings } from '@shared/types';
import { IPC_CHANNELS, ok, err, type IpcChannel } from '@shared/ipc';
import { getSettings, setSettings } from '../services/settings';
import * as catalog from '../services/catalog';
import * as steam from '../services/steam/session';
import * as steamWeb from '../services/steam/webapi';
import * as mods from '../services/mods';
import * as catalogSync from '../services/catalog/sync';
import * as updater from '../services/updater';
import * as guides from '../services/guides';
import * as progress from '../services/progress';
import * as achievements from '../services/achievements';
import * as maps from '../services/maps';
import * as platinum from '../services/platinum';
import { startWarmup } from '../services/platinum/warmup';
import { paths, OPENABLE, type OpenableKey } from '../paths';
import { log } from '../logger';

const logger = log('ipc');

/**
 * Canales ya registrados. Hace falta llevar la cuenta a mano: `ipcMain.handle()`
 * guarda sus canales en un registro interno propio, así que `ipcMain.eventNames()`
 * no los ve y no sirve para comprobar la cobertura del contrato.
 */
const registered = new Set<IpcChannel>();

/**
 * Registra un canal envolviendo el handler para que nunca lance a través del IPC.
 * Ver docs/CONTRACT.md, regla 2: todo devuelve `Result<T>`.
 */
function handle<T>(
  channel: IpcChannel,
  fn: (...args: any[]) => Promise<Result<T>> | Result<T>,
): void {
  registered.add(channel);
  ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
    try {
      return await fn(...args);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error(`${channel} falló:`, e);
      return err(message);
    }
  });
}

export function registerIpc(): void {
  // ── Ajustes ────────────────────────────────────────────────
  handle('settings.get', () => ok<Settings>(getSettings()));
  handle('settings.set', (patch: Partial<Settings>) => ok(setSettings(patch)));

  handle('settings.pickFolder', async (title: string) => {
    const res = await dialog.showOpenDialog({
      title,
      properties: ['openDirectory'],
    });
    return ok(res.canceled ? null : (res.filePaths[0] ?? null));
  });

  handle('settings.pickFile', async (
    title: string,
    filters?: { name: string; extensions: string[] }[],
  ) => {
    const res = await dialog.showOpenDialog({
      title,
      properties: ['openFile'],
      filters: filters ?? [],
    });
    return ok(res.canceled ? null : (res.filePaths[0] ?? null));
  });

  /**
   * Abre una carpeta conocida o una URL externa.
   *
   * No acepta una ruta arbitraria a propósito: `shell.openPath` sobre un `.exe`
   * lo ejecuta, y eso es más capacidad de la que el renderer necesita. Solo
   * valen las claves de `OPENABLE` y las URLs https, que van por `openExternal`
   * (`openPath` no sabe abrir URLs, que era además por lo que el botón de la
   * clave de API no hacía nada).
   */
  handle('settings.openPath', async (target: string) => {
    if (/^https:\/\//i.test(target)) {
      await shell.openExternal(target);
      return ok(undefined);
    }

    const folder = OPENABLE[target as OpenableKey];
    if (!folder) {
      return err(
        `Destino no permitido: "${target}". Válidos: ${Object.keys(OPENABLE).join(', ')} o una URL https.`,
        'FORBIDDEN',
      );
    }
    const error = await shell.openPath(folder);
    return error ? err(error) : ok(undefined);
  });

  // ── App ────────────────────────────────────────────────────
  handle('app.version', () => ok(app.getVersion()));
  handle('app.checkForUpdates', async () => ok(await updater.checkForUpdates()));
  handle('app.downloadUpdate', async () => {
    await updater.downloadAndInstall();
    return ok(undefined);
  });
  handle('app.openLogs', async () => {
    const error = await shell.openPath(paths.logs);
    return error ? err(error) : ok(undefined);
  });

  // Controles de ventana: son `send`, no `invoke`, porque no devuelven nada.
  ipcMain.on('window.minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
  ipcMain.on('window.maximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on('window.close', (e) => BrowserWindow.fromWebContents(e.sender)?.close());

  // ── Biblioteca ─────────────────────────────────────────────
  handle('library.list', () => ok(catalog.listGames()));
  handle('library.scan', async () => {
    const games = await catalog.scan();
    // Un escaneo puede traer juegos nuevos: que el cálculo los recoja.
    startWarmup();
    return ok(games);
  });
  handle('library.get', (id: string) => {
    const game = catalog.getGame(id);
    return game ? ok(game) : err(`Juego no encontrado: ${id}`, 'NOT_FOUND');
  });
  handle('library.addManual', (exePath: string) => ok(catalog.addManual(exePath)));
  handle('library.remove', (id: string) => { catalog.removeGame(id); return ok(undefined); });
  handle('library.setFavorite', (id: string, favorite: boolean) => {
    catalog.setFavorite(id, favorite);
    return ok(undefined);
  });
  handle('library.launch', async (id: string, args?: string) =>
    ok(await catalog.launch(id, args)));

  // ── Logros y estadísticas ──────────────────────────────────
  handle('steam.open', async (appId: string) => ok(await steam.open(appId)));
  handle('steam.close', (appId: string) => { steam.close(appId); return ok(undefined); });
  handle('steam.achievements', async (appId: string) => ok(await steam.achievements(appId)));
  handle('steam.stats', async (appId: string) => ok(await steam.stats(appId)));
  handle('steam.commit', async (
    appId: string,
    patch: { achievements: { apiName: string; unlocked: boolean }[];
             stats: { apiName: string; value: number }[] },
  ) => {
    const result = await steam.commit(appId, patch);
    // El informe cacheado acaba de quedarse viejo por nuestra propia mano.
    platinum.invalidate(`steam:${appId}`);
    return ok(result);
  });
  handle('steam.backups', (appId: string) => ok(steam.backups(appId)));
  handle('steam.restore', async (appId: string, snapshotId: string) => {
    const result = await steam.restore(appId, snapshotId);
    platinum.invalidate(`steam:${appId}`);
    return ok(result);
  });
  handle('steam.resetAll', async (appId: string) => {
    await steam.resetAll(appId);
    platinum.invalidate(`steam:${appId}`);
    return ok(undefined);
  });

  // ── Gestor de mods ─────────────────────────────────────────
  handle('mods.list', (gameId: string) => ok(mods.list(gameId)));
  handle('mods.install', async (gameId: string, archivePath?: string) =>
    ok(await mods.install(gameId, archivePath)));
  handle('mods.uninstall', (gameId: string, modId: string) => {
    mods.uninstall(gameId, modId);
    return ok(undefined);
  });
  handle('mods.setEnabled', (gameId: string, modId: string, enabled: boolean) =>
    ok(mods.setEnabled(gameId, modId, enabled)));
  handle('mods.reorder', (gameId: string, modIds: string[]) =>
    ok(mods.reorder(gameId, modIds)));
  handle('mods.deploy', (gameId: string) => ok(mods.deploy(gameId)));
  handle('mods.purge', (gameId: string) => { mods.purge(gameId); return ok(undefined); });
  handle('mods.profiles', (gameId: string) => ok(mods.profiles(gameId)));
  handle('mods.saveProfile', (profile: Parameters<typeof mods.saveProfile>[0]) =>
    ok(mods.saveProfile(profile)));
  handle('mods.activateProfile', (gameId: string, profileId: string) => {
    mods.activateProfile(gameId, profileId);
    return ok(undefined);
  });
  handle('mods.deleteProfile', (gameId: string, profileId: string) => {
    mods.deleteProfile(gameId, profileId);
    return ok(undefined);
  });
  handle('mods.discover', async (gameId: string) => ok(await mods.discover(gameId)));
  handle('mods.installRemote', async (
    gameId: string,
    mod: Parameters<typeof mods.installRemote>[1],
  ) => ok(await mods.installRemote(gameId, mod)));

  handle('steam.checkKey', async () => ok(await steamWeb.checkKey()));

  // ── Logros de cualquier plataforma ─────────────────────────
  handle('achievements.list', (gameId: string) => achievements.list(gameId).then(ok));
  handle('achievements.mark', async (gameId: string, patches: { apiName: string; unlocked: boolean }[]) => {
    const set = await achievements.mark(gameId, patches);
    // El informe cacheado acaba de quedarse viejo por nuestra propia mano.
    platinum.invalidate(gameId);
    return ok(set);
  });

  // ── Informe de platino ─────────────────────────────────────
  handle('platinum.report', (gameId: string, refresh?: boolean) =>
    platinum.report(gameId, refresh === true).then(ok));
  handle('platinum.summaries', () => ok(platinum.summariesFor()));

  // ── Guías con texto completo ───────────────────────────────
  handle('guides.list', (gameId: string, category: GuideCategory, query?: string) =>
    guides.list(gameId, category, query).then(ok));
  handle('guides.read', (entry: GuideEntry) => guides.read(entry).then(ok));

  // ── Mapas interactivos ─────────────────────────────────────
  handle('maps.list', (gameId: string) => maps.list(gameId).then(ok));
  handle('maps.add', (gameId: string, input: { title: string; url: string }) =>
    maps.add(gameId, input).then(ok));
  handle('maps.remove', (gameId: string, mapId: string) => maps.remove(gameId, mapId).then(ok));

  // ── Progreso de completado local ───────────────────────────
  handle('progress.get', (gameId: string) => ok(progress.get(gameId)));
  handle('progress.save', (value: CompletionProgress) => ok(progress.save(value)));

  // ── Catálogo de definiciones ───────────────────────────────
  handle('catalog.sync', async () => ok(await catalogSync.sync(getSettings().catalogSource)));
  handle('catalog.version', () => ok(catalogSync.version()));

  // Red de seguridad: si el contrato añade un canal y nadie lo registra, se detecta
  // aquí en el arranque y no en un fallo silencioso en tiempo de ejecución.
  const missing = IPC_CHANNELS.filter((c) => !registered.has(c));
  if (missing.length > 0) {
    logger.warn('canales del contrato sin registrar:', missing.join(', '));
  }
  logger.info(`IPC listo — ${IPC_CHANNELS.length - missing.length}/${IPC_CHANNELS.length} canales`);
}
