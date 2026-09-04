import { statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { transform } from 'esbuild';

/**
 * Lo que hace falta para importar el código de la aplicación desde un test.
 *
 * Tres cosas, y ninguna toca lo que se publica:
 *
 *  1. **Los alias.** `@/lib/format` y `@shared/types` los resuelven Vite y el
 *     compilador; Node no sabe nada de ellos.
 *  2. **Las extensiones.** El proyecto importa a sus vecinos sin extensión,
 *     que es lo normal en TypeScript. Node las exige.
 *  3. **El JSX.** `--experimental-strip-types` quita tipos, pero JSX no es un
 *     tipo: es sintaxis, y Node no la entiende. Se traduce con esbuild, que ya
 *     venía con Vite y no suma una dependencia.
 *
 * Y una cuarta que no es de Node sino del empaquetador: una vista importa su
 * carátula y su vídeo (`import trofeo from '@/assets/trofeo.png'`). Vite los
 * convierte en una URL; aquí se devuelve una cadena y en paz, porque lo que se
 * prueba no es la imagen.
 */

const raiz = fileURLToPath(new URL('..', import.meta.url));
const ALIAS = [
  ['@shared/', join(raiz, 'src', 'shared')],
  ['@/', join(raiz, 'src', 'renderer')],
];
const EXTENSIONES = ['.ts', '.tsx', '/index.ts', '/index.tsx'];
const ASSETS = /\.(png|jpe?g|gif|svg|webp|mp4|webm|woff2?|css)$/;

/** `@/lib/format` → una ruta de disco de verdad. */
function porAlias(especificador) {
  for (const [prefijo, destino] of ALIAS) {
    if (especificador.startsWith(prefijo)) {
      return join(destino, especificador.slice(prefijo.length));
    }
  }
  return null;
}

/** ¿Hay un archivo —no una carpeta— en esta ruta? */
function esArchivo(ruta) {
  try {
    return statSync(ruta).isFile();
  } catch {
    return false;
  }
}

/**
 * Prueba las extensiones que el proyecto se calla.
 *
 * Comprueba que sea un archivo y no solo que exista: `@/components/ui` es una
 * carpeta con un `index.tsx` dentro, y devolverla hacía que Node intentara
 * leerse un directorio.
 */
function conExtension(ruta) {
  if (esArchivo(ruta)) return ruta;
  for (const sufijo of EXTENSIONES) {
    const intento = ruta + sufijo;
    if (esArchivo(intento)) return intento;
  }
  return null;
}

/**
 * `electron`, que en un runner de Node no existe.
 *
 * Media aplicación vive detrás de `import { app } from 'electron'`, y sin esto
 * lo único comprobable del proceso principal eran las funciones que no
 * importan nada —que son justo las que menos pueden romper—. `deploy.ts`
 * escribe con enlaces duros dentro de la carpeta de un juego y `purge()` borra
 * y restaura ahí: eso no tenía ni un test porque no se podía cargar.
 *
 * El doble está en `test/dobles/electron.ts` y solo lleva lo que se usa.
 */
const ELECTRON = join(raiz, 'test', 'dobles', 'electron.ts');

export async function resolve(especificador, contexto, siguiente) {
  if (especificador === 'electron') {
    return { url: pathToFileURL(ELECTRON).href, shortCircuit: true };
  }

  const desdeAlias = porAlias(especificador);
  if (desdeAlias) {
    const encontrado = conExtension(desdeAlias);
    if (encontrado) return { url: pathToFileURL(encontrado).href, shortCircuit: true };
  }

  if (especificador.startsWith('.') && contexto.parentURL?.startsWith('file:')) {
    const base = dirname(fileURLToPath(contexto.parentURL));
    const encontrado = conExtension(join(base, especificador));
    if (encontrado) return { url: pathToFileURL(encontrado).href, shortCircuit: true };
  }

  return siguiente(especificador, contexto);
}

export async function load(url, contexto, siguiente) {
  if (!url.startsWith('file:')) return siguiente(url, contexto);

  if (ASSETS.test(url)) {
    // Vite devolvería una URL; para un test basta con que sea una cadena.
    return { format: 'module', shortCircuit: true, source: `export default ${JSON.stringify(url)};` };
  }

  if (url.endsWith('.tsx') || (url.endsWith('.ts') && url.includes('/src/'))) {
    const codigo = await readFile(fileURLToPath(url), 'utf8');
    const { code } = await transform(codigo, {
      loader: url.endsWith('.tsx') ? 'tsx' : 'ts',
      format: 'esm',
      target: 'node20',
      // El mismo runtime automático que usa la aplicación: sin `import React`
      // en cada archivo, que es como está escrito el proyecto.
      jsx: 'automatic',
      sourcefile: url,
      /*
       * `import.meta.env` es de Vite y aquí no existe. Solo lo usa `api.ts`
       * para saber si se fuerza el backend falso; sin valor, no se fuerza, y
       * la aplicación cae al mock por su otro camino: no hay `window.atreus`
       * porque no hay preload. Que es justo lo que quiere un test.
       */
      define: { 'import.meta.env.VITE_MOCK': 'undefined' },
    });
    return { format: 'module', shortCircuit: true, source: code };
  }

  return siguiente(url, contexto);
}
