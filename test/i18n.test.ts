import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { traducir, IDIOMAS, LOCALE } from '../src/shared/i18n/index.ts';
import { es } from '../src/shared/i18n/es.ts';
import { en } from '../src/shared/i18n/en.ts';
import { pt } from '../src/shared/i18n/pt.ts';
import { explicarAviso } from '../src/renderer/lib/aviso.ts';
import { nombreGuia, textoMapa, tituloMapa } from '../src/renderer/lib/contenido.ts';

/**
 * La traducción y la prosa que arma el renderer.
 *
 * El typecheck ya impide que a un idioma le falte una clave: los diccionarios
 * se declaran como `Record<Clave, string>` sobre el castellano. Lo que no
 * puede ver es lo de aquí — que los huecos se rellenen, que el que sobra no
 * se quede escrito en pantalla, y que las frases que antes venían hechas del
 * backend se compongan con lo que ahora llega en su lugar.
 */

/** El traductor de un idioma, con la forma que esperan los compositores. */
const enIdioma = (idioma: 'es' | 'en' | 'pt') =>
  (clave: Parameters<typeof traducir>[1], huecos?: Parameters<typeof traducir>[2]) =>
    traducir(idioma, clave, huecos);

describe('traducir', () => {
  test('rellena los huecos con lo que se le da', () => {
    assert.equal(
      traducir('es', 'lateral.abrirFicha', { juego: 'Balatro' }),
      'Abrir la ficha de Balatro',
    );
  });

  test('el mismo hueco repetido se rellena todas las veces', () => {
    assert.equal(traducir('es', 'celebra.todos', { total: 31 }), '31 de 31 logros · los tienes todos');
  });

  /*
   * Si falta un dato, se deja el hueco tal cual en vez de escribir "undefined".
   * Es feo, pero es un fallo del que llama y se ve; "undefined" en medio de una
   * frase parece un fallo de la aplicación.
   */
  test('un hueco sin dato se queda como está, no se convierte en undefined', () => {
    const salida = traducir('es', 'lateral.abrirFicha', {});
    assert.equal(salida, 'Abrir la ficha de {juego}');
    assert.ok(!salida.includes('undefined'));
  });

  test('sin huecos que rellenar, el texto sale entero', () => {
    assert.equal(traducir('en', 'lateral.coleccion'), 'Collection');
    assert.equal(traducir('pt', 'lateral.coleccion'), 'Coleção');
  });

  /*
   * Media frase en otro idioma se lee mal, pero una clave en crudo se lee como
   * un fallo. El castellano es la red.
   */
  test('un idioma desconocido cae al castellano en vez de enseñar la clave', () => {
    assert.equal(traducir('fr' as never, 'lateral.coleccion'), 'Colección');
  });
});

describe('los tres diccionarios', () => {
  test('tienen exactamente las mismas claves', () => {
    const claves = Object.keys(es);
    assert.deepEqual(Object.keys(en).sort(), claves.slice().sort());
    assert.deepEqual(Object.keys(pt).sort(), claves.slice().sort());
  });

  /*
   * Un hueco que el castellano define y otro idioma no escribe deja un dato
   * fuera de la frase sin que nadie se entere; al revés, deja un `{hueco}`
   * escrito en pantalla. El typecheck no ve ninguno de los dos.
   */
  test('cada traducción usa los mismos huecos que el original', () => {
    const huecos = (texto: string) => [...texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const problemas: string[] = [];
    for (const [clave, original] of Object.entries(es)) {
      for (const [nombre, diccionario] of [['en', en], ['pt', pt]] as const) {
        const esperados = huecos(original);
        const encontrados = huecos(diccionario[clave as keyof typeof es]);
        if (esperados.join() !== encontrados.join()) {
          problemas.push(`${clave} (${nombre}): ${esperados.join()} vs ${encontrados.join()}`);
        }
      }
    }
    assert.deepEqual(problemas, []);
  });

  test('ninguna traducción se ha quedado vacía', () => {
    const vacias = Object.keys(es).filter((k) => {
      const clave = k as keyof typeof es;
      return !en[clave].trim() || !pt[clave].trim();
    });
    assert.deepEqual(vacias, []);
  });

  test('cada idioma del selector tiene diccionario y configuración regional', () => {
    for (const { id } of IDIOMAS) {
      assert.ok(LOCALE[id], `${id} necesita una configuración regional`);
      assert.equal(typeof traducir(id, 'lateral.coleccion'), 'string');
    }
  });
});

describe('los avisos del proceso principal', () => {
  const t = enIdioma('es');

  test('un juego que se cierra sin tiempo no dice "0 min"', () => {
    assert.equal(
      explicarAviso(t, { kind: 'gameStopped', game: 'Balatro', minutes: 0 }),
      'Balatro se ha cerrado',
    );
  });

  test('un minuto va en singular', () => {
    assert.equal(
      explicarAviso(t, { kind: 'gameStopped', game: 'Balatro', minutes: 1 }),
      'Balatro se ha cerrado · 1 min de sesión',
    );
  });

  test('más de uno, en plural y con su número', () => {
    assert.equal(
      explicarAviso(t, { kind: 'gameStopped', game: 'Balatro', minutes: 42 }),
      'Balatro se ha cerrado · 42 min de sesión',
    );
  });

  test('una definición nueva no se anuncia en plural', () => {
    assert.equal(
      explicarAviso(t, { kind: 'catalogUpdated', definitions: 1 }),
      'Contenido actualizado: 1 definición nueva',
    );
  });

  test('el mismo aviso se dice en el idioma activo', () => {
    const aviso = { kind: 'updateReady', version: '0.2.0' } as const;
    assert.equal(explicarAviso(enIdioma('en'), aviso), 'Atreus 0.2.0 is ready to install when you close it.');
    assert.equal(explicarAviso(enIdioma('pt'), aviso).startsWith('O Atreus 0.2.0'), true);
  });
});

describe('lo que Atreus encuentra fuera', () => {
  const t = enIdioma('es');

  /*
   * La línea que separa el contenido de la etiqueta: el dominio de una web
   * viene de fuera y se enseña tal cual; que algo sea "una guía de la
   * comunidad de Steam" lo dice Atreus, y lo dice en tu idioma.
   */
  test('el dominio de una web se enseña tal cual', () => {
    assert.equal(nombreGuia(t, { kind: 'web', domain: 'gamefaqs.gamespot.com' }), 'gamefaqs.gamespot.com');
  });

  test('lo que pone Atreus se traduce', () => {
    assert.equal(nombreGuia(t, { kind: 'steam' }), 'Guías de la comunidad de Steam');
    assert.equal(nombreGuia(enIdioma('en'), { kind: 'steam' }), 'Steam community guides');
  });

  test('el nombre de una wiki es dato, la palabra "wiki" es etiqueta', () => {
    assert.equal(nombreGuia(t, { kind: 'wiki', site: 'balatro' }), 'balatro · wiki');
  });

  test('el título de un mapa del catálogo es el que escribió quien lo puso', () => {
    assert.equal(tituloMapa(t, { kind: 'catalog', title: 'Mapa de coleccionables' }), 'Mapa de coleccionables');
  });

  test('el de MapGenie lo compone Atreus con el nombre del juego', () => {
    assert.equal(tituloMapa(t, { kind: 'mapgenie', game: 'Elden Ring' }), 'Elden Ring · mapa interactivo');
    assert.equal(
      tituloMapa(enIdioma('en'), { kind: 'mapgenie', game: 'Elden Ring' }),
      'Elden Ring · interactive map',
    );
  });

  test('el extracto de una wiki se respeta; el relleno se traduce', () => {
    assert.equal(textoMapa(t, { kind: 'text', text: 'Lo que dijo la wiki' }), 'Lo que dijo la wiki');
    assert.equal(textoMapa(enIdioma('en'), { kind: 'wikiPage' }), 'A map page from the game’s wiki.');
  });
});
