import type {
  DerivedResolve, GameId, MemType, ScanCandidate, ScanMode, ScanSession, ScanSummary, ScanState,
} from '@shared/types';
import { log } from '../../logger';
import { emit } from '../../ipc/emit';
import { getGame } from '../catalog';
import { getDefinition } from '../catalog/definitions';
import { checkGame, checkProcess } from './guard';
import {
  findProcessByName, listModules, openProcess, closeProcess,
  readMemory, readableRegions, type ModuleInfo,
} from './win32';
import { readValue, writeValue, encodeValue, TYPE_SIZE } from './memory';

const logger = log('scanner');

/**
 * Buscador de valores en memoria.
 *
 * Es el taller donde salen los cheats: los patrones AoB no se pueden inventar,
 * hay que encontrarlos en el proceso en marcha. El flujo es el clásico —
 * buscar un valor conocido, cambiarlo en el juego, filtrar lo que cambió, y
 * repetir hasta quedarse con una dirección.
 *
 * La primera pasada usa `Buffer.indexOf` sobre los bytes del valor en vez de
 * comparar posición a posición: es memoria nativa buscando un patrón, y la
 * diferencia sobre gigabytes es de minutos a segundos. El precio es que la
 * primera búsqueda tiene que ser de un **valor exacto**; los modos de
 * comparación llegan en las pasadas siguientes, cuando ya quedan pocas
 * direcciones que releer.
 */

/** Tope de candidatos de la primera pasada. Por encima, no sirve de nada. */
const MAX_CANDIDATES = 200_000;
/** Trozos de lectura. */
const CHUNK = 4 * 1024 * 1024;
/** Tope de rutas de puntero que se buscan al derivar. */
const MAX_POINTER_PATHS = 5;

interface Candidate {
  address: bigint;
  previous: number;
}

class Session {
  readonly gameId: GameId;
  state: ScanState = 'idle';
  pid: number | null = null;
  type: MemType = 'i32';
  summary: ScanSummary | null = null;
  error: string | null = null;

  private handle = 0;
  private exeName = '';
  private candidates: Candidate[] = [];
  private truncated = false;
  private pass = 0;

  constructor(gameId: GameId) {
    this.gameId = gameId;
  }

  get session(): ScanSession {
    return {
      gameId: this.gameId,
      state: this.state,
      pid: this.pid,
      type: this.type,
      summary: this.summary,
      error: this.error,
    };
  }

  private setState(state: ScanState, error: string | null = null): void {
    this.state = state;
    this.error = error;
    emit('scanner:session', this.session);
  }

  attach(): ScanSession {
    const game = getGame(this.gameId);
    if (!game) {
      this.setState('error', `Juego no encontrado: ${this.gameId}`);
      return this.session;
    }

    // Las mismas dos barreras que el motor de cheats. Buscar es casi siempre
    // leer, pero `poke` escribe, y no quiero un atajo por la puerta de atrás.
    const verdict = checkGame(game);
    if (!verdict.allowed) {
      this.setState('blocked', verdict.reason);
      return this.session;
    }

    const exe = getDefinition(this.gameId)?.exe;
    if (!exe) {
      this.setState(
        'error',
        'La definición del juego no indica su ejecutable ("exe"), así que no se ' +
        'sabe a qué proceso engancharse.',
      );
      return this.session;
    }
    this.exeName = exe;

    const proc = findProcessByName(exe);
    if (!proc) {
      this.setState('error', `${exe} no está en ejecución`);
      return this.session;
    }

    const procVerdict = checkProcess(proc.pid, game.name);
    if (!procVerdict.allowed) {
      this.setState('blocked', procVerdict.reason);
      return this.session;
    }

    const handle = openProcess(proc.pid);
    if (!handle) {
      this.setState(
        'error',
        `No se pudo abrir ${exe} (pid ${proc.pid}). Prueba a ejecutar Atreus como administrador.`,
      );
      return this.session;
    }

    this.handle = handle;
    this.pid = proc.pid;
    this.reset();
    this.setState('attached');
    logger.info(`buscador enganchado a ${exe} pid=${proc.pid}`);
    return this.session;
  }

  detach(): void {
    if (this.handle) closeProcess(this.handle);
    this.handle = 0;
    this.pid = null;
    this.reset();
    this.setState('idle');
  }

  reset(): void {
    this.candidates = [];
    this.truncated = false;
    this.pass = 0;
    this.summary = null;
  }

  /** Primera pasada: valor exacto por toda la memoria legible. */
  first(type: MemType, value: number): ScanSummary {
    this.requireAttached();
    if (type === 'bytes') throw new Error('La primera búsqueda necesita un tipo numérico');

    this.type = type;
    this.candidates = [];
    this.truncated = false;

    const needle = encodeValue(type, value);
    const size = TYPE_SIZE[type];
    const started = Date.now();
    const regions = readableRegions(this.handle);
    const total = regions.reduce((sum, r) => sum + r.size, 0);
    let scanned = 0;
    let lastEmit = 0;

    this.setState('scanning');

    outer:
    for (const region of regions) {
      let offset = 0;
      while (offset < region.size) {
        const length = Math.min(CHUNK, region.size - offset);
        const buffer = readMemory(this.handle, region.base + BigInt(offset), length);

        if (buffer) {
          let index = buffer.indexOf(needle);
          while (index >= 0) {
            // Los valores del juego están alineados a su tamaño; sin este
            // filtro entran coincidencias a caballo entre dos datos.
            const absolute = region.base + BigInt(offset + index);
            if (absolute % BigInt(size) === 0n) {
              this.candidates.push({ address: absolute, previous: value });
              if (this.candidates.length >= MAX_CANDIDATES) {
                this.truncated = true;
                break outer;
              }
            }
            index = buffer.indexOf(needle, index + 1);
          }
        }

        scanned += length;
        offset += length;

        // Avisar del progreso sin inundar el IPC.
        if (Date.now() - lastEmit > 200) {
          lastEmit = Date.now();
          emit('scanner:progress', {
            gameId: this.gameId, scanned, total, found: this.candidates.length,
          });
        }
      }
    }

    this.pass = 1;
    this.summary = {
      count: this.candidates.length,
      truncated: this.truncated,
      elapsedMs: Date.now() - started,
      pass: this.pass,
    };
    emit('scanner:progress', {
      gameId: this.gameId, scanned: total, total, found: this.candidates.length,
    });
    this.setState('attached');

    logger.info(
      `primera pasada ${type}=${value}: ${this.candidates.length} candidatos ` +
      `en ${this.summary.elapsedMs} ms sobre ${(total / 1024 / 1024).toFixed(0)} MB` +
      `${this.truncated ? ' (recortado)' : ''}`,
    );
    return this.summary;
  }

  /** Pasadas siguientes: se releen los candidatos y se filtran. */
  next(mode: ScanMode, value?: number): ScanSummary {
    this.requireAttached();
    if (this.pass === 0) throw new Error('Haz primero una búsqueda inicial');
    if (mode === 'eq' && typeof value !== 'number') {
      throw new Error('El modo "igual a" necesita un valor');
    }

    const started = Date.now();
    this.setState('scanning');

    const kept: Candidate[] = [];
    for (const candidate of this.candidates) {
      const current = readValue(this.handle, candidate.address, this.type);
      // Una dirección que ya no se puede leer es memoria liberada: se descarta.
      if (typeof current !== 'number') continue;

      const keep =
        mode === 'eq' ? current === value
        : mode === 'changed' ? current !== candidate.previous
        : mode === 'unchanged' ? current === candidate.previous
        : mode === 'increased' ? current > candidate.previous
        : current < candidate.previous;

      if (keep) kept.push({ address: candidate.address, previous: current });
    }

    this.candidates = kept;
    this.pass += 1;
    this.summary = {
      count: kept.length,
      truncated: false,
      elapsedMs: Date.now() - started,
      pass: this.pass,
    };
    this.setState('attached');

    logger.info(`pasada ${this.pass} (${mode}): ${kept.length} candidatos`);
    return this.summary;
  }

  list(limit = 200): ScanCandidate[] {
    this.requireAttached();
    const modules = listModules(this.pid!);

    return this.candidates.slice(0, limit).map((c) => {
      const current = readValue(this.handle, c.address, this.type);
      return {
        address: `0x${c.address.toString(16).toUpperCase()}`,
        value: typeof current === 'number' ? current : c.previous,
        previous: c.previous,
        module: moduleOf(modules, c.address)?.name ?? null,
      };
    });
  }

  poke(address: string, value: number): void {
    this.requireAttached();
    if (!writeValue(this.handle, BigInt(address), this.type, value)) {
      throw new Error(`No se pudo escribir en ${address}`);
    }
  }

  /**
   * Convierte una dirección en algo que sirva en la próxima partida.
   *
   * Una dirección cruda no vale: cambia en cada ejecución. Hay dos salidas
   * estables — que caiga dentro de un módulo (base + desplazamiento fijo), o
   * que algún puntero **dentro de un módulo** apunte a ella.
   */
  derive(address: string): DerivedResolve[] {
    this.requireAttached();
    const target = BigInt(address);
    const modules = listModules(this.pid!);
    const out: DerivedResolve[] = [];

    const owner = moduleOf(modules, target);
    if (owner) {
      const offset = Number(target - owner.base);
      out.push({
        kind: 'static',
        resolve: { kind: 'static', module: owner.name, offset },
        explanation:
          `La dirección cae dentro de ${owner.name}, a +0x${offset.toString(16)} de su base. ` +
          'Es la forma más fiable: aguanta reinicios mientras no se parchee el juego.',
      });
      return out;
    }

    // Está en el heap: se buscan punteros que la apunten.
    const needle = Buffer.alloc(8);
    needle.writeBigUInt64LE(target);

    for (const region of readableRegions(this.handle)) {
      let offset = 0;
      while (offset < region.size && out.length < MAX_POINTER_PATHS) {
        const length = Math.min(CHUNK, region.size - offset);
        const buffer = readMemory(this.handle, region.base + BigInt(offset), length);

        if (buffer) {
          let index = buffer.indexOf(needle);
          while (index >= 0 && out.length < MAX_POINTER_PATHS) {
            const pointerAt = region.base + BigInt(offset + index);
            const holder = moduleOf(modules, pointerAt);
            // Solo sirve si el puntero vive dentro de un módulo: ahí su
            // posición es fija entre ejecuciones.
            if (holder && pointerAt % 8n === 0n) {
              const base = Number(pointerAt - holder.base);
              out.push({
                kind: 'pointer',
                resolve: { kind: 'pointer', module: holder.name, base, offsets: [0] },
                explanation:
                  `Un puntero en ${holder.name}+0x${base.toString(16)} apunta a esta dirección. ` +
                  'Funciona entre partidas siempre que el juego siga guardando el dato ahí.',
              });
            }
            index = buffer.indexOf(needle, index + 1);
          }
        }
        offset += length;
      }
      if (out.length >= MAX_POINTER_PATHS) break;
    }

    if (out.length === 0) {
      throw new Error(
        'No se encontró ninguna ruta estable: la dirección está en el heap y ningún ' +
        'puntero de un módulo apunta a ella. Haría falta una cadena de punteros de ' +
        'más de un nivel, que este buscador todavía no hace.',
      );
    }
    return out;
  }

  private requireAttached(): void {
    if (!this.handle || !this.pid) throw new Error('El buscador no está enganchado a ningún juego');
  }
}

/** Módulo que contiene una dirección, si alguno la contiene. */
function moduleOf(modules: ModuleInfo[], address: bigint): ModuleInfo | null {
  for (const m of modules) {
    if (address >= m.base && address < m.base + BigInt(m.size)) return m;
  }
  return null;
}

// ── Registro de sesiones ──────────────────────────────────────
const sessions = new Map<GameId, Session>();

function get(gameId: GameId): Session {
  let session = sessions.get(gameId);
  if (!session) {
    session = new Session(gameId);
    sessions.set(gameId, session);
  }
  return session;
}

export const attach = (gameId: GameId): ScanSession => get(gameId).attach();
export const detach = (gameId: GameId): void => get(gameId).detach();
export const session = (gameId: GameId): ScanSession | null =>
  sessions.get(gameId)?.session ?? null;
export const first = (gameId: GameId, type: MemType, value: number): ScanSummary =>
  get(gameId).first(type, value);
export const next = (gameId: GameId, mode: ScanMode, value?: number): ScanSummary =>
  get(gameId).next(mode, value);
export const list = (gameId: GameId, limit?: number): ScanCandidate[] =>
  get(gameId).list(limit);
export const poke = (gameId: GameId, address: string, value: number): void =>
  get(gameId).poke(address, value);
export const derive = (gameId: GameId, address: string): DerivedResolve[] =>
  get(gameId).derive(address);
export const reset = (gameId: GameId): void => get(gameId).reset();

/** Suelta todas las sesiones. Se llama al salir de la app. */
export function detachAll(): void {
  for (const [, s] of sessions) s.detach();
  sessions.clear();
}
