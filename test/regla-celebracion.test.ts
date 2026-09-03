import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { decidirCelebracion } from '../src/main/services/platinum/regla-celebracion.ts';

/**
 * Cuándo salta la celebración del platino.
 *
 * Es el momento que da nombre a la aplicación y el que más molesta si se
 * equivoca: una celebración de algo que hiciste hace meses no es una alegría,
 * es ruido. Estas cuatro pruebas fijan la regla que ya falló una vez.
 */

describe('decidirCelebracion', () => {
  test('un juego que ya estaba apuntado no vuelve a celebrarse', () => {
    assert.equal(decidirCelebracion(true, true), 'nada');
    assert.equal(decidirCelebracion(true, false), 'nada');
  });

  test('un juego conocido que llega al 100 % es noticia', () => {
    assert.equal(decidirCelebracion(false, true), 'celebrar');
  });

  /*
   * El caso que se rompió. Atreus calcula por primera vez un juego que ya está
   * al 100 %: ese platino es anterior a que supiera de su existencia. Da igual
   * que sea el día de la instalación o un mes después, cuando le llega el turno
   * en el calentamiento porque las veces anteriores falló o se lo saltó.
   */
  test('la primera vez que se calcula un juego, su 100 % no se celebra', () => {
    assert.equal(decidirCelebracion(false, false), 'apuntar-callando');
  });

  test('nunca devuelve otra cosa que las tres decisiones', () => {
    for (const registrado of [true, false]) {
      for (const conocido of [true, false]) {
        assert.ok(
          ['celebrar', 'apuntar-callando', 'nada'].includes(decidirCelebracion(registrado, conocido)),
        );
      }
    }
  });
});
