#!/usr/bin/env node
import { randomUUID, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
const args = process.argv.slice(2);
const get = (name, fallback = null) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] ?? fallback : fallback; };
const tier = String(get('tier', 'lifetime')).toLowerCase();
if (!['lifetime', 'friends', 'pro', 'trial'].includes(tier)) throw new Error('Tier válido: lifetime, friends, pro o trial');
const privatePath = get('private', process.env.ATREUS_LICENSE_PRIVATE_KEY_PATH);
if (!privatePath) throw new Error('Indica --private C:\\ruta\\atreus-license-private.pem');
const days = get('days'); const issuedAt = Math.floor(Date.now() / 1000);
if (days && (!Number.isInteger(Number(days)) || Number(days) < 1)) throw new Error('La duración debe ser un número positivo de días.');
const payload = { v: 1, id: randomUUID(), t: tier, o: String(get('name', 'Usuario Atreus')).trim(), i: issuedAt, e: days ? issuedAt + Number(days) * 86400 : null };
const message = Buffer.from(JSON.stringify(payload));
console.log(`ATREUS-1.${message.toString('base64url')}.${sign(null, message, readFileSync(privatePath, 'utf8')).toString('base64url')}`);
