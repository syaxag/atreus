import { app } from 'electron';
import { join } from 'node:path';
import { existsSync, mkdirSync, renameSync } from 'node:fs';

/**
 * Rutas de datos de Atreus.
 *
 * Hay **dos capas de contenido**, y esa separación es lo que permite añadir
 * juegos, cheats y mods sin reempaquetar la app:
 *
 *  - *de fábrica* — lo que viene con la instalación, junto al ejecutable y en
 *    solo lectura. Se sustituye al actualizar la app.
 *  - *del usuario* — bajo `%APPDATA%/Atreus/data`, editable a mano y
 *    sincronizable desde un repositorio. **Tiene prioridad** sobre la de fábrica
 *    y sobrevive a las actualizaciones.
 *
 * Para añadir un juego basta con dejar su JSON en la carpeta del usuario: la
 * app lo recoge en caliente, sin reinstalar ni reiniciar.
 */

const root = app.isPackaged
  ? join(app.getPath('appData'), 'Atreus')
  : join(app.getPath('appData'), 'Atreus-dev');

/*
 * Electron guarda lo suyo —cachés, almacenamiento del renderer y, sobre todo,
 * el candado de instancia única— en `userData`, que por defecto sale del
 * nombre del producto. Como el nombre es el mismo en desarrollo y en la app
 * instalada, ambas acababan en la misma carpeta y **se disputaban el candado**:
 * con la app de desarrollo abierta, la instalada arrancaba entera y se cerraba
 * sola justo antes de mostrarse, sin decir nada, porque cedía el paso a la
 * otra. Se ancla aquí, junto al resto de los datos, y cada una va por su lado.
 *
 * Tiene que ocurrir al cargar el módulo: para cuando la app está lista, tanto
 * el candado como las cachés ya están abiertos donde tocaba.
 */
app.setPath('userData', root);

/**
 * Contenido de fábrica. Va como `extraResources`, es decir, en
 * `resources/data` **fuera** del asar: dentro no se podría leer ni reemplazar.
 */
const builtinData = app.isPackaged
  ? join(process.resourcesPath, 'data')
  : join(app.getAppPath(), 'data');

/** Contenido del usuario, editable y persistente entre versiones. */
const userData = join(root, 'data');

/**
 * Dónde estaba la caché antes de que se le cambiara el nombre.
 *
 * Solo para mudar lo que sobrevivió —las subcarpetas— y no obligar a volver a
 * descargar todas las carátulas. Lo demás ya lo había borrado Chromium.
 */
const cacheVieja = join(root, 'cache');

export const paths = {
  root,
  settings: join(root, 'settings.json'),
  library: join(root, 'library.json'),
  profiles: join(root, 'profiles'),
  mods: join(root, 'mods'),
  /**
   * Lo que se puede volver a descargar: carátulas, iconos, el mapa de AppIDs.
   *
   * **No se llama `cache` a propósito.** Se llamaba así, y Chromium guarda lo
   * suyo en `<userData>/Cache`, que en Windows es la misma carpeta. Chromium
   * limpia los archivos sueltos que no reconoce de su directorio y respeta las
   * subcarpetas, así que `platinum.json`, `guides.json`, `mapgenie.json` y
   * `steam-appids.json` desaparecían **en cada arranque** mientras `covers/` e
   * `icons/` sobrevivían. Nadie se enteraba: el efecto era que la primera vez
   * siempre tardaba, todas las veces.
   */
  cache: join(root, 'cache-atreus'),
  backups: join(root, 'backups'),
  progress: join(root, 'progress'),
  /** Minutos que Atreus ha visto cada juego abierto. */
  sessions: join(root, 'sessions.json'),
  logs: join(root, 'logs'),
  logFile: join(root, 'logs', 'main.log'),

  // ── Capa de fábrica ──
  builtinData,
  builtinGameDefs: join(builtinData, 'games'),

  // ── Capa del usuario ──
  userData,
  userGameDefs: join(userData, 'games'),
  /** Marca de la última sincronización del catálogo. */
  catalogMeta: join(userData, 'catalog.json'),
} as const;

/** Carpetas que el usuario puede abrir desde la interfaz, por nombre. */
export const OPENABLE = {
  data: root,
  defs: paths.userGameDefs,
  mods: paths.mods,
  logs: paths.logs,
} as const;

export type OpenableKey = keyof typeof OPENABLE;

/**
 * Trae lo que sobrevivió de la carpeta anterior.
 *
 * Solo `covers/` e `icons/`: son las dos subcarpetas, y son las únicas que
 * Chromium no borraba. Mover una carpeta es instantáneo y evita volver a
 * descargar la carátula de toda la biblioteca. Si algo falla, se calla: lo
 * peor que pasa es que se descarguen otra vez.
 */
function mudarCacheVieja(): void {
  if (!existsSync(cacheVieja)) return;
  for (const nombre of ['covers', 'icons']) {
    const desde = join(cacheVieja, nombre);
    const hasta = join(paths.cache, nombre);
    if (!existsSync(desde) || existsSync(hasta)) continue;
    try {
      renameSync(desde, hasta);
    } catch {
      // Si no se puede, se vuelven a descargar y ya está.
    }
  }
}

/** Crea el árbol de carpetas. Idempotente; llamar una vez al arrancar. */
export function ensurePaths(): void {
  for (const dir of [
    root, paths.profiles, paths.mods, paths.cache, paths.backups, paths.progress, paths.logs,
    paths.userData, paths.userGameDefs,
  ]) {
    mkdirSync(dir, { recursive: true });
  }
  mudarCacheVieja();
}
