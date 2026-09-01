/// <reference types="vite/client" />

import type { AtreusApi } from '@shared/ipc';

declare global {
  interface Window {
    /** Inyectado por src/preload/index.ts. Ausente cuando se corre con VITE_MOCK=1. */
    atreus?: AtreusApi;
  }
}

interface ImportMetaEnv {
  readonly VITE_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

export {};
