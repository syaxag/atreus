/**
 * Cuándo se celebra un platino. La regla sola, sin disco.
 *
 * Vive aparte de `celebrated.ts` porque aquel toca `paths`, que arrastra
 * `electron`, y entonces no se puede probar con `node --test`. Esta parte es la
 * que decide y la que se equivocó una vez, así que es la que tiene prueba.
 */

export type Decision =
  /** Es noticia: la celebración salta. */
  | 'celebrar'
  /** Se apunta para no repetirlo, pero sin fiesta. */
  | 'apuntar-callando'
  /** Ya estaba apuntado: no se hace nada. */
  | 'nada';

/**
 * @param yaRegistrado Atreus ya había apuntado este juego como completo.
 * @param yaConocido   Atreus ya había calculado este juego alguna vez, aunque
 *                     fuese sin estar completo.
 *
 * El caso que importa es el segundo. Un juego que Atreus **nunca** había
 * calculado y que ya aparece al 100 % lo terminaste antes de que él supiera de
 * su existencia: da igual que sea el día de la instalación o un mes después,
 * cuando por fin le llega el turno en el cálculo. Ese no se celebra.
 *
 * Antes esto lo decidía una marca global de "biblioteca ya recorrida", y por
 * eso fallaba: la primera pasada termina igual aunque se dejara juegos sin
 * calcular, y al calcularlos días más tarde su platino viejo salía como nuevo.
 */
export function decidirCelebracion(yaRegistrado: boolean, yaConocido: boolean): Decision {
  if (yaRegistrado) return 'nada';
  return yaConocido ? 'celebrar' : 'apuntar-callando';
}
