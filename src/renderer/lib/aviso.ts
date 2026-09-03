import type { ToastNotice } from '@shared/types';
import type { Clave, Huecos } from '@/i18n/traducir';

/**
 * Los avisos que manda el proceso principal por su cuenta.
 *
 * Un juego que se abre, el catálogo que se actualiza solo, una actualización
 * lista: no nacen de una pulsación, así que llegan por el evento `toast` y no
 * como respuesta a nada. Llegaban redactados, y en castellano.
 *
 * Se traducen al recibirlos, no al pintarlos: un aviso dura cuatro segundos y
 * no se repinta si cambias de idioma mientras está en pantalla. Lo que sí se
 * queda —el registro de Actividad— guarda la clave; ver `store.ts`.
 */
export function explicarAviso(
  t: (clave: Clave, huecos?: Huecos) => string,
  aviso: ToastNotice,
): string {
  switch (aviso.kind) {
    case 'definitionsReloaded':
      return t('toast.definiciones');
    case 'gameStarted':
      return t('toast.iniciado', { juego: aviso.game });
    case 'gameStopped':
      if (aviso.minutes < 1) return t('toast.cerrado', { juego: aviso.game });
      return t(aviso.minutes === 1 ? 'toast.cerradoUnMinuto' : 'toast.cerradoConMinutos',
        { juego: aviso.game, n: aviso.minutes });
    case 'contentReadyOne':
      return t('toast.contenidoUno', {
        juego: aviso.game, mods: aviso.mods, guias: aviso.guides,
      });
    case 'contentReadyMany':
      return t('toast.contenidoVarios', { n: aviso.games });
    case 'catalogUpdated':
      return t(aviso.definitions === 1 ? 'toast.catalogoUna' : 'toast.catalogo',
        { n: aviso.definitions });
    case 'modConflicts':
      return t(aviso.files === 1 ? 'toast.conflictoUno' : 'toast.conflictos', { n: aviso.files });
    case 'updateReady':
      return t('toast.actualizacionLista', { version: aviso.version });
  }
}
