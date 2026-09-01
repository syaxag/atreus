import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { findSteamPath, readLibraryFolders } from '../catalog/steam';
import { getSettings } from '../settings';
import { inspectSteamApi, type SteamApiCapabilities } from './pe';
import { log } from '../../logger';

const logger = log('steam:locator');

/**
 * Localiza `steam_api64.dll`.
 *
 * Se usa la API **plana** de Steamworks (`SteamAPI_ISteamUserStats_*`), que son
 * funciones exportadas normales, en lugar de las interfaces de `steamclient.dll`,
 * que son C++ virtual y cuyos índices de vtable cambian entre versiones de Steam.
 * Eso elimina el punto de rotura más probable del módulo de logros.
 *
 * La DLL no se redistribuye: se toma la copia que ya trae cualquier juego
 * instalado. Siempre hay alguna si el usuario tiene juegos.
 *
 * Ojo: **no todas las copias valen**. Cada juego trae la versión del SDK con la
 * que se compiló, y varían mucho — en esta máquina, de ocho copias solo una
 * exporta `SteamAPI_InitFlat`, y las de Apex y Rocket League ni siquiera exponen
 * el accessor de `ISteamUserStats`. Por eso se elige inspeccionando la tabla de
 * exports (`pe.ts`) en vez de por fecha de archivo.
 */

export interface SteamApiDll extends SteamApiCapabilities {
  path: string;
}

let cached: SteamApiDll | null | undefined;

/** Rutas donde suele estar, dentro del directorio de un juego. */
const SUBPATHS = [
  '',
  'bin',
  'Binaries',
  join('Binaries', 'Win64'),
  join('bin', 'win64'),
  'win64',
  'x64',
  join('Engine', 'Binaries', 'ThirdParty', 'Steamworks'),
];

function findInGame(gameDir: string): string | null {
  for (const sub of SUBPATHS) {
    const candidate = join(gameDir, sub, 'steam_api64.dll');
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Elige la mejor copia de `steam_api64.dll` entre los juegos instalados.
 *
 * Criterio, en orden: que exporte todo lo que usamos, que tenga `InitFlat`
 * (da el motivo del fallo, no solo un booleano) y que su accessor sea el de
 * versión más alta.
 */
export function findSteamApiDll(): SteamApiDll | null {
  if (cached !== undefined) return cached;
  cached = null;

  const steamPath = findSteamPath(getSettings().steamPath);
  if (!steamPath) {
    logger.warn('no se encontró Steam');
    return cached;
  }

  let best: SteamApiDll | null = null;
  let examined = 0;
  let rejected = 0;

  for (const folder of readLibraryFolders(steamPath)) {
    const common = join(folder, 'steamapps', 'common');
    let games: string[];
    try {
      games = readdirSync(common);
    } catch {
      continue;
    }

    for (const game of games) {
      const dll = findInGame(join(common, game));
      if (!dll) continue;
      examined++;

      const caps = inspectSteamApi(dll);
      if (!caps) { rejected++; continue; }

      const candidate: SteamApiDll = { ...caps, path: dll };
      if (
        !best ||
        (candidate.hasInitFlat && !best.hasInitFlat) ||
        (candidate.hasInitFlat === best.hasInitFlat &&
          candidate.accessorVersion > best.accessorVersion)
      ) {
        best = candidate;
      }
    }
  }

  cached = best;
  if (best) {
    logger.info(
      `steam_api64.dll: ${best.path} (${best.accessor}, ` +
      `init=${best.hasInitFlat ? 'InitFlat' : 'Init'}, ` +
      `iconos=${best.utilsAccessor || 'no'}) — ` +
      `${examined} copias examinadas, ${rejected} descartadas`,
    );
  } else {
    logger.warn(
      examined === 0
        ? 'ningún juego instalado trae steam_api64.dll'
        : `las ${examined} copias de steam_api64.dll encontradas no exportan lo necesario`,
    );
  }
  return cached;
}

export function resetDllCache(): void {
  cached = undefined;
}

/** ¿Está el cliente de Steam corriendo? Sin él, `SteamAPI_Init` falla siempre. */
export function isSteamRunning(): boolean {
  try {
    const out = execFileSync(
      'tasklist',
      ['/FI', 'IMAGENAME eq steam.exe', '/NH'],
      { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return /steam\.exe/i.test(out);
  } catch {
    return false;
  }
}

/** SteamID64 del usuario conectado, leído del registro. Solo informativo. */
export function getActiveSteamId(): string | null {
  try {
    const out = execFileSync(
      'reg',
      ['query', 'HKCU\\Software\\Valve\\Steam\\ActiveProcess', '/v', 'ActiveUser'],
      { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const hex = /ActiveUser\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(out)?.[1];
    if (!hex) return null;
    const accountId = parseInt(hex, 16);
    if (!accountId) return null;
    // SteamID64 = 76561197960265728 + accountId
    return (76561197960265728n + BigInt(accountId)).toString();
  } catch {
    return null;
  }
}
