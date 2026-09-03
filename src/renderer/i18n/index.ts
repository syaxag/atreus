import { useCallback } from 'react';
import { useStore } from '@/store';
import { traducir, type Clave, type Huecos, type Idioma } from './traducir';

/**
 * Traducción de la interfaz, sin dependencias.
 *
 * El proyecto tiene cuatro dependencias en total y ninguna merecía ser la
 * quinta por esto: un diccionario por idioma y una función que sustituye
 * huecos cubre lo que hace falta, y cabe en una pantalla.
 *
 * Aquí solo viven los enganches con React. El traductor en sí está en
 * `traducir.ts`, que no sabe nada del store: ver la nota de aquel archivo.
 */

export { traducir, IDIOMAS, LOCALE } from './traducir';
export type { Clave, Huecos, Idioma } from './traducir';

/**
 * El traductor del idioma activo.
 *
 * Se suscribe a los ajustes, así que cambiar de idioma repinta la aplicación
 * entera sin reiniciar nada. Mientras los ajustes no han cargado, castellano.
 */
export function useT(): (clave: Clave, huecos?: Huecos) => string {
  const idioma = useStore((estado) => estado.settings?.language ?? 'es');
  return useCallback((clave: Clave, huecos?: Huecos) => traducir(idioma, clave, huecos), [idioma]);
}

/** El idioma activo, para lo que necesite la configuración regional. */
export function useIdioma(): Idioma {
  return useStore((estado) => estado.settings?.language ?? 'es');
}
