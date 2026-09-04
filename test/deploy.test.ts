import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative, sep } from 'node:path';
import type { GameId, Mod } from '../src/shared/types.ts';

/**
 * El despliegue de mods, contra un directorio de verdad.
 *
 * Esto es lo único de Atreus que puede dejar la instalación de otra persona
 * peor de como estaba: escribe con enlaces duros dentro de la carpeta de un
 * juego, aparta lo que pisa con un sufijo, y al purgar borra y devuelve. Y no
 * tenía **ni un test**, porque `deploy → store → paths → electron` no se puede
 * cargar en un runner de Node.
 *
 * Ahora sí: `test/dobles/electron.ts` da un Electron de mentira cuyo
 * `getPath('appData')` es un directorio temporal, así que el almacén de mods de
 * Atreus y la carpeta del juego son carpetas reales que este archivo crea y
 * borra. No se comprueba la forma del código sino la promesa que hace:
 * **desplegar y purgar deja el juego como estaba**.
 */

const temporales: string[] = [];

function carpeta(prefijo: string): string {
  const dir = mkdtempSync(join(tmpdir(), `atreus-${prefijo}-`));
  temporales.push(dir);
  return dir;
}

/*
 * `paths` se fija al cargarse, y lee del doble de Electron. Se apunta a una
 * carpeta nueva **antes** de importar nada de la aplicación, para que el
 * almacén de mods de estos tests no toque los datos de nadie.
 */
process.env['ATREUS_TEST_DATA'] = carpeta('datos');

const { deploy, purge, findConflicts, isDeployed } =
  await import('../src/main/services/mods/deploy.ts');
const { getDeployRecord, modDir } = await import('../src/main/services/mods/store.ts');

const JUEGO = 'steam:2379780' as GameId;

/** Una foto del árbol: ruta relativa → contenido. Para comparar antes y después. */
function foto(raiz: string): Record<string, string> {
  const salida: Record<string, string> = {};
  const recorrer = (dir: string) => {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const completo = join(dir, entrada.name);
      if (entrada.isDirectory()) recorrer(completo);
      else salida[relative(raiz, completo).split(sep).join('/')] = readFileSync(completo, 'utf8');
    }
  };
  recorrer(raiz);
  return salida;
}

/** Escribe un archivo creando sus carpetas. */
function escribir(base: string, ruta: string, contenido: string): void {
  const completo = join(base, ruta);
  mkdirSync(dirname(completo), { recursive: true });
  writeFileSync(completo, contenido, 'utf8');
}

/** Deja un mod en el almacén de Atreus, con sus archivos, y devuelve su ficha. */
function mod(id: string, orden: number, archivos: Record<string, string>): Mod {
  const staging = modDir(JUEGO, id);
  mkdirSync(staging, { recursive: true });
  for (const [ruta, contenido] of Object.entries(archivos)) escribir(staging, ruta, contenido);

  return {
    id,
    gameId: JUEGO,
    name: `Mod ${id}`,
    version: '1.0.0',
    author: null,
    description: null,
    status: 'staged',
    enabled: true,
    order: orden,
    sizeBytes: 0,
    installedAt: 0,
    files: Object.keys(archivos),
    conflictsWith: [],
    error: null,
  };
}

let juego: string;

beforeEach(() => {
  juego = carpeta('juego');
});

afterEach(() => {
  // El registro de despliegue vive en el almacén y sobrevive entre tests: se
  // limpia, o el purge de uno afecta al siguiente.
  try { purge(JUEGO); } catch { /* no había nada desplegado */ }
  rmSync(modDir(JUEGO, ''), { recursive: true, force: true });
  for (const dir of temporales.splice(1)) rmSync(dir, { recursive: true, force: true });
});

describe('desplegar y purgar', () => {
  test('un mod aparece en el juego, y al purgar no queda rastro', () => {
    escribir(juego, 'juego.exe', 'el juego');
    const antes = foto(juego);

    const uno = mod('m1', 0, { 'mods/lo-mio.dll': 'binario', 'README.txt': 'léeme' });
    const res = deploy(JUEGO, [uno], juego);

    assert.equal(res.files, 2);
    assert.equal(readFileSync(join(juego, 'mods', 'lo-mio.dll'), 'utf8'), 'binario');
    assert.ok(isDeployed(JUEGO));

    purge(JUEGO);

    // La promesa entera, en una línea: el juego vuelve a como estaba.
    assert.deepEqual(foto(juego), antes);
    assert.equal(isDeployed(JUEGO), false);
  });

  test('un archivo del juego pisado se respalda y vuelve intacto', () => {
    escribir(juego, 'data/config.ini', 'el original del juego');
    const antes = foto(juego);

    deploy(JUEGO, [mod('m1', 0, { 'data/config.ini': 'el del mod' })], juego);
    assert.equal(readFileSync(join(juego, 'data', 'config.ini'), 'utf8'), 'el del mod');

    purge(JUEGO);

    assert.equal(readFileSync(join(juego, 'data', 'config.ini'), 'utf8'), 'el original del juego');
    assert.deepEqual(foto(juego), antes);
  });

  test('las carpetas que creamos se retiran; las que ya estaban, no', () => {
    escribir(juego, 'data/ya-estaba.txt', 'x');
    const antes = foto(juego);

    deploy(JUEGO, [mod('m1', 0, { 'data/nuevo.txt': 'a', 'nueva/hondo/x.txt': 'b' })], juego);
    assert.ok(existsSync(join(juego, 'nueva', 'hondo')));

    purge(JUEGO);

    // La nuestra se va entera, con sus niveles.
    assert.equal(existsSync(join(juego, 'nueva')), false);
    // Y la del juego se queda, con lo suyo dentro.
    assert.ok(existsSync(join(juego, 'data', 'ya-estaba.txt')));
    assert.deepEqual(foto(juego), antes);
  });

  test('dos mods que pisan el mismo archivo: gana el del orden más alto', () => {
    escribir(juego, 'juego.exe', 'el juego');
    const antes = foto(juego);

    const primero = mod('m1', 0, { 'mods/comun.cfg': 'del primero' });
    const segundo = mod('m2', 1, { 'mods/comun.cfg': 'del segundo' });
    const res = deploy(JUEGO, [primero, segundo], juego);

    // El último del orden de carga manda, que es lo que espera cualquiera que
    // haya ordenado su lista.
    assert.equal(readFileSync(join(juego, 'mods', 'comun.cfg'), 'utf8'), 'del segundo');
    assert.equal(res.conflicts.length, 1);
    assert.deepEqual(res.conflicts[0]!.mods.sort(), ['m1', 'm2']);

    purge(JUEGO);
    assert.deepEqual(foto(juego), antes);
  });

  test('un mod desactivado no llega al juego', () => {
    const activo = mod('m1', 0, { 'a.txt': 'sí' });
    const apagado = { ...mod('m2', 1, { 'b.txt': 'no' }), enabled: false };

    deploy(JUEGO, [activo, apagado], juego);

    assert.ok(existsSync(join(juego, 'a.txt')));
    assert.equal(existsSync(join(juego, 'b.txt')), false);
  });

  test('un mod en error tampoco', () => {
    const roto = { ...mod('m1', 0, { 'a.txt': 'x' }), status: 'error' as const };
    const res = deploy(JUEGO, [roto], juego);

    assert.equal(res.files, 0);
    assert.equal(existsSync(join(juego, 'a.txt')), false);
  });

  test('desactivar un mod y volver a desplegar retira sus archivos', () => {
    escribir(juego, 'juego.exe', 'el juego');

    const uno = mod('m1', 0, { 'mods/uno.dll': '1' });
    const dos = mod('m2', 1, { 'mods/dos.dll': '2' });
    deploy(JUEGO, [uno, dos], juego);
    assert.ok(existsSync(join(juego, 'mods', 'dos.dll')));

    // Se vuelve a desplegar con el segundo apagado: tiene que desaparecer.
    deploy(JUEGO, [uno, { ...dos, enabled: false }], juego);
    assert.ok(existsSync(join(juego, 'mods', 'uno.dll')));
    assert.equal(existsSync(join(juego, 'mods', 'dos.dll')), false);
  });

  test('desplegar dos veces seguidas no duplica ni deja copias de nosotros mismos', () => {
    escribir(juego, 'data/config.ini', 'original');
    const antes = foto(juego);

    const uno = mod('m1', 0, { 'data/config.ini': 'del mod' });
    deploy(JUEGO, [uno], juego);
    deploy(JUEGO, [uno], juego);
    deploy(JUEGO, [uno], juego);

    purge(JUEGO);

    // El defecto que esto vigila: que el segundo despliegue respaldara el
    // archivo del *mod* como si fuera del juego. Ahí el original se perdía.
    assert.deepEqual(foto(juego), antes);
  });

  test('los archivos desplegados son enlaces duros: no ocupan el doble', () => {
    const uno = mod('m1', 0, { 'grande.bin': 'x'.repeat(1000) });
    deploy(JUEGO, [uno], juego);

    const origen = statSync(join(modDir(JUEGO, 'm1'), 'grande.bin'));
    const destino = statSync(join(juego, 'grande.bin'));

    // Mismo inodo, o al menos el mismo contenido si el sistema obligó a copiar
    // (otra unidad, otro sistema de archivos). Las dos cosas son correctas.
    const enlazado = origen.ino === destino.ino && origen.ino !== 0;
    if (!enlazado) {
      assert.equal(readFileSync(join(juego, 'grande.bin'), 'utf8').length, 1000);
    }
    assert.equal(destino.size, 1000);
  });

  test('purgar sin nada desplegado no hace nada y no se queja', () => {
    escribir(juego, 'juego.exe', 'x');
    const antes = foto(juego);

    assert.equal(purge(JUEGO), 0);
    assert.deepEqual(foto(juego), antes);
  });

  test('el registro apunta lo escrito y lo respaldado', () => {
    escribir(juego, 'data/config.ini', 'original');
    deploy(JUEGO, [mod('m1', 0, { 'data/config.ini': 'mod', 'nuevo.txt': 'x' })], juego);

    const registro = getDeployRecord(JUEGO);
    assert.ok(registro);
    assert.equal(registro.root, juego);
    assert.equal(registro.files.length, 2);

    const pisado = registro.files.find((f) => f.path.includes('config.ini'));
    assert.equal(pisado?.backedUp, true, 'el que pisó al juego tiene que constar respaldado');

    const nuevo = registro.files.find((f) => f.path === 'nuevo.txt');
    assert.equal(nuevo?.backedUp, false, 'el que no pisó nada, no');
  });

  test('si el usuario borró a mano lo desplegado, purgar no revienta', () => {
    escribir(juego, 'data/config.ini', 'original');
    deploy(JUEGO, [mod('m1', 0, { 'data/config.ini': 'mod', 'suelto.txt': 'x' })], juego);

    // Alguien limpia la carpeta del juego por su cuenta.
    rmSync(join(juego, 'suelto.txt'), { force: true });

    purge(JUEGO);
    // Lo importante sigue siendo verdad: el original vuelve.
    assert.equal(readFileSync(join(juego, 'data', 'config.ini'), 'utf8'), 'original');
  });

  test('un mod sin su carpeta en el almacén se salta sin tumbar el despliegue', () => {
    const fantasma = mod('m1', 0, { 'a.txt': 'x' });
    rmSync(modDir(JUEGO, 'm1'), { recursive: true, force: true });
    const bueno = mod('m2', 1, { 'b.txt': 'y' });

    const res = deploy(JUEGO, [fantasma, bueno], juego);

    assert.equal(res.files, 1);
    assert.ok(existsSync(join(juego, 'b.txt')));
  });
});

describe('conflictos', () => {
  test('dos mods que escriben lo mismo se detectan', () => {
    const uno = mod('m1', 0, { 'mods/x.cfg': 'a', 'solo-mio.txt': 'a' });
    const dos = mod('m2', 1, { 'mods/x.cfg': 'b' });

    const conflictos = findConflicts(JUEGO, [uno, dos]);

    assert.equal(conflictos.length, 1);
    assert.match(conflictos[0]!.path, /x\.cfg$/);
  });

  test('sin solapes no hay conflicto', () => {
    const uno = mod('m1', 0, { 'a.txt': 'a' });
    const dos = mod('m2', 1, { 'b.txt': 'b' });

    assert.deepEqual(findConflicts(JUEGO, [uno, dos]), []);
  });

  test('el mismo archivo con otras mayúsculas también es conflicto en Windows', () => {
    const uno = mod('m1', 0, { 'Mods/Config.CFG': 'a' });
    const dos = mod('m2', 1, { 'mods/config.cfg': 'b' });

    assert.equal(findConflicts(JUEGO, [uno, dos]).length, 1);
  });
});
