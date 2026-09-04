import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Settings } from '../src/shared/types.ts';
import { revisar } from '../src/main/services/settings/validar.ts';
import { cifrar, descifrar, type Cofre } from '../src/main/services/settings/secretos.ts';

/**
 * Lo que se guarda entre arranques, revisado y cifrado.
 *
 * Los ajustes son el único sitio donde un fallo de un momento se queda a vivir:
 * lo que entra mal se escribe en el disco y sobrevive al reinicio.
 */

const BASE: Settings = {
  theme: 'dark',
  accent: '#8b5cf6',
  steamPath: null,
  steamWebApiKey: null,
  xboxApiKey: null,
  scanOnStart: true,
  minimizeToTray: true,
  catalogSource: '',
  autoSyncCatalog: true,
  updateSource: '',
  checkForAppUpdates: true,
  autoDownloadUpdates: false,
  achievementRiskAccepted: false,
  celebrationSound: true,
  language: 'es',
};

describe('revisar un parche de ajustes', () => {
  test('lo correcto pasa tal cual', () => {
    const { limpio, rechazos } = revisar({ language: 'en', scanOnStart: false });
    assert.deepEqual(limpio, { language: 'en', scanOnStart: false });
    assert.deepEqual(rechazos, []);
  });

  test('un valor de otro tipo se descarta y el resto del parche se aplica', () => {
    // Esto es lo que importa: un ajuste malo no debe costar los otros tres que
    // iban en la misma llamada.
    const { limpio, rechazos } = revisar({
      scanOnStart: 'sí' as unknown,
      language: 'pt',
      celebrationSound: false,
    });
    assert.deepEqual(limpio, { language: 'pt', celebrationSound: false });
    assert.equal(rechazos.length, 1);
    assert.equal(rechazos[0]!.clave, 'scanOnStart');
    assert.match(rechazos[0]!.motivo, /sí o no/);
  });

  test('un idioma que no existe no se guarda', () => {
    const { limpio, rechazos } = revisar({ language: 'kl' });
    assert.deepEqual(limpio, {});
    assert.equal(rechazos.length, 1);
  });

  test('un acento que no es un color se rechaza', () => {
    // Va directo a una variable CSS: sin esto, un valor con `;` se cuela.
    assert.equal(revisar({ accent: 'red; content: evil' }).limpio.accent, undefined);
    assert.equal(revisar({ accent: '#8b5cf6' }).limpio.accent, '#8b5cf6');
    assert.equal(revisar({ accent: '#fff' }).limpio.accent, undefined);
  });

  test('una clave de API puede ser texto o nada, pero no un objeto', () => {
    assert.equal(revisar({ steamWebApiKey: 'ABC123' }).limpio.steamWebApiKey, 'ABC123');
    assert.equal(revisar({ steamWebApiKey: null }).limpio.steamWebApiKey, null);
    assert.equal(revisar({ steamWebApiKey: { a: 1 } }).limpio.steamWebApiKey, undefined);
  });

  test('un ajuste que no existe no se cuela en el archivo', () => {
    const { limpio, rechazos } = revisar({ inventado: 42 });
    assert.deepEqual(limpio, {});
    assert.match(rechazos[0]!.motivo, /no es un ajuste/);
  });

  test('undefined es "no tocar", no "borrar"', () => {
    const { limpio, rechazos } = revisar({ language: undefined });
    assert.deepEqual(limpio, {});
    assert.deepEqual(rechazos, []);
  });

  test('lo que no es un objeto se rechaza entero, sin reventar', () => {
    assert.equal(revisar(null).rechazos.length, 1);
    assert.equal(revisar('hola').rechazos.length, 1);
    assert.equal(revisar([1, 2]).rechazos.length, 1);
  });
});

/** Un cofre de mentira: se ve lo que entra y lo que sale. */
function cofreQueCifra(): Cofre {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (texto) => Buffer.from(`CIFRADO(${texto})`, 'utf8'),
    decryptString: (buffer) => {
      const s = buffer.toString('utf8');
      const m = /^CIFRADO\((.*)\)$/s.exec(s);
      if (!m) throw new Error('esto no lo cifré yo');
      return m[1]!;
    },
  };
}

const cofreApagado: Cofre = {
  isEncryptionAvailable: () => false,
  encryptString: () => { throw new Error('no debería llamarse'); },
  decryptString: () => { throw new Error('no debería llamarse'); },
};

describe('las claves de API en el disco', () => {
  test('se cifran al guardar y vuelven al leer', () => {
    const cofre = cofreQueCifra();
    const conClaves = { ...BASE, steamWebApiKey: 'STEAM123', xboxApiKey: 'XBOX456' };

    const { valor: guardado } = cifrar(conClaves, cofre);
    assert.notEqual(guardado.steamWebApiKey, 'STEAM123');
    assert.ok(guardado.steamWebApiKey!.startsWith('atreus:v1:'));

    const { valor: leido } = descifrar(guardado, cofre);
    assert.equal(leido.steamWebApiKey, 'STEAM123');
    assert.equal(leido.xboxApiKey, 'XBOX456');
  });

  test('lo que no es un secreto no se toca', () => {
    const { valor } = cifrar({ ...BASE, steamPath: 'C:\\Steam' }, cofreQueCifra());
    assert.equal(valor.steamPath, 'C:\\Steam');
    assert.equal(valor.language, 'es');
  });

  test('sin cifrado disponible la clave se guarda igual, y se avisa', () => {
    // Perder una clave por no poder cifrarla sería un arreglo peor que el
    // problema que arregla.
    const { valor, avisos } = cifrar({ ...BASE, steamWebApiKey: 'STEAM123' }, cofreApagado);
    assert.equal(valor.steamWebApiKey, 'STEAM123');
    assert.equal(avisos.length, 1);
    assert.match(avisos[0]!, /en claro/);
  });

  test('sin claves puestas no se avisa de nada', () => {
    const { avisos } = cifrar(BASE, cofreApagado);
    assert.deepEqual(avisos, []);
  });

  test('una clave ya guardada en claro se lee tal cual', () => {
    // Es lo que hay en el archivo de cualquiera que ya usara Atreus: nadie
    // tiene que volver a pegarla.
    const enClaro = { ...BASE, steamWebApiKey: 'DE_ANTES' };
    const { valor } = descifrar(enClaro, cofreQueCifra());
    assert.equal(valor.steamWebApiKey, 'DE_ANTES');
  });

  test('y se cifra sola en el siguiente guardado', () => {
    const cofre = cofreQueCifra();
    const { valor } = cifrar({ ...BASE, steamWebApiKey: 'DE_ANTES' }, cofre);
    assert.ok(valor.steamWebApiKey!.startsWith('atreus:v1:'));
    assert.equal(descifrar(valor, cofre).valor.steamWebApiKey, 'DE_ANTES');
  });

  test('no se cifra dos veces', () => {
    const cofre = cofreQueCifra();
    const una = cifrar({ ...BASE, steamWebApiKey: 'X' }, cofre).valor;
    const dos = cifrar(una, cofre).valor;
    assert.equal(dos.steamWebApiKey, una.steamWebApiKey);
  });

  test('un secreto de otro equipo se vacía y se explica', () => {
    // Copiar settings.json a otra cuenta de Windows deja algo que DPAPI ya no
    // sabe abrir. Se vacía —no la tenemos— en vez de dejar una cadena ilegible
    // en el campo de Ajustes.
    const ajeno = { ...BASE, xboxApiKey: 'atreus:v1:bm8gc295IHN1eW8=' };
    const { valor, avisos } = descifrar(ajeno, cofreQueCifra());
    assert.equal(valor.xboxApiKey, null);
    assert.equal(avisos.length, 1);
    assert.match(avisos[0]!, /Vuelve a pegarla/);
  });

  test('si el cofre revienta al comprobarse, se sigue guardando en claro', () => {
    const roto: Cofre = {
      isEncryptionAvailable: () => { throw new Error('DPAPI no responde'); },
      encryptString: () => { throw new Error('no'); },
      decryptString: () => { throw new Error('no'); },
    };
    const { valor } = cifrar({ ...BASE, steamWebApiKey: 'X' }, roto);
    assert.equal(valor.steamWebApiKey, 'X');
  });
});
