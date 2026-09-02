import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Game } from '@shared/types';
import { parseVdf, dig, str, num } from './vdf';
import { log } from '../../logger';
import { localSteamCover } from './covers';

const logger = log('catalog:steam');

/** AppIDs que Steam instala pero no son juegos. */
const NOT_GAMES = new Set([
  '228980', // Steamworks Common Redistributables
  '1070560', // Steam Linux Runtime
  '1391110', // Steam Linux Runtime - Soldier
  '1628350', // Steam Linux Runtime - Sniper
  // Utilidades detectadas en esta biblioteca. No son títulos que Atreus deba
  // mandar a los flujos de mods, logros ni cheats.
  '280680', // Krita
  '993090', // Lossless Scaling
  '431960', // Wallpaper Engine
]);

export function isSteamGameAppId(appId: string): boolean {
  return !NOT_GAMES.has(appId);
}

/** Localiza la instalación de Steam: registro primero, rutas típicas después. */
export function findSteamPath(override?: string | null): string | null {
  if (override && existsSync(join(override, 'steamapps'))) return override;

  try {
    const out = execFileSync(
      'reg',
      ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'],
      { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const match = /SteamPath\s+REG_SZ\s+(.+)/i.exec(out);
    if (match?.[1]) {
      const path = match[1].trim().replace(/\//g, '\\');
      if (existsSync(join(path, 'steamapps'))) return path;
    }
  } catch {
    // El registro puede no estar disponible; se prueba con las rutas típicas.
  }

  for (const candidate of [
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
  ]) {
    if (existsSync(join(candidate, 'steamapps'))) return candidate;
  }
  return null;
}

/**
 * Todas las carpetas de biblioteca declaradas en `libraryfolders.vdf`.
 * Steam permite bibliotecas en otras unidades: aquí salen `C:` y `G:`, por ejemplo.
 */
export function readLibraryFolders(steamPath: string): string[] {
  const vdfPath = join(steamPath, 'steamapps', 'libraryfolders.vdf');
  const folders = new Set<string>([steamPath]);

  try {
    const root = parseVdf(readFileSync(vdfPath, 'utf8'));
    const libs = dig(root, 'libraryfolders');
    if (libs && typeof libs !== 'string') {
      for (const key of Object.keys(libs)) {
        const path = str(libs, key, 'path');
        if (path && existsSync(join(path, 'steamapps'))) folders.add(path);
      }
    }
  } catch (e) {
    logger.warn('no se pudo leer libraryfolders.vdf:', e);
  }

  return [...folders];
}

/**
 * Busca la carátula: primero la caché local del cliente, si no la CDN.
 *
 * La búsqueda en disco vive en `covers.ts` porque Steam ha cambiado dos veces
 * la disposición de `librarycache` y esa lógica la necesitan también las demás
 * plataformas.
 */
function resolveCover(steamPath: string, appId: string): {
  cover: string | null;
  local: string | null;
} {
  const local = localSteamCover(steamPath, appId);
  if (local) return { cover: `atreus://cover/steam.${appId}`, local };
  return {
    cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`,
    local: null,
  };
}

export interface SteamScanResult {
  games: Game[];
  /** Rutas locales de carátula por GameId, para servirlas por el protocolo propio. */
  covers: Map<string, string>;
}

/** Recorre todas las bibliotecas y devuelve un `Game` por `appmanifest_*.acf`. */
export function scanSteam(steamPath: string): SteamScanResult {
  const games: Game[] = [];
  const covers = new Map<string, string>();
  const seen = new Set<string>();

  for (const folder of readLibraryFolders(steamPath)) {
    const appsDir = join(folder, 'steamapps');
    let entries: string[];
    try {
      entries = readdirSync(appsDir).filter(
        (f) => f.startsWith('appmanifest_') && f.endsWith('.acf'),
      );
    } catch {
      continue;
    }

    for (const entry of entries) {
      try {
        const acf = parseVdf(readFileSync(join(appsDir, entry), 'utf8'));
        const appId = str(acf, 'AppState', 'appid');
        const name = str(acf, 'AppState', 'name');
        if (!appId || !name || !isSteamGameAppId(appId) || seen.has(appId)) continue;
        seen.add(appId);

        const installDirName = str(acf, 'AppState', 'installdir');
        const installDir = installDirName
          ? join(appsDir, 'common', installDirName)
          : null;

        const { cover, local } = resolveCover(steamPath, appId);
        const id = `steam:${appId}`;
        if (local) covers.set(id, local);

        games.push({
          id,
          platform: 'steam',
          nativeId: appId,
          name,
          installDir: installDir && existsSync(installDir) ? installDir : null,
          exePath: null, // Steam lanza por URL; no hace falta el exe salvo para el trainer.
          iconUrl: null,
          headerUrl: cover,
          sizeBytes: num(acf, 'AppState', 'SizeOnDisk'),
          lastPlayed: num(acf, 'AppState', 'LastPlayed'),
          playtimeMinutes: null, // Lo rellena decorate() con localconfig.vdf
          hasDefinition: false, // Lo rellena definitions.ts
          multiplayer: false,
          favorite: false,
        });
      } catch (e) {
        logger.warn(`no se pudo leer ${entry}:`, e);
      }
    }
  }

  logger.info(`${games.length} juegos de Steam en ${readLibraryFolders(steamPath).length} bibliotecas`);
  return { games, covers };
}

/** Busca el ejecutable más probable dentro del directorio del juego. */
export function guessExe(installDir: string | null, gameName: string): string | null {
  if (!installDir || !existsSync(installDir)) return null;
  try {
    const exes = readdirSync(installDir)
      .filter((f) => f.toLowerCase().endsWith('.exe'))
      .filter((f) => !/^(unins|setup|vc_?redist|dxsetup|crash)/i.test(f));
    if (exes.length === 0) return null;

    // Preferir el que se parezca al nombre del juego; si no, el más grande.
    const slug = gameName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const byName = exes.find(
      (f) => f.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/exe$/, '') === slug,
    );
    if (byName) return join(installDir, byName);

    let best: { file: string; size: number } | null = null;
    for (const f of exes) {
      try {
        const size = statSync(join(installDir, f)).size;
        if (!best || size > best.size) best = { file: f, size };
      } catch {
        // Un exe ilegible no debe abortar la detección.
      }
    }
    return best ? join(installDir, best.file) : null;
  } catch {
    return null;
  }
}
