import type { MemType } from '@shared/types';

/**
 * Serialización de valores tipados a bytes y vuelta.
 *
 * Sin dependencias del sistema: es aritmética pura sobre buffers, y es donde
 * un fallo se traduce en escribir el número equivocado en la memoria de un
 * juego. Aparte para poder probarlo.
 */

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

/**
 * Recorta al rango del tipo en vez de dejar que `writeIntLE` lance.
 * Un valor fuera de rango en una definición de cheat es un error del JSON, no
 * algo que deba tumbar la sesión: se satura y se sigue.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/**
 * Serializa un valor tipado al buffer que se escribirá.
 *
 * Los valores fuera de rango se saturan en vez de lanzar: un número imposible
 * en una definición de cheat es un error del JSON, no algo que deba tumbar la
 * sesión entera.
 */
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
    // Los decimales NO se truncan: 1.5 debe escribirse como 1.5.
    case 'f32': buffer.writeFloatLE(n, 0); break;
    case 'f64': buffer.writeDoubleLE(n, 0); break;
  }
  return buffer;
}

/** Interpreta un buffer como el tipo pedido. */
export function decodeValue(buffer: Buffer, type: Exclude<MemType, 'bytes'>): number {
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
