import { readFileSync } from 'node:fs';

/**
 * Lector de la tabla de exports de un PE (DLL de Windows).
 *
 * Hace falta porque las copias de `steam_api64.dll` que trae cada juego son de
 * versiones distintas del SDK y **no** exponen las mismas funciones: en esta
 * máquina, de ocho copias solo una tiene `SteamAPI_InitFlat`, y dos no exponen
 * siquiera el accessor de `ISteamUserStats`. Elegir por fecha de archivo da
 * elecciones malas; hay que elegir por lo que la DLL sabe hacer.
 *
 * Se lee el archivo, no se carga: así se pueden descartar candidatos sin el
 * riesgo ni el coste de mapear código en el proceso.
 */

interface Section {
  virtualAddress: number;
  virtualSize: number;
  rawSize: number;
  rawPointer: number;
}

const PE_SIGNATURE = 0x4550; // 'PE\0\0'
const MAGIC_PE32PLUS = 0x20b;

export function readExports(dllPath: string): string[] {
  const data = readFileSync(dllPath);

  const peOffset = data.readUInt32LE(0x3c);
  if (data.readUInt16LE(peOffset) !== PE_SIGNATURE) {
    throw new Error('no es un archivo PE válido');
  }

  const sectionCount = data.readUInt16LE(peOffset + 6);
  const optionalSize = data.readUInt16LE(peOffset + 20);
  const optionalOffset = peOffset + 24;
  const magic = data.readUInt16LE(optionalOffset);

  // Los data directories están tras el optional header, cuyo tamaño depende
  // de si el PE es de 32 o de 64 bits.
  const dataDirectories = optionalOffset + (magic === MAGIC_PE32PLUS ? 112 : 96);
  const exportRva = data.readUInt32LE(dataDirectories);
  if (exportRva === 0) return [];

  const sections: Section[] = [];
  const sectionTable = optionalOffset + optionalSize;
  for (let i = 0; i < sectionCount; i++) {
    const off = sectionTable + i * 40;
    sections.push({
      virtualSize: data.readUInt32LE(off + 8),
      virtualAddress: data.readUInt32LE(off + 12),
      rawSize: data.readUInt32LE(off + 16),
      rawPointer: data.readUInt32LE(off + 20),
    });
  }

  /** Traduce una dirección virtual relativa a un offset dentro del archivo. */
  const toOffset = (rva: number): number => {
    for (const s of sections) {
      const size = Math.max(s.virtualSize, s.rawSize);
      if (rva >= s.virtualAddress && rva < s.virtualAddress + size) {
        return s.rawPointer + (rva - s.virtualAddress);
      }
    }
    throw new Error(`RVA fuera de rango: 0x${rva.toString(16)}`);
  };

  const table = toOffset(exportRva);
  const nameCount = data.readUInt32LE(table + 24);
  const namesOffset = toOffset(data.readUInt32LE(table + 32));

  const names: string[] = [];
  for (let i = 0; i < nameCount; i++) {
    const start = toOffset(data.readUInt32LE(namesOffset + i * 4));
    const end = data.indexOf(0, start);
    names.push(data.toString('ascii', start, end));
  }
  return names;
}

/** Lo que una copia concreta de `steam_api64.dll` sabe hacer. */
export interface SteamApiCapabilities {
  /** Nombre del accessor, p. ej. `SteamAPI_SteamUserStats_v013`. */
  accessor: string;
  /** Versión numérica del accessor, para preferir la más alta. */
  accessorVersion: number;
  /** `SteamAPI_InitFlat` da el motivo del fallo; `SteamAPI_Init` solo un booleano. */
  hasInitFlat: boolean;
  hasInit: boolean;
  /** Accessor de ISteamUtils, necesario para los iconos. Vacío si no lo exporta. */
  utilsAccessor: string;
}

/** Funciones de `ISteamUserStats` sin las cuales el módulo de logros no sirve. */
const REQUIRED = [
  'SteamAPI_RunCallbacks',
  'SteamAPI_Shutdown',
  'SteamAPI_ISteamUserStats_GetNumAchievements',
  'SteamAPI_ISteamUserStats_GetAchievementName',
  'SteamAPI_ISteamUserStats_GetAchievementAndUnlockTime',
  'SteamAPI_ISteamUserStats_GetAchievementDisplayAttribute',
  'SteamAPI_ISteamUserStats_SetAchievement',
  'SteamAPI_ISteamUserStats_ClearAchievement',
  'SteamAPI_ISteamUserStats_GetStatInt32',
  'SteamAPI_ISteamUserStats_GetStatFloat',
  'SteamAPI_ISteamUserStats_SetStatInt32',
  'SteamAPI_ISteamUserStats_SetStatFloat',
  'SteamAPI_ISteamUserStats_StoreStats',
  'SteamAPI_ISteamUserStats_ResetAllStats',
];

const ACCESSOR_PATTERN = /^SteamAPI_SteamUserStats_v(\d+)$/;
const UTILS_PATTERN = /^SteamAPI_SteamUtils_v(\d+)$/;

/** Sin estas tres, los iconos no se pueden convertir; el resto sigue funcionando. */
const ICON_FUNCTIONS = [
  'SteamAPI_ISteamUserStats_GetAchievementIcon',
  'SteamAPI_ISteamUtils_GetImageSize',
  'SteamAPI_ISteamUtils_GetImageRGBA',
];

/** Inspecciona una DLL; devuelve null si no sirve para nuestro uso. */
export function inspectSteamApi(dllPath: string): SteamApiCapabilities | null {
  let names: string[];
  try {
    names = readExports(dllPath);
  } catch {
    return null;
  }

  const available = new Set(names);
  if (REQUIRED.some((fn) => !available.has(fn))) return null;

  const hasInitFlat = available.has('SteamAPI_InitFlat');
  const hasInit = available.has('SteamAPI_Init');
  if (!hasInitFlat && !hasInit) return null;

  // Si hay varios accessors, gana el de versión más alta.
  let best: { name: string; version: number } | null = null;
  for (const name of names) {
    const match = ACCESSOR_PATTERN.exec(name);
    if (!match) continue;
    const version = Number(match[1]);
    if (!best || version > best.version) best = { name, version };
  }
  if (!best) return null;

  let utilsAccessor = '';
  if (ICON_FUNCTIONS.every((fn) => available.has(fn))) {
    let bestUtils: { name: string; version: number } | null = null;
    for (const name of names) {
      const match = UTILS_PATTERN.exec(name);
      if (!match) continue;
      const version = Number(match[1]);
      if (!bestUtils || version > bestUtils.version) bestUtils = { name, version };
    }
    utilsAccessor = bestUtils?.name ?? '';
  }

  return {
    accessor: best.name,
    accessorVersion: best.version,
    hasInitFlat,
    hasInit,
    utilsAccessor,
  };
}
