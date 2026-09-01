/**
 * Trocea una línea de argumentos respetando las comillas.
 *
 * Partir por espacios rompe cualquier ruta con espacios, que en Windows son la
 * norma: `--mod "C:\Mis Mods\x.pak"` se convertía en tres argumentos.
 */
export function splitArgs(line: string | undefined): string[] {
  if (!line?.trim()) return [];

  const out: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let started = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;

    if (quote) {
      if (c === quote) quote = null;
      else current += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      started = true; // permite un argumento que sea una cadena vacía
      continue;
    }
    if (c === ' ' || c === '	') {
      if (current || started) { out.push(current); current = ''; started = false; }
      continue;
    }
    current += c;
  }
  if (current || started) out.push(current);
  return out;
}
