import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Achievement, GameStat, SteamSnapshot } from '../src/shared/types.ts';

/**
 * Las copias de seguridad de Steam.
 *
 * Esta es la pieza que la fase 0 encontró muerta: `saveSnapshot` estaba
 * importada en `session.ts` y no la llamaba nadie, así que la carpeta de copias
 * estaba **siempre vacía** y el botón de Restaurar del Historial no podía
 * funcionar. Se arregló, y desde entonces lo único que respaldaba que
 * funcionara era que el código parecía correcto.
 *
 * Para la red de seguridad de lo único que escribe en Steam, eso no basta.
 */

process.env['ATREUS_TEST_DATA'] = mkdtempSync(join(tmpdir(), 'atreus-copias-'));

const { saveSnapshot, listSnapshots, getSnapshot } =
  await import('../src/main/services/steam/backups.ts');
const { paths } = await import('../src/main/paths.ts');

const APP = '2379780';

function logro(apiName: string, unlocked: boolean): Achievement {
  return {
    apiName,
    displayName: apiName,
    description: '',
    unlocked,
    unlockTime: unlocked ? 1_700_000_000 : null,
    globalPercent: null,
    hidden: false,
    iconUrl: null,
    iconGrayUrl: null,
    protected: false,
  };
}

function stat(apiName: string, value: number): GameStat {
  return {
    apiName,
    displayName: apiName,
    value,
    // El valor de partida va en la copia igual que el actual: sin él no se
    // podría revertir, que es para lo que existe la copia.
    originalValue: value,
    type: 'int',
    incrementOnly: false,
    permission: 0,
  };
}

let contador = 0;

/** Una copia con identificador propio, para no depender del reloj. */
function copia(appId = APP, campos: Partial<SteamSnapshot> = {}): SteamSnapshot {
  contador++;
  return {
    id: `snap-${contador}`,
    appId,
    createdAt: 1_700_000_000 + contador,
    achievements: [logro('A', true), logro('B', false)],
    stats: [stat('muertes', 42)],
    ...campos,
  };
}

/** La carpeta donde acaban las copias de un juego. */
const carpetaDe = (appId: string) => join(paths.backups, appId);

beforeEach(() => {
  contador = 0;
  rmSync(paths.backups, { recursive: true, force: true });
  mkdirSync(paths.backups, { recursive: true });
});

afterEach(() => {
  rmSync(paths.backups, { recursive: true, force: true });
});

describe('guardar y recuperar una copia', () => {
  test('lo que se guarda es lo que vuelve, entero', () => {
    const original = copia();
    saveSnapshot(original);

    const recuperada = getSnapshot(APP, original.id);

    // Entera y no un resumen: restaurar necesita cada logro y cada estadística.
    assert.deepEqual(recuperada, original);
  });

  test('se recupera por su identificador, no por el orden', () => {
    const a = copia();
    const b = copia();
    saveSnapshot(a);
    saveSnapshot(b);

    assert.equal(getSnapshot(APP, a.id)?.id, a.id);
    assert.equal(getSnapshot(APP, b.id)?.id, b.id);
  });

  test('pedir una copia que no existe da null, no revienta', () => {
    saveSnapshot(copia());
    assert.equal(getSnapshot(APP, 'no-existe'), null);
  });

  test('un juego sin copias devuelve lista vacía', () => {
    assert.deepEqual(listSnapshots('108600'), []);
  });

  test('las copias de un juego no se mezclan con las de otro', () => {
    saveSnapshot(copia(APP));
    saveSnapshot(copia('108600'));

    assert.equal(listSnapshots(APP).length, 1);
    assert.equal(listSnapshots('108600').length, 1);
    assert.equal(listSnapshots(APP)[0]!.appId, APP);
  });

  test('la más reciente va primero: es la que se ofrece restaurar', () => {
    const vieja = copia(APP, { createdAt: 1_000 });
    const nueva = copia(APP, { createdAt: 9_000 });
    saveSnapshot(vieja);
    saveSnapshot(nueva);

    const lista = listSnapshots(APP);
    assert.equal(lista[0]!.createdAt, 9_000);
    assert.equal(lista[1]!.createdAt, 1_000);
  });
});

describe('lo que puede salir mal', () => {
  test('una copia corrupta no se lleva por delante a las buenas', () => {
    const buena = copia();
    saveSnapshot(buena);
    // Un corte de luz a media escritura, un disco lleno: pasa.
    writeFileSync(join(carpetaDe(APP), '9999999999-rota.json'), '{ esto no es json', 'utf8');

    const lista = listSnapshots(APP);

    assert.equal(lista.length, 1);
    assert.equal(lista[0]!.id, buena.id);
    // Y la buena se sigue pudiendo restaurar, que es lo que importa.
    assert.ok(getSnapshot(APP, buena.id));
  });

  test('un JSON válido que no es una copia se descarta', () => {
    saveSnapshot(copia());
    writeFileSync(join(carpetaDe(APP), '9999999999-otro.json'), '{"hola":"mundo"}', 'utf8');
    writeFileSync(join(carpetaDe(APP), '9999999998-medias.json'),
      JSON.stringify({ id: 'x', appId: APP, createdAt: 1, achievements: [] }), 'utf8');

    // Sin `stats` no es restaurable: media copia es peor que ninguna, porque
    // aplicarla dejaría el juego en un estado que nunca existió.
    assert.equal(listSnapshots(APP).length, 1);
  });

  test('una copia de otro juego en la carpeta equivocada no cuela', () => {
    const ajena = copia('108600');
    mkdirSync(carpetaDe(APP), { recursive: true });
    writeFileSync(join(carpetaDe(APP), '9999999999-ajena.json'), JSON.stringify(ajena), 'utf8');

    assert.deepEqual(listSnapshots(APP), []);
  });

  test('lo que no sea .json ni se mira', () => {
    saveSnapshot(copia());
    writeFileSync(join(carpetaDe(APP), 'notas.txt'), 'cualquier cosa', 'utf8');

    assert.equal(listSnapshots(APP).length, 1);
  });
});

describe('no crecen sin límite', () => {
  test('se conservan doce por juego y se van las más viejas', () => {
    // Cada escritura de logros hace una copia. Sin tope, un juego con el que se
    // trastea una tarde deja cientos de archivos en el disco del usuario.
    for (let i = 1; i <= 20; i++) {
      saveSnapshot(copia(APP, { createdAt: 1_000 + i }));
    }

    const lista = listSnapshots(APP);
    assert.equal(lista.length, 12);

    // Y las que quedan son las doce últimas, no doce cualesquiera.
    assert.equal(lista[0]!.createdAt, 1_020);
    assert.equal(lista[11]!.createdAt, 1_009);
  });

  test('el recorte no toca las copias de otro juego', () => {
    saveSnapshot(copia('108600'));
    for (let i = 1; i <= 20; i++) saveSnapshot(copia(APP, { createdAt: 1_000 + i }));

    assert.equal(listSnapshots('108600').length, 1);
  });

  test('no deja temporales a medias en la carpeta', () => {
    saveSnapshot(copia());
    // Se escribe a un `.tmp` y se renombra; si el renombrado no ocurriera, el
    // temporal se quedaría ahí y la carpeta acumularía basura invisible.
    const sueltos = readdirSync(carpetaDe(APP)).filter((f) => f.endsWith('.tmp'));
    assert.deepEqual(sueltos, []);
  });

  test('la carpeta del juego se crea sola la primera vez', () => {
    assert.equal(existsSync(carpetaDe('999999')), false);
    saveSnapshot(copia('999999'));
    assert.ok(existsSync(carpetaDe('999999')));
  });
});
