import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { generateKey, verifyKey } from '../src/main/services/license/index.ts';

describe('licencias Ed25519', () => {
  test('el emisor genera una clave firmada sin incluir la privada', () => {
    const pair = generateKeyPairSync('ed25519');
    const key = generateKey(
      { v: 1, id: 'test-id', t: 'lifetime', o: 'Tester', i: 1_700_000_000, e: null },
      pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    );
    assert.match(key, /^ATREUS-1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.doesNotMatch(key, /PRIVATE KEY/);
  });

  test('verifica con la pública y rechaza una firma modificada', () => {
    const pair = generateKeyPairSync('ed25519');
    const previous = process.env.ATREUS_LICENSE_PUBLIC_KEY;
    process.env.ATREUS_LICENSE_PUBLIC_KEY = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const key = generateKey({ v: 1, id: 'verify-id', t: 'pro', o: 'Cliente', i: Math.floor(Date.now() / 1000), e: null }, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
    assert.equal(verifyKey(key).valid, true);

    // Manipular la firma cambiando su último carácter era intermitente: en
    // base64url el último carácter arrastra bits de relleno, así que varias
    // letras distintas decodifican a los MISMOS bytes y la "firma modificada"
    // resultaba ser la original. Se le da la vuelta a un bit del primer byte,
    // que siempre produce una firma distinta.
    const [, payload, signature] = /^ATREUS-1\.([^.]+)\.(.+)$/.exec(key)!;
    const bytes = Buffer.from(signature!, 'base64url');
    bytes[0] ^= 0x01;
    const tampered = `ATREUS-1.${payload}.${bytes.toString('base64url')}`;
    assert.notEqual(tampered, key);
    assert.equal(verifyKey(tampered).valid, false);
    if (previous === undefined) delete process.env.ATREUS_LICENSE_PUBLIC_KEY;
    else process.env.ATREUS_LICENSE_PUBLIC_KEY = previous;
  });
});
