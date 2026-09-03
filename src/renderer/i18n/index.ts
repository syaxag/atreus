import { useCallback } from 'react';
import { useStore } from '@/store';
import { traducir, type Clave, type Huecos, type Idioma } from '@shared/i18n';

/**
 * Traducción de la interfaz, sin dependencias.
 *
 * El proyecto tiene cuatro dependencias en total y ninguna merecía ser la
 * quinta por esto: un diccionario por idioma y una función que sustituye
 * huecos cubre lo que hace falta, y cabe en una pantalla.
 *
 * Aquí solo viven los enganches con React. El traductor y los diccionarios
 * están en `shared/i18n`, porque el proceso principal también los necesita
 * para el menú de la bandeja: ver la nota de aquel archivo.
 */

export { traducir, IDIOMAS, LOCALE } from '@shared/i18n';
export type { Clave, Huecos, Idioma } from '@shared/i18n';

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

/**
 * Traduce fuera de un componente.
 *
 * Para lo que no puede usar el hook: un componente de clase —la pantalla de
 * fallo— o código suelto. No se resuscribe, así que solo vale para texto que
 * se pinta una vez o que ya se está repintando por otro motivo.
 */
export function traducirAhora(clave: Clave, huecos?: Huecos): string {
  return traducir(useStore.getState().settings?.language ?? 'es', clave, huecos);
}

/** El idioma activo, para lo que necesite la configuración regional. */
export function useIdioma(): Idioma {
  return useStore((estado) => estado.settings?.language ?? 'es');
}
