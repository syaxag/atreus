/// <reference types="vite/client" />

import type { AtreusApi } from '@shared/ipc';

declare global {
  interface Window {
    /** Inyectado por src/preload/index.ts. Ausente cuando se corre con VITE_MOCK=1. */
    atreus?: AtreusApi;
  }

  namespace JSX {
    interface IntrinsicElements {
      /**
       * `<webview>` de Electron, donde se abren los mapas interactivos.
       *
       * React no lo conoce, así que hay que declararlo. Solo se exponen los
       * atributos que Atreus usa: nada de `nodeintegration` ni `preload`, que
       * son justamente los que abrirían el contenido remoto al sistema.
       */
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        partition?: string;
        allowpopups?: boolean;
        useragent?: string;
      };
    }
  }
}

interface ImportMetaEnv {
  readonly VITE_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

export {};
