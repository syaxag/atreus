/**
 * Atreus — tipos de dominio compartidos entre main y renderer.
 *
 * La aplicación tiene un único objetivo: llevar un juego al 100 % de logros.
 * Todo lo que no sirva para eso no vive aquí. Ver docs/CONTRACT.md.
 */

// ─────────────────────────── Juegos ───────────────────────────

export type Platform = 'steam' | 'epic' | 'gog' | 'xbox' | 'ea' | 'battlenet' | 'manual';

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
  /**
   * Póster vertical 2:3, servido por `atreus://poster/...`.
   *
   * Es con lo que se pinta la Colección: una parrilla de pósters se lee como
   * una estantería de juegos, y la misma parrilla con banners apaisados se lee
   * como una tabla de miniaturas. `headerUrl` sigue existiendo porque la
   * cabecera de la ficha necesita el apaisado, donde el vertical no cabe.
   * `null` cuando Steam no publica póster de ese juego.
   */
  portraitUrl: string | null;
  sizeBytes: number | null;
  lastPlayed: number | null;
  /**
   * Minutos jugados según la plataforma. En Steam se leen del `localconfig.vdf`
   * de la cuenta local, así que no hace falta clave de API. null = se desconoce.
   */
  playtimeMinutes: number | null;
  /** true si hay `data/games/<id>.json` con datos de catálogo. */
  hasDefinition: boolean;
  /** true si el título es principalmente multijugador. Solo informativo. */
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
  /**
   * Porcentaje de jugadores del mundo que lo tienen (0–100), o null si Steam
   * no lo publica. Es el dato que decide qué logros hacen difícil el platino.
   */
  globalPercent: number | null;
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

/**
 * De dónde sale el estado de desbloqueo de los logros de un juego.
 *
 * - `steam`: del cliente de Steam, con fechas reales. Atreus puede escribirlo.
 * - `manual`: la lista es la del catálogo público de Steam y el progreso lo
 *   marca el usuario, porque su plataforma no lo publica sin iniciar sesión.
 * - `none`: no hay lista de logros que enseñar.
 */
export type AchievementTracking = 'steam' | 'manual' | 'none';

/**
 * De dónde sale un dato, como identificador y no como nombre.
 *
 * Las cinco primeras son fuentes de la lista de logros; las tres últimas, de
 * lo que el informe de platino añade encima. El nombre legible lo pone el
 * renderer: *"Cliente de Steam"* es una frase, y las frases las escribe quien
 * sabe en qué idioma está la interfaz.
 */
export type SourceRef =
  | { id: 'none' }
  | { id: 'steam-client' }
  | { id: 'steam-webapi' }
  | { id: 'steam-catalog'; appId: string }
  | { id: 'xbox-openxbl' }
  | { id: 'steam-rarity' }
  | { id: 'steam-playtime' }
  | { id: 'atreus-sessions' };

/**
 * Por qué el progreso es como es, o por qué falta algo.
 *
 * Viaja como caso y datos, no como párrafo, por lo mismo que `SourceRef`. La
 * excepción es `definition`, que lleva texto a propósito: lo escribió quien
 * hizo la ficha de ese juego y Atreus no tiene con qué traducirlo, igual que
 * no traduce una guía de Steam.
 */
export type Notice =
  | { kind: 'definition'; text: string }
  | { kind: 'noAchievements' }
  | { kind: 'noWrite' }
  | { kind: 'xboxReadOnly' }
  | { kind: 'steamClosed' }
  | { kind: 'noList' }
  /** `detail` es el mensaje del sistema, si lo hubo; no se traduce. */
  | { kind: 'unreadable'; detail: string | null }
  | { kind: 'notOnSteam'; game: string; platform: Platform }
  | { kind: 'manual'; platform: Platform }
  | { kind: 'manualSteamFailed'; detail: string | null }
  | { kind: 'noRarity' };

/** Los logros de un juego, con la verdad sobre de dónde salen. */
export interface AchievementSet {
  gameId: GameId;
  tracking: AchievementTracking;
  /** true si Atreus puede escribir el estado en la plataforma. */
  writable: boolean;
  /** De dónde sale la lista. */
  source: SourceRef;
  /** Por qué el progreso no es automático, cuando no lo es. */
  note: Notice | null;
  items: Achievement[];
}

/**
 * Qué ha pasado al comprobar una clave, sin decirlo con palabras.
 *
 * Los dos casos buenos —`ok` y el perfil o el historial cerrados— vienen con
 * la cuenta y el número de juegos en sus propios campos, así que aquí solo
 * hace falta el caso; la frase la escribe Ajustes.
 */
/**
 * Un aviso que el proceso principal manda por su cuenta.
 *
 * Los avisos del main no nacen de una pulsación: un juego que se abre, el
 * catálogo que se actualiza solo. Viajan como caso y datos por lo mismo que
 * `Notice`; la frase la escribe el renderer al recibirlos.
 */
export type ToastNotice =
  | { kind: 'definitionsReloaded' }
  | { kind: 'gameStarted'; game: string }
  | { kind: 'gameStopped'; game: string; minutes: number }
  | { kind: 'contentReadyOne'; game: string; mods: number; guides: number }
  | { kind: 'contentReadyMany'; games: number }
  | { kind: 'catalogUpdated'; definitions: number }
  | { kind: 'modConflicts'; files: number }
  | { kind: 'updateReady'; version: string };

export type SteamKeyStatus = 'badFormat' | 'noSteamId' | 'rejected' | 'ok' | 'privateProfile';

export type XboxKeyStatus = 'noKey' | 'rejected' | 'ok' | 'emptyHistory';

/** Copia local del estado de Steam justo antes de una escritura. */
export interface SteamSnapshot {
  id: string;
  appId: string;
  createdAt: number;
  achievements: Achievement[];
  stats: GameStat[];
}

// ─────────────────────── Informe de platino ───────────────────────

/**
 * Con qué se compone la frase que explica la estimación.
 *
 * El proceso principal manda **los números, no la frase**. La frase la escribe
 * el renderer, que es el único que sabe en qué idioma está la interfaz: una
 * explicación ya redactada aquí se quedaba en castellano dijera lo que dijera
 * Ajustes, y ninguna traducción del renderer podía tocarla.
 */
export type EstimateReason =
  /** Ya están todos: lo que se enseña es lo que costó. */
  | { kind: 'done' }
  /** Tus horas y tus logros. `costRatio` es cuánto más cuesta lo que falta. */
  | { kind: 'measured'; playedHours: number; unlocked: number; total: number; costRatio: number }
  /** Has jugado poco: el número sale de la rareza, no de tu ritmo. */
  | { kind: 'projected'; playedHours: number }
  /** Ni horas ni logros: solo se puede hablar del juego, no de ti. */
  | { kind: 'community'; tier: DifficultyTier | null };

/** Cuánto queda y a qué ritmo. */
export interface PlatinumEstimate {
  /** Horas totales estimadas para llegar al 100 %. */
  totalHours: number;
  /** Horas que faltan desde donde estás ahora. */
  remainingHours: number;
  /**
   * De dónde sale el número:
   * - `measured`: tus propias horas y tu propio ritmo de logros.
   * - `projected`: tus horas, proyectadas por la rareza de lo que falta.
   * - `community`: solo la rareza global, porque aún no has jugado bastante.
   */
  basis: 'measured' | 'projected' | 'community';
  confidence: 'low' | 'medium' | 'high';
  reason: EstimateReason;
}

/**
 * El tramo de dificultad, no su nombre.
 *
 * Viaja como identificador por lo mismo que `EstimateReason`: *Exigente* es
 * una palabra, y las palabras las pone quien conoce el idioma.
 */
export type DifficultyTier = 'veryEasy' | 'easy' | 'demanding' | 'hard' | 'brutal';

/** Cómo de duro es el platino, en la escala habitual de 1 a 10. */
export interface PlatinumDifficulty {
  score: number;
  tier: DifficultyTier;
  /** % global del logro más raro del juego. */
  rarestPercent: number | null;
  /** Cuántos logros los tiene menos del 5 % de la gente. */
  ultraRare: number;
  /** De cuántos logros publica la plataforma la rareza, y cuántos hay. */
  knownPercents: number;
  total: number;
}

/** Un logro que falta, con su rareza. Son los que deciden el platino. */
export interface RemainingAchievement {
  apiName: string;
  displayName: string;
  description: string;
  iconUrl: string | null;
  globalPercent: number | null;
  hidden: boolean;
}

/** Retrato completo de "cuánto me falta para el platino de este juego". */
export interface PlatinumReport {
  gameId: GameId;
  gameName: string;
  unlocked: number;
  total: number;
  /** 0–100. */
  percent: number;
  /** true cuando hay logros y están todos. */
  complete: boolean;
  /** De dónde sale el progreso: del cliente de Steam o de tus propias marcas. */
  tracking: AchievementTracking;
  /** Minutos jugados totales según la plataforma. */
  playtimeMinutes: number | null;
  /** Minutos que Atreus ha visto el juego abierto desde que se instaló. */
  trackedMinutes: number;
  /** Epoch en segundos del primer y del último logro conseguido. */
  firstUnlockAt: number | null;
  lastUnlockAt: number | null;
  estimate: PlatinumEstimate | null;
  difficulty: PlatinumDifficulty | null;
  /** Los que faltan, del más común al más raro. */
  remaining: RemainingAchievement[];
  /** De dónde salen los datos, para no vender humo. */
  sources: SourceRef[];
  /** Motivo por el que falta algo, si falta. */
  warning: Notice | null;
  /** Cuándo se calculó, en segundos, como todas las fechas del contrato. */
  updatedAt: number;
}

/** Fila del ranking de la Biblioteca: lo justo para ordenar y filtrar. */
export interface PlatinumSummary {
  gameId: GameId;
  tracking: AchievementTracking;
  unlocked: number;
  total: number;
  percent: number;
  complete: boolean;
  playtimeMinutes: number | null;
  /** En segundos; null mientras no se haya calculado nunca. */
  updatedAt: number | null;
}

// ─────────────────────────── Guías ───────────────────────────

export type GuideCategory = 'platinum' | 'achievements' | 'collectibles' | 'walkthrough' | 'bosses';

/** Quién publica la guía. Decide si Atreus sabe leer su texto entero. */
export type GuideProvider = 'steam' | 'wiki' | 'web';

/**
 * De dónde sale una guía.
 *
 * `web` lleva el dominio porque es un dato de fuera; los otros dos son
 * nuestros y se nombran en el idioma de la interfaz, no aquí.
 */
export type GuideSource =
  | { kind: 'steam' }
  | { kind: 'wiki'; site: string }
  | { kind: 'web'; domain: string };

export interface GuideEntry {
  /** Clave estable dentro de su proveedor. */
  id: string;
  title: string;
  snippet: string;
  url: string;
  source: GuideSource;
  provider: GuideProvider;
  author: string | null;
  /** Valoración de la comunidad, cuando la fuente la publica. */
  rating: number | null;
  /** Código de idioma detectado: 'es', 'en' u 'otro'. */
  language: string;
  /** true si Atreus sabe extraer el texto completo, no solo un extracto. */
  readable: boolean;
}

export interface GuideSection {
  heading: string;
  body: string;
  /** Imágenes de la propia guía, en su orden. */
  images: string[];
}

export interface GuideDocument {
  /** Vacío cuando la fuente no publicó ninguno; el título lo pone la vista. */
  title: string;
  url: string;
  source: GuideSource;
  provider: GuideProvider;
  author: string | null;
  summary: string;
  sections: GuideSection[];
  /** true cuando la fuente solo dejó sacar un extracto. */
  partial: boolean;
  fetchedAt: number;
}

// ─────────────────────── Mapas interactivos ───────────────────────

/**
 * Un mapa interactivo real, que se abre dentro de Atreus.
 *
 * No se replica el mapa: se abre la web del proveedor en una pestaña integrada,
 * con sus marcadores, sus filtros y su progreso.
 */
/**
 * Cómo se llama un mapa y qué se dice de él.
 *
 * Las dos van como caso y datos por lo de siempre: *"mapa interactivo"* es una
 * frase. `catalog` y `text` llevan texto tal cual porque lo escribió quien
 * hizo la ficha del juego, o es el extracto de la wiki.
 */
export type MapLabel =
  | { kind: 'catalog'; title: string }
  | { kind: 'mapgenie'; game: string }
  | { kind: 'page'; game: string; page: string };

export type MapBlurb =
  | { kind: 'text'; text: string }
  | { kind: 'mapgenie' }
  | { kind: 'fandom' }
  | { kind: 'wikiPage' };

export interface InteractiveMap {
  id: string;
  label: MapLabel;
  blurb: MapBlurb;
  url: string;
  /** El sitio del que sale: "MapGenie", el host de la wiki… null si es del catálogo. */
  provider: string | null;
  /** true si lo añadiste tú y por tanto se puede quitar. */
  removable?: boolean;
}

/**
 * Contenido que Atreus ha comprobado para una tarjeta de la Colección.
 *
 * No es una etiqueta del catálogo: los contadores salen de las mismas fuentes
 * que abren las vistas de guías, mapas y mods. `updatedAt` permite que la UI
 * deje claro que es una comprobación reciente, no una promesa genérica.
 */
export interface ContentAvailability {
  gameId: GameId;
  guides: number;
  readableGuides: number;
  maps: number;
  mods: number;
  /** Cuándo se comprobó este juego, en segundos. */
  updatedAt: number;
}

/** Lista de progreso local: no modifica logros ni partidas del juego. */
export type CompletionItemKind = 'achievement' | 'collectible' | 'mission' | 'boss' | 'note';

export interface CompletionItem {
  id: string;
  label: string;
  kind: CompletionItemKind;
  done: boolean;
}

/** Checklist y notas que Atreus conserva por juego entre actualizaciones. */
export interface CompletionProgress {
  gameId: GameId;
  updatedAt: number;
  items: CompletionItem[];
  notes: string;
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

/** Vista de solo lectura antes de escribir un perfil de mods en el juego. */
export interface ModDeployPreview {
  root: string;
  activeMods: string[];
  files: {
    path: string;
    modId: string;
    modName: string;
    /** El destino existe ahora; Atreus lo respalda antes de cambiarlo. */
    currentlyExists: boolean;
  }[];
  /** Dos mods activos escriben la misma ruta; gana el último del orden. */
  conflicts: { path: string; mods: string[] }[];
}

/** Un mod disponible en un catálogo público, todavía no instalado. */
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
   * "cheat" si el catálogo lo publica como mod pero funciona como truco:
   * menús de mods, modos debug. Atreus ya no incluye motor de cheats, pero sí
   * dice de qué tipo es cada cosa antes de instalarla.
   */
  kind: 'mod' | 'cheat';
  /**
   * true si la URL de descarga aún no se conoce y hay que pedirla al instalar.
   *
   * GameBanana no la da en el listado; pedirla para los 148 mods de un juego
   * serían 148 peticiones, así que se resuelve solo la del que se instala.
   */
  deferred: boolean;
  /** false cuando el proveedor (Steam Workshop) conserva la instalación. */
  installable?: boolean;
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
  /** Clave de la Steam Web API. Opcional: enriquece, no hace falta. */
  steamWebApiKey: string | null;
  /**
   * Clave de OpenXBL, para leer tus logros de Xbox.
   *
   * Xbox Live no se consulta sin autenticarse. La clave la generas tú entrando
   * con tu cuenta de Microsoft en xbl.io; Atreus solo maneja la clave y nunca
   * ve tu contraseña. Sin ella los juegos de Xbox usan la lista del catálogo
   * público de Steam con el progreso que marques a mano.
   */
  xboxApiKey: string | null;
  scanOnStart: boolean;
  minimizeToTray: boolean;
  /** Origen del catálogo de definiciones: carpeta local o URL de repo. */
  catalogSource: string;
  /** Sincroniza el catálogo remoto al arrancar y después cada seis horas. */
  autoSyncCatalog: boolean;
  /** Carpeta HTTPS que contiene latest.yml y los instaladores. */
  updateSource: string;
  /** Busca nuevas versiones de Atreus al arrancar. */
  checkForAppUpdates: boolean;
  /** Descarga en segundo plano las actualizaciones encontradas. */
  autoDownloadUpdates: boolean;
  /**
   * El usuario ya leyó y aceptó el aviso sobre desbloquear logros a mano.
   *
   * Se guarda para no repetirlo en cada juego, pero se puede volver a activar
   * desde Ajustes. Mientras sea false, Logros no deja guardar nada.
   */
  achievementRiskAccepted: boolean;
  /** Suena la recompensa al conseguir un platino. */
  celebrationSound: boolean;
  language: 'es' | 'en';
}

// ──────────────────── Resultado uniforme ────────────────────

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

export interface ScanProgress {
  /**
   * En qué va el escaneo. Antes venía además un `message` con el rótulo ya
   * escrito —"Leyendo bibliotecas de Steam…"—, y la fase ya lo decía todo:
   * el rótulo lo pone la Colección, que sabe en qué idioma está.
   */
  phase: 'steam' | 'epic' | 'gog' | 'xbox' | 'ea' | 'battlenet' | 'enrich' | 'done';
  found: number;
}
