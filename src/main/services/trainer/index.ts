import { globalShortcut } from 'electron';
import type { CheatDef, CheatState, GameId, TrainerSession } from '@shared/types';
import { log } from '../../logger';
import { emit } from '../../ipc/emit';
import { getGame } from '../catalog';
import { getDefinition } from '../catalog/definitions';
import { getSettings } from '../settings';
import { checkGame, checkProcess } from './guard';
import { findProcessByName, findModule, openProcess, closeProcess, listProcesses } from './win32';
import { resolveAddress } from './resolve';
import { readValue, writeValue, parseHexBytes } from './memory';
import { writeMemory } from './win32';

const logger = log('trainer');

/** Cada cuánto se reescriben los valores congelados. */
const FREEZE_INTERVAL_MS = 60;
/** Cada cuánto se comprueba que el juego sigue vivo. */
const WATCH_INTERVAL_MS = 1500;

interface Active {
  def: CheatDef;
  address: bigint;
  state: CheatState;
}

class Session {
  readonly gameId: GameId;
  state: TrainerSession['state'] = 'detached';
  pid: number | null = null;
  moduleBase: string | null = null;
  error: string | null = null;

  private handle = 0;
  private exeName = '';
  private defs: CheatDef[] = [];
  private active = new Map<string, Active>();
  private freezeTimer: NodeJS.Timeout | null = null;
  private watchTimer: NodeJS.Timeout | null = null;
  private hotkeys: string[] = [];

  constructor(gameId: GameId) {
    this.gameId = gameId;
  }

  get session(): TrainerSession {
    return {
      gameId: this.gameId,
      state: this.state,
      pid: this.pid,
      moduleBase: this.moduleBase,
      error: this.error,
    };
  }

  private setState(state: TrainerSession['state'], error: string | null = null): void {
    this.state = state;
    this.error = error;
    emit('trainer:session', this.session);
  }

  definitions(): CheatDef[] {
    if (this.defs.length === 0) {
      this.defs = getDefinition(this.gameId)?.cheats ?? [];
    }
    return this.defs;
  }

  attach(): TrainerSession {
    const game = getGame(this.gameId);
    if (!game) {
      this.setState('error', `Juego no encontrado: ${this.gameId}`);
      return this.session;
    }

    // Barrera 1: el juego. Antes de tocar ningún proceso.
    const gameVerdict = checkGame(game);
    if (!gameVerdict.allowed) {
      this.setState('blocked', gameVerdict.reason);
      return this.session;
    }

    const def = getDefinition(this.gameId);
    this.defs = def?.cheats ?? [];
    if (this.defs.length === 0) {
      this.setState('error', 'Este juego no tiene definición de cheats');
      return this.session;
    }

    this.exeName = def?.exe ?? '';
    if (!this.exeName) {
      this.setState('error', 'La definición no indica el ejecutable ("exe")');
      return this.session;
    }

    this.setState('searching');
    const proc = findProcessByName(this.exeName);
    if (!proc) {
      this.setState('detached', `${this.exeName} no está en ejecución`);
      return this.session;
    }

    // Barrera 2: el proceso. Aunque el juego no esté en la lista.
    const procVerdict = checkProcess(proc.pid, game.name);
    if (!procVerdict.allowed) {
      this.setState('blocked', procVerdict.reason);
      return this.session;
    }

    const handle = openProcess(proc.pid);
    if (!handle) {
      this.setState(
        'error',
        `No se pudo abrir ${this.exeName} (pid ${proc.pid}). ` +
        'Prueba a ejecutar Atreus como administrador.',
      );
      return this.session;
    }

    this.handle = handle;
    this.pid = proc.pid;
    const module = findModule(proc.pid, this.exeName);
    this.moduleBase = module ? `0x${module.base.toString(16).toUpperCase()}` : null;

    this.startWatch();
    this.startFreeze();
    this.registerHotkeys();
    this.setState('attached');
    logger.info(`enganchado a ${this.exeName} pid=${proc.pid} base=${this.moduleBase}`);
    return this.session;
  }

  detach(): void {
    this.stopTimers();
    this.unregisterHotkeys();

    // Restaurar los parches de código antes de soltar el proceso: dejar un juego
    // con bytes modificados es peor que no haberlo tocado.
    for (const [, entry] of this.active) {
      if (entry.state.enabled) this.applyOff(entry);
    }
    this.active.clear();

    if (this.handle) closeProcess(this.handle);
    this.handle = 0;
    this.pid = null;
    this.moduleBase = null;
    this.setState('detached');
  }

  private startWatch(): void {
    this.watchTimer = setInterval(() => {
      if (!this.pid) return;
      const alive = listProcesses().some((p) => p.pid === this.pid);
      if (!alive) {
        logger.info(`${this.exeName} se cerró; soltando la sesión`);
        this.stopTimers();
        this.unregisterHotkeys();
        this.active.clear();
        if (this.handle) closeProcess(this.handle);
        this.handle = 0;
        this.pid = null;
        this.moduleBase = null;
        this.setState('detached', 'El juego se cerró');
      }
    }, WATCH_INTERVAL_MS);
  }

  private startFreeze(): void {
    this.freezeTimer = setInterval(() => {
      for (const [, entry] of this.active) {
        if (!entry.state.enabled || !entry.def.write.freeze) continue;
        const value = entry.state.value ?? entry.def.write.value ?? 0;
        writeValue(this.handle, entry.address, entry.def.write.type, value);
      }
    }, FREEZE_INTERVAL_MS);
  }

  private stopTimers(): void {
    if (this.freezeTimer) { clearInterval(this.freezeTimer); this.freezeTimer = null; }
    if (this.watchTimer) { clearInterval(this.watchTimer); this.watchTimer = null; }
  }

  private registerHotkeys(): void {
    if (!getSettings().hotkeysEnabled) return;
    for (const def of this.defs) {
      if (!def.hotkey) continue;
      try {
        const ok = globalShortcut.register(def.hotkey, () => {
          if (def.type === 'button') void this.trigger(def.id);
          else this.toggle(def.id, !this.stateOf(def.id).enabled);
        });
        if (ok) this.hotkeys.push(def.hotkey);
        else logger.warn(`hotkey ocupada por otra app: ${def.hotkey}`);
      } catch (e) {
        logger.warn(`hotkey inválida "${def.hotkey}":`, e);
      }
    }
  }

  private unregisterHotkeys(): void {
    for (const key of this.hotkeys) globalShortcut.unregister(key);
    this.hotkeys = [];
  }

  stateOf(cheatId: string): CheatState {
    const entry = this.active.get(cheatId);
    if (entry) return entry.state;
    return { id: cheatId, enabled: false, value: null, resolved: null, error: null };
  }

  states(): CheatState[] {
    return this.definitions().map((d) => this.stateOf(d.id));
  }

  /** Resuelve la dirección de un cheat, cacheando el resultado en la sesión. */
  private entryFor(cheatId: string): Active | { error: string } {
    const cached = this.active.get(cheatId);
    if (cached) return cached;

    const def = this.definitions().find((d) => d.id === cheatId);
    if (!def) return { error: `Cheat desconocido: ${cheatId}` };
    if (!this.handle || !this.pid) return { error: 'Sin enganchar al juego' };

    const { address, error } = resolveAddress(this.handle, this.pid, def.resolve);
    if (address === null) {
      const state: CheatState = {
        id: cheatId, enabled: false, value: null, resolved: false,
        error: error ?? 'No se pudo resolver la dirección',
      };
      emit('trainer:state', { gameId: this.gameId, state });
      return { error: state.error! };
    }

    const entry: Active = {
      def,
      address,
      state: {
        id: cheatId,
        enabled: false,
        value: def.type === 'value'
          ? (readValue(this.handle, address, def.write.type) as number | null)
          : null,
        resolved: true,
        error: null,
      },
    };
    this.active.set(cheatId, entry);
    return entry;
  }

  toggle(cheatId: string, enabled: boolean): CheatState {
    const entry = this.entryFor(cheatId);
    if ('error' in entry) return this.stateOf(cheatId);

    entry.state.enabled = enabled;
    if (enabled) this.applyOn(entry);
    else this.applyOff(entry);

    emit('trainer:state', { gameId: this.gameId, state: { ...entry.state } });
    return { ...entry.state };
  }

  setValue(cheatId: string, value: number): CheatState {
    const entry = this.entryFor(cheatId);
    if ('error' in entry) return this.stateOf(cheatId);

    entry.state.value = value;
    entry.state.enabled = true;
    writeValue(this.handle, entry.address, entry.def.write.type, value);

    emit('trainer:state', { gameId: this.gameId, state: { ...entry.state } });
    return { ...entry.state };
  }

  trigger(cheatId: string): void {
    const entry = this.entryFor(cheatId);
    if ('error' in entry) return;
    this.applyOn(entry);
  }

  private applyOn(entry: Active): void {
    const { write } = entry.def;
    const value = entry.state.value ?? write.value ?? 0;
    writeValue(this.handle, entry.address, write.type, value);
  }

  /**
   * Desactiva un cheat. Si la definición trae `restore`, se reponen los bytes
   * originales; es lo que hace reversible un parche de código (un `nop`).
   */
  private applyOff(entry: Active): void {
    const { write } = entry.def;
    if (!write.restore) return;
    try {
      writeMemory(this.handle, entry.address, parseHexBytes(write.restore));
    } catch (e) {
      logger.warn(`no se pudieron restaurar los bytes de ${entry.def.id}:`, e);
    }
  }
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

export function definitions(gameId: GameId): CheatDef[] {
  return get(gameId).definitions();
}

export function attach(gameId: GameId): TrainerSession {
  return get(gameId).attach();
}

export function detach(gameId: GameId): void {
  sessions.get(gameId)?.detach();
}

export function session(gameId: GameId): TrainerSession | null {
  const found = sessions.get(gameId);
  return found ? found.session : null;
}

export function toggle(gameId: GameId, cheatId: string, enabled: boolean): CheatState {
  return get(gameId).toggle(cheatId, enabled);
}

export function setValue(gameId: GameId, cheatId: string, value: number): CheatState {
  return get(gameId).setValue(cheatId, value);
}

export function trigger(gameId: GameId, cheatId: string): void {
  get(gameId).trigger(cheatId);
}

export function states(gameId: GameId): CheatState[] {
  return get(gameId).states();
}

/** Suelta todas las sesiones. Se llama al salir de la app. */
export function detachAll(): void {
  for (const [, s] of sessions) s.detach();
  sessions.clear();
  globalShortcut.unregisterAll();
}
