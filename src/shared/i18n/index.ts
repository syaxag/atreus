import type { Settings } from '../types';
import { es, type Clave } from './es';
import { en } from './en';

/**
 * El traductor, sin React y sin proceso.
 *
 * Vive en `shared/` por dos razones. Una: el store del renderer también
 * traduce, y el hook de `renderer/i18n` se suscribe al store, así que tenerlo
 * todo junto los importaba en círculo. Dos: el menú de la bandeja lo construye
 * Electron **en el proceso principal**, que no ve nada del renderer, y también
 * habla el idioma que elijas.
 *
 * Traduce **la interfaz de Atreus, no lo que encuentra**. Una guía de Steam
 * escrita en inglés seguirá en inglés, y eso es lo correcto: reescribirla sería
 * inventarse el contenido de otro.
 */

export type Idioma = Settings['language'];
export type { Clave };

const DICCIONARIOS: Record<Idioma, Record<Clave, string>> = { es, en };

/** Los idiomas disponibles, para el selector de Ajustes. */
export const IDIOMAS: { id: Idioma; clave: Clave }[] = [
  { id: 'es', clave: 'ajustes.idiomaEs' },
  { id: 'en', clave: 'ajustes.idiomaEn' },
];

/**
 * Etiqueta de configuración regional, para fechas y números.
 *
 * De aquí la saca `format.ts`, que la guarda en una variable de módulo: es el
 * único sitio donde se decide que el inglés de Atreus escribe las fechas como
 * en Londres y no como en Nueva York.
 */
export const LOCALE: Record<Idioma, string> = { es: 'es-ES', en: 'en-GB' };

export type Huecos = Record<string, string | number>;

/**
 * Traduce una clave.
 *
 * Si el idioma no la tiene —cosa que el typecheck no debería dejar pasar— cae
 * al castellano en vez de enseñar la clave en crudo: media frase en otro idioma
 * se lee mal, pero `lateral.trofeosPista` en pantalla se lee como un fallo.
 */
export function traducir(idioma: Idioma, clave: Clave, huecos?: Huecos): string {
  const texto = DICCIONARIOS[idioma]?.[clave] ?? es[clave];
  if (!huecos) return texto;
  return texto.replace(/\{(\w+)\}/g, (crudo, nombre: string) =>
    (nombre in huecos ? String(huecos[nombre]) : crudo));
}
