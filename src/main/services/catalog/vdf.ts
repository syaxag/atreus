/**
 * Parser mínimo del formato KeyValues de Valve (VDF).
 *
 * Es el formato de `libraryfolders.vdf` y de los `appmanifest_*.acf`. La gramática
 * real admite condicionales (`[$WIN32]`) e `#include`, pero ninguno de los dos
 * archivos que leemos los usa, así que se ignoran a propósito.
 *
 *   "libraryfolders"
 *   {
 *       "0"
 *       {
 *           "path"    "C:\\Program Files (x86)\\Steam"
 *       }
 *   }
 */

export type VdfValue = string | VdfObject;
export interface VdfObject {
  [key: string]: VdfValue | undefined;
}

/** Devuelve el objeto raíz. Lanza si las llaves no cuadran. */
export function parseVdf(input: string): VdfObject {
  let i = 0;

  function skipTrivia(): void {
    while (i < input.length) {
      const c = input[i]!;
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
        i++;
      } else if (c === '/' && input[i + 1] === '/') {
        while (i < input.length && input[i] !== '\n') i++;
      } else {
        return;
      }
    }
  }

  function readToken(): string {
    skipTrivia();
    if (i >= input.length) throw new Error('VDF: fin inesperado');

    // Cadena entre comillas, con escapes.
    if (input[i] === '"') {
      i++;
      let out = '';
      while (i < input.length && input[i] !== '"') {
        if (input[i] === '\\') {
          i++;
          const esc = input[i];
          out += esc === 'n' ? '\n' : esc === 't' ? '\t' : (esc ?? '');
        } else {
          out += input[i];
        }
        i++;
      }
      i++; // comilla de cierre
      return out;
    }

    // Token suelto sin comillas (Steam los emite a veces).
    let out = '';
    while (i < input.length && !' \t\r\n"{}'.includes(input[i]!)) {
      out += input[i];
      i++;
    }
    return out;
  }

  function readObject(): VdfObject {
    const obj: VdfObject = {};
    for (;;) {
      skipTrivia();
      if (i >= input.length) return obj;
      if (input[i] === '}') { i++; return obj; }

      const key = readToken();
      skipTrivia();

      if (input[i] === '{') {
        i++;
        obj[key] = readObject();
      } else {
        obj[key] = readToken();
      }
    }
  }

  skipTrivia();
  const rootKey = readToken();
  skipTrivia();
  if (input[i] !== '{') throw new Error(`VDF: se esperaba '{' tras "${rootKey}"`);
  i++;
  return { [rootKey]: readObject() };
}

/** Navega por claves anidadas devolviendo undefined en cuanto una falta. */
export function dig(obj: VdfValue | undefined, ...keys: string[]): VdfValue | undefined {
  let cur: VdfValue | undefined = obj;
  for (const k of keys) {
    if (cur === undefined || typeof cur === 'string') return undefined;
    cur = cur[k];
  }
  return cur;
}

/** Lee una clave como cadena; undefined si no existe o es un objeto. */
export function str(obj: VdfValue | undefined, ...keys: string[]): string | undefined {
  const v = dig(obj, ...keys);
  return typeof v === 'string' ? v : undefined;
}

/** Lee una clave como número; null si no existe o no es numérica. */
export function num(obj: VdfValue | undefined, ...keys: string[]): number | null {
  const v = str(obj, ...keys);
  if (v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
