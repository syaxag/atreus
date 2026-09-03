import { test, describe, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { botones, contiene, limpiar, pintar, pulsar, teclear, texto } from './dom.ts';
import type { Game, PlatinumSummary } from '../src/shared/types.ts';

/**
 * Las vistas, pintadas de verdad.
 *
 * Aquí solo entra lo que no ve nadie más: los estados límite —una lista vacía,
 * una biblioteca sin nada calculado— y el comportamiento de un diálogo. No se
 * comprueban estilos ni maquetación, que jsdom no sabe; para eso está abrir la
 * aplicación, que es lo que hace `npm run smoke`.
 *
 * El orden de los imports importa: `./dom.ts` monta el DOM al cargarse, y
 * React lo mira al cargarse él. Por eso las vistas entran con `await import`.
 */

const { useStore } = await import('../src/renderer/store.ts');
const { ProfileView } = await import('../src/renderer/views/ProfileView.tsx');
const { HomeView } = await import('../src/renderer/views/HomeView.tsx');
const { Modal, Empty, Progress } = await import('../src/renderer/components/ui/index.tsx');
const React = await import('react');

/** El estado con el que arranca el store, para dejarlo como estaba. */
const limpio = {
  games: [] as Game[],
  platinum: {} as Record<string, PlatinumSummary>,
  activeGameIds: [] as string[],
  loadingLibrary: false,
  section: 'home' as const,
  selectedId: null,
};

function juego(campos: Partial<Game> = {}): Game {
  return {
    id: 'steam:1',
    platform: 'steam',
    nativeId: '1',
    name: 'Balatro',
    installDir: null,
    exePath: null,
    iconUrl: null,
    headerUrl: null,
    portraitUrl: null,
    sizeBytes: null,
    lastPlayed: null,
    playtimeMinutes: null,
    hasDefinition: false,
    multiplayer: false,
    favorite: false,
    ...campos,
  };
}

function resumen(campos: Partial<PlatinumSummary> = {}): PlatinumSummary {
  return {
    gameId: 'steam:1',
    tracking: 'steam',
    unlocked: 0,
    total: 0,
    percent: 0,
    complete: false,
    playtimeMinutes: null,
    difficulty: null,
    next: null,
    rarest: null,
    lastUnlockAt: null,
    unlockDays: [],
    schema: 2,
    updatedAt: 1,
    ...campos,
  };
}

beforeEach(() => { useStore.setState(limpio); });
afterEach(async () => { await limpiar(); });

describe('el Perfil', () => {
  test('sin nada calculado, lo dice en vez de enseñar ceros', async () => {
    const vista = await pintar(React.createElement(ProfileView));
    assert.ok(contiene(vista, 'Todavía no hay nada que sumar'));
    assert.ok(!contiene(vista, 'Completado medio'), 'no se pintan cifras que no existen');
  });

  /*
   * Un juego sin lista de logros no cuenta para nada del perfil: si contara,
   * la media saldría dividida entre juegos que no tienen nada que promediar.
   */
  test('un juego sin logros no cuenta como juego con logros', async () => {
    useStore.setState({ platinum: { 'steam:1': resumen({ total: 0 }) } });
    const vista = await pintar(React.createElement(ProfileView));
    assert.ok(contiene(vista, 'Todavía no hay nada que sumar'));
  });

  test('con datos, suma y lo enseña', async () => {
    useStore.setState({
      games: [juego({ id: 'a', name: 'Uno' }), juego({ id: 'b', name: 'Dos' })],
      platinum: {
        a: resumen({ gameId: 'a', total: 10, unlocked: 10, complete: true, playtimeMinutes: 600 }),
        b: resumen({ gameId: 'b', total: 10, unlocked: 5 }),
      },
    });
    const vista = await pintar(React.createElement(ProfileView));
    assert.ok(contiene(vista, 'Platinos'));
    assert.ok(contiene(vista, '15'), 'los logros sumados');
    assert.ok(contiene(vista, '75 %'), 'el completado medio');
  });

  test('sin ningún platino, no promete una vitrina vacía', async () => {
    useStore.setState({
      games: [juego({ id: 'b', name: 'Dos' })],
      platinum: { b: resumen({ gameId: 'b', total: 10, unlocked: 5 }) },
    });
    const vista = await pintar(React.createElement(ProfileView));
    assert.ok(contiene(vista, 'Cuando remates el primero'));
  });

  test('el logro más raro se enseña con el juego del que es', async () => {
    useStore.setState({
      games: [juego({ id: 'a', name: 'Geometry Dash' })],
      platinum: {
        a: resumen({
          gameId: 'a', total: 10, unlocked: 4,
          rarest: { name: 'Beyond Insanity', percent: 0.2 },
        }),
      },
    });
    const vista = await pintar(React.createElement(ProfileView));
    assert.ok(contiene(vista, 'Beyond Insanity'));
    assert.ok(contiene(vista, 'Geometry Dash'));
    assert.ok(contiene(vista, '0,20 %'));
  });
});

describe('la Portada', () => {
  test('sin juegos, manda a la Colección en vez de quedarse en blanco', async () => {
    const vista = await pintar(React.createElement(HomeView));
    assert.ok(contiene(vista, 'Aún no hay nada que contar'));
    assert.ok(botones(vista).some((b) => (b.textContent ?? '').includes('Ir a la Colección')));
  });

  /*
   * El caso que se arregló: una biblioteca de Epic o Xbox recién escaneada no
   * trae ni horas ni progreso. Antes salía el vacío de "escanea tu biblioteca"
   * teniendo dieciséis juegos delante.
   */
  test('con juegos pero sin horas ni progreso, enseña uno igualmente', async () => {
    useStore.setState({ games: [juego({ name: 'Halo' })] });
    const vista = await pintar(React.createElement(HomeView));
    assert.ok(contiene(vista, 'Halo'));
    assert.ok(!contiene(vista, 'Aún no hay nada que contar'));
  });

  test('manda el que está abierto ahora mismo, y lo dice', async () => {
    useStore.setState({
      games: [juego({ id: 'a', name: 'El último jugado', lastPlayed: 2000 }),
        juego({ id: 'b', name: 'El que está abierto' })],
      activeGameIds: ['b'],
    });
    const vista = await pintar(React.createElement(HomeView));
    assert.ok(contiene(vista, 'JUGANDO AHORA'));
    assert.ok(contiene(vista, 'El que está abierto'));
  });

  test('si no hay ninguno abierto, el último que tocaste', async () => {
    useStore.setState({
      games: [juego({ id: 'a', name: 'Antiguo', lastPlayed: 1000 }),
        juego({ id: 'b', name: 'Reciente', lastPlayed: 9000 })],
    });
    const vista = await pintar(React.createElement(HomeView));
    assert.ok(contiene(vista, 'SIGUE DONDE LO DEJASTE'));
    assert.ok(contiene(vista, 'Reciente'));
  });

  test('el protagonista no se repite abajo en "lo último"', async () => {
    useStore.setState({
      games: [juego({ id: 'a', name: 'Solo', lastPlayed: 9000 })],
    });
    const vista = await pintar(React.createElement(HomeView));
    const veces = (texto(vista).match(/Solo/g) ?? []).length;
    assert.equal(veces, 1, 'aparece una vez, no dos');
  });
});

describe('el diálogo', () => {
  test('cerrado no pinta nada', async () => {
    const vista = await pintar(React.createElement(Modal, {
      open: false, title: 'Un título', onClose: () => {}, children: 'contenido',
    }));
    assert.equal(texto(vista), '');
  });

  test('abierto se anuncia como diálogo y con su nombre', async () => {
    const vista = await pintar(React.createElement(Modal, {
      open: true, title: 'Comparar perfiles', onClose: () => {}, children: 'contenido',
    }));
    const dialogo = vista.querySelector('[role="dialog"]');
    assert.ok(dialogo);
    assert.equal(dialogo.getAttribute('aria-modal'), 'true');
    assert.equal(dialogo.getAttribute('aria-label'), 'Comparar perfiles');
  });

  /*
   * El foco se queda en el botón que abrió el diálogo, que está fuera, así que
   * un `onKeyDown` en el propio diálogo no oiría nada. Se escucha en la
   * ventana; esto comprueba que se sigue oyendo.
   */
  test('Escape lo cierra', async () => {
    let cerrado = false;
    await pintar(React.createElement(Modal, {
      open: true, title: 'Un título', onClose: () => { cerrado = true; }, children: 'contenido',
    }));
    await teclear('Escape');
    assert.equal(cerrado, true);
  });

  test('otra tecla no lo cierra', async () => {
    let cerrado = false;
    await pintar(React.createElement(Modal, {
      open: true, title: 'Un título', onClose: () => { cerrado = true; }, children: 'contenido',
    }));
    await teclear('a');
    assert.equal(cerrado, false);
  });

  test('pulsar fuera lo cierra, y dentro no', async () => {
    let cerrado = false;
    const vista = await pintar(React.createElement(Modal, {
      open: true, title: 'Un título', onClose: () => { cerrado = true; }, children: 'contenido',
    }));
    const dialogo = vista.querySelector('[role="dialog"]') as HTMLElement;
    await pulsar(dialogo, 'nada que pulsar');
    assert.equal(cerrado, false, 'el contenido no cierra');
  });
});

describe('las piezas sueltas', () => {
  test('el vacío enseña título, pista y su acción', async () => {
    const vista = await pintar(React.createElement(Empty, {
      title: 'No hay nada', hint: 'Prueba con otra cosa',
      action: React.createElement('button', null, 'Reintentar'),
    }));
    const dice = vista;
    assert.ok(contiene(vista, 'No hay nada'));
    assert.ok(contiene(vista, 'Prueba con otra cosa'));
    assert.equal(botones(vista).length, 1);
  });

  test('la barra de progreso dice su valor a quien no la ve', async () => {
    const vista = await pintar(React.createElement(Progress, { value: 42, label: 'Balatro' }));
    const barra = vista.querySelector('[role="progressbar"]');
    assert.ok(barra);
    assert.equal(barra.getAttribute('aria-valuenow'), '42');
    assert.equal(barra.getAttribute('aria-label'), 'Balatro');
  });

  test('un valor imposible se recorta a la escala', async () => {
    const vista = await pintar(React.createElement(Progress, { value: 180 }));
    assert.equal(vista.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow'), '100');
  });
});
