import type { MemType } from '@shared/types';
import { readMemory, writeMemory } from './win32';
import { TYPE_SIZE, parseHexBytes, encodeValue, decodeValue } from './codec';

export { TYPE_SIZE, parseHexBytes, encodeValue, decodeValue };

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
  return buffer ? decodeValue(buffer, type) : null;
}

export function writeValue(
  handle: number,
  address: bigint,
  type: MemType,
  value: number | string,
): boolean {
  return writeMemory(handle, address, encodeValue(type, value));
}
