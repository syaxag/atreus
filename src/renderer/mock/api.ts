import type { AtreusApi, AtreusEvents } from '@shared/ipc';
import { ok, err } from '@shared/ipc';
import type {
  Achievement, CheatState, Game, GameStat, Mod, ModProfile, Settings, TrainerSession,
} from '@shared/types';
import {
  MOCK_ACHIEVEMENTS, MOCK_CHEATS, MOCK_GAMES, MOCK_MODS, MOCK_PROFILES, MOCK_STATS,
} from './data';

/**
 * Backend falso. Se activa con VITE_MOCK=1 (`npm run dev:mock`).
 * Permite construir toda la interfaz sin Steam ni juegos abiertos.
 */

/** Latencia simulada para que los estados de carga se vean de verdad. */
const wait = (min = 150, max = 400) =>
  new Promise<void>((r) => setTimeout(r, min + Math.random() * (max - min)));

// Estado mutable en memoria: los cambios persisten mientras dure la sesión.
let games: Game[] = structuredClone(MOCK_GAMES);
let achievements: Achievement[] = structuredClone(MOCK_ACHIEVEMENTS);
let stats: GameStat[] = structuredClone(MOCK_STATS);
let mods: Mod[] = structuredClone(MOCK_MODS);
let profiles: ModProfile[] = structuredClone(MOCK_PROFILES);
const cheatStates = new Map<string, CheatState>();
const sessions = new Map<string, TrainerSession>();

let settings: Settings = {
  theme: 'dark',
  accent: '#8b5cf6',
  steamPath: 'C:\\Program Files (x86)\\Steam',
  steamWebApiKey: null,
  scanOnStart: true,
  minimizeToTray: true,
  hotkeysEnabled: true,
  catalogSource: '',
  confirmBeforeCheats: true,
  language: 'es',
};

// ── Bus de eventos local ──────────────────────────────────────
type Handler = (payload: never) => void;
const listeners = new Map<string, Set<Handler>>();

function emit<K extends keyof AtreusEvents>(channel: K, payload: AtreusEvents[K]): void {
  for (const h of listeners.get(channel) ?? []) (h as (p: AtreusEvents[K]) => void)(payload);
}

function stateOf(gameId: string, cheatId: string): CheatState {
  const key = `${gameId}|${cheatId}`;
  let s = cheatStates.get(key);
  if (!s) {
    s = { id: cheatId, enabled: false, value: null, resolved: null, error: null };
    cheatStates.set(key, s);
  }
  return s;
}

export const mockApi: AtreusApi = {
  library: {
    async list() { await wait(); return ok(games); },

    async scan() {
      const phases = [
        { phase: 'steam', message: 'Leyendo bibliotecas de Steam…' },
        { phase: 'epic', message: 'Buscando manifiestos de Epic…' },
        { phase: 'gog', message: 'Consultando el registro de GOG…' },
        { phase: 'xbox', message: 'Enumerando paquetes de Xbox…' },
        { phase: 'enrich', message: 'Descargando carátulas…' },
      ] as const;
      for (const [i, p] of phases.entries()) {
        await wait(220, 480);
        emit('library:scan-progress', {
          phase: p.phase,
          found: Math.round(((i + 1) / phases.length) * games.length),
          message: p.message,
        });
      }
      emit('library:scan-progress', { phase: 'done', found: games.length, message: 'Listo' });
      emit('library:updated', games);
      return ok(games);
    },

    async get(id) {
      await wait(80, 160);
      const g = games.find((x) => x.id === id);
      return g ? ok(g) : err(`Juego no encontrado: ${id}`, 'NOT_FOUND');
    },

    async addManual(exePath) {
      await wait();
      const name = exePath.split(/[\\/]/).pop()?.replace(/\.exe$/i, '') ?? 'Juego';
      const g: Game = {
        id: `manual:${Date.now().toString(36)}`,
        platform: 'manual', nativeId: name, name,
        installDir: exePath.replace(/[\\/][^\\/]+$/, ''), exePath,
        iconUrl: null, headerUrl: null, sizeBytes: null, lastPlayed: null,
        hasDefinition: false, multiplayer: false, favorite: false,
      };
      games = [...games, g];
      emit('library:updated', games);
      return ok(g);
    },

    async remove(id) {
      await wait(80, 160);
      games = games.filter((g) => g.id !== id);
      emit('library:updated', games);
      return ok(undefined);
    },

    async setFavorite(id, favorite) {
      await wait(40, 90);
      games = games.map((g) => (g.id === id ? { ...g, favorite } : g));
      emit('library:updated', games);
      return ok(undefined);
    },

    async launch(id) {
      await wait();
      const pid = 1000 + Math.floor(Math.random() * 60000);
      emit('game:started', { gameId: id, pid });
      return ok({ pid });
    },
  },

  steam: {
    async open(appId) {
      emit('steam:session', { appId, state: 'starting', error: null });
      await wait(400, 900);
      const session = { appId, state: 'connected' as const, error: null };
      emit('steam:session', session);
      return ok(session);
    },
    async close(appId) {
      await wait(60, 120);
      emit('steam:session', { appId, state: 'idle', error: null });
      return ok(undefined);
    },
    async achievements() { await wait(300, 700); return ok(achievements); },
    async stats() { await wait(200, 500); return ok(stats); },

    async commit(_appId, patch) {
      await wait(400, 800);
      const at = Math.floor(Date.now() / 1000);
      achievements = achievements.map((a) => {
        const p = patch.achievements.find((x) => x.apiName === a.apiName);
        if (!p) return a;
        return { ...a, unlocked: p.unlocked, unlockTime: p.unlocked ? (a.unlockTime ?? at) : null };
      });
      stats = stats.map((s) => {
        const p = patch.stats.find((x) => x.apiName === s.apiName);
        return p ? { ...s, value: p.value, originalValue: p.value } : s;
      });
      const applied = patch.achievements.length + patch.stats.length;
      emit('toast', { level: 'success', message: `${applied} cambios guardados en Steam` });
      return ok({ applied });
    },

    async resetAll() {
      await wait(500, 900);
      achievements = achievements.map((a) => ({ ...a, unlocked: false, unlockTime: null }));
      stats = stats.map((s) => ({ ...s, value: 0, originalValue: 0 }));
      emit('toast', { level: 'warn', message: 'Logros y estadísticas restablecidos' });
      return ok(undefined);
    },
  },

  trainer: {
    async definitions(gameId) {
      await wait(100, 200);
      const g = games.find((x) => x.id === gameId);
      if (!g?.hasDefinition) return ok([]);
      return ok(MOCK_CHEATS);
    },

    async attach(gameId) {
      const g = games.find((x) => x.id === gameId);
      if (g?.multiplayer) {
        const blocked: TrainerSession = {
          gameId, state: 'blocked', pid: null, moduleBase: null,
          error: 'Título multijugador: el motor de cheats está bloqueado de forma permanente.',
        };
        sessions.set(gameId, blocked);
        emit('trainer:session', blocked);
        return ok(blocked);
      }
      emit('trainer:session', { gameId, state: 'searching', pid: null, moduleBase: null, error: null });
      await wait(600, 1200);
      const session: TrainerSession = {
        gameId, state: 'attached',
        pid: 1000 + Math.floor(Math.random() * 60000),
        moduleBase: '0x7FF6A2C10000', error: null,
      };
      sessions.set(gameId, session);
      emit('trainer:session', session);
      return ok(session);
    },

    async detach(gameId) {
      await wait(60, 120);
      const s: TrainerSession = { gameId, state: 'detached', pid: null, moduleBase: null, error: null };
      sessions.set(gameId, s);
      for (const c of MOCK_CHEATS) cheatStates.delete(`${gameId}|${c.id}`);
      emit('trainer:session', s);
      return ok(undefined);
    },

    async session(gameId) { await wait(30, 60); return ok(sessions.get(gameId) ?? null); },

    async toggle(gameId, cheatId, enabled) {
      await wait(80, 180);
      const s = stateOf(gameId, cheatId);
      s.enabled = enabled;
      s.resolved = true;
      emit('trainer:state', { gameId, state: { ...s } });
      return ok({ ...s });
    },

    async setValue(gameId, cheatId, value) {
      await wait(60, 120);
      const s = stateOf(gameId, cheatId);
      s.value = value;
      s.resolved = true;
      emit('trainer:state', { gameId, state: { ...s } });
      return ok({ ...s });
    },

    async trigger(gameId, cheatId) {
      await wait(60, 120);
      emit('toast', { level: 'success', message: `Ejecutado: ${cheatId}` });
      return ok(undefined);
    },

    async states(gameId) {
      await wait(40, 90);
      return ok(MOCK_CHEATS.map((c) => stateOf(gameId, c.id)));
    },
  },

  mods: {
    async list(gameId) { await wait(); return ok(mods.filter((m) => m.gameId === gameId)); },

    async install(gameId) {
      await wait(700, 1400);
      const m: Mod = {
        id: `m${Date.now().toString(36)}`, gameId, name: 'Mod nuevo', version: '1.0',
        author: null, description: null, status: 'staged', enabled: false,
        order: mods.length, sizeBytes: 1_200_000, installedAt: Math.floor(Date.now() / 1000),
        files: [], conflictsWith: [], error: null,
      };
      mods = [...mods, m];
      emit('mods:updated', { gameId, mods: mods.filter((x) => x.gameId === gameId) });
      return ok(m);
    },

    async uninstall(gameId, modId) {
      await wait(200, 400);
      mods = mods.filter((m) => m.id !== modId);
      emit('mods:updated', { gameId, mods: mods.filter((x) => x.gameId === gameId) });
      return ok(undefined);
    },

    async setEnabled(gameId, modId, enabled) {
      await wait(80, 160);
      mods = mods.map((m) => (m.id === modId ? { ...m, enabled } : m));
      emit('mods:updated', { gameId, mods: mods.filter((x) => x.gameId === gameId) });
      const found = mods.find((m) => m.id === modId);
      return found ? ok(found) : err('Mod no encontrado', 'NOT_FOUND');
    },

    async reorder(gameId, modIds) {
      await wait(80, 160);
      mods = mods.map((m) => {
        const i = modIds.indexOf(m.id);
        return i >= 0 ? { ...m, order: i } : m;
      });
      const list = mods.filter((m) => m.gameId === gameId).sort((a, b) => a.order - b.order);
      emit('mods:updated', { gameId, mods: list });
      return ok(list);
    },

    async deploy(gameId) {
      await wait(600, 1200);
      mods = mods.map((m) =>
        m.gameId === gameId && m.enabled ? { ...m, status: 'deployed' as const } : m);
      const files = mods.filter((m) => m.gameId === gameId && m.enabled).length * 14;
      emit('mods:updated', { gameId, mods: mods.filter((x) => x.gameId === gameId) });
      emit('toast', { level: 'success', message: `${files} archivos desplegados` });
      return ok({ files });
    },

    async purge(gameId) {
      await wait(400, 800);
      mods = mods.map((m) =>
        m.gameId === gameId && m.status === 'deployed' ? { ...m, status: 'staged' as const } : m);
      emit('mods:updated', { gameId, mods: mods.filter((x) => x.gameId === gameId) });
      emit('toast', { level: 'info', message: 'Directorio del juego restaurado' });
      return ok(undefined);
    },

    async profiles(gameId) { await wait(); return ok(profiles.filter((p) => p.gameId === gameId)); },

    async saveProfile(profile) {
      await wait(150, 300);
      const exists = profiles.some((p) => p.id === profile.id);
      profiles = exists
        ? profiles.map((p) => (p.id === profile.id ? profile : p))
        : [...profiles, profile];
      return ok(profile);
    },

    async activateProfile(gameId, profileId) {
      await wait(200, 400);
      profiles = profiles.map((p) =>
        p.gameId === gameId ? { ...p, isActive: p.id === profileId } : p);

      // Aplicar la selección y el orden del perfil, igual que hace el backend
      // real: si el mock solo marcara el perfil activo, la interfaz parecería
      // rota justo donde no lo está.
      const profile = profiles.find((p) => p.id === profileId);
      if (profile) {
        const chosen = new Set(profile.mods);
        mods = mods
          .map((m) =>
            m.gameId === gameId
              ? {
                  ...m,
                  enabled: chosen.has(m.id),
                  order: chosen.has(m.id) ? profile.mods.indexOf(m.id) : Number.MAX_SAFE_INTEGER,
                }
              : m,
          )
          .sort((a, b) => a.order - b.order)
          .map((m, i) => (m.gameId === gameId ? { ...m, order: i } : m));
        emit('mods:updated', { gameId, mods: mods.filter((m) => m.gameId === gameId) });
      }
      return ok(undefined);
    },

    async deleteProfile(gameId, profileId) {
      await wait(120, 240);
      profiles = profiles.filter((p) => p.id !== profileId);
      return ok(undefined);
    },
  },

  settings: {
    async get() { await wait(40, 80); return ok(settings); },
    async set(patch) { await wait(60, 120); settings = { ...settings, ...patch }; return ok(settings); },
    async pickFolder() { await wait(); return ok('C:\\Ruta\\De\\Ejemplo'); },
    async pickFile() { await wait(); return ok('C:\\Ruta\\De\\Ejemplo\\mod.zip'); },
    async openPath() { await wait(40, 80); return ok(undefined); },
  },

  catalog: {
    async sync() { await wait(600, 1200); return ok({ updated: 3, total: 12 }); },
    async version() { await wait(50, 100); return ok({ version: '2026.09.01', updatedAt: Math.floor(Date.now() / 1000) }); },
  },

  app: {
    async version() { await wait(20, 40); return ok('0.1.0-mock'); },
    async checkForUpdates() { await wait(400, 800); return ok({ available: false, version: null }); },
    async openLogs() { await wait(40, 80); return ok(undefined); },
    minimize() { /* sin ventana real en modo mock */ },
    maximize() { /* sin ventana real en modo mock */ },
    close() { /* sin ventana real en modo mock */ },
  },

  on(channel, handler) {
    let set = listeners.get(channel);
    if (!set) { set = new Set(); listeners.set(channel, set); }
    set.add(handler as Handler);
    return () => { set?.delete(handler as Handler); };
  },
};
