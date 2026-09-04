import { fork, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type {
  Achievement, AchievementPatch, GameStat, StatPatch, SteamSession, SteamSessionState,
  SteamSnapshot,
} from '@shared/types';
import { log } from '../../logger';
import { globalPercentages } from '../achievements/rarity';
import { paths } from '../../paths';
import { setIconRoot } from '../../protocol';
import { emit } from '../../ipc/emit';
import { findSteamPath } from '../catalog/steam';
import { getSettings } from '../settings';
import { findSteamApiDll, isSteamRunning } from './locator';
import { readSchema, type SchemaStat } from './schema';
import { getSnapshot, listSnapshots, saveSnapshot } from './backups';

const logger = log('steam:session');

// La raíz es fija; cada AppID cuelga de ella en su propia subcarpeta.
setIconRoot(join(paths.cache, 'icons'));

/** Timeout por petición. Steam responde en milisegundos; esto es la red de seguridad. */
const TIMEOUT_MS = 15_000;

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

class Worker {
  readonly appId: string;
  state: SteamSessionState = 'idle';
  /** Falso si Steam rechaza toda escritura de logros en este juego. */
  writable = true;
  error: string | null = null;

  private child: ChildProcess | null = null;
  private pending = new Map<number, Pending>();
  private seq = 0;
  private buffer = '';
  /**
   * true mientras se cierra a propósito.
   *
   * Salir de la vista de Logros antes de que Steam termine de conectar aborta
   * la petición en curso; eso es una cancelación normal, no un fallo, y no debe
   * dejar la sesión en estado de error ni ensuciar el registro.
   */
  private closing = false;
  /** Nombres y tipos de las estadísticas: la API plana no sabe enumerarlas. */
  private schemaStats: SchemaStat[] = [];
  /** Definiciones de logros del esquema local para textos e iconos. */
  private schemaAchievements = new Map<string, { displayName: string; description: string; hidden: boolean; icon?: string; iconGray?: string }>();

  constructor(appId: string) {
    this.appId = appId;
  }

  get session(): SteamSession {
    return { appId: this.appId, state: this.state, error: this.error };
  }

  private setState(state: SteamSessionState, error: string | null = null): void {
    this.state = state;
    this.error = error;
    emit('steam:session', this.session);
  }

  /**
   * Vuelve a reposo sin borrar un diagnóstico.
   *
   * El cierre del proceso hijo y `stop()` llegan justo después de un fallo de
   * conexión; si pusieran `idle` a secas, la interfaz mostraría "sin sesión" en
   * lugar del motivo real.
   */
  private setIdle(): void {
    if (this.state === 'error' || this.state === 'steam-not-running') return;
    this.setState('idle');
  }

  async start(): Promise<SteamSession> {
    if (this.state === 'connected') return this.session;
    this.closing = false;

    if (!isSteamRunning()) {
      this.setState('steam-not-running', 'Steam no está en ejecución. Ábrelo y reintenta.');
      return this.session;
    }

    const dll = findSteamApiDll();
    if (!dll) {
      this.setState('error', 'No se encontró steam_api64.dll en ningún juego instalado.');
      return this.session;
    }

    this.setState('starting');

    // El worker corre como Node dentro del binario de Electron: así koffi usa
    // el mismo ABI que la app y no hace falta un Node aparte.
    //
    // `__dirname` es siempre la carpeta del bundle del main (out/main, o dentro
    // del asar cuando está empaquetado) y el worker se compila justo ahí al lado,
    // así que vale para desarrollo y para producción sin ramificar.
    const script = join(__dirname, 'steam-worker.js');

    this.child = fork(script, [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        SteamAppId: this.appId,
        SteamGameId: this.appId,
        ATREUS_STEAM_DLL: dll.path,
        ATREUS_STEAM_ACCESSOR: dll.accessor,
        ATREUS_STEAM_INITFLAT: dll.hasInitFlat ? '1' : '0',
        ATREUS_STEAM_UTILS: dll.utilsAccessor,
        ATREUS_ICON_DIR: join(paths.cache, 'icons', this.appId),
      },
    });

    this.child.stdout?.setEncoding('utf8');
    this.child.stdout?.on('data', (chunk: string) => this.onData(chunk));
    this.child.stderr?.setEncoding('utf8');
    this.child.stderr?.on('data', (chunk: string) => {
      // Steam escribe avisos por stderr ("Setting breakpad minidump..."); son ruido.
      const text = chunk.trim();
      if (text) logger.debug(`[${this.appId}] ${text}`);
    });

    this.child.on('exit', (code) => {
      this.rejectAll(new Error(`El proceso de Steam terminó (código ${code})`));
      this.child = null;
      this.setIdle();
    });

    try {
      const hello = await this.send<{ writable: boolean }>('connect');
      // Hay juegos cuyos logros solo concede el servidor del editor. Se sabe
      // al conectar, para que la interfaz no ofrezca un botón que no puede
      // cumplir. Ver `probeWritable` en el worker.
      this.writable = hello.writable !== false;
      this.setState('connected');

      const steamPath = findSteamPath(getSettings().steamPath);
      if (steamPath) {
        const schema = readSchema(steamPath, this.appId, getSettings().language === 'es' ? 'spanish' : 'english');
        this.schemaStats = schema.stats;
        this.schemaAchievements.clear();
        for (const ach of schema.achievements) {
          this.schemaAchievements.set(ach.apiName, ach);
        }
      } else {
        this.schemaStats = [];
        this.schemaAchievements.clear();
      }
    } catch (e) {
      if (this.closing) {
        // Cancelado por el usuario al cambiar de vista: ni error ni ruido.
        logger.debug(`[${this.appId}] conexión cancelada`);
        return this.session;
      }
      const message = e instanceof Error ? e.message : String(e);
      logger.error(`[${this.appId}] no se pudo conectar: ${message}`);
      this.setState('error', message);
      this.stop();
    }

    return this.session;
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let index: number;
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (!line.startsWith('{')) continue; // ruido de la DLL de Steam

      try {
        const res = JSON.parse(line) as { id: number; ok: boolean; data?: unknown; error?: string };
        const waiting = this.pending.get(res.id);
        if (!waiting) continue;
        clearTimeout(waiting.timer);
        this.pending.delete(res.id);
        if (res.ok) waiting.resolve(res.data);
        else waiting.reject(new Error(res.error ?? 'error desconocido'));
      } catch {
        // Una línea que no es JSON es salida de la DLL; se ignora.
      }
    }
  }

  private send<T>(method: string, params?: unknown): Promise<T> {
    const child = this.child;
    if (!child?.stdin) return Promise.reject(new Error('El proceso de Steam no está activo'));

    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Steam no respondió a "${method}" en ${TIMEOUT_MS / 1000} s`));
      }, TIMEOUT_MS);

      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      child.stdin!.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  private rejectAll(error: Error): void {
    for (const [, waiting] of this.pending) {
      clearTimeout(waiting.timer);
      waiting.reject(error);
    }
    this.pending.clear();
  }

  async achievements(): Promise<Achievement[]> {
    const raw = await this.send<
      { apiName: string; displayName: string; description: string; hidden: boolean;
        unlocked: boolean; unlockTime: number | null; icon: string | null }[]
    >('achievements');

    const cdn = (hash: string) =>
      `https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/${this.appId}/${hash}`;

    return raw.map(({ icon, ...a }) => {
      const schema = this.schemaAchievements.get(a.apiName);

      /*
       * El PNG que cachea el worker es el del **estado actual** del logro: para
       * uno bloqueado, Steam devuelve su icono apagado. Metiéndolo antes en la
       * ranura de "icono de color", un logro bloqueado enseñaba el gris al
       * activarlo y parecía que no pasaba nada. Cada imagen va a la ranura que
       * de verdad le corresponde, y la otra cara sale del esquema, que sí
       * distingue las dos.
       */
      const cached = icon ? `atreus://icon/${this.appId}/${icon}` : null;
      const iconUrl = (a.unlocked ? cached : null) ?? (schema?.icon ? cdn(schema.icon) : null);
      const iconGrayUrl = (a.unlocked ? null : cached) ?? (schema?.iconGray ? cdn(schema.iconGray) : null);

      return {
        apiName: a.apiName,
        displayName: a.displayName || schema?.displayName || a.apiName,
        description: a.description || schema?.description || '',
        hidden: a.hidden ?? schema?.hidden ?? false,
        unlocked: a.unlocked,
        unlockTime: a.unlockTime,
        iconUrl,
        iconGrayUrl,
        protected: false,
        // Lo rellena el envoltorio exportado, que sí puede ir a la red.
        globalPercent: null,
      };
    });
  }

  async stats(): Promise<GameStat[]> {
    if (this.schemaStats.length === 0) return [];

    const values = await this.send<{ apiName: string; value: number }[]>(
      'stats',
      this.schemaStats.map((s) => ({ apiName: s.apiName, type: s.type })),
    );
    const byName = new Map(values.map((v) => [v.apiName, v.value]));

    return this.schemaStats
      .filter((s) => byName.has(s.apiName))
      .map((s) => ({
        apiName: s.apiName,
        displayName: s.displayName,
        type: s.type,
        value: byName.get(s.apiName)!,
        originalValue: byName.get(s.apiName)!,
        incrementOnly: s.incrementOnly,
        permission: s.permission,
      }));
  }

  async commit(
    achievements: AchievementPatch[],
    stats: StatPatch[],
  ): Promise<{ applied: number; rejected: string[] }> {
    const typeOf = new Map(this.schemaStats.map((s) => [s.apiName, s.type]));
    const result = await this.send<{ applied: number; failed: string[] }>('commit', {
      achievements,
      stats: stats.map((s) => ({ ...s, type: typeOf.get(s.apiName) ?? 'int' })),
    });

    if (result.failed.length > 0) {
      logger.warn(`[${this.appId}] Steam rechazó: ${result.failed.join(', ')}`);
    }
    return { applied: result.applied, rejected: result.failed };
  }

  async resetAll(): Promise<void> {
    await this.send('resetAll');
  }

  stop(): void {
    this.closing = true;
    if (!this.child) return;
    // Se pide el cierre limpio para que llame a SteamAPI_Shutdown; si no
    // contesta enseguida, se mata.
    const child = this.child;
    this.send('close').catch(() => undefined);
    setTimeout(() => { if (!child.killed) child.kill(); }, 1000);
    this.child = null;
    this.rejectAll(new Error('Sesión cerrada'));
    this.setIdle();
  }
}

// ── Registro de sesiones ──────────────────────────────────────
const sessions = new Map<string, Worker>();

function get(appId: string): Worker {
  let worker = sessions.get(appId);
  if (!worker) {
    worker = new Worker(appId);
    sessions.set(appId, worker);
  }
  return worker;
}

export function open(appId: string): Promise<SteamSession> {
  return get(appId).start();
}

export function close(appId: string): void {
  sessions.get(appId)?.stop();
  sessions.delete(appId);
}

export function closeAll(): void {
  for (const [, worker] of sessions) worker.stop();
  sessions.clear();
}

/** Exige una sesión conectada; si no lo está, la arranca. */
async function connected(appId: string): Promise<Worker> {
  const worker = get(appId);
  if (worker.state !== 'connected') {
    const session = await worker.start();
    if (session.state !== 'connected') {
      throw new Error(session.error ?? 'No se pudo conectar con Steam');
    }
  }
  return worker;
}

/**
 * Logros del juego, ya cruzados con su rareza global.
 *
 * La rareza no viene del cliente de Steam sino de una API pública, y se pide en
 * paralelo: si tarda o falla, los logros salen igual con `globalPercent: null`.
 */
export async function achievements(appId: string): Promise<Achievement[]> {
  const [list, percentages] = await Promise.all([
    connected(appId).then((worker) => worker.achievements()),
    globalPercentages(appId),
  ]);
  if (percentages.size === 0) return list;
  return list.map((a) => ({ ...a, globalPercent: percentages.get(a.apiName) ?? null }));
}

export async function stats(appId: string): Promise<GameStat[]> {
  return (await connected(appId)).stats();
}

/** ¿Acepta Steam que Atreus escriba los logros de este juego? */
export async function canWrite(appId: string): Promise<boolean> {
  return (await connected(appId)).writable;
}

/**
 * Guarda cómo estaba el juego **antes** de tocarlo.
 *
 * Es lo que hace que la pestaña de Historial signifique algo: sin esta llamada
 * la carpeta de copias se queda vacía para siempre y "Restaurar" no tiene nada
 * que restaurar. Estuvo así: `saveSnapshot` existía, estaba importada y no la
 * llamaba nadie —lo destapó `noUnusedLocals`, no una prueba—.
 *
 * Se lee del cliente, no de la caché: el estado que hay que poder devolver es
 * el que Steam tiene en este momento, no el que Atreus pintó hace media hora.
 *
 * Un fallo aquí **detiene la escritura**. Escribir logros sin haber podido
 * guardar la vuelta atrás es exactamente lo que la copia existe para evitar.
 */
async function snapshot(worker: Worker, appId: string): Promise<void> {
  const [achievementList, statList] = await Promise.all([worker.achievements(), worker.stats()]);
  saveSnapshot({
    id: randomUUID(),
    appId,
    createdAt: Math.floor(Date.now() / 1000),
    achievements: achievementList,
    stats: statList,
  });
  logger.info(`${appId}: copia de seguridad guardada antes de escribir`);
}

export async function commit(
  appId: string,
  patch: { achievements: AchievementPatch[]; stats: StatPatch[] },
): Promise<{ applied: number; rejected: string[] }> {
  const worker = await connected(appId);
  await snapshot(worker, appId);
  return worker.commit(patch.achievements, patch.stats);
}

export async function resetAll(appId: string): Promise<void> {
  const worker = await connected(appId);
  await snapshot(worker, appId);
  await worker.resetAll();
}

export function backups(appId: string): SteamSnapshot[] {
  return listSnapshots(appId);
}

export async function restore(appId: string, snapshotId: string): Promise<{ applied: number }> {
  const previa = getSnapshot(appId, snapshotId);
  if (!previa) throw new Error('No se encontró la copia de seguridad solicitada');
  const worker = await connected(appId);
  // Restaurar también escribe: sin esta copia, volver de una restauración
  // equivocada al estado de hace un minuto sería imposible.
  await snapshot(worker, appId);
  return worker.commit(
    previa.achievements.filter((a) => !a.protected).map((a) => ({ apiName: a.apiName, unlocked: a.unlocked })),
    previa.stats.filter((s) => !s.incrementOnly).map((s) => ({ apiName: s.apiName, value: s.value })),
  );
}
