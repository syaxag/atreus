import { app, dialog, ipcMain, shell, BrowserWindow } from 'electron';
import type { Result, Settings } from '@shared/types';
import { IPC_CHANNELS, ok, err, type IpcChannel } from '@shared/ipc';
import { getSettings, setSettings } from '../services/settings';
import * as catalog from '../services/catalog';
import * as steam from '../services/steam/session';
import * as trainer from '../services/trainer';
import * as mods from '../services/mods';
import * as catalogSync from '../services/catalog/sync';
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

/** Marcador para los canales cuyo servicio aún no existe. Ver docs/ROADMAP.md. */
function pending(channel: IpcChannel, phase: string): void {
  handle(channel, () => err(`Pendiente de la ${phase}`, 'NOT_IMPLEMENTED'));
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
  handle('app.checkForUpdates', () =>
    // El actualizador real llega en la FASE 6.
    ok({ available: false, version: null }),
  );
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
  handle('library.scan', async () => ok(await catalog.scan()));
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
  ) => ok(await steam.commit(appId, patch)));
  handle('steam.resetAll', async (appId: string) => {
    await steam.resetAll(appId);
    return ok(undefined);
  });

  // ── Motor de cheats ────────────────────────────────────────
  handle('trainer.definitions', (gameId: string) => ok(trainer.definitions(gameId)));
  handle('trainer.attach', (gameId: string) => ok(trainer.attach(gameId)));
  handle('trainer.detach', (gameId: string) => { trainer.detach(gameId); return ok(undefined); });
  handle('trainer.session', (gameId: string) => ok(trainer.session(gameId)));
  handle('trainer.toggle', (gameId: string, cheatId: string, enabled: boolean) =>
    ok(trainer.toggle(gameId, cheatId, enabled)));
  handle('trainer.setValue', (gameId: string, cheatId: string, value: number) =>
    ok(trainer.setValue(gameId, cheatId, value)));
  handle('trainer.trigger', (gameId: string, cheatId: string) => {
    trainer.trigger(gameId, cheatId);
    return ok(undefined);
  });
  handle('trainer.states', (gameId: string) => ok(trainer.states(gameId)));

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

  // ── Catálogo de definiciones ───────────────────────────────
  handle('catalog.sync', async () => ok(await catalogSync.sync(getSettings().catalogSource)));
  handle('catalog.version', () => ok(catalogSync.version()));

  // ── Pendientes por fase ────────────────────────────────────
  // Cada canal responde con un error explícito en lugar de no existir, para que
  // la interfaz pueda desarrollarse contra el backend real desde ya.

  // Red de seguridad: si el contrato añade un canal y nadie lo registra, se detecta
  // aquí en el arranque y no en un fallo silencioso en tiempo de ejecución.
  const missing = IPC_CHANNELS.filter((c) => !registered.has(c));
  if (missing.length > 0) {
    logger.warn('canales del contrato sin registrar:', missing.join(', '));
  }
  logger.info(`IPC listo — ${IPC_CHANNELS.length - missing.length}/${IPC_CHANNELS.length} canales`);
}
