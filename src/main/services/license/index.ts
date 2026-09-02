import { createPublicKey, sign, verify } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { LicenseInfo, LicenseTier, Result } from '../../../shared/types.ts';

type LicensePayload = { v: 1; id: string; t: Exclude<LicenseTier, 'none'>; o: string; i: number; e: number | null; hw?: string };
type StoredLicense = { key: string };
const TIERS = new Set<LicensePayload['t']>(['lifetime', 'friends', 'pro', 'trial']);
const FEATURES: Record<LicenseTier, string[]> = {
  lifetime: ['cheats', 'mods', 'guides', 'maps', 'scanner', 'vip_updates'],
  friends: ['cheats', 'mods', 'guides', 'maps', 'scanner', 'friends_badge'],
  pro: ['cheats', 'mods', 'guides', 'maps', 'scanner'],
  trial: ['cheats', 'mods', 'guides', 'maps'],
  none: ['cheats_preview', 'mods_preview', 'guides_preview'],
};
const inactive = (): LicenseInfo => ({ active: false, tier: 'none', licenseKey: null, ownerName: null, expiresAt: null, issuedAt: null, features: FEATURES.none });
const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const err = (error: string, code?: string): Result<never> => ({ ok: false, error, code });
function notify(info: LicenseInfo): void {
  try {
    // No se importa estáticamente para que el verificador también pueda
    // ejecutarse desde el CLI y los tests, fuera de Electron.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { emit } = require('../../ipc/emit');
    emit('license:updated', info);
  } catch { /* entorno sin Electron */ }
}
/**
 * Rutas de Atreus, si estamos dentro de Electron.
 *
 * Este módulo tiene que poder ejecutarse también desde el CLI y las pruebas,
 * fuera de Electron, así que `paths` se pide de forma perezosa y se acepta que
 * no esté. Sin esto pasaban dos cosas: en desarrollo la licencia se guardaba en
 * `%APPDATA%/Atreus` mientras el resto de la app usaba `Atreus-dev`, y la clave
 * pública se buscaba en `process.resourcesPath`, que en `npm run dev` apunta
 * dentro de `node_modules/electron` — es decir, **nunca se encontraba**.
 */
function electronPaths(): { userData: string; builtinData: string } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { paths } = require('../../paths') as { paths: { userData: string; builtinData: string } };
    return paths?.userData && paths?.builtinData ? paths : null;
  } catch { return null; }
}

function appData(): string { return process.env.APPDATA || process.env.HOME || '.'; }

function licensePath(): string {
  const paths = electronPaths();
  return paths ? join(paths.userData, 'license.json') : join(appData(), 'Atreus', 'data', 'license.json');
}

/** La clave pública, mirando en todos los sitios donde puede estar. */
function publicKey(): string | null {
  if (process.env.ATREUS_LICENSE_PUBLIC_KEY) return process.env.ATREUS_LICENSE_PUBLIC_KEY.replace(/\\n/g, '\n');
  const paths = electronPaths();
  const candidates = [
    // La capa de usuario primero: permite rotar la clave sin reinstalar la app.
    ...(paths ? [join(paths.userData, 'license-public-key.pem'), join(paths.builtinData, 'license-public-key.pem')] : []),
    ...(process.resourcesPath ? [join(process.resourcesPath, 'data', 'license-public-key.pem')] : []),
    join(process.cwd(), 'data', 'license-public-key.pem'),
  ];
  for (const file of candidates) {
    try { return readFileSync(file, 'utf8'); } catch { /* se prueba la siguiente */ }
  }
  return null;
}
function decode(key: string): { payload: LicensePayload; signature: Buffer } | { error: string } {
  const match = /^ATREUS-1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(key.trim());
  if (!match) return { error: 'Formato inválido. Usa una clave ATREUS-1.…' };
  try {
    const payload = JSON.parse(Buffer.from(match[1]!, 'base64url').toString('utf8')) as LicensePayload;
    if (payload.v !== 1 || !TIERS.has(payload.t) || !payload.o || !Number.isInteger(payload.i) || (payload.e !== null && !Number.isInteger(payload.e))) return { error: 'El contenido de la licencia no es válido.' };
    return { payload, signature: Buffer.from(match[2]!, 'base64url') };
  } catch { return { error: 'No se pudo leer la licencia.' }; }
}
export function verifyKey(key: string): { valid: boolean; data?: LicenseInfo; error?: string } {
  const decoded = decode(key);
  if ('error' in decoded) return { valid: false, error: decoded.error };
  const pem = publicKey();
  if (!pem) return { valid: false, error: 'La aplicación no tiene una clave pública de licencias configurada.' };
  try {
    if (!verify(null, Buffer.from(JSON.stringify(decoded.payload)), createPublicKey(pem), decoded.signature)) return { valid: false, error: 'Firma criptográfica inválida.' };
  } catch { return { valid: false, error: 'No se pudo verificar la firma de la licencia.' }; }
  if (decoded.payload.e !== null && decoded.payload.e < Math.floor(Date.now() / 1000)) return { valid: false, error: 'Esta licencia ha caducado.' };
  return { valid: true, data: { active: true, tier: decoded.payload.t, licenseKey: key.trim(), ownerName: decoded.payload.o, expiresAt: decoded.payload.e, issuedAt: decoded.payload.i, features: FEATURES[decoded.payload.t] } };
}
/** El CLI recibe la privada por ruta; esta función nunca expone una en la app. */
export function generateKey(payload: LicensePayload, privateKeyPem: string): string {
  const message = Buffer.from(JSON.stringify(payload));
  return `ATREUS-1.${message.toString('base64url')}.${sign(null, message, privateKeyPem).toString('base64url')}`;
}
export function getLicense(): LicenseInfo {
  try { const stored = JSON.parse(readFileSync(licensePath(), 'utf8')) as StoredLicense; return verifyKey(stored.key).data ?? inactive(); } catch { return inactive(); }
}
export function activateLicense(key: string): Result<LicenseInfo> {
  const verified = verifyKey(key);
  if (!verified.valid || !verified.data) return err(verified.error ?? 'Clave inválida', 'INVALID_LICENSE');
  try { const file = licensePath(); mkdirSync(dirname(file), { recursive: true }); writeFileSync(`${file}.tmp`, JSON.stringify({ key: key.trim() }, null, 2), 'utf8'); renameSync(`${file}.tmp`, file); notify(verified.data); return ok(verified.data); } catch (e) { return err(e instanceof Error ? e.message : 'No se pudo guardar la licencia'); }
}
export function deactivateLicense(): Result<void> {
  try { writeFileSync(licensePath(), JSON.stringify({}, null, 2), 'utf8'); notify(inactive()); return ok(undefined); } catch (e) { return err(e instanceof Error ? e.message : 'No se pudo desactivar la licencia'); }
}
