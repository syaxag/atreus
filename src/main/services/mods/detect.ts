import { readFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { listFiles, readJsonFromZip } from './archive';

/**
 * Deduce nombre, versión y autor de un mod recién extraído.
 *
 * No hay un formato común, así que se prueban los manifiestos habituales y, si
 * ninguno aparece, se cae al nombre del archivo. Es mejor una suposición
 * razonable que obligar a teclear los datos a mano en cada instalación.
 */

export interface ModMeta {
  name: string;
  version: string | null;
  author: string | null;
  description: string | null;
}

/** Manifiestos conocidos, con la clave de cada campo. */
const MANIFESTS: {
  file: RegExp;
  keys: { name: string[]; version: string[]; author: string[]; description: string[] };
}[] = [
  {
    // Steamodded (Balatro), Thunderstore, muchos mods de Lua/JS
    file: /^(manifest\.json|mod\.json|thunderstore\.toml|package\.json)$/i,
    keys: {
      name: ['name', 'display_name', 'displayName', 'title'],
      version: ['version', 'version_number', 'versionNumber'],
      author: ['author', 'authors', 'owner', 'creator'],
      description: ['description', 'summary'],
    },
  },
  {
    // BepInEx y derivados
    file: /^(modinfo\.json|plugin\.json)$/i,
    keys: {
      name: ['Name', 'name'],
      version: ['Version', 'version'],
      author: ['Author', 'author'],
      description: ['Description', 'description'],
    },
  },
];

function pick(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  }
  return null;
}

/** Separadores a espacios, para que "Cool_Mod-final" se lea como texto. */
function humanize(value: string): string {
  return value.replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Saca nombre y versión del nombre del archivo.
 *
 * El orden importa: hay que buscar la versión **antes** de convertir los
 * separadores en espacios, o "OtroMod v2.1" se lee como "OtroMod v2 1" y el
 * número se pierde.
 */
function fromFileName(archivePath: string): { name: string; version: string | null } {
  const raw = basename(archivePath).replace(/\.(zip|7z|rar)$/i, '');
  const match = /[ ._-]v?(\d+(?:\.\d+)+)\s*$/i.exec(raw) ?? /[ ._-]v?(\d+(?:\.\d+)+)/i.exec(raw);

  if (match) {
    const name = humanize(raw.slice(0, match.index));
    if (name) return { name, version: match[1] ?? null };
  }
  return { name: humanize(raw), version: null };
}

export function detectMeta(stagingDir: string, archivePath: string): ModMeta {
  const guessed = fromFileName(archivePath);

  const fallback: ModMeta = {
    name: guessed.name || 'Mod sin nombre',
    version: guessed.version,
    author: null,
    description: null,
  };

  let files: string[];
  try {
    files = listFiles(stagingDir);
  } catch {
    return fallback;
  }

  // Solo se miran los manifiestos poco profundos: uno enterrado a cinco
  // niveles suele ser de una dependencia, no del mod.
  const shallow = files.filter((f) => f.split(/[\\/]/).length <= 3);

  for (const manifest of MANIFESTS) {
    const match = shallow.find((f) => manifest.file.test(basename(f)));
    if (!match) continue;

    try {
      const raw = JSON.parse(readFileSync(join(stagingDir, match), 'utf8')) as Record<string, unknown>;
      const name = pick(raw, manifest.keys.name);
      return {
        name: name ?? fallback.name,
        version: pick(raw, manifest.keys.version),
        author: pick(raw, manifest.keys.author),
        description: pick(raw, manifest.keys.description),
      };
    } catch {
      // Manifiesto ilegible: se prueba el siguiente.
    }
  }

  return fallback;
}

/**
 * Metadatos de un mod que se despliega empaquetado (`.geode`, `.pak`…).
 *
 * No se extrae, así que el manifiesto se lee de dentro del zip cuando lo hay.
 * Un `.pak` de Unreal no lleva manifiesto: ahí manda el nombre del archivo.
 */
export async function detectPackagedMeta(archivePath: string): Promise<ModMeta> {
  const guessed = fromFileName(archivePath);
  const fallback: ModMeta = {
    name: guessed.name || basename(archivePath),
    version: guessed.version,
    author: null,
    description: null,
  };

  // `.geode` es un zip con `mod.json` en la raíz.
  const manifest = await readJsonFromZip(archivePath, ['mod.json', 'manifest.json']);
  if (!manifest) return fallback;

  const name = typeof manifest['name'] === 'string' ? manifest['name'] : null;
  const version = typeof manifest['version'] === 'string' ? manifest['version'] : null;
  const developer =
    typeof manifest['developer'] === 'string' ? manifest['developer']
    : Array.isArray(manifest['developers']) && typeof manifest['developers'][0] === 'string'
      ? (manifest['developers'][0] as string)
      : null;
  const description =
    typeof manifest['description'] === 'string' ? manifest['description'] : null;

  return {
    name: name ?? fallback.name,
    // Geode escribe las versiones como "v1.2.3"; se normaliza.
    version: version ? version.replace(/^v/i, '') : fallback.version,
    author: developer,
    description,
  };
}

/** ¿El árbol extraído parece un mod, o el archivo venía vacío/roto? */
export function looksValid(stagingDir: string): boolean {
  if (!existsSync(stagingDir)) return false;
  try {
    return listFiles(stagingDir).length > 0;
  } catch {
    return false;
  }
}
