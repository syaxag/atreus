#!/usr/bin/env node
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const publicPath = resolve(process.argv[2] || 'data/license-public-key.pem');
const privatePath = resolve(process.argv[3] || `${process.env.APPDATA || '.'}/Atreus/license-private.pem`);
const pair = generateKeyPairSync('ed25519');
mkdirSync(dirname(publicPath), { recursive: true }); mkdirSync(dirname(privatePath), { recursive: true });
writeFileSync(publicPath, pair.publicKey.export({ type: 'spki', format: 'pem' }), { mode: 0o644 });
writeFileSync(privatePath, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
console.log(`Clave pública: ${publicPath}`); console.log(`Clave privada: ${privatePath}`);
