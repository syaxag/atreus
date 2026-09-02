import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Dónde deja cada plataforma la imagen de un juego, en disco.
 *
 * Va aparte de `covers.ts` porque no toca Electron ni la red: recibe rutas y
 * devuelve rutas, así que se puede probar con una carpeta de mentira. Es la
 * parte que más se ha equivocado históricamente —Steam ha cambiado dos veces la
 * disposición de su caché— y justo por eso merece tener pruebas.
 */

/** Nombres de archivo de la caché de Steam, del más apaisado al menos. */
export const STEAM_ART = [
  'library_header.jpg',
  'header.jpg',
  'capsule_616x353.jpg',
  'library_600x900.jpg',
] as const;

function directories(path: string): string[] {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/**
 * Carátula de Steam ya descargada por el cliente, o null.
 *
 * Se aceptan las tres disposiciones que ha usado Steam:
 *
 *  - `librarycache/<appid>/<hash>/library_header.jpg` — la actual, desde 2024.
 *    Cada imagen cuelga de una subcarpeta con el hash de su contenido.
 *  - `librarycache/<appid>/library_header.jpg` — la intermedia.
 *  - `librarycache/<appid>_library_header.jpg` — la antigua, plana.
 *
 * Buscar solo en una era el motivo real de que no saliera **ninguna** carátula
 * local: el código miraba la disposición intermedia contra un cliente que ya
 * usaba la de subcarpetas, así que siempre caía a la CDN.
 */
export function localSteamCover(steamPath: string, appId: string): string | null {
  const root = join(steamPath, 'appcache', 'librarycache');
  const appDir = join(root, appId);

  if (existsSync(appDir)) {
    for (const name of STEAM_ART) {
      const direct = join(appDir, name);
      if (existsSync(direct)) return direct;
    }
    const subdirs = directories(appDir);
    for (const name of STEAM_ART) {
      for (const sub of subdirs) {
        const file = join(appDir, sub, name);
        if (existsSync(file)) return file;
      }
    }
  }

  for (const name of STEAM_ART) {
    const flat = join(root, `${appId}_${name}`);
    if (existsSync(flat)) return flat;
  }
  return null;
}

/**
 * Logo local de un juego de la Microsoft Store, o null.
 *
 * `MicrosoftGame.config` declara sus imágenes con rutas relativas a la carpeta
 * del paquete, y siempre están: para Xbox no hace falta salir a la red.
 */
export function localXboxCover(installDir: string | null): string | null {
  if (!installDir) return null;
  const config = join(installDir, 'MicrosoftGame.config');
  if (!existsSync(config)) return null;

  let xml: string;
  try {
    // Los comentarios del GDK traen atributos de ejemplo; fuera antes de buscar.
    xml = readFileSync(config, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  } catch {
    return null;
  }

  // De mayor a menor: la primera que exista sirve.
  for (const attribute of ['SplashScreenImage', 'Square480x480Logo', 'Square150x150Logo', 'Square44x44Logo']) {
    const value = new RegExp(`${attribute}="([^"]+)"`, 'i').exec(xml)?.[1];
    if (!value) continue;
    const file = join(installDir, value.replace(/\//g, '\\'));
    if (existsSync(file)) return file;
  }
  return null;
}
