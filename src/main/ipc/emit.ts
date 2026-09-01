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

/** Atajo para el evento `toast`, que es el que más se usa. */
export const toast = {
  info: (message: string) => emit('toast', { level: 'info', message }),
  success: (message: string) => emit('toast', { level: 'success', message }),
  warn: (message: string) => emit('toast', { level: 'warn', message }),
  error: (message: string) => emit('toast', { level: 'error', message }),
};
