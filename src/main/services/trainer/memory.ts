import type { MemType } from '@shared/types';
import { readMemory, writeMemory } from './win32';

/** Tamaño en bytes de cada tipo. `bytes` es variable y se trata aparte. */
export const TYPE_SIZE: Record<Exclude<MemType, 'bytes'>, number> = {
  i8: 1, u8: 1,
  i16: 2, u16: 2,
  i32: 4, u32: 4,
  i64: 8, u64: 8,
  f32: 4, f64: 8,
};

/** Convierte una cadena hex ("90 90 EB") a buffer. Acepta espacios y guiones. */
export function parseHexBytes(hex: string): Buffer {
  const clean = hex.replace(/[\s-]/g, '');
  if (clean.length % 2 !== 0) throw new Error(`Bytes hex impares: "${hex}"`);
  if (!/^[0-9a-fA-F]*$/.test(clean)) throw new Error(`Bytes hex inválidos: "${hex}"`);
  return Buffer.from(clean, 'hex');
}

/** Lee un valor tipado. null si la lectura falla. */
export function readValue(
  handle: number,
  address: bigint,
  type: MemType,
  length = 0,
): number | string | null {
  if (type === 'bytes') {
    const buffer = readMemory(handle, address, length);
    return buffer ? buffer.toString('hex').toUpperCase() : null;
  }

  const buffer = readMemory(handle, address, TYPE_SIZE[type]);
  if (!buffer) return null;

  switch (type) {
    case 'i8': return buffer.readInt8(0);
    case 'u8': return buffer.readUInt8(0);
    case 'i16': return buffer.readInt16LE(0);
    case 'u16': return buffer.readUInt16LE(0);
    case 'i32': return buffer.readInt32LE(0);
    case 'u32': return buffer.readUInt32LE(0);
    // Se devuelven como number: los valores de juego caben de sobra en un
    // double, y el contrato IPC habla en numbers.
    case 'i64': return Number(buffer.readBigInt64LE(0));
    case 'u64': return Number(buffer.readBigUInt64LE(0));
    case 'f32': return buffer.readFloatLE(0);
    case 'f64': return buffer.readDoubleLE(0);
  }
}

/** Serializa un valor tipado al buffer que se escribirá. */
export function encodeValue(type: MemType, value: number | string): Buffer {
  if (type === 'bytes') return parseHexBytes(String(value));

  const buffer = Buffer.alloc(TYPE_SIZE[type]);
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Valor no numérico para ${type}: ${value}`);

  switch (type) {
    case 'i8': buffer.writeInt8(clamp(n, -128, 127), 0); break;
    case 'u8': buffer.writeUInt8(clamp(n, 0, 255), 0); break;
    case 'i16': buffer.writeInt16LE(clamp(n, -32768, 32767), 0); break;
    case 'u16': buffer.writeUInt16LE(clamp(n, 0, 65535), 0); break;
    case 'i32': buffer.writeInt32LE(clamp(n, -2147483648, 2147483647), 0); break;
    case 'u32': buffer.writeUInt32LE(clamp(n, 0, 4294967295), 0); break;
    case 'i64': buffer.writeBigInt64LE(BigInt(Math.trunc(n)), 0); break;
    case 'u64': buffer.writeBigUInt64LE(BigInt(Math.max(0, Math.trunc(n))), 0); break;
    case 'f32': buffer.writeFloatLE(n, 0); break;
    case 'f64': buffer.writeDoubleLE(n, 0); break;
  }
  return buffer;
}

export function writeValue(
  handle: number,
  address: bigint,
  type: MemType,
  value: number | string,
): boolean {
  return writeMemory(handle, address, encodeValue(type, value));
}

/**
 * Recorta al rango del tipo en vez de dejar que `writeIntLE` lance.
 * Un valor fuera de rango en una definición de cheat es un error del JSON, no
 * algo que deba tumbar la sesión: se satura y se sigue.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
