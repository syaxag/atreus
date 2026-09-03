import { BrowserWindow } from 'electron';
import type { AtreusEvents } from '@shared/ipc';

/**
 * Envío de eventos push del main al renderer, tipado por `AtreusEvents`.
 * Se emite a todas las ventanas vivas; hoy solo hay una.
 */
export function emit<K extends keyof AtreusEvents>(
  channel: K,
  payload: AtreusEvents[K],
): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

