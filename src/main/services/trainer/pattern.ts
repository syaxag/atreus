/**
 * Compilación y búsqueda de patrones de bytes (AoB).
 *
 * Va aparte del escáner a propósito: aquí no se toca ningún proceso ni ninguna
 * API del sistema, así que se puede probar sin arrancar nada. Es la lógica que
 * decide si un cheat apunta al sitio correcto, y merece tener pruebas.
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
