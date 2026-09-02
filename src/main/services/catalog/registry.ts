/**
 * Lectura pura de la salida de `reg query` y de las entradas de desinstalación
 * de Windows. No ejecuta nada: recibe texto y devuelve estructuras, para que
 * los escáneres de EA App y Battle.net se puedan probar sin tocar el registro.
 */

/** Subclaves directas de `root` tal como las lista `reg query root`. */
export function parseRegSubkeys(output: string, root: string): string[] {
  const prefix = `${root}\\`;
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.toLowerCase().startsWith(prefix.toLowerCase()))
    // `reg query` solo lista un nivel, pero un valor que contenga la ruta no
    // debe colarse como subclave: las subclaves no llevan tabulaciones ni tipos.
    .filter((line) => !/\s{2,}REG_/.test(line));
}

/**
 * Valores `REG_SZ` / `REG_EXPAND_SZ` de una clave. Las claves se devuelven en
 * minúsculas para que `Install Dir` e `InstallDir` se busquen igual.
 */
export function parseRegValues(output: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    const match = /^(.+?)\s{2,}REG_(?:SZ|EXPAND_SZ)\s{2,}(.*)$/.exec(line)
      ?? /^(.+?)\s+REG_(?:SZ|EXPAND_SZ)\s+(.*)$/.exec(line);
    if (!match) continue;
    const name = match[1]!.trim().toLowerCase();
    const value = match[2]!.trim();
    if (value) values[name] = value;
  }
  return values;
}

/** Primer valor presente de una lista de nombres candidatos. */
export function pickValue(values: Record<string, string>, ...names: string[]): string | null {
  for (const name of names) {
    const value = values[name.toLowerCase()];
    if (value) return value;
  }
  return null;
}

/** Entrada de "Programas instalados", tal como la devuelve PowerShell. */
export interface UninstallEntry {
  displayName: string;
  publisher: string;
  installLocation: string | null;
  displayIcon: string | null;
  key: string;
}

/**
 * Normaliza el JSON de `Get-ItemProperty ... | ConvertTo-Json`. PowerShell
 * devuelve un objeto suelto cuando solo hay una entrada, y `$null` en los
 * campos ausentes: aquí todo pasa a ser una lista con cadenas.
 */
export function parseUninstallEntries(json: string): UninstallEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json || '[]');
  } catch {
    return [];
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const entries: UninstallEntry[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const str = (key: string) => (typeof record[key] === 'string' ? (record[key] as string).trim() : '');
    const displayName = str('DisplayName');
    if (!displayName) continue;
    entries.push({
      displayName,
      publisher: str('Publisher'),
      installLocation: str('InstallLocation') || null,
      displayIcon: str('DisplayIcon') || null,
      key: str('PSChildName') || displayName,
    });
  }
  return entries;
}

/** `C:\Juego\juego.exe,0` → `C:\Juego\juego.exe`; cualquier otra cosa → null. */
export function exeFromDisplayIcon(icon: string | null): string | null {
  if (!icon) return null;
  const clean = icon.replace(/^"|"$/g, '').replace(/,-?\d+$/, '').replace(/"$/, '').trim();
  return /\.exe$/i.test(clean) ? clean : null;
}
