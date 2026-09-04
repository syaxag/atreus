import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { CATALOGO_OFICIAL } from '../src/main/services/catalog/sync.ts';

/**
 * El manifiesto del catálogo compartido.
 *
 * Es lo que hace que añadir un juego le llegue a todo el mundo sin reinstalar
 * nada, y por eso mismo es un archivo con consecuencias: lo descarga cada
 * Atreus que hay por ahí, cada seis horas.
 *
 * Lo que se comprueba no es el generador sino **el manifiesto que hay ahora
 * mismo en el repositorio**: que sus hashes cuadran con los archivos de al
 * lado, que sus direcciones son las que la sincronización va a aceptar, y que
 * no se ha quedado atrás respecto a `data/games/`. Un manifiesto viejo o con un
 * hash que no cuadra no falla al publicarse: falla en el equipo de otro.
 */

const raiz = fileURLToPath(new URL('..', import.meta.url));
const manifiesto = JSON.parse(readFileSync(join(raiz, 'data', 'catalog.json'), 'utf8')) as {
  schema: string;
  version: string;
  publishedAt: number;
  definitions: { file: string; url: string; sha256: string }[];
};

/** Las definiciones de verdad: ni el esquema ni los ejemplos. */
const enDisco = readdirSync(join(raiz, 'data', 'games'))
  .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  .sort();

describe('la forma del manifiesto', () => {
  test('declara el esquema que la sincronización reconoce', () => {
    // `manifest()` en sync.ts exige exactamente esta cadena; con otra, el
    // archivo se trataría como una definición suelta y se adoptaría entero.
    assert.equal(manifiesto.schema, 'atreus.catalog/v1');
  });

  test('lleva versión y fecha de publicación', () => {
    assert.match(manifiesto.version, /^\d{4}\.\d{2}\.\d{2}$/);
    assert.equal(typeof manifiesto.publishedAt, 'number');
    assert.ok(manifiesto.publishedAt > 1_700_000_000);
  });

  test('no está vacío', () => {
    assert.ok(manifiesto.definitions.length > 0);
  });
});

describe('lo que promete cada entrada', () => {
  test('todas las direcciones son https', () => {
    // `syncManifest` rechaza el manifiesto entero si una no lo es, así que una
    // sola entrada mal formada deja a todo el mundo sin actualizar.
    for (const d of manifiesto.definitions) {
      assert.ok(d.url.startsWith('https://'), `${d.file}: ${d.url}`);
    }
  });

  test('el nombre del archivo coincide con el final de su dirección', () => {
    for (const d of manifiesto.definitions) {
      assert.ok(d.url.endsWith(`/${d.file}`), `${d.file} no cuadra con ${d.url}`);
    }
  });

  test('ningún nombre empieza por guión bajo ni deja de ser .json', () => {
    // La adopción descarta los dos casos en silencio: publicarlos sería
    // prometer una definición que nadie va a instalar.
    for (const d of manifiesto.definitions) {
      assert.ok(d.file.endsWith('.json'), d.file);
      assert.ok(!d.file.startsWith('_'), d.file);
    }
  });

  test('el hash de cada una cuadra con el archivo de al lado', () => {
    // Esto es lo que impide que una definición cambie por el camino sin que se
    // note. Si el manifiesto se quedó sin regenerar tras editar una ficha, la
    // sincronización la rechazará en el equipo del usuario y aquí se ve antes.
    for (const d of manifiesto.definitions) {
      const ruta = join(raiz, 'data', 'games', d.file);
      assert.ok(existsSync(ruta), `${d.file} está en el manifiesto y no en data/games`);
      const real = createHash('sha256').update(readFileSync(ruta)).digest('hex');
      assert.equal(real, d.sha256, `${d.file}: hay que volver a ejecutar "npm run catalog"`);
    }
  });
});

describe('el manifiesto no se queda atrás', () => {
  test('publica exactamente las definiciones que hay en data/games', () => {
    const enManifiesto = manifiesto.definitions.map((d) => d.file).sort();
    assert.deepEqual(
      enManifiesto,
      enDisco,
      'faltan o sobran fichas: ejecuta "npm run catalog"',
    );
  });

  test('cada definición aparece una sola vez', () => {
    const vistos = new Set(manifiesto.definitions.map((d) => d.file));
    assert.equal(vistos.size, manifiesto.definitions.length);
  });
});

describe('el origen por defecto', () => {
  test('es https y apunta al manifiesto', () => {
    assert.ok(CATALOGO_OFICIAL.startsWith('https://'));
    // `syncFromUrl` solo entra por el camino del manifiesto si la dirección
    // acaba en `.json`; con cualquier otra cosa intentaría extraer un ZIP.
    assert.ok(CATALOGO_OFICIAL.toLowerCase().endsWith('.json'));
  });

  test('apunta al catálogo de este repositorio', () => {
    assert.match(CATALOGO_OFICIAL, /syaxag\/atreus/);
    assert.ok(CATALOGO_OFICIAL.endsWith('/data/catalog.json'));
  });
});
