/**
 * Los enlaces de fuera que enseña Atreus, en un solo sitio.
 *
 * Están aquí y no repartidos por las vistas porque son datos, no interfaz: hoy
 * son dos y mañana pueden ser tres, y cambiar uno no debería obligar a buscarlo
 * dentro de un JSX de quinientas líneas.
 *
 * Todos se abren en el navegador del sistema, nunca dentro de la ventana. Eso
 * lo garantiza `settings.openPath`, que solo acepta `https://` y carpetas
 * conocidas —ver `ipc/register.ts`—, así que un enlace mal puesto aquí no puede
 * convertirse en algo peor que un enlace roto.
 */

export interface Enlace {
  /** Dónde va. Siempre https. */
  url: string;
  /** Lo que se enseña al lado del botón, si hay algo que enseñar. */
  etiqueta?: string;
}

/**
 * Donde se cuenta cómo se construye Atreus.
 */
export const TIKTOK: Enlace = {
  url: 'https://www.tiktok.com/@hv_syax',
  etiqueta: '@hv_syax',
};

/**
 * Donde se puede echar una mano, si alguien quiere.
 *
 * `null` mientras no haya una dirección de verdad, y la interfaz **no pinta el
 * botón** en ese caso: un botón de donar que no lleva a ninguna parte es peor
 * que no tenerlo, porque el que lo pulsa ya venía con la intención puesta.
 */
export const DONAR: Enlace | null = null;
