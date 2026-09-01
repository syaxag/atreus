import type { CheatResolve } from '@shared/types';
import { findModule, readMemory } from './win32';
import { compilePattern, scanModule } from './scanner';

/**
 * Traduce una `CheatResolve` de `data/games/<id>.json` a una dirección real.
 *
 * Las tres formas cubren los casos habituales:
 *  - `aob`     — buscar un patrón de código y aplicar un desplazamiento.
 *  - `pointer` — cadena de punteros desde la base del módulo.
 *  - `static`  — base del módulo + desplazamiento fijo.
 */

export interface ResolveResult {
  address: bigint | null;
  error: string | null;
}

export function resolveAddress(
  handle: number,
  pid: number,
  resolve: CheatResolve,
): ResolveResult {
  const module = findModule(pid, resolve.module);
  if (!module) {
    return { address: null, error: `El módulo "${resolve.module}" no está cargado` };
  }

  switch (resolve.kind) {
    case 'static':
      return { address: module.base + BigInt(resolve.offset), error: null };

    case 'aob': {
      let pattern;
      try {
        pattern = compilePattern(resolve.pattern);
      } catch (e) {
        return { address: null, error: e instanceof Error ? e.message : String(e) };
      }

      const matches = scanModule(handle, module, pattern);
      if (matches.length === 0) {
        return {
          address: null,
          error: 'Patrón no encontrado: la definición no coincide con esta versión del juego',
        };
      }
      // Un patrón que coincide en varios sitios no identifica nada. Elegir el
      // primero apuntaría el cheat a una dirección arbitraria, así que se
      // rechaza y se pide afinar la definición.
      if (matches.length > 1) {
        return {
          address: null,
          error:
            `Patrón ambiguo: ${matches.length} coincidencias en ${resolve.module}. ` +
            'Añade más bytes fijos a la definición para que sea único.',
        };
      }

      let address = matches[0]! + BigInt(resolve.offset);
      if (resolve.deref) {
        // Muchos patrones apuntan a una instrucción que contiene un puntero;
        // `deref` lo sigue una vez para llegar al dato.
        const buffer = readMemory(handle, address, 8);
        if (!buffer) return { address: null, error: 'No se pudo desreferenciar el puntero' };
        address = buffer.readBigUInt64LE(0);
        if (address === 0n) return { address: null, error: 'El puntero es nulo' };
      }
      return { address, error: null };
    }

    case 'pointer': {
      let address = module.base + BigInt(resolve.base);
      // Cada salto lee un puntero de 64 bits y le suma el offset siguiente.
      for (const [index, offset] of resolve.offsets.entries()) {
        const buffer = readMemory(handle, address, 8);
        if (!buffer) {
          return { address: null, error: `Lectura fallida en el salto ${index + 1}` };
        }
        const next = buffer.readBigUInt64LE(0);
        if (next === 0n) {
          return { address: null, error: `Puntero nulo en el salto ${index + 1}` };
        }
        address = next + BigInt(offset);
      }
      return { address, error: null };
    }
  }
}
