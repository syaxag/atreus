import { app } from 'electron';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

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

/**
 * Contenido de fábrica. Va como `extraResources`, es decir, en
 * `resources/data` **fuera** del asar: dentro no se podría leer ni reemplazar.
 */
const builtinData = app.isPackaged
  ? join(process.resourcesPath, 'data')
  : join(app.getAppPath(), 'data');

/** Contenido del usuario, editable y persistente entre versiones. */
const userData = join(root, 'data');

export const paths = {
  root,
  settings: join(root, 'settings.json'),
  library: join(root, 'library.json'),
  profiles: join(root, 'profiles'),
  mods: join(root, 'mods'),
  cache: join(root, 'cache'),
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

/** Crea el árbol de carpetas. Idempotente; llamar una vez al arrancar. */
export function ensurePaths(): void {
  for (const dir of [
    root, paths.profiles, paths.mods, paths.cache, paths.backups, paths.progress, paths.logs,
    paths.userData, paths.userGameDefs,
  ]) {
    mkdirSync(dir, { recursive: true });
  }
}
