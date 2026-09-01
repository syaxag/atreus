import { basename } from 'node:path';

/**
 * Nombre y versión a partir del nombre del archivo.
 *
 * Aparte porque aquí ya hubo un fallo: se normalizaban los separadores antes de
 * buscar la versión y "OtroMod v2.1" perdía el número. Con prueba no vuelve.
 */

/** Separadores a espacios, para que "Cool_Mod-final" se lea como texto. */
export function humanize(value: string): string {
  return value.replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Saca nombre y versión del nombre del archivo.
 *
 * El orden importa: hay que buscar la versión **antes** de convertir los
 * separadores en espacios, o "OtroMod v2.1" se lee como "OtroMod v2 1" y el
 * número se pierde.
 */
export function fromFileName(archivePath: string): { name: string; version: string | null } {
  const raw = basename(archivePath).replace(/\.(zip|7z|rar)$/i, '');
  const match = /[ ._-]v?(\d+(?:\.\d+)+)\s*$/i.exec(raw) ?? /[ ._-]v?(\d+(?:\.\d+)+)/i.exec(raw);

  if (match) {
    const name = humanize(raw.slice(0, match.index));
    // Lo que queda delante tiene que parecer un nombre. Con "1.2.3.zip" el
    // recorte deja "1", que no es el nombre de nada: en ese caso es mejor
    // quedarse con el archivo entero que inventar una separación.
    if (/[a-z]/i.test(name)) return { name, version: match[1] ?? null };
  }
  return { name: humanize(raw), version: null };
}
