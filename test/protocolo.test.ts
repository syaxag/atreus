import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * El protocolo `atreus://`.
 *
 * Es por donde el renderer consigue archivos del disco: carátulas, pósters e
 * iconos de logros, que viven en la caché de Steam y fuera del bundle. El
 * renderer no puede leer `file://` —lo bloquea la CSP, y con razón—, así que
 * pasa por aquí.
 *
 * Lo que se comprueba es lo único que importa de un intermediario así: que
 * entrega **lo que le han registrado** y nada más. Un fallo aquí convierte
 * "enseñar una carátula" en "leer cualquier archivo del disco que el renderer
 * sepa nombrar", y el renderer enseña texto de webs de terceros.
 *
 * Este archivo era imposible de escribir hasta ahora: `protocol.handle()`
 * registra un manejador que solo llama Chromium. El doble de Electron se queda
 * con él y lo presta.
 */

const raiz = mkdtempSync(join(tmpdir(), 'atreus-protocolo-'));
process.env['ATREUS_TEST_DATA'] = raiz;

const { pedirA } = await import('./dobles/electron.ts');
const { registerProtocolHandlers, setCoverPaths, setPosterPaths, setIconRoot } =
  await import('../src/main/protocol.ts');

/** Carpeta de iconos, como la que monta la sesión de Steam. */
const iconos = join(raiz, 'iconos');
/** Un archivo cualquiera fuera de todo lo registrado, para intentar sacarlo. */
const secreto = join(raiz, 'secreto.txt');

const caratula = join(raiz, 'caratula-balatro.png');
const poster = join(raiz, 'poster-balatro.png');

before(() => {
  mkdirSync(join(iconos, '2379780'), { recursive: true });
  writeFileSync(join(iconos, '2379780', 'logro.png'), 'ICONO');
  writeFileSync(secreto, 'CONTRASEÑAS');
  writeFileSync(caratula, 'CARATULA');
  writeFileSync(poster, 'POSTER');

  setIconRoot(iconos);
  setCoverPaths(new Map([['steam:2379780', caratula]]));
  setPosterPaths(new Map([['steam:2379780', poster]]));
  registerProtocolHandlers();
});

const pedir = async (url: string) => await pedirA(url);

describe('lo que sí sirve', () => {
  test('una carátula registrada', async () => {
    const res = await pedir('atreus://cover/steam.2379780');
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'CARATULA');
  });

  test('un póster registrado', async () => {
    const res = await pedir('atreus://poster/steam.2379780');
    assert.equal(await res.text(), 'POSTER');
  });

  test('un icono de logro, por AppID y nombre de archivo', async () => {
    const res = await pedir('atreus://icon/2379780/logro.png');
    assert.equal(await res.text(), 'ICONO');
  });

  test('el sello de tiempo de la URL no estorba', async () => {
    // La biblioteca añade `?v=<mtime>` para que una carátula que llega tarde se
    // recargue. Si el manejador mirara la cadena entera, eso lo rompería.
    const res = await pedir('atreus://cover/steam.2379780?v=1730000000');
    assert.equal(await res.text(), 'CARATULA');
  });
});

describe('lo que no', () => {
  test('un juego que nadie registró', async () => {
    const res = await pedir('atreus://cover/steam.999999');
    assert.equal(res.status, 404);
  });

  test('un icono de un AppID que no es un número', async () => {
    // El AppID entra en una ruta del disco: si no se comprueba, ahí cabe
    // cualquier cosa.
    assert.equal((await pedir('atreus://icon/..%2F..%2Fetc/logro.png')).status, 404);
    assert.equal((await pedir('atreus://icon/steam/logro.png')).status, 404);
  });

  test('un icono cuyo nombre intenta salirse de su carpeta', async () => {
    assert.equal((await pedir('atreus://icon/2379780/..%2Fsecreto.txt')).status, 404);
    assert.equal((await pedir('atreus://icon/2379780/sub%2Fotro.png')).status, 404);
  });

  test('un icono que no es .png', async () => {
    assert.equal((await pedir('atreus://icon/2379780/secreto.txt')).status, 404);
    assert.equal((await pedir('atreus://icon/2379780/algo.exe')).status, 404);
  });

  test('un icono que no existe', async () => {
    assert.equal((await pedir('atreus://icon/2379780/no-esta.png')).status, 404);
  });

  test('una ruta absoluta del disco no se sirve por nombrarla', async () => {
    // Este es el fallo que el protocolo existe para no tener: el renderer no
    // puede pedir un archivo, solo una clave que el catálogo haya registrado.
    const res = await pedir(`atreus://cover/${encodeURIComponent(secreto)}`);
    assert.equal(res.status, 404);
  });

  test('un destino que no es ninguno de los tres', async () => {
    assert.equal((await pedir('atreus://loquesea/x')).status, 404);
    assert.equal((await pedir('atreus://cover')).status, 404);
  });
});

describe('cuando cambia lo registrado', () => {
  test('registrar de nuevo olvida lo anterior', async () => {
    // Un reescaneo sustituye el mapa entero. Si se acumulara, un juego
    // desinstalado seguiría sirviendo su carátula vieja para siempre.
    setCoverPaths(new Map([['steam:108600', caratula]]));

    assert.equal((await pedir('atreus://cover/steam.2379780')).status, 404);
    assert.equal(await (await pedir('atreus://cover/steam.108600')).text(), 'CARATULA');
  });
});
