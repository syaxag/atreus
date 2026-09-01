/**
 * Atreus — tipos de dominio compartidos entre main y renderer.
 *
 * CONTRATO CONGELADO. Cambiar algo aquí obliga a avisar al otro agente.
 * Ver docs/CONTRACT.md.
 */

// ─────────────────────────── Juegos ───────────────────────────

export type Platform = 'steam' | 'epic' | 'gog' | 'xbox' | 'manual';

/** Identificador estable: `"steam:2379780"`, `"manual:a1b2c3"`. */
export type GameId = string;

export interface Game {
  id: GameId;
  platform: Platform;
  /** AppID de Steam / id de Epic / etc. Sin el prefijo de plataforma. */
  nativeId: string;
  name: string;
  installDir: string | null;
  exePath: string | null;
  iconUrl: string | null;
  headerUrl: string | null;
  sizeBytes: number | null;
  lastPlayed: number | null;
  /** true si hay `data/games/<id>.json` con cheats. */
  hasDefinition: boolean;
  /** true si el título es multijugador → trainer bloqueado. */
  multiplayer: boolean;
  favorite: boolean;
}

// ─────────────────────── Logros y estadísticas ───────────────────────

export interface Achievement {
  apiName: string;
  displayName: string;
  description: string;
  iconUrl: string | null;
  iconGrayUrl: string | null;
  hidden: boolean;
  unlocked: boolean;
  /** Epoch en segundos, o null si está bloqueado. */
  unlockTime: number | null;
  /** El logro está protegido por el servidor: no se puede escribir. */
  protected: boolean;
}

export type StatType = 'int' | 'float' | 'avgrate';

export interface GameStat {
  apiName: string;
  displayName: string;
  type: StatType;
  value: number;
  /** Valor original tal como se leyó, para poder revertir. */
  originalValue: number;
  /** Marcada como increment-only en el esquema. */
  incrementOnly: boolean;
  permission: number;
}

/** Estado del proceso satélite de Steam para un AppID. */
export type SteamSessionState =
  | 'idle'
  | 'starting'
  | 'connected'
  | 'error'
  | 'steam-not-running'
  | 'app-not-owned';

export interface SteamSession {
  appId: string;
  state: SteamSessionState;
  error: string | null;
}

export interface AchievementPatch {
  apiName: string;
  unlocked: boolean;
}

export interface StatPatch {
  apiName: string;
  value: number;
}

// ─────────────────────────── Cheats ───────────────────────────

export type CheatType = 'toggle' | 'value' | 'button';
export type MemType =
  | 'i8' | 'u8' | 'i16' | 'u16' | 'i32' | 'u32'
  | 'i64' | 'u64' | 'f32' | 'f64' | 'bytes';

/** Cómo se localiza la dirección objetivo en memoria. */
export type CheatResolve =
  | { kind: 'aob'; module: string; pattern: string; offset: number; deref?: boolean }
  | { kind: 'pointer'; module: string; base: number; offsets: number[] }
  | { kind: 'static'; module: string; offset: number };

export interface CheatDef {
  id: string;
  name: string;
  description?: string;
  type: CheatType;
  /** Agrupación en la UI: "Jugador", "Recursos", "Armas"… */
  group?: string;
  hotkey?: string;
  resolve: CheatResolve;
  write: {
    type: MemType;
    /** Para `toggle`/`button`: el valor a escribir al activar. */
    value?: number | string;
    /** Para `value`: rango editable por el usuario. */
    min?: number;
    max?: number;
    step?: number;
    /** Reescribir en bucle para vencer al juego. */
    freeze?: boolean;
    /** Bytes originales a restaurar al desactivar (nop-patches). */
    restore?: string;
  };
  /** Aviso a mostrar antes de activar. */
  warning?: string;
}

export interface CheatState {
  id: string;
  enabled: boolean;
  /** Valor actual para cheats de tipo `value`. */
  value: number | null;
  /** null = aún no resuelto; false = patrón no encontrado. */
  resolved: boolean | null;
  error: string | null;
}

export type AttachState =
  | 'detached'
  | 'searching'
  | 'attached'
  | 'blocked'      // título en la lista de bloqueo
  | 'error';

export interface TrainerSession {
  gameId: GameId;
  state: AttachState;
  pid: number | null;
  moduleBase: string | null;
  error: string | null;
}

// ─────────────────────── Buscador de memoria ───────────────────────

/** Cómo se filtra una búsqueda de refinamiento. */
export type ScanMode =
  | 'eq'          // igual a un valor concreto
  | 'changed'     // distinto de la lectura anterior
  | 'unchanged'   // igual que la lectura anterior
  | 'increased'
  | 'decreased';

export interface ScanCandidate {
  /** Dirección en hexadecimal, p. ej. "0x7FF6A2C10000". */
  address: string;
  /** Valor leído ahora. */
  value: number;
  /** Valor de la pasada anterior, para ver qué se movió. */
  previous: number;
  /** Módulo que la contiene, si cae dentro de uno. */
  module: string | null;
}

export interface ScanSummary {
  /** Cuántas direcciones quedan tras el último filtro. */
  count: number;
  /** true si se llegó al tope y la lista está recortada. */
  truncated: boolean;
  elapsedMs: number;
  /** Número de pasada: 1 es la primera búsqueda. */
  pass: number;
}

export type ScanState = 'idle' | 'attached' | 'scanning' | 'blocked' | 'error';

export interface ScanSession {
  gameId: GameId;
  state: ScanState;
  pid: number | null;
  type: MemType;
  summary: ScanSummary | null;
  error: string | null;
}

export interface ScanProgressEvent {
  gameId: GameId;
  /** Bytes ya examinados y bytes totales estimados. */
  scanned: number;
  total: number;
  found: number;
}

/** Una forma estable de volver a esa dirección en la próxima partida. */
export interface DerivedResolve {
  resolve: CheatResolve;
  /** Cómo de fiable es: "static" aguanta siempre; "pointer" casi siempre. */
  kind: 'static' | 'pointer';
  explanation: string;
}

// ──────────────────────────── Mods ────────────────────────────

export type ModStatus = 'staged' | 'deployed' | 'error';

export interface Mod {
  id: string;
  gameId: GameId;
  name: string;
  version: string | null;
  author: string | null;
  description: string | null;
  status: ModStatus;
  enabled: boolean;
  /** Orden de carga; menor = antes. */
  order: number;
  sizeBytes: number;
  installedAt: number;
  /** Rutas relativas al directorio del juego que este mod despliega. */
  files: string[];
  conflictsWith: string[];
  error: string | null;
}

/**
 * Un mod disponible en un catálogo público, todavía no instalado.
 *
 * Sale de los proveedores (Thunderstore, Geode). Los **cheats** no aparecen
 * aquí: no existe catálogo público legible por máquina que los publique.
 */
export interface RemoteMod {
  /** Identificador dentro de su catálogo. */
  id: string;
  name: string;
  author: string;
  version: string;
  description: string;
  downloads: number;
  sizeBytes: number | null;
  iconUrl: string | null;
  pageUrl: string;
  downloadUrl: string;
  /** Nombre con el que se guarda al descargar; decide si se extrae o no. */
  fileName: string;
  categories: string[];
  /** Cuántas dependencias declara. Informativo. */
  dependencies: number;
  /** Catálogo del que viene, para enseñarlo. */
  source: string;
  /**
   * Qué mide el número de `downloads` en este catálogo.
   *
   * No todos publican descargas: GameBanana da "me gusta". Llamarlo descargas
   * en la interfaz sería mentir, así que cada proveedor dice qué es lo suyo.
   */
  metric: string;
  /**
   * "cheat" si el catálogo lo publica como mod pero funciona como cheat:
   * menús de mods, trainers, modos debug. En muchos juegos es la única forma
   * de cheat que existe, porque nadie escribe trainers de memoria para ellos.
   */
  kind: 'mod' | 'cheat';
  /**
   * true si la URL de descarga aún no se conoce y hay que pedirla al instalar.
   *
   * GameBanana no la da en el listado; pedirla para los 148 mods de un juego
   * serían 148 peticiones, así que se resuelve solo la del que se instala.
   */
  deferred: boolean;
}

export interface ModProfile {
  id: string;
  gameId: GameId;
  name: string;
  /** ids de mods activos, en orden. */
  mods: string[];
  launchArgs: string;
  isActive: boolean;
}

// ────────────────────────── Ajustes ──────────────────────────

export interface Settings {
  theme: 'dark';
  accent: string;
  steamPath: string | null;
  /** Clave de la Steam Web API, para esquemas de logros. Opcional. */
  steamWebApiKey: string | null;
  scanOnStart: boolean;
  minimizeToTray: boolean;
  hotkeysEnabled: boolean;
  /** Origen del catálogo de definiciones: carpeta local o URL de repo. */
  catalogSource: string;
  confirmBeforeCheats: boolean;
  language: 'es' | 'en';
}

// ──────────────────── Resultado uniforme ────────────────────

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

export interface ScanProgress {
  phase: 'steam' | 'epic' | 'gog' | 'xbox' | 'enrich' | 'done';
  found: number;
  message: string;
}
