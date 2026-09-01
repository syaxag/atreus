/**
 * Atreus — contrato IPC entre el proceso main y el renderer.
 *
 * ══════════════════════════════════════════════════════════════
 *  CONTRATO CONGELADO — coordinar cualquier cambio entre agentes.
 *  Agente A implementa `AtreusApi` en main/ipc/register.ts
 *  Agente B consume `window.atreus` (tipado por `AtreusApi`)
 * ══════════════════════════════════════════════════════════════
 */

import type {
  Achievement, AchievementPatch, CheatDef, CheatState, Game, GameId,
  GameStat, Mod, ModProfile, Result, ScanProgress, Settings,
  StatPatch, SteamSession, TrainerSession,
} from './types';

/** Superficie completa expuesta en `window.atreus`. */
export interface AtreusApi {
  library: {
    /** Devuelve la caché; no escanea. */
    list(): Promise<Result<Game[]>>;
    /** Reescanea todas las plataformas. Emite `library:scan-progress`. */
    scan(): Promise<Result<Game[]>>;
    get(id: GameId): Promise<Result<Game>>;
    /** Añade un juego apuntando a un .exe suelto. */
    addManual(exePath: string): Promise<Result<Game>>;
    remove(id: GameId): Promise<Result<void>>;
    setFavorite(id: GameId, favorite: boolean): Promise<Result<void>>;
    launch(id: GameId, args?: string): Promise<Result<{ pid: number }>>;
  };

  steam: {
    /** Arranca el proceso satélite para ese AppID. */
    open(appId: string): Promise<Result<SteamSession>>;
    close(appId: string): Promise<Result<void>>;
    achievements(appId: string): Promise<Result<Achievement[]>>;
    stats(appId: string): Promise<Result<GameStat[]>>;
    /** Aplica cambios y llama a StoreStats. Todo o nada. */
    commit(
      appId: string,
      patch: { achievements: AchievementPatch[]; stats: StatPatch[] },
    ): Promise<Result<{ applied: number }>>;
    /** Restablece TODOS los logros y stats del juego. Destructivo. */
    resetAll(appId: string): Promise<Result<void>>;
  };

  trainer: {
    /** Definiciones de cheats de `data/games/<id>.json`. */
    definitions(gameId: GameId): Promise<Result<CheatDef[]>>;
    /** Busca el proceso y engancha. Falla si el juego está bloqueado. */
    attach(gameId: GameId): Promise<Result<TrainerSession>>;
    detach(gameId: GameId): Promise<Result<void>>;
    session(gameId: GameId): Promise<Result<TrainerSession | null>>;
    toggle(gameId: GameId, cheatId: string, enabled: boolean): Promise<Result<CheatState>>;
    setValue(gameId: GameId, cheatId: string, value: number): Promise<Result<CheatState>>;
    /** Dispara un cheat de tipo `button`. */
    trigger(gameId: GameId, cheatId: string): Promise<Result<void>>;
    states(gameId: GameId): Promise<Result<CheatState[]>>;
  };

  mods: {
    list(gameId: GameId): Promise<Result<Mod[]>>;
    /** Abre diálogo de archivo si no se pasa ruta. */
    install(gameId: GameId, archivePath?: string): Promise<Result<Mod>>;
    uninstall(gameId: GameId, modId: string): Promise<Result<void>>;
    setEnabled(gameId: GameId, modId: string, enabled: boolean): Promise<Result<Mod>>;
    /** Reordena la carga; `modIds` en el nuevo orden. */
    reorder(gameId: GameId, modIds: string[]): Promise<Result<Mod[]>>;
    /** Escribe los mods activos al directorio del juego. */
    deploy(gameId: GameId): Promise<Result<{ files: number }>>;
    /** Revierte el despliegue dejando el juego limpio. */
    purge(gameId: GameId): Promise<Result<void>>;
    profiles(gameId: GameId): Promise<Result<ModProfile[]>>;
    saveProfile(profile: ModProfile): Promise<Result<ModProfile>>;
    activateProfile(gameId: GameId, profileId: string): Promise<Result<void>>;
    deleteProfile(gameId: GameId, profileId: string): Promise<Result<void>>;
  };

  settings: {
    get(): Promise<Result<Settings>>;
    set(patch: Partial<Settings>): Promise<Result<Settings>>;
    /** Abre un selector de carpeta nativo. */
    pickFolder(title: string): Promise<Result<string | null>>;
    pickFile(title: string, filters?: { name: string; extensions: string[] }[]): Promise<Result<string | null>>;
    openPath(path: string): Promise<Result<void>>;
  };

  catalog: {
    /** Descarga/refresca `data/games/*.json` desde `settings.catalogSource`. */
    sync(): Promise<Result<{ updated: number; total: number }>>;
    version(): Promise<Result<{ version: string; updatedAt: number }>>;
  };

  app: {
    version(): Promise<Result<string>>;
    checkForUpdates(): Promise<Result<{ available: boolean; version: string | null }>>;
    minimize(): void;
    maximize(): void;
    close(): void;
    openLogs(): Promise<Result<void>>;
  };

  /** Suscripción a eventos push del main. Devuelve la función de baja. */
  on<K extends keyof AtreusEvents>(
    channel: K,
    handler: (payload: AtreusEvents[K]) => void,
  ): () => void;
}

/** Eventos que el main empuja al renderer. */
export interface AtreusEvents {
  'library:scan-progress': ScanProgress;
  'library:updated': Game[];
  'steam:session': SteamSession;
  'trainer:session': TrainerSession;
  'trainer:state': { gameId: GameId; state: CheatState };
  'mods:updated': { gameId: GameId; mods: Mod[] };
  'game:started': { gameId: GameId; pid: number };
  'game:stopped': { gameId: GameId };
  'toast': { level: 'info' | 'success' | 'warn' | 'error'; message: string };
  'update:available': { version: string };
}

/**
 * Nombres de canal derivados de la forma `dominio.metodo`.
 * El main registra `ipcMain.handle(ch, …)` para cada uno.
 */
export const IPC_CHANNELS = [
  'library.list', 'library.scan', 'library.get', 'library.addManual',
  'library.remove', 'library.setFavorite', 'library.launch',

  'steam.open', 'steam.close', 'steam.achievements', 'steam.stats',
  'steam.commit', 'steam.resetAll',

  'trainer.definitions', 'trainer.attach', 'trainer.detach', 'trainer.session',
  'trainer.toggle', 'trainer.setValue', 'trainer.trigger', 'trainer.states',

  'mods.list', 'mods.install', 'mods.uninstall', 'mods.setEnabled',
  'mods.reorder', 'mods.deploy', 'mods.purge', 'mods.profiles',
  'mods.saveProfile', 'mods.activateProfile', 'mods.deleteProfile',

  'settings.get', 'settings.set', 'settings.pickFolder', 'settings.pickFile',
  'settings.openPath',

  'catalog.sync', 'catalog.version',

  'app.version', 'app.checkForUpdates', 'app.openLogs',
] as const;

export type IpcChannel = (typeof IPC_CHANNELS)[number];

export const EVENT_CHANNELS = [
  'library:scan-progress', 'library:updated', 'steam:session',
  'trainer:session', 'trainer:state', 'mods:updated',
  'game:started', 'game:stopped', 'toast', 'update:available',
] as const;

/** Helpers para construir `Result<T>` sin repetir literales. */
export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const err = (error: string, code?: string): Result<never> =>
  ({ ok: false, error, code });
