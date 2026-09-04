import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { act, limpiar, pintar, pulsar, texto } from './dom.ts';

/**
 * El guardia que descarta lo que llega tarde.
 *
 * El test que importa es el segundo: reproduce la carrera de verdad —abrir un
 * juego, saltar a otro antes de que el primero conteste, y que el primero
 * conteste después— y comprueba que lo que queda pintado es lo del juego que
 * está abierto. Sin el guardia, ese test falla: se ve el juego equivocado.
 */

const { useCarga } = await import('../src/renderer/lib/vigencia.ts');
const React = await import('react');

/** Una promesa que se cumple cuando el test diga, no cuando quiera. */
function aplazada<T>() {
  let cumplir!: (valor: T) => void;
  const promesa = new Promise<T>((res) => { cumplir = res; });
  return { promesa, cumplir };
}

/** Lo que enseña la carga: cargando, el error, o los datos. */
function Sonda({ id, pedir }: { id: string; pedir: (id: string) => Promise<string> }) {
  const traer = React.useCallback(() => pedir(id), [id, pedir]);
  const { datos, cargando, error } = useCarga(traer);
  return React.createElement('span', null, cargando ? 'cargando' : (error ?? datos ?? 'vacío'));
}

/**
 * La sonda con un botón para cambiar de juego.
 *
 * Es lo que hace la barra lateral: cambia el `gameId` de la vista **sin
 * desmontarla**. Por eso un `let vigente` por montaje no bastaba y el guardia
 * lleva un contador.
 */
function ConCambio({ pedir }: { pedir: (id: string) => Promise<string> }) {
  const [id, setId] = React.useState('a');
  return React.createElement(
    'div',
    null,
    React.createElement('button', { onClick: () => setId('b') }, 'cambiar'),
    React.createElement(Sonda, { id, pedir }),
  );
}

describe('useCarga', () => {
  afterEach(limpiar);

  test('pinta lo que llega', async () => {
    const vista = await pintar(React.createElement(Sonda, {
      id: 'a',
      pedir: async (id: string) => `logros de ${id}`,
    }));

    await act(async () => { await Promise.resolve(); });
    assert.equal(texto(vista), 'logros de a');
  });

  test('la respuesta del juego anterior NO pisa la del actual', async () => {
    const a = aplazada<string>();
    const b = aplazada<string>();
    const enElAire: Record<string, Promise<string>> = { a: a.promesa, b: b.promesa };

    const vista = await pintar(React.createElement(ConCambio, {
      pedir: (id: string) => enElAire[id]!,
    }));
    assert.ok(texto(vista).includes('cargando'));

    // El usuario salta al juego B mientras A sigue en el aire.
    await pulsar(vista, 'cambiar');

    // B contesta primero, que es lo normal cuando el anterior se atascó.
    await act(async () => { b.cumplir('logros de b'); await b.promesa; });
    assert.ok(texto(vista).includes('logros de b'));

    // Y ahora contesta A, tarde. Aquí es donde antes se rompía todo: el
    // `setState` de A se pintaba encima y la vista de B enseñaba los logros
    // de A, sin ningún aviso.
    await act(async () => { a.cumplir('logros de a'); await a.promesa; });

    assert.ok(
      texto(vista).includes('logros de b'),
      `la vista debía seguir en B y dice: "${texto(vista)}"`,
    );
    assert.ok(!texto(vista).includes('logros de a'));
  });

  test('un error se cuenta y no deja datos viejos puestos', async () => {
    const vista = await pintar(React.createElement(Sonda, {
      id: 'a',
      pedir: async () => { throw new Error('Steam no respondió'); },
    }));

    await act(async () => { await Promise.resolve(); });
    assert.equal(texto(vista), 'Steam no respondió');
  });

  test('desmontar mientras carga no pinta nada después', async () => {
    const lenta = aplazada<string>();
    await pintar(React.createElement(Sonda, { id: 'a', pedir: () => lenta.promesa }));

    await limpiar();
    // Sin el guardia, esto es un setState sobre un componente desmontado.
    // Que no reviente ni avise es la prueba.
    await act(async () => { lenta.cumplir('tarde'); await lenta.promesa; });
  });
});
