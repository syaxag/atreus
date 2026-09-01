import { readMemory, readableRegions, type ModuleInfo } from './win32';

/**
 * Escaneo de patrones de bytes (AoB) en la memoria de otro proceso.
 *
 * Un patrón es una secuencia hex con comodines: `48 8B ?? ?? 00 89`. Los `??`
 * saltan bytes que cambian entre compilaciones o entre ejecuciones, que es lo
 * que hace que una definición sobreviva a un parche menor del juego.
 */

export interface Pattern {
  bytes: Buffer;
  /** true en las posiciones que deben coincidir; false en los comodines. */
  mask: boolean[];
}

/** Compila `"48 8B ?? 00"` a bytes + máscara. */
export function compilePattern(pattern: string): Pattern {
  const tokens = pattern.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) throw new Error('Patrón vacío');

  const bytes = Buffer.alloc(tokens.length);
  const mask: boolean[] = [];

  tokens.forEach((token, i) => {
    if (token === '??' || token === '?' || token === 'xx') {
      bytes[i] = 0;
      mask.push(false);
      return;
    }
    if (!/^[0-9a-fA-F]{2}$/.test(token)) {
      throw new Error(`Token de patrón inválido: "${token}"`);
    }
    bytes[i] = parseInt(token, 16);
    mask.push(true);
  });

  if (!mask.some(Boolean)) throw new Error('El patrón es todo comodines');
  return { bytes, mask };
}

/** Busca el patrón dentro de un buffer. Devuelve el índice o -1. */
export function findInBuffer(haystack: Buffer, pattern: Pattern, from = 0): number {
  const { bytes, mask } = pattern;
  const last = haystack.length - bytes.length;

  // Primer byte fijo: permite saltar con indexOf en vez de comparar posición
  // a posición, que en regiones de decenas de MB se nota mucho.
  const anchor = mask.indexOf(true);
  const anchorByte = bytes[anchor]!;

  for (let i = from; i <= last; i++) {
    const found = haystack.indexOf(anchorByte, i + anchor);
    if (found < 0 || found - anchor > last) return -1;
    i = found - anchor;
    if (i < from) continue;

    let match = true;
    for (let j = 0; j < bytes.length; j++) {
      if (mask[j] && haystack[i + j] !== bytes[j]) { match = false; break; }
    }
    if (match) return i;
  }
  return -1;
}

/** Trozos de lectura. Grande para pocas llamadas, con solape para no cortar patrones. */
const CHUNK_SIZE = 4 * 1024 * 1024;

/**
 * Tope de coincidencias que se recogen.
 *
 * Solo interesa distinguir "una" de "varias": si un patrón aparece más de una
 * vez es ambiguo y hay que afinarlo, no elegir a ciegas. Con dos basta para
 * saberlo, pero se guardan unas cuantas para poder informar del número.
 */
const MAX_MATCHES = 8;

/** Recoge todas las coincidencias de un rango, hasta `MAX_MATCHES`. */
function scanRange(
  handle: number,
  base: bigint,
  total: number,
  pattern: Pattern,
  out: bigint[],
): void {
  const overlap = pattern.bytes.length - 1;
  let offset = 0;

  while (offset < total && out.length < MAX_MATCHES) {
    const size = Math.min(CHUNK_SIZE, total - offset);
    const buffer = readMemory(handle, base + BigInt(offset), size);

    if (buffer) {
      let index = findInBuffer(buffer, pattern);
      while (index >= 0 && out.length < MAX_MATCHES) {
        const address = base + BigInt(offset + index);
        // El solape entre trozos puede devolver la misma dirección dos veces.
        if (!out.includes(address)) out.push(address);
        index = findInBuffer(buffer, pattern, index + 1);
      }
    }
    // Aunque un trozo falle se sigue: puede haber páginas sin confirmar en
    // medio y no es razón para abandonar la búsqueda.
    offset += size - overlap;
    if (size <= overlap) break;
  }
}

/**
 * Busca el patrón en un módulo concreto.
 *
 * Acotarlo al módulo, en vez de a todo el proceso, es mucho más rápido y evita
 * falsos positivos en el heap, donde los mismos bytes aparecen por casualidad.
 */
export function scanModule(handle: number, module: ModuleInfo, pattern: Pattern): bigint[] {
  const out: bigint[] = [];
  scanRange(handle, module.base, module.size, pattern, out);
  return out;
}

/** Busca en todas las regiones legibles. Último recurso: es bastante más lento. */
export function scanProcess(handle: number, pattern: Pattern): bigint[] {
  const out: bigint[] = [];
  for (const region of readableRegions(handle)) {
    scanRange(handle, region.base, region.size, pattern, out);
    if (out.length >= MAX_MATCHES) break;
  }
  return out;
}
