import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { nombreSeguro, descargaPermitida } from '../src/main/services/mods/providers.ts';
import { resolverRaiz, dentroDe } from '../src/main/services/mods/raiz.ts';
import { origenRemoto } from '../src/main/services/catalog/sync.ts';

/**
 * Los tres bordes por donde entraba algo de fuera sin que nadie lo mirara.
 *
 * Ninguno de estos tres es una hipótesis: los tres son datos que Atreus se
 * cree de un catálogo público o de un archivo JSON sincronizado por la red, y
 * los tres acababan decidiendo dónde se escribe en el disco.
 */

describe('el nombre con el que se guarda una descarga', () => {
  test('un nombre normal se respeta', () => {
    assert.equal(nombreSeguro('BalatroMod-1.2.0.zip'), 'BalatroMod-1.2.0.zip');
    assert.equal(nombreSeguro('mi mod.geode'), 'mi mod.geode');
  });

  test('el recorrido de directorios se corta', () => {
    // Esto es lo que escribía fuera del temporal.
    assert.equal(nombreSeguro('..\\..\\algo.exe'), 'algo.exe');
    assert.equal(nombreSeguro('../../../etc/passwd'), 'passwd');
    assert.equal(nombreSeguro('C:\\Windows\\System32\\evil.dll'), 'evil.dll');
    assert.equal(nombreSeguro('/tmp/x/y/z.zip'), 'z.zip');
  });

  test('un nombre que era solo recorrido no deja nada, y se dice', () => {
    assert.equal(nombreSeguro('..'), null);
    assert.equal(nombreSeguro('../..'), null);
    assert.equal(nombreSeguro(''), null);
    assert.equal(nombreSeguro('   '), null);
  });

  test('los caracteres que Windows no admite se sustituyen', () => {
    assert.equal(nombreSeguro('mod<>:"|?*.zip'), 'mod_______.zip');
  });

  test('un nombre larguísimo se recorta', () => {
    const largo = 'a'.repeat(400) + '.zip';
    assert.equal(nombreSeguro(largo)!.length, 120);
  });

  test('un nombre oculto no se cuela como tal', () => {
    // `.htaccess` a secas es legítimo en un zip, pero como nombre del archivo
    // descargado solo sirve para esconderlo.
    assert.equal(nombreSeguro('...oculto.zip'), 'oculto.zip');
  });
});

describe('de dónde se admite descargar un mod', () => {
  test('https sí', () => {
    assert.equal(descargaPermitida('https://thunderstore.io/x.zip'), true);
  });

  test('http plano no: lo que se descarga acaba dentro de un juego', () => {
    assert.equal(descargaPermitida('http://thunderstore.io/x.zip'), false);
  });

  test('ni file, ni ftp, ni una cadena que no es una URL', () => {
    assert.equal(descargaPermitida('file:///C:/Windows/System32/x.dll'), false);
    assert.equal(descargaPermitida('ftp://algo/x.zip'), false);
    assert.equal(descargaPermitida('no soy una url'), false);
    assert.equal(descargaPermitida(''), false);
  });
});

describe('el origen del catálogo de definiciones', () => {
  test('una carpeta local no es un origen remoto', () => {
    assert.equal(origenRemoto('C:\\Users\\yo\\definiciones'), null);
    assert.equal(origenRemoto('./data/games'), null);
  });

  test('https sí', () => {
    assert.equal(origenRemoto('https://ejemplo.com/catalogo.zip')?.protocol, 'https:');
  });

  test('http plano se rechaza diciendo por qué', () => {
    // Una definición decide qué ejecutable se lanza y dónde se escriben los
    // mods: por HTTP la cambia cualquiera que esté en medio.
    assert.throws(
      () => origenRemoto('http://ejemplo.com/catalogo.zip'),
      /HTTPS/,
    );
  });

  test('otros esquemas también', () => {
    assert.throws(() => origenRemoto('ftp://ejemplo.com/catalogo.zip'), /HTTPS/);
    assert.throws(() => origenRemoto('file:///C:/algo.json'), /HTTPS/);
  });
});

describe('dónde puede una definición desplegar sus mods', () => {
  const env = {
    APPDATA: 'C:\\Users\\yo\\AppData\\Roaming',
    LOCALAPPDATA: 'C:\\Users\\yo\\AppData\\Local',
    USERPROFILE: 'C:\\Users\\yo',
    SystemRoot: 'C:\\Windows',
  } as NodeJS.ProcessEnv;

  const juego = 'C:\\Steam\\steamapps\\common\\Balatro';

  test('sin raíz declarada, el directorio del juego', () => {
    const r = resolverRaiz(juego, undefined, env);
    assert.equal(r.ok && r.root, juego);
  });

  test('una relativa cuelga del juego', () => {
    const r = resolverRaiz(juego, 'Mods', env);
    assert.ok(r.ok);
    assert.ok(dentroDe(r.root, juego));
  });

  test('%APPDATA% es una carpeta del usuario y se acepta', () => {
    const r = resolverRaiz(juego, '%APPDATA%\\Balatro\\Mods', env);
    assert.ok(r.ok, r.ok ? '' : r.error);
    assert.ok(dentroDe(r.root, env['APPDATA']!));
  });

  test('%SystemRoot%\\System32 se rechaza, con el motivo escrito', () => {
    // Este es el caso que importa: ahí escribe deploy() y ahí borra purge().
    const r = resolverRaiz(juego, '%SystemRoot%\\System32', env);
    assert.equal(r.ok, false);
    assert.match(r.ok ? '' : r.error, /fuera del juego/);
  });

  test('una ruta absoluta cualquiera se rechaza', () => {
    assert.equal(resolverRaiz(juego, 'C:\\Windows\\System32', env).ok, false);
    assert.equal(resolverRaiz(juego, 'D:\\lo que sea', env).ok, false);
  });

  test('una relativa con .. que se sale del juego se rechaza', () => {
    const r = resolverRaiz(juego, '..\\..\\..\\..\\Windows\\System32', env);
    assert.equal(r.ok, false);
    assert.match(r.ok ? '' : r.error, /se sale del directorio del juego/);
  });

  test('un recurso de red se rechaza', () => {
    const r = resolverRaiz(juego, '\\\\servidor\\compartido\\mods', env);
    assert.equal(r.ok, false);
    assert.match(r.ok ? '' : r.error, /red/);
  });

  test('una variable que no existe deja la raíz vacía y se dice', () => {
    const r = resolverRaiz(juego, '%NO_EXISTE%', env);
    assert.equal(r.ok, false);
    assert.match(r.ok ? '' : r.error, /vacía/);
  });

  test('sin juego instalado y sin raíz, no hay dónde desplegar', () => {
    assert.equal(resolverRaiz(null, undefined, env).ok, false);
    assert.equal(resolverRaiz(null, 'Mods', env).ok, false);
  });
});

describe('dentroDe', () => {
  test('una carpeta está dentro de sí misma', () => {
    assert.equal(dentroDe('C:\\Juegos', 'C:\\Juegos'), true);
  });

  test('un hermano con el mismo prefijo NO está dentro', () => {
    // El fallo clásico de comparar cadenas sin el separador.
    assert.equal(dentroDe('C:\\Juegos2', 'C:\\Juegos'), false);
  });

  test('no distingue mayúsculas, como Windows', () => {
    assert.equal(dentroDe('c:\\juegos\\balatro', 'C:\\Juegos'), true);
  });

  test('un contenedor vacío no contiene nada', () => {
    assert.equal(dentroDe('C:\\Juegos', ''), false);
  });
});
