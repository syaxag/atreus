/**
 * Proceso satélite de Steam — uno por AppID.
 *
 * Existe porque la API de Steamworks vincula un único AppID al proceso que la
 * inicializa: no se pueden leer los logros de dos juegos desde el mismo proceso.
 * El main lo lanza bajo demanda con `SteamAppId` en el entorno y habla con él por
 * stdin/stdout con mensajes JSON, uno por línea.
 *
 * Usa la API **plana** (`SteamAPI_ISteamUserStats_*`): funciones exportadas
 * normales, sin vtables. Ver `locator.ts` para el porqué.
 */

import koffi from 'koffi';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePng } from './png';

interface Request {
  id: number;
  method: 'connect' | 'achievements' | 'stats' | 'commit' | 'resetAll' | 'close';
  params?: unknown;
}

interface Response {
  id: number;
  ok: boolean;
  data?: unknown;
  error?: string;
}

interface WorkerAchievement {
  apiName: string;
  displayName: string;
  description: string;
  hidden: boolean;
  unlocked: boolean;
  unlockTime: number | null;
  /** Nombre del PNG cacheado, o null si Steam aún no tiene el icono. */
  icon: string | null;
}

interface StatRequest {
  apiName: string;
  type: 'int' | 'float' | 'avgrate';
}

interface CommitParams {
  achievements: { apiName: string; unlocked: boolean }[];
  stats: { apiName: string; value: number; type: 'int' | 'float' | 'avgrate' }[];
}

/** Códigos de `ESteamAPIInitResult`. */
const INIT_RESULT = [
  'OK',
  'Fallo genérico',
  'El cliente de Steam no está corriendo',
  'Versión de la API incompatible',
] as const;

const appId = process.env['SteamAppId'] ?? '';
const dllPath = process.env['ATREUS_STEAM_DLL'] ?? '';
/** Accessor concreto de esta copia de la DLL, p. ej. `SteamAPI_SteamUserStats_v013`. */
const accessor = process.env['ATREUS_STEAM_ACCESSOR'] ?? '';
/** Accessor de ISteamUtils, necesario para convertir los iconos. Puede faltar. */
const utilsAccessor = process.env['ATREUS_STEAM_UTILS'] ?? '';
/** Carpeta donde se cachean los iconos ya convertidos a PNG. */
const iconDir = process.env['ATREUS_ICON_DIR'] ?? '';
/** `InitFlat` da el motivo del fallo; `Init` solo devuelve un booleano. */
const useInitFlat = process.env['ATREUS_STEAM_INITFLAT'] === '1';

// ── Enlaces con la DLL ────────────────────────────────────────
let api: {
  InitFlat: ((err: Buffer) => number) | null;
  Init: (() => boolean) | null;
  Shutdown: () => void;
  RunCallbacks: () => void;
  UserStats: () => unknown;
  GetNumAchievements: (self: unknown) => number;
  GetAchievementName: (self: unknown, i: number) => string;
  GetAchievementAndUnlockTime: (
    self: unknown, name: string, achieved: boolean[], time: number[],
  ) => boolean;
  GetAchievementDisplayAttribute: (self: unknown, name: string, key: string) => string;
  SetAchievement: (self: unknown, name: string) => boolean;
  ClearAchievement: (self: unknown, name: string) => boolean;
  GetStatInt32: (self: unknown, name: string, out: number[]) => boolean;
  GetStatFloat: (self: unknown, name: string, out: number[]) => boolean;
  SetStatInt32: (self: unknown, name: string, value: number) => boolean;
  SetStatFloat: (self: unknown, name: string, value: number) => boolean;
  StoreStats: (self: unknown) => boolean;
  ResetAllStats: (self: unknown, achievementsToo: boolean) => boolean;
  GetAchievementIcon: ((self: unknown, name: string) => number) | null;
  Utils: (() => unknown) | null;
  GetImageSize: ((self: unknown, handle: number, w: number[], h: number[]) => boolean) | null;
  GetImageRGBA: ((self: unknown, handle: number, buf: Buffer, size: number) => boolean) | null;
} | null = null;

let userStats: unknown = null;
let utils: unknown = null;
let pump: NodeJS.Timeout | null = null;

function bind(): void {
  const lib = koffi.load(dllPath);
  const P = 'SteamAPI_ISteamUserStats_';
  api = {
    // Solo una de las dos existe según la versión del SDK con la que se
    // compiló el juego del que sale la DLL. Ver locator.ts.
    InitFlat: useInitFlat ? lib.func('int SteamAPI_InitFlat(_Out_ char *err)') : null,
    Init: useInitFlat ? null : lib.func('bool SteamAPI_Init()'),
    Shutdown: lib.func('void SteamAPI_Shutdown()'),
    RunCallbacks: lib.func('void SteamAPI_RunCallbacks()'),
    UserStats: lib.func(`void* ${accessor}()`),
    GetNumAchievements: lib.func(`uint32 ${P}GetNumAchievements(void *self)`),
    GetAchievementName: lib.func(`const char* ${P}GetAchievementName(void *self, uint32 i)`),
    GetAchievementAndUnlockTime: lib.func(
      `bool ${P}GetAchievementAndUnlockTime(void *self, const char *name, _Out_ bool *a, _Out_ uint32 *t)`,
    ),
    GetAchievementDisplayAttribute: lib.func(
      `const char* ${P}GetAchievementDisplayAttribute(void *self, const char *name, const char *key)`,
    ),
    SetAchievement: lib.func(`bool ${P}SetAchievement(void *self, const char *name)`),
    ClearAchievement: lib.func(`bool ${P}ClearAchievement(void *self, const char *name)`),
    GetStatInt32: lib.func(`bool ${P}GetStatInt32(void *self, const char *name, _Out_ int32 *v)`),
    GetStatFloat: lib.func(`bool ${P}GetStatFloat(void *self, const char *name, _Out_ float *v)`),
    SetStatInt32: lib.func(`bool ${P}SetStatInt32(void *self, const char *name, int32 v)`),
    SetStatFloat: lib.func(`bool ${P}SetStatFloat(void *self, const char *name, float v)`),
    StoreStats: lib.func(`bool ${P}StoreStats(void *self)`),
    ResetAllStats: lib.func(`bool ${P}ResetAllStats(void *self, bool achievementsToo)`),

    // Los iconos son opcionales: si esta copia de la DLL no los expone, la
    // interfaz se queda con su marcador y todo lo demás sigue funcionando.
    GetAchievementIcon: tryBind(() =>
      lib.func(`int ${P}GetAchievementIcon(void *self, const char *name)`)),
    Utils: utilsAccessor ? tryBind(() => lib.func(`void* ${utilsAccessor}()`)) : null,
    GetImageSize: tryBind(() =>
      lib.func('bool SteamAPI_ISteamUtils_GetImageSize(void *self, int image, _Out_ uint32 *w, _Out_ uint32 *h)')),
    GetImageRGBA: tryBind(() =>
      lib.func('bool SteamAPI_ISteamUtils_GetImageRGBA(void *self, int image, _Inout_ uint8 *dest, int size)')),
  };
}

/** Enlaza una función opcional; null si esta DLL no la exporta. */
function tryBind<T>(bind: () => T): T | null {
  try { return bind(); } catch { return null; }
}

function connect(): { appId: string; achievements: number } {
  if (!dllPath) throw new Error('No se encontró steam_api64.dll en ningún juego instalado');
  if (!appId) throw new Error('Falta SteamAppId en el entorno del proceso');

  if (!accessor) throw new Error('Falta el accessor de ISteamUserStats');

  bind();

  if (api!.InitFlat) {
    const err = Buffer.alloc(1024);
    const result = api!.InitFlat(err);
    if (result !== 0) {
      const detail = err.toString('utf8').split('\0')[0];
      const label = INIT_RESULT[result] ?? `código ${result}`;
      throw new Error(detail ? `${label}: ${detail}` : label);
    }
  } else if (!api!.Init!()) {
    // La API antigua no explica el motivo; los dos habituales son que Steam no
    // esté abierto o que la cuenta no tenga el juego.
    throw new Error(
      'SteamAPI_Init falló. Comprueba que Steam está abierto y que tu cuenta ' +
      `tiene el AppID ${appId}.`,
    );
  }

  userStats = api!.UserStats();
  if (!userStats) throw new Error('No se pudo obtener ISteamUserStats');

  utils = api!.Utils ? api!.Utils() : null;
  if (iconDir && !existsSync(iconDir)) mkdirSync(iconDir, { recursive: true });

  // El estado del usuario suele estar en la caché del cliente y llega al
  // instante, pero en una instalación recién hecha puede tardar: se bombean
  // callbacks un momento antes de darlo por vacío.
  const deadline = Date.now() + 3000;
  let count = api!.GetNumAchievements(userStats);
  while (count === 0 && Date.now() < deadline) {
    api!.RunCallbacks();
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40);
    count = api!.GetNumAchievements(userStats);
  }

  // Steam espera que el proceso bombee callbacks mientras esté vivo.
  pump = setInterval(() => {
    try { api?.RunCallbacks(); } catch { /* la sesión se está cerrando */ }
  }, 200);

  return { appId, achievements: count };
}

function readAchievements(): WorkerAchievement[] {
  if (!api || !userStats) throw new Error('Sesión de Steam no iniciada');
  const total = api.GetNumAchievements(userStats);
  const out: WorkerAchievement[] = [];

  for (let i = 0; i < total; i++) {
    const apiName = api.GetAchievementName(userStats, i);
    if (!apiName) continue;

    const achieved = [false];
    const unlockTime = [0];
    api.GetAchievementAndUnlockTime(userStats, apiName, achieved, unlockTime);

    out.push({
      apiName,
      displayName: api.GetAchievementDisplayAttribute(userStats, apiName, 'name') || apiName,
      description: api.GetAchievementDisplayAttribute(userStats, apiName, 'desc') || '',
      hidden: api.GetAchievementDisplayAttribute(userStats, apiName, 'hidden') === '1',
      unlocked: achieved[0] === true,
      unlockTime: achieved[0] && unlockTime[0] ? unlockTime[0]! : null,
      icon: cacheIcon(apiName),
    });
  }
  return out;
}

/**
 * Convierte el icono de un logro a PNG y lo cachea en disco.
 *
 * Steam los da como buffer RGBA en crudo, no como archivo. Devuelve el nombre
 * del PNG, o null si el cliente todavía no ha descargado ese icono — pedirlo
 * dispara la descarga, así que en una segunda visita suele estar.
 */
function cacheIcon(apiName: string): string | null {
  if (!iconDir || !api?.GetAchievementIcon || !utils || !api.GetImageSize || !api.GetImageRGBA) {
    return null;
  }

  // Un nombre de logro puede traer puntos o barras; se sanea para el disco.
  const file = `${apiName.replace(/[^a-zA-Z0-9._-]/g, '_')}.png`;
  const full = join(iconDir, file);
  if (existsSync(full)) return file;

  try {
    const handle = api.GetAchievementIcon(userStats, apiName);
    if (!handle) return null; // aún no descargado

    const width = [0];
    const height = [0];
    if (!api.GetImageSize(utils, handle, width, height)) return null;
    const w = width[0]!;
    const h = height[0]!;
    if (!w || !h) return null;

    const buffer = Buffer.alloc(w * h * 4);
    if (!api.GetImageRGBA(utils, handle, buffer, buffer.length)) return null;

    writeFileSync(full, encodePng(buffer, w, h));
    return file;
  } catch {
    return null; // un icono roto no debe tumbar la lista entera
  }
}

/**
 * Lee los valores de las estadísticas pedidas.
 *
 * La API plana no sabe enumerar estadísticas — solo logros — así que el main
 * manda los nombres y tipos sacados del esquema (`schema.ts`).
 */
function readStats(requested: StatRequest[]): { apiName: string; value: number }[] {
  if (!api || !userStats) throw new Error('Sesión de Steam no iniciada');
  const out: { apiName: string; value: number }[] = [];

  for (const stat of requested) {
    const box = [0];
    const ok =
      stat.type === 'int'
        ? api.GetStatInt32(userStats, stat.apiName, box)
        : api.GetStatFloat(userStats, stat.apiName, box);
    if (ok) out.push({ apiName: stat.apiName, value: box[0]! });
  }
  return out;
}

function commit(params: CommitParams): { applied: number; failed: string[] } {
  if (!api || !userStats) throw new Error('Sesión de Steam no iniciada');
  const failed: string[] = [];
  let applied = 0;

  for (const a of params.achievements) {
    const ok = a.unlocked
      ? api.SetAchievement(userStats, a.apiName)
      : api.ClearAchievement(userStats, a.apiName);
    if (ok) applied++;
    else failed.push(a.apiName);
  }

  for (const s of params.stats) {
    const ok =
      s.type === 'int'
        ? api.SetStatInt32(userStats, s.apiName, Math.trunc(s.value))
        : api.SetStatFloat(userStats, s.apiName, s.value);
    if (ok) applied++;
    else failed.push(s.apiName);
  }

  // Nada llega al servidor hasta StoreStats. Si falla, no se ha guardado nada.
  if (!api.StoreStats(userStats)) {
    throw new Error('StoreStats falló: Steam rechazó los cambios');
  }
  return { applied, failed };
}

function resetAll(): void {
  if (!api || !userStats) throw new Error('Sesión de Steam no iniciada');
  if (!api.ResetAllStats(userStats, true)) throw new Error('ResetAllStats falló');
  if (!api.StoreStats(userStats)) throw new Error('StoreStats falló tras el reinicio');
}

function shutdown(): void {
  if (pump) { clearInterval(pump); pump = null; }
  try { api?.Shutdown(); } catch { /* ya estaba cerrada */ }
  api = null;
  userStats = null;
}

// ── Protocolo por stdin/stdout ────────────────────────────────
function reply(res: Response): void {
  process.stdout.write(`${JSON.stringify(res)}\n`);
}

function dispatch(req: Request): void {
  try {
    switch (req.method) {
      case 'connect':
        reply({ id: req.id, ok: true, data: connect() });
        break;
      case 'achievements':
        reply({ id: req.id, ok: true, data: readAchievements() });
        break;
      case 'stats':
        reply({ id: req.id, ok: true, data: readStats((req.params ?? []) as StatRequest[]) });
        break;
      case 'commit':
        reply({ id: req.id, ok: true, data: commit(req.params as CommitParams) });
        break;
      case 'resetAll':
        resetAll();
        reply({ id: req.id, ok: true });
        break;
      case 'close':
        shutdown();
        reply({ id: req.id, ok: true });
        process.exit(0);
        break;
      default:
        reply({ id: req.id, ok: false, error: `Método desconocido: ${String(req.method)}` });
    }
  } catch (e) {
    reply({ id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => {
  buffer += chunk;
  let index: number;
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    try {
      dispatch(JSON.parse(line) as Request);
    } catch (e) {
      reply({ id: -1, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
});

process.on('exit', shutdown);
