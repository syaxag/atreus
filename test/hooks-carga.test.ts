import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { act, limpiar, pintar, texto } from './dom.ts';

/**
 * Que una carga de vista termine, y termine **una vez**.
 *
 * Sale de un defecto real, encontrado sacando capturas para el README: el
 * Taller se quedaba en sus esqueletos de carga para siempre y pidiendo la lista
 * sin parar. El backend contestaba en un segundo; el que no paraba era el
 * renderer.
 *
 * La causa: la vista pasa `(mensaje) => pushToast('error', mensaje)` al hook,
 * que es lo normal y es una función **nueva en cada render**. Estaba en las
 * dependencias de la carga, así que el efecto que la ejecuta se disparaba en
 * cada render; cada carga invalidaba el turno de la anterior —que por eso salía
 * sin apagar `cargando`— y encendía el suyo.
 *
 * Lo que se comprueba aquí es la propiedad que faltaba: **un callback sin
 * memorizar no puede provocar una segunda carga**. Es la trampa que se olvida
 * una vez y devuelve el mismo fallo.
 */

const { useMods } = await import('../src/renderer/hooks/useMods.ts');
const { api } = await import('../src/renderer/lib/api.ts');
const React = await import('react');

/** Cuántas veces se ha pedido la lista de mods. */
let peticiones = 0;

const listaOriginal = api.mods.list;
const perfilesOriginal = api.mods.profiles;

/** Una vista mínima que usa el hook como lo usa el Taller. */
function Sonda({ gameId }: { gameId: string }) {
  // Sin memorizar, a propósito: es lo que hace ModsView y lo que tiene que
  // seguir siendo seguro.
  const { mods, cargando } = useMods(gameId, (mensaje) => void mensaje);
  return React.createElement(
    'span',
    null,
    cargando ? 'cargando' : `listo:${mods.length}`,
  );
}

describe('useMods', () => {
  afterEach(async () => {
    await limpiar();
    api.mods.list = listaOriginal;
    api.mods.profiles = perfilesOriginal;
    peticiones = 0;
  });

  test('la carga termina, y el esqueleto se va', async () => {
    api.mods.list = async () => { peticiones++; return { ok: true as const, data: [] }; };
    api.mods.profiles = async () => ({ ok: true as const, data: [] });

    const vista = await pintar(React.createElement(Sonda, { gameId: 'steam:2379780' }));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    // Este es el fallo que había: se quedaba en 'cargando' para siempre.
    assert.equal(texto(vista), 'listo:0');
  });

  test('un callback sin memorizar no provoca una carga por render', async () => {
    api.mods.list = async () => { peticiones++; return { ok: true as const, data: [] }; };
    api.mods.profiles = async () => ({ ok: true as const, data: [] });

    await pintar(React.createElement(Sonda, { gameId: 'steam:2379780' }));
    for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); });

    // Una, no una por cada vuelta. Con el defecto puesto esto crecía sin techo
    // y cada vuelta volvía a encender el esqueleto.
    assert.equal(peticiones, 1, `se pidió la lista ${peticiones} veces`);
  });

  test('cambiar de juego sí vuelve a pedirla, una vez', async () => {
    api.mods.list = async () => { peticiones++; return { ok: true as const, data: [] }; };
    api.mods.profiles = async () => ({ ok: true as const, data: [] });

    const { act: actuar } = await import('./dom.ts');
    let cambiar!: (id: string) => void;

    function ConCambio() {
      const [id, setId] = React.useState('steam:1');
      cambiar = setId;
      return React.createElement(Sonda, { gameId: id });
    }

    await pintar(React.createElement(ConCambio));
    for (let i = 0; i < 4; i++) await actuar(async () => { await Promise.resolve(); });
    assert.equal(peticiones, 1);

    await actuar(async () => { cambiar('steam:2'); });
    for (let i = 0; i < 4; i++) await actuar(async () => { await Promise.resolve(); });

    assert.equal(peticiones, 2, `se pidió la lista ${peticiones} veces`);
  });
});
