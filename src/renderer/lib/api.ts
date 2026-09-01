import type { AtreusApi } from '@shared/ipc';
import { mockApi } from '../mock/api';

/**
 * Punto único de acceso al backend.
 *
 * Con VITE_MOCK=1 (`npm run dev:mock`) se usa el backend falso; en cualquier otro
 * caso, el puente real del preload. Ver docs/CONTRACT.md.
 */

const forced = import.meta.env.VITE_MOCK === '1';

export const usingMock = forced || !window.atreus;

export const api: AtreusApi = usingMock ? mockApi : (window.atreus as AtreusApi);

if (usingMock && !forced) {
  console.warn('[atreus] no hay puente del preload; usando el backend falso');
}
