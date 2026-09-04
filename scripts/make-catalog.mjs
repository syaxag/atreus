/*
 * Genera el manifiesto del catálogo compartido a partir de `data/games/`.
 *
 * Es lo que convierte "añadir un juego" en algo que **le llega a todo el
 * mundo**: hasta ahora, para que alguien tuviera la ficha de un juego nuevo
 * hacía falta que se bajara un instalador. Con el catálogo publicado, se añade
 * un JSON, se empuja, y las Atreus de ahí fuera lo recogen solas.
 *
 * El manifiesto no lleva las definiciones dentro, sino **dónde está cada una y
 * su SHA-256**. Dos motivos:
 *
 *  - Atreus se baja solo las que cambiaron, y no el catálogo entero cada seis
 *    horas.
 *  - El hash es lo que hace que una definición no se pueda cambiar por el
 *    camino sin que se note. La sincronización lo comprueba y rechaza la que
 *    no cuadre; ver `syncManifest` en `services/catalog/sync.ts`.
 *
 * Uso:
 *   npm run catalog        (escribe data/catalog.json)
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const raiz = process.cwd();
const carpeta = join(raiz, 'data', 'games');
const salida = join(raiz, 'data', 'catalog.json');

/**
 * De dónde se bajan las definiciones.
 *
 * `raw.githubusercontent.com` sirve el contenido del repositorio por HTTPS y en
 * crudo, que es lo que hace falta. Va contra `master` a propósito y no contra
 * una etiqueta: el catálogo tiene que poder adelantarse a las versiones de la
 * aplicación, que es su razón de ser.
 */
const BASE = 'https://raw.githubusercontent.com/syaxag/atreus/master/data/games';

/** Las definiciones de verdad: ni el esquema ni los ejemplos. */
const archivos = readdirSync(carpeta)
  .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  .sort();

if (archivos.length === 0) {
  console.error('No hay ninguna definición en data/games.');
  process.exit(1);
}

const definiciones = [];
for (const file of archivos) {
  const contenido = readFileSync(join(carpeta, file));

  // Se valida antes de publicarla. Un JSON roto en el catálogo lo descarga
  // todo el mundo y lo descarta todo el mundo: mejor no llegar a colgarlo.
  try {
    const def = JSON.parse(contenido.toString('utf8'));
    if (typeof def?.id !== 'string' || typeof def?.name !== 'string') {
      console.error(`${file}: le falta "id" o "name". No se publica.`);
      process.exit(1);
    }
  } catch (e) {
    console.error(`${file}: JSON inválido — ${e.message}`);
    process.exit(1);
  }

  definiciones.push({
    file,
    url: `${BASE}/${file}`,
    sha256: createHash('sha256').update(contenido).digest('hex'),
  });
}

/**
 * La versión del catálogo es la fecha.
 *
 * No sigue a la de la aplicación **a propósito**: son dos cosas que se publican
 * por separado y con ritmos distintos, y darles el mismo número invitaría a
 * pensar que hay que subir las dos a la vez.
 */
const hoy = new Date();
const version = [
  hoy.getUTCFullYear(),
  String(hoy.getUTCMonth() + 1).padStart(2, '0'),
  String(hoy.getUTCDate()).padStart(2, '0'),
].join('.');

const manifiesto = {
  schema: 'atreus.catalog/v1',
  version,
  publishedAt: Math.floor(Date.now() / 1000),
  definitions: definiciones,
};

writeFileSync(salida, `${JSON.stringify(manifiesto, null, 2)}\n`, 'utf8');
console.log(`catalog.json escrito: ${definiciones.length} definiciones, versión ${version}`);
