import { protocol, net } from 'electron';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Protocolo propio `atreus://` para servir imágenes locales al renderer.
 *
 * El renderer no puede leer `file://` (lo bloquea la CSP, y con razón). Las
 * carátulas viven en la caché de Steam, fuera del bundle, así que se sirven por
 * este esquema controlado: el renderer solo puede pedir rutas que el catálogo
 * haya registrado, no una ruta arbitraria del disco.
 */

/** GameId → ruta absoluta del archivo de carátula. La rellena el catálogo. */
const covers = new Map<string, string>();

/** GameId → ruta absoluta del póster vertical. Mismo trato que las carátulas. */
const posters = new Map<string, string>();

/** Raíz de la caché de iconos de logros. La fija el módulo de Steam. */
let iconRoot: string | null = null;

export function setIconRoot(path: string): void {
  iconRoot = path;
}

export function setCoverPaths(entries: Map<string, string>): void {
  covers.clear();
  for (const [id, path] of entries) covers.set(id, path);
}

export function setPosterPaths(entries: Map<string, string>): void {
  posters.clear();
  for (const [id, path] of entries) posters.set(id, path);
}

/** Debe llamarse ANTES de `app.whenReady()`. */
export function registerSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'atreus', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

/** Debe llamarse DESPUÉS de `app.whenReady()`. */
export function registerProtocolHandlers(): void {
  protocol.handle('atreus', (request) => {
    const url = new URL(request.url);

    if (url.hostname === 'icon' && iconRoot) {
      // `atreus://icon/<appid>/<archivo>.png`
      const parts = url.pathname.replace(/^\//, '').split('/');
      const appId = parts[0] ?? '';
      const file = parts[1] ?? '';
      // Solo nombres simples: nada de recorrer el disco desde el renderer.
      if (/^\d+$/.test(appId) && /^[A-Za-z0-9._-]+\.png$/.test(file)) {
        const full = join(iconRoot, appId, file);
        if (existsSync(full)) return net.fetch(pathToFileURL(full).toString());
      }
      return new Response('icon not found', { status: 404 });
    }

    if (url.hostname === 'poster') {
      const key = decodeURIComponent(url.pathname.replace(/^\//, '')).replace('.', ':');
      const file = posters.get(key);
      if (file) return net.fetch(pathToFileURL(file).toString());
      return new Response('poster not found', { status: 404 });
    }

    if (url.hostname === 'cover') {
      // `atreus://cover/steam.2379780` → el id va en el path, con '.' en vez de ':'
      const key = decodeURIComponent(url.pathname.replace(/^\//, '')).replace('.', ':');
      const file = covers.get(key);
      if (file) return net.fetch(pathToFileURL(file).toString());
      return new Response('cover not found', { status: 404 });
    }

    return new Response('not found', { status: 404 });
  });
}
