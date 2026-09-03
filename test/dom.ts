import { JSDOM } from 'jsdom';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ReactElement } from 'react';

/**
 * Un DOM de mentira para probar las vistas.
 *
 * Se monta **al importar este archivo**, y por eso los tests de componentes lo
 * importan antes que nada y cargan la vista con un `await import(...)`: React
 * mira `document` cuando se carga, no cuando se usa, así que el orden importa.
 *
 * Lo que se prueba con esto es lo que ni el typecheck ni el smoke ven: que una
 * lista vacía no reviente, que un diálogo cierre con Escape, que un estado
 * límite pinte lo que dice. No es para comprobar estilos ni maquetación —eso
 * no lo sabe jsdom— sino el comportamiento.
 */

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://atreus.test/',
  pretendToBeVisual: true,
});

const globales = [
  'window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event',
  'KeyboardEvent', 'MouseEvent', 'CustomEvent', 'getComputedStyle', 'requestAnimationFrame',
  'cancelAnimationFrame', 'DOMRect',
] as const;

/*
 * Con `defineProperty` y no con una asignación: en Node 24 algunos globales
 * —`navigator`, sin ir más lejos— solo tienen getter, y asignarles revienta.
 */
for (const nombre of globales) {
  const valor = (dom.window as unknown as Record<string, unknown>)[nombre];
  if (valor === undefined) continue;
  Object.defineProperty(globalThis, nombre, { value: valor, configurable: true, writable: true });
}

// React 18 lo exige para no llenar la salida de avisos sobre `act`.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let raiz: Root | null = null;
let contenedor: HTMLElement | null = null;

/** Pinta un componente y devuelve su contenedor. */
export async function pintar(elemento: ReactElement): Promise<HTMLElement> {
  contenedor = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
  await act(async () => { raiz!.render(elemento); });
  return contenedor;
}

/** Desmonta lo pintado. Va en un `afterEach`, o una prueba ensucia la siguiente. */
export async function limpiar(): Promise<void> {
  if (raiz) await act(async () => { raiz!.unmount(); });
  contenedor?.remove();
  raiz = null;
  contenedor = null;
}

/** El texto visible, con los espacios normalizados para poder buscar en él. */
export function texto(nodo: HTMLElement): string {
  return (nodo.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * ¿Dice esto la vista?
 *
 * Sin distinguir mayúsculas **a propósito**: media interfaz lleva `uppercase`
 * de CSS, y jsdom no aplica CSS. Un test que buscara "PLATINOS" estaría
 * comprobando la hoja de estilos, que aquí no existe, en vez del contenido.
 */
export function contiene(nodo: HTMLElement, algo: string): boolean {
  return texto(nodo).toLocaleLowerCase().includes(algo.toLocaleLowerCase());
}

/** Todos los botones, que es por donde se toca una vista. */
export function botones(nodo: HTMLElement): HTMLButtonElement[] {
  return [...nodo.querySelectorAll('button')] as HTMLButtonElement[];
}

/** Pulsa el primer botón cuyo texto o etiqueta accesible contenga `algo`. */
export async function pulsar(nodo: HTMLElement, algo: string): Promise<boolean> {
  const boton = botones(nodo).find((b) => (
    (b.textContent ?? '').includes(algo) || (b.getAttribute('aria-label') ?? '').includes(algo)
  ));
  if (!boton) return false;
  await act(async () => { boton.click(); });
  return true;
}

/** Manda una tecla a la ventana, como haría el usuario. */
export async function teclear(tecla: string): Promise<void> {
  await act(async () => {
    dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: tecla, bubbles: true }));
  });
}

export { act };
