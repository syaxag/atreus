/**
 * Parser del formato KeyValues **binario** de Valve.
 *
 * Es el formato de `appcache/stats/UserGameStatsSchema_<appid>.bin`, de donde
 * salen los nombres y tipos de las estadísticas. La API plana de Steamworks sabe
 * enumerar logros (`GetNumAchievements`) pero **no** estadísticas, así que sin
 * este archivo la única alternativa sería la Steam Web API con clave.
 *
 * Estructura de cada nodo: [1 byte de tipo][clave terminada en NUL][valor].
 * El tipo 0x08 cierra el objeto en curso.
 */

export type BinKvValue = string | number | bigint | BinKvObject;
export interface BinKvObject {
  [key: string]: BinKvValue | undefined;
}

const TYPE_OBJECT = 0x00;
const TYPE_STRING = 0x01;
const TYPE_INT32 = 0x02;
const TYPE_FLOAT32 = 0x03;
const TYPE_POINTER = 0x04;
const TYPE_WIDESTRING = 0x05;
const TYPE_COLOR = 0x06;
const TYPE_UINT64 = 0x07;
const TYPE_END = 0x08;
const TYPE_INT64 = 0x0a;

export function parseBinaryKv(buffer: Buffer): BinKvObject {
  let offset = 0;

  function readCString(): string {
    const end = buffer.indexOf(0, offset);
    if (end < 0) throw new Error('KV binario: cadena sin terminador');
    const value = buffer.toString('utf8', offset, end);
    offset = end + 1;
    return value;
  }

  function readObject(): BinKvObject {
    const obj: BinKvObject = {};

    while (offset < buffer.length) {
      const type = buffer.readUInt8(offset);
      offset += 1;
      if (type === TYPE_END) return obj;

      const key = readCString();

      switch (type) {
        case TYPE_OBJECT:
          obj[key] = readObject();
          break;
        case TYPE_STRING:
          obj[key] = readCString();
          break;
        case TYPE_WIDESTRING: {
          // UTF-16 terminado en doble NUL. Raro en estos archivos, pero hay que
          // consumirlo bien o se desalinea todo lo que venga después.
          let end = offset;
          while (end + 1 < buffer.length && buffer.readUInt16LE(end) !== 0) end += 2;
          obj[key] = buffer.toString('utf16le', offset, end);
          offset = end + 2;
          break;
        }
        case TYPE_INT32:
        case TYPE_POINTER:
        case TYPE_COLOR:
          obj[key] = buffer.readInt32LE(offset);
          offset += 4;
          break;
        case TYPE_FLOAT32:
          obj[key] = buffer.readFloatLE(offset);
          offset += 4;
          break;
        case TYPE_UINT64:
          obj[key] = buffer.readBigUInt64LE(offset);
          offset += 8;
          break;
        case TYPE_INT64:
          obj[key] = buffer.readBigInt64LE(offset);
          offset += 8;
          break;
        default:
          throw new Error(`KV binario: tipo desconocido 0x${type.toString(16)} en ${offset - 1}`);
      }
    }

    return obj;
  }

  return readObject();
}

/** Devuelve el valor como cadena, venga como cadena o como número. */
export function asString(value: BinKvValue | undefined): string | undefined {
  if (value === undefined || typeof value === 'object') return undefined;
  return String(value);
}

/** Devuelve el valor como número; null si no es convertible. */
export function asNumber(value: BinKvValue | undefined): number | null {
  if (value === undefined || typeof value === 'object') return null;
  const n = typeof value === 'bigint' ? Number(value) : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Devuelve el valor como objeto, o undefined si es un escalar. */
export function asObject(value: BinKvValue | undefined): BinKvObject | undefined {
  return value !== undefined && typeof value === 'object' ? value : undefined;
}
