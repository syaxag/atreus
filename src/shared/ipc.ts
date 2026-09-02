/**
 * Atreus — contrato IPC entre el proceso main y el renderer.
 *
 * Todo devuelve `Result<T>`: ningún handler lanza a través del puente.
 * Ver docs/CONTRACT.md.
 */

import type {
  Achievement, AchievementPatch, AchievementSet, CompletionProgress, Game, GameId, GameStat,
  GuideCategory, GuideDocument, GuideEntry, InteractiveMap, Mod,
  ModProfile, PlatinumReport, PlatinumSummary, RemoteMod, Result, ScanProgress,
  Settings, StatPatch, SteamSession, SteamSnapshot,
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
    backups(appId: string): Promise<Result<SteamSnapshot[]>>;
    restore(appId: string, snapshotId: string): Promise<Result<{ applied: number }>>;
    /** Restablece TODOS los logros y stats del juego. Destructivo. */
    resetAll(appId: string): Promise<Result<void>>;
    /**
     * Comprueba la clave de la Web API contra Steam y explica qué pasa.
     * Una clave mal pegada o un perfil privado fallan en silencio; esto lo dice.
     */
    checkKey(): Promise<Result<{ ok: boolean; persona: string | null; publicProfile: boolean; message: string }>>;
  };

  /**
   * Logros de cualquier juego, de la tienda que sea.
   *
   * En Steam el estado sale del cliente y se puede escribir. En Epic, EA, Xbox
   * o GOG la lista sale del catálogo público de Steam y el progreso lo marca el
   * usuario: ninguna de esas plataformas lo publica sin iniciar sesión.
   */
  achievements: {
    list(gameId: GameId): Promise<Result<AchievementSet>>;
    /** Marca logros en el registro manual. Falla si la plataforma los da sola. */
    mark(gameId: GameId, patches: AchievementPatch[]): Promise<Result<AchievementSet>>;
  };

  /**
   * El corazón de la aplicación: cuánto falta para el platino de un juego.
   *
   * Junta los logros de Steam, la rareza global de cada uno, las horas jugadas
   * de la cuenta local y el tiempo que Atreus ha visto el juego abierto.
   */
  platinum: {
    /** Informe completo. `refresh` fuerza a ignorar la caché de 30 minutos. */
    report(gameId: GameId, refresh?: boolean): Promise<Result<PlatinumReport>>;
    /** Resumen de toda la biblioteca, para ordenar y filtrar. Usa caché. */
    summaries(): Promise<Result<PlatinumSummary[]>>;
  };

  guides: {
    /**
     * Guías del juego, ya buscadas por Atreus: no hay que teclear nada.
     * Devuelve primero las que se pueden leer enteras dentro de la aplicación.
     */
    list(gameId: GameId, category: GuideCategory, query?: string): Promise<Result<GuideEntry[]>>;
    /** Texto completo de una guía, en secciones. */
    read(entry: GuideEntry): Promise<Result<GuideDocument>>;
  };

  maps: {
    /** Mapas interactivos disponibles para el juego, buscados automáticamente. */
    list(gameId: GameId): Promise<Result<InteractiveMap[]>>;
    /** Guarda un mapa a mano en la ficha del juego, para lo que no se encuentra solo. */
    add(gameId: GameId, input: { title: string; url: string }): Promise<Result<InteractiveMap[]>>;
    /** Quita uno de los añadidos a mano. */
    remove(gameId: GameId, mapId: string): Promise<Result<InteractiveMap[]>>;
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
    /** Catálogo público del juego. Falla si no declara proveedor. */
    discover(gameId: GameId): Promise<Result<RemoteMod[]>>;
    installRemote(gameId: GameId, mod: RemoteMod): Promise<Result<Mod>>;
  };

  progress: {
    get(gameId: GameId): Promise<Result<CompletionProgress>>;
    save(progress: CompletionProgress): Promise<Result<CompletionProgress>>;
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
    downloadUpdate(): Promise<Result<void>>;
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
  /** El cálculo en segundo plano ha rellenado un juego más de la biblioteca. */
  'platinum:summaries': PlatinumSummary[];
  'steam:session': SteamSession;
  'mods:updated': { gameId: GameId; mods: Mod[] };
  /** Juegos nuevos detectados en un escaneo, con cuántos mods hay para ellos. */
  'mods:available': { games: { gameId: GameId; name: string; count: number }[] };
  'game:started': { gameId: GameId; pid: number };
  /** Al cerrarse, se informa de cuántos minutos duró la sesión. */
  'game:stopped': { gameId: GameId; minutes: number };
  'toast': { level: 'info' | 'success' | 'warn' | 'error'; message: string };
  'update:available': { version: string };
  'update:progress': { percent: number; bytesPerSecond: number; transferred: number; total: number };
  'update:downloaded': { version: string };
}

/**
 * Nombres de canal derivados de la forma `dominio.metodo`.
 * El main registra `ipcMain.handle(ch, …)` para cada uno.
 */
export const IPC_CHANNELS = [
  'library.list', 'library.scan', 'library.get', 'library.addManual',
  'library.remove', 'library.setFavorite', 'library.launch',

  'steam.open', 'steam.close', 'steam.achievements', 'steam.stats',
  'steam.commit', 'steam.backups', 'steam.restore', 'steam.resetAll', 'steam.checkKey',

  'achievements.list', 'achievements.mark',

  'platinum.report', 'platinum.summaries',

  'guides.list', 'guides.read',
  'maps.list', 'maps.add', 'maps.remove',

  'mods.list', 'mods.install', 'mods.uninstall', 'mods.setEnabled',
  'mods.reorder', 'mods.deploy', 'mods.purge', 'mods.profiles',
  'mods.saveProfile', 'mods.activateProfile', 'mods.deleteProfile',
  'mods.discover', 'mods.installRemote',

  'progress.get', 'progress.save',

  'settings.get', 'settings.set', 'settings.pickFolder', 'settings.pickFile',
  'settings.openPath',

  'catalog.sync', 'catalog.version',

  'app.version', 'app.checkForUpdates', 'app.downloadUpdate', 'app.openLogs',
] as const;

export type IpcChannel = (typeof IPC_CHANNELS)[number];

export const EVENT_CHANNELS = [
  'library:scan-progress', 'library:updated', 'platinum:summaries', 'steam:session',
  'mods:updated', 'mods:available',
  'game:started', 'game:stopped', 'toast', 'update:available',
  'update:progress', 'update:downloaded', 'license:updated',
] as const;

/** Helpers para construir `Result<T>` sin repetir literales. */
export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const err = (error: string, code?: string): Result<never> =>
  ({ ok: false, error, code });
