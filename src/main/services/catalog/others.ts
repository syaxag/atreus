import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Game } from '@shared/types';
import { log } from '../../logger';

/**
 * Escáneres de las plataformas que no son Steam.
 *
 * Cada uno es tolerante a fallos por diseño: si la plataforma no está instalada
 * devuelve una lista vacía en vez de lanzar. Un escaneo nunca debe fallar entero
 * porque falte un launcher.
 */

const logger = log('catalog:otras');

function base(
  platform: Game['platform'],
  nativeId: string,
  name: string,
  installDir: string | null,
  exePath: string | null,
): Game {
  return {
    id: `${platform}:${nativeId}`,
    platform,
    nativeId,
    name,
    installDir,
    exePath,
    iconUrl: null,
    headerUrl: null,
    sizeBytes: null,
    lastPlayed: null,
    hasDefinition: false,
    multiplayer: false,
    favorite: false,
  };
}

// ── Epic Games ────────────────────────────────────────────────
interface EpicManifest {
  AppName?: string;
  DisplayName?: string;
  InstallLocation?: string;
  LaunchExecutable?: string;
  InstallSize?: number;
  bIsIncompleteInstall?: boolean;
}

export function scanEpic(): Game[] {
  const dir = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests';
  if (!existsSync(dir)) return [];

  const games: Game[] = [];
  try {
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.item'))) {
      try {
        const m = JSON.parse(readFileSync(join(dir, file), 'utf8')) as EpicManifest;
        if (!m.AppName || !m.DisplayName || m.bIsIncompleteInstall) continue;

        const installDir = m.InstallLocation ?? null;
        const exePath =
          installDir && m.LaunchExecutable ? join(installDir, m.LaunchExecutable) : null;

        const g = base('epic', m.AppName, m.DisplayName, installDir, exePath);
        g.sizeBytes = typeof m.InstallSize === 'number' ? m.InstallSize : null;
        games.push(g);
      } catch {
        // Un manifiesto corrupto se salta sin más.
      }
    }
  } catch (e) {
    logger.warn('fallo leyendo los manifiestos de Epic:', e);
  }
  logger.info(`${games.length} juegos de Epic`);
  return games;
}

// ── GOG Galaxy ────────────────────────────────────────────────
export function scanGog(): Game[] {
  const games: Game[] = [];
  const key = 'HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games';

  let subkeys: string[];
  try {
    subkeys = execFileSync('reg', ['query', key], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.startsWith(key + '\\'));
  } catch {
    return []; // GOG no está instalado.
  }

  for (const sub of subkeys) {
    try {
      const out = execFileSync('reg', ['query', sub], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
      const pick = (name: string) =>
        new RegExp(`${name}\\s+REG_SZ\\s+(.+)`, 'i').exec(out)?.[1]?.trim();

      const gameId = pick('gameID');
      const name = pick('gameName');
      if (!gameId || !name) continue;

      const installDir = pick('path') ?? null;
      const exe = pick('exe');
      games.push(base('gog', gameId, name, installDir, exe ?? null));
    } catch {
      // Una clave ilegible se salta.
    }
  }
  logger.info(`${games.length} juegos de GOG`);
  return games;
}

// ── Xbox / Microsoft Store ────────────────────────────────────

/**
 * Un paquete de la Store solo es un juego si su `MicrosoftGame.config` declara
 * un ejecutable. Los stubs de DLC y los "launch trackers" llevan en su lugar
 * `TargetDeviceFamilyForDLC` y ningún `<Executable>`: sin este filtro, la
 * biblioteca se llena de entradas como "BO7 DLC17 Standard Launch Tracker".
 */
function readGameConfig(installLocation: string): { name: string; exe: string } | null {
  const configPath = join(installLocation, 'MicrosoftGame.config');
  if (!existsSync(configPath)) return null;

  let xml: string;
  try {
    xml = readFileSync(configPath, 'utf8');
  } catch {
    return null;
  }

  // Los comentarios del GDK traen `<Executable ...>` de ejemplo: hay que quitarlos
  // antes de buscar, o todos los stubs parecerían juegos.
  const clean = xml.replace(/<!--[\s\S]*?-->/g, '');

  if (/<TargetDeviceFamilyForDLC>/i.test(clean)) return null;

  const exe = /<Executable\s+[^>]*Name="([^"]+)"/i.exec(clean)?.[1];
  if (!exe) return null;

  const name = /<ShellVisuals\s+[^>]*DefaultDisplayName="([^"]+)"/i.exec(clean)?.[1];
  return { name: name ?? exe.replace(/\.exe$/i, ''), exe };
}

export function scanXbox(): Game[] {
  // `Get-AppxPackage` tarda un par de segundos; se pide solo lo necesario.
  const script = [
    'Get-AppxPackage',
    '| Where-Object { $_.IsFramework -eq $false -and $_.SignatureKind -eq "Store" }',
    '| Select-Object PackageFamilyName, InstallLocation',
    '| ConvertTo-Json -Compress',
  ].join(' ');

  try {
    const out = execFileSync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { encoding: 'utf8', windowsHide: true, timeout: 30_000, maxBuffer: 8 * 1024 * 1024 },
    );
    const parsed = JSON.parse(out || '[]') as
      | { PackageFamilyName: string; InstallLocation: string }[]
      | { PackageFamilyName: string; InstallLocation: string };
    const list = Array.isArray(parsed) ? parsed : [parsed];

    const games: Game[] = [];
    for (const pkg of list) {
      if (!pkg?.InstallLocation) continue;
      const config = readGameConfig(pkg.InstallLocation);
      if (!config) continue;

      const exePath = join(pkg.InstallLocation, config.exe);
      games.push(
        base(
          'xbox',
          pkg.PackageFamilyName,
          config.name,
          pkg.InstallLocation,
          existsSync(exePath) ? exePath : null,
        ),
      );
    }

    logger.info(`${games.length} juegos de Xbox`);
    return games;
  } catch (e) {
    logger.warn('no se pudo enumerar los paquetes de Xbox:', e);
    return [];
  }
}
