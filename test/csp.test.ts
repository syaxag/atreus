import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/**
 * La política de seguridad de contenido, leída del HTML de verdad.
 *
 * No de una copia ni de una constante: del archivo que se empaqueta. Un test
 * que comprobara una constante daría verde con la CSP quitada del HTML, que es
 * exactamente el fallo que ya se cometió una vez en la prueba de humo y está
 * contado en `scripts/smoke.mjs`.
 *
 * Lo que se lee aquí es lo que protege una pantalla que **muestra texto de
 * webs de terceros**: las guías de la comunidad y las wikis.
 */

const raiz = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(join(raiz, 'src', 'renderer', 'index.html'), 'utf8');

/** El contenido del `<meta http-equiv="Content-Security-Policy">`. */
const csp = (() => {
  const meta = /<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?content="([^"]+)"/i.exec(html);
  assert.ok(meta, 'el HTML del renderer no declara ninguna CSP');
  return meta[1]!.replace(/\s+/g, ' ').trim();
})();

/** Las directivas, como mapa. */
const directivas = new Map(
  csp.split(';').map((trozo) => trozo.trim()).filter(Boolean).map((trozo) => {
    const [nombre, ...valores] = trozo.split(/\s+/);
    return [nombre!.toLowerCase(), valores];
  }),
);

describe('la CSP del renderer', () => {
  test('nada por defecto salvo lo propio', () => {
    assert.deepEqual(directivas.get('default-src'), ["'self'"]);
  });

  test('ningún script de fuera: las guías traen texto ajeno', () => {
    assert.deepEqual(directivas.get('script-src'), ["'self'"]);
    // Ni `unsafe-inline` ni `unsafe-eval`, que serían la puerta entera.
    assert.ok(!csp.includes("script-src 'self' 'unsafe"));
  });

  test('object-src: nada de <object> ni <embed>', () => {
    assert.deepEqual(directivas.get('object-src'), ["'none'"]);
  });

  test('base-uri: que una inyección no pueda mover la base de las rutas', () => {
    // `default-src` NO cubre esta. Es de las que hay que escribir o no existen.
    assert.deepEqual(directivas.get('base-uri'), ["'self'"]);
  });

  test('form-action: Atreus no envía formularios a ninguna parte', () => {
    // Tampoco la cubre `default-src`. Un <form> hacia fuera solo puede ser un
    // intento de sacar datos de aquí.
    assert.deepEqual(directivas.get('form-action'), ["'none'"]);
  });

  test('las imágenes vienen de una lista, y toda la lista es https', () => {
    const img = directivas.get('img-src');
    assert.ok(img, 'no hay img-src');
    const remotas = img.filter((v) => v.includes('://'));
    assert.ok(remotas.length > 0, 'se esperaban CDN concretos');
    for (const origen of remotas) {
      assert.ok(origen.startsWith('https://'), `${origen} no es https`);
    }
  });

  test('no hay comodines en ninguna directiva', () => {
    for (const [nombre, valores] of directivas) {
      assert.ok(!valores.includes('*'), `${nombre} tiene un comodín`);
      for (const valor of valores) {
        assert.ok(!valor.startsWith('*.'), `${nombre} admite el comodín ${valor}`);
      }
    }
  });
});
