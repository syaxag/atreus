import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  bytes, comparar, configurarLocale, dateTime, duration, hours, numero, percent, rarity, relative,
  span,
} from '../src/renderer/lib/format.ts';

/**
 * Fechas, números y las palabras que `Intl` no da.
 *
 * Este archivo guarda **estado de módulo**: el idioma se fija una vez y lo usan
 * cuarenta sitios. Por eso importa probarlo, y por eso cada prueba lo fija
 * primero: si una dejara puesto el inglés, la siguiente mediría otra cosa.
 *
 * Lo que se comprueba no es que `Intl` funcione —eso ya lo hace alguien—, sino
 * lo que se rompió de verdad: con la interfaz en inglés seguía diciendo
 * "hace 34 minutos", "7,6 h" y "0,30 %", porque las comas se ponían a mano.
 */

const UNIDADES_ES = {
  hoy: 'hoy', dia: 'día', dias: 'días',
  mes: 'mes', meses: 'meses',
  anio: 'año', anios: 'años', y: 'y', nunca: 'nunca',
};
const UNIDADES_EN = {
  hoy: 'today', dia: 'day', dias: 'days',
  mes: 'month', meses: 'months',
  anio: 'year', anios: 'years', y: 'and', nunca: 'never',
};
const RAREZAS_ES = {
  sinDatos: 'Sin datos', legendario: 'Legendario', ultra: 'Ultra raro',
  raro: 'Raro', poco: 'Poco común', comun: 'Común',
};
const RAREZAS_EN = {
  sinDatos: 'No data', legendario: 'Legendary', ultra: 'Ultra rare',
  raro: 'Rare', poco: 'Uncommon', comun: 'Common',
};

const enCastellano = () => configurarLocale('es-ES', UNIDADES_ES, RAREZAS_ES);
const enIngles = () => configurarLocale('en-GB', UNIDADES_EN, RAREZAS_EN);

beforeEach(enCastellano);

describe('el separador decimal sigue al idioma', () => {
  test('los porcentajes', () => {
    assert.equal(percent(12.4), '12,4 %');
    enIngles();
    assert.equal(percent(12.4), '12.4 %');
  });

  /*
   * Por debajo del 1 % se dan dos decimales: es donde vive la rareza que
   * decide un platino, y "0,3 %" y "0,25 %" no son lo mismo.
   */
  test('la rareza fina lleva dos decimales', () => {
    assert.equal(percent(0.3), '0,30 %');
    enIngles();
    assert.equal(percent(0.3), '0.30 %');
  });

  test('las horas estimadas', () => {
    assert.equal(hours(7.55), '7,6 h');
    enIngles();
    assert.equal(hours(7.55), '7.6 h');
  });

  test('los tamaños de archivo', () => {
    assert.equal(bytes(1_600_000), '1,5 MB');
    enIngles();
    assert.equal(bytes(1_600_000), '1.5 MB');
  });

  test('los números sueltos, con sus millares', () => {
    assert.equal(numero(1272), '1272', 'en castellano cuatro cifras van sin punto');
    assert.equal(numero(12720), '12.720');
    enIngles();
    assert.equal(numero(12720), '12,720');
  });
});

describe('lo que Intl no cubre y viene del diccionario', () => {
  test('"nunca" cuando no hay fecha', () => {
    assert.equal(relative(null), 'nunca');
    enIngles();
    assert.equal(relative(null), 'never');
  });

  test('la escala de rareza es una palabra, no un número', () => {
    assert.equal(rarity(0.5), 'Legendario');
    assert.equal(rarity(30), 'Poco común');
    assert.equal(rarity(null), 'Sin datos');
    enIngles();
    assert.equal(rarity(0.5), 'Legendary');
    assert.equal(rarity(null), 'No data');
  });

  /*
   * `span()` compone "2 años y 3 meses" a mano porque `Intl` no lo hace, así
   * que es el único sitio donde el plural y la conjunción vienen del
   * diccionario. Es también el que se quedaba en castellano sin que se notara.
   */
  test('"dos años y tres meses" se compone con las palabras del idioma', () => {
    const hace = (dias: number) => Math.floor(Date.now() / 1000) - dias * 86_400;
    assert.equal(span(hace(830)), '2 años y 3 meses');
    enIngles();
    assert.equal(span(hace(830)), '2 years and 3 months');
  });

  test('el singular no se pluraliza', () => {
    const hace = (dias: number) => Math.floor(Date.now() / 1000) - dias * 86_400;
    assert.equal(span(hace(1)), '1 día');
    assert.equal(span(hace(40)), '1 mes');
    assert.equal(span(hace(370)), '1 año', 'doce meses justos, sin resto que decir');
  });

  test('hoy es hoy, no "0 días"', () => {
    assert.equal(span(Math.floor(Date.now() / 1000)), 'hoy');
  });
});

describe('duraciones', () => {
  test('los minutos sueltos no se disfrazan de horas', () => {
    assert.equal(duration(45), '45 min');
    assert.equal(duration(90), '1 h 30 min');
  });

  test('a partir de cien horas los minutos sobran', () => {
    assert.equal(duration(6060), '101 h');
  });

  test('sin dato, un guion y no un cero', () => {
    assert.equal(duration(null), '—');
    assert.equal(duration(0), '—');
    assert.equal(bytes(null), '—');
    assert.equal(percent(null), '—');
  });
});

describe('el orden alfabético también es del idioma', () => {
  test('la eñe va después de la ene, no al final', () => {
    const nombres = ['Nz', 'Ña', 'Na'];
    assert.deepEqual([...nombres].sort(comparar), ['Na', 'Nz', 'Ña']);
  });

  test('las mayúsculas no se van todas delante', () => {
    assert.deepEqual(['b', 'A', 'a'].sort(comparar), ['a', 'A', 'b']);
  });
});

describe('las fechas', () => {
  test('cambian de formato con el idioma', () => {
    const momento = Date.UTC(2026, 2, 12, 18, 4) / 1000;
    const castellano = dateTime(momento);
    enIngles();
    assert.notEqual(dateTime(momento), castellano, 'no puede salir igual en los dos');
  });

  test('sin fecha, un guion', () => {
    assert.equal(dateTime(null), '—');
    assert.equal(dateTime(0), '—');
  });
});
