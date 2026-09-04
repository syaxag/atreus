import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { act, limpiar, pintar } from './dom.ts';

/**
 * El diálogo y el foco.
 *
 * Lo difícil ya estaba: `role="dialog"`, `aria-modal` y cerrar con Escape. Lo
 * que faltaba era lo que `aria-modal` **no** hace: al tabulador no le dice
 * nada, así que el foco se iba a los botones de la vista de detrás —tapados
 * por el fondo, invisibles— y desde ahí se podía pulsar a ciegas.
 */

const { Modal } = await import('../src/renderer/components/ui/index.tsx');
const React = await import('react');

/**
 * El texto de lo que tiene el foco.
 *
 * Se compara el texto y no el nodo. Un `assert.equal` entre dos elementos
 * pintados por React serializa el árbol de fibras entero para enseñar la
 * diferencia: tarda **treinta segundos** en fallar, y eso no parece un test
 * rojo, parece un test colgado. Por lo mismo, los nodos se comparan con
 * `assert.ok(a === b)` y no con `assert.equal`.
 */
const activo = () => (globalThis.document.activeElement?.textContent ?? '').trim();

/** Manda una tecla al elemento con el foco, como haría el usuario. */
async function tabular(shift = false): Promise<void> {
  const doc = globalThis.document;
  await act(async () => {
    doc.activeElement?.dispatchEvent(new globalThis.KeyboardEvent('keydown', {
      key: 'Tab', shiftKey: shift, bubbles: true, cancelable: true,
    }));
  });
}

function dialogoCon(...botones: string[]) {
  return React.createElement(Modal, {
    open: true,
    title: 'Confirmar',
    onClose: () => undefined,
    children: React.createElement(
      'div',
      null,
      ...botones.map((texto) => React.createElement('button', { key: texto }, texto)),
    ),
  });
}

describe('el foco dentro del diálogo', () => {
  afterEach(limpiar);

  test('al abrirse, el foco entra en el diálogo', async () => {
    const vista = await pintar(dialogoCon('Aceptar'));
    const dialogo = vista.querySelector('[role="dialog"]');

    assert.ok(globalThis.document.activeElement === dialogo);
  });

  test('el tabulador no se sale por el final', async () => {
    const vista = await pintar(dialogoCon('Uno', 'Dos'));
    const dialogo = vista.querySelector('[role="dialog"]')!;
    const enfocables = [...dialogo.querySelectorAll('button')];
    const ultimo = enfocables[enfocables.length - 1]!;

    await act(async () => { ultimo.focus(); });
    await tabular();

    // Vuelve al primero en vez de irse a la vista de detrás.
    assert.equal(activo(), 'Uno');
  });

  test('Shift+Tab tampoco se sale por el principio', async () => {
    const vista = await pintar(dialogoCon('Uno', 'Dos'));
    const dialogo = vista.querySelector('[role="dialog"]')!;
    const enfocables = [...dialogo.querySelectorAll('button')];

    await act(async () => { enfocables[0]!.focus(); });
    await tabular(true);

    assert.equal(activo(), 'Dos');
  });

  test('con el foco en el propio diálogo, Shift+Tab va al último', async () => {
    // Es el estado nada más abrirse: el foco está en el contenedor, no en un
    // botón. Sin este caso, la primera pulsación se escapaba.
    await pintar(dialogoCon('Uno', 'Dos'));

    await tabular(true);

    assert.equal(activo(), 'Dos');
  });

  test('un diálogo sin nada que enfocar retiene el foco', async () => {
    const vista = await pintar(React.createElement(Modal, {
      open: true,
      title: 'Solo texto',
      onClose: () => undefined,
      children: React.createElement('p', null, 'Nada que pulsar'),
    }));
    const dialogo = vista.querySelector('[role="dialog"]');

    await tabular();

    assert.ok(globalThis.document.activeElement === dialogo);
  });

  test('al cerrarse, el foco vuelve a quien lo abrió', async () => {
    // Sin esto el foco se quedaba en el body y el tabulador volvía a empezar
    // por la esquina de la ventana.
    const doc = globalThis.document;
    const abridor = doc.createElement('button');
    abridor.textContent = 'Abrir';
    doc.body.appendChild(abridor);
    abridor.focus();
    assert.ok(doc.activeElement === abridor);

    await pintar(dialogoCon('Aceptar'));
    assert.ok(doc.activeElement !== abridor);

    await limpiar();

    assert.ok(doc.activeElement === abridor);
    abridor.remove();
  });

  test('si quien lo abrió ya no está, cerrar no revienta', async () => {
    const doc = globalThis.document;
    const efimero = doc.createElement('button');
    doc.body.appendChild(efimero);
    efimero.focus();

    await pintar(dialogoCon('Aceptar'));
    efimero.remove(); // el botón desaparece con la vista

    await limpiar();
  });
});
