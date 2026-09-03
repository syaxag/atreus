import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Game } from '@shared/types';
import { log } from '../../logger';
import { guessExe } from './steam';
import {
  exeFromDisplayIcon, parseRegSubkeys, parseRegValues, parseUninstallEntries, pickValue,
  type UninstallEntry,
} from './registry';

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
    portraitUrl: null,
    sizeBytes: null,
    lastPlayed: null,
    playtimeMinutes: null,
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

// ── EA App y Battle.net ──────────────────────────────────────
//
// Ninguno de los dos publica un manifiesto local legible: EA App cifra su
// almacén de instalaciones y Battle.net guarda `product.db` en protobuf. Lo
// estable es lo que ambos dejan en el registro de Windows: las claves de
// cada juego (`EA Games`, `Origin Games`, `Blizzard Entertainment`) y las
// entradas de "Programas instalados". Se leen las dos fuentes y se unen por
// carpeta de instalación, sin iniciar ningún launcher.

function regQuery(key: string): string | null {
  try {
    return execFileSync('reg', ['query', key], {
      encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null; // La clave no existe: la plataforma no está instalada.
  }
}

/** Juegos registrados como subclaves directas de `root`. */
function registryGames(root: string, platform: Game['platform'], skip: RegExp): Game[] {
  const listing = regQuery(root);
  if (!listing) return [];

  const games: Game[] = [];
  for (const subkey of parseRegSubkeys(listing, root)) {
    const nativeId = subkey.slice(root.length + 1);
    if (skip.test(nativeId)) continue;
    const out = regQuery(subkey);
    if (!out) continue;

    const values = parseRegValues(out);
    const installDir = pickValue(values, 'Install Dir', 'InstallDir', 'InstallLocation', 'InstallPath', 'Path');
    if (!installDir || !existsSync(installDir)) continue;

    // Origin usa ids numéricos como clave; el nombre legible es la carpeta.
    const name = pickValue(values, 'DisplayName', 'Game Name', 'Title')
      ?? (/^\d+$/.test(nativeId) ? basename(installDir.replace(/[\\/]+$/, '')) : nativeId);
    const exe = pickValue(values, 'Launcher', 'Exe', 'ExecutablePath');
    const exePath = exe && existsSync(exe) ? exe : guessExe(installDir, name);
    games.push(base(platform, nativeId, name, installDir, exePath));
  }
  return games;
}

/**
 * "Programas instalados" de Windows, las tres vistas (64 bits, 32 bits y
 * usuario). Una sola llamada a PowerShell para todo el escaneo.
 */
export function readUninstallEntries(): UninstallEntry[] {
  const script = [
    'Get-ItemProperty',
    "'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',",
    "'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',",
    "'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'",
    '-ErrorAction SilentlyContinue',
    '| Where-Object { $_.DisplayName -and $_.Publisher }',
    '| Select-Object DisplayName, Publisher, InstallLocation, DisplayIcon, PSChildName',
    '| ConvertTo-Json -Compress',
  ].join(' ');

  try {
    const out = execFileSync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { encoding: 'utf8', windowsHide: true, timeout: 30_000, maxBuffer: 8 * 1024 * 1024 },
    );
    return parseUninstallEntries(out);
  } catch (e) {
    logger.warn('no se pudo leer la lista de programas instalados:', e);
    return [];
  }
}

/** Convierte las entradas de un editor en juegos, descartando sus launchers. */
export function gamesFromUninstall(
  entries: UninstallEntry[],
  platform: Game['platform'],
  publisher: RegExp,
  skip: RegExp,
): Game[] {
  const games: Game[] = [];
  for (const entry of entries) {
    if (!publisher.test(entry.publisher) || skip.test(entry.displayName)) continue;
    const installDir = entry.installLocation?.replace(/^"|"$/g, '') ?? null;
    if (!installDir || !existsSync(installDir)) continue;
    const fromIcon = exeFromDisplayIcon(entry.displayIcon);
    const exePath = fromIcon && existsSync(fromIcon) ? fromIcon : guessExe(installDir, entry.displayName);
    games.push(base(platform, entry.key, entry.displayName, installDir, exePath));
  }
  return games;
}

/** Une varias fuentes del mismo launcher: la misma carpeta es el mismo juego. */
export function mergeByInstallDir(...sources: Game[][]): Game[] {
  const seen = new Set<string>();
  const out: Game[] = [];
  for (const list of sources) {
    for (const game of list) {
      const key = (game.installDir ?? game.id).toLowerCase().replace(/[\\/]+$/, '');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(game);
    }
  }
  return out;
}

const EA_LAUNCHERS = /^(EA app|EA Desktop|EA Core|EADM|Origin)$/i;
const EA_PUBLISHER = /electronic arts/i;

/**
 * Juegos de EA App y Origin. `EA Games` y `Origin Games` son las claves que
 * dejan los instaladores; la lista de programas cubre los que no las tienen.
 */
export function scanEa(entries: UninstallEntry[] = readUninstallEntries()): Game[] {
  const games = mergeByInstallDir(
    registryGames('HKLM\\SOFTWARE\\EA Games', 'ea', EA_LAUNCHERS),
    registryGames('HKLM\\SOFTWARE\\WOW6432Node\\EA Games', 'ea', EA_LAUNCHERS),
    registryGames('HKLM\\SOFTWARE\\WOW6432Node\\Origin Games', 'ea', EA_LAUNCHERS),
    registryGames('HKLM\\SOFTWARE\\Origin Games', 'ea', EA_LAUNCHERS),
    gamesFromUninstall(entries, 'ea', EA_PUBLISHER, EA_LAUNCHERS),
  );
  logger.info(`${games.length} juegos de EA App`);
  return games;
}

const BLIZZARD_LAUNCHERS = /^(Battle\.net|Agent|Blizzard Browser)/i;
const BLIZZARD_PUBLISHER = /blizzard/i;

/**
 * Juegos de Battle.net. Se excluye la propia aplicación y su agente: solo
 * cuentan las entradas con una carpeta de juego que exista de verdad.
 */
export function scanBattleNet(entries: UninstallEntry[] = readUninstallEntries()): Game[] {
  const games = mergeByInstallDir(
    registryGames('HKLM\\SOFTWARE\\WOW6432Node\\Blizzard Entertainment', 'battlenet', BLIZZARD_LAUNCHERS),
    gamesFromUninstall(entries, 'battlenet', BLIZZARD_PUBLISHER, BLIZZARD_LAUNCHERS),
  );
  logger.info(`${games.length} juegos de Battle.net`);
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
      // El launcher no es el juego Java. Se conserva la edición Java, que
      // tiene su propia definición y detector de perfiles/mods.
      if (/^Microsoft\.4297127D64EC6_/i.test(pkg.PackageFamilyName)) continue;
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
