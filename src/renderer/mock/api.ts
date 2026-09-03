import type { AtreusApi, AtreusEvents } from '@shared/ipc';
import { ok, err } from '@shared/ipc';
import type {
  Achievement, CompletionProgress, Game, GameStat, InteractiveMap, Mod, ModProfile,
  ContentAvailability, PlatinumReport, PlatinumSummary, Settings, SteamSnapshot,
} from '@shared/types';
import {
  MOCK_ACHIEVEMENTS, MOCK_GAMES, MOCK_GUIDES, MOCK_MAPS, MOCK_MODS, MOCK_PLAYTIME,
  MOCK_PROFILES, MOCK_REMOTE, MOCK_STATS,
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
const snapshots = new Map<string, SteamSnapshot[]>();
/** Marcas manuales del mock: `${gameId}|${apiName}`. */
const manualMarks = new Set<string>();
/** Mapas que el usuario añade a mano durante la sesión del mock. */
const extraMaps: InteractiveMap[] = [];
const completionProgress = new Map<string, CompletionProgress>();

function defaultProgress(gameId: string): CompletionProgress {
  return {
    gameId,
    updatedAt: Date.now(),
    notes: '',
    items: [
      { id: 'main-story', label: 'Completar la historia principal', kind: 'mission', done: false },
      { id: 'collectibles', label: 'Revisar coleccionables y mapa', kind: 'collectible', done: false },
      { id: 'achievements', label: 'Completar los logros restantes', kind: 'achievement', done: false },
    ],
  };
}

/**
 * Informe de platino simulado.
 *
 * Se calcula igual que en el backend real —a partir de los logros y de la
 * rareza— para que la ficha del juego se pueda ajustar sin Steam delante.
 */
function buildMockReport(game: Game): PlatinumReport {
  const list = game.id === 'steam:2379780' ? achievements : achievements.slice(0, 6);
  const unlocked = list.filter((a) => a.unlocked);
  const remaining = list.filter((a) => !a.unlocked);
  const times = unlocked.map((a) => a.unlockTime).filter((t): t is number => !!t);
  const playtimeMinutes = MOCK_PLAYTIME[game.id] ?? null;
  const rarest = Math.min(...list.map((a) => a.globalPercent ?? 100));

  return {
    gameId: game.id,
    gameName: game.name,
    // El mock enseña las dos caras: los juegos que no son de Steam llevan el
    // progreso a mano, igual que en la aplicación real.
    tracking: game.platform === 'steam' ? 'steam' : 'manual',
    unlocked: unlocked.length,
    total: list.length,
    percent: list.length === 0 ? 0 : Math.round((unlocked.length / list.length) * 1000) / 10,
    complete: list.length > 0 && unlocked.length === list.length,
    playtimeMinutes,
    trackedMinutes: Math.round((playtimeMinutes ?? 0) / 4),
    firstUnlockAt: times.length > 0 ? Math.min(...times) : null,
    lastUnlockAt: times.length > 0 ? Math.max(...times) : null,
    estimate: {
      totalHours: Math.round(((playtimeMinutes ?? 600) / 60) * 1.8 * 10) / 10,
      remainingHours: Math.round(((playtimeMinutes ?? 600) / 60) * 0.8 * 10) / 10,
      basis: 'measured',
      confidence: 'medium',
      explanation: 'Datos de ejemplo del modo mock: en la aplicación real salen de tus horas y de la rareza de cada logro.',
    },
    difficulty: {
      score: rarest < 5 ? 7.5 : 4,
      label: rarest < 5 ? 'Difícil' : 'Asequible',
      rarestPercent: rarest,
      ultraRare: list.filter((a) => (a.globalPercent ?? 100) < 5).length,
      explanation: `El logro más raro lo tiene el ${rarest} % de los jugadores.`,
    },
    remaining: remaining
      .sort((a, b) => (b.globalPercent ?? -1) - (a.globalPercent ?? -1))
      .map((a) => ({
        apiName: a.apiName,
        displayName: a.displayName,
        description: a.description,
        iconUrl: a.iconGrayUrl ?? a.iconUrl,
        globalPercent: a.globalPercent,
        hidden: a.hidden,
      })),
    sources: ['Modo mock: datos de ejemplo'],
    warning: null,
    updatedAt: Date.now(),
  };
}

let settings: Settings = {
  theme: 'dark',
  accent: '#8b5cf6',
  steamPath: 'C:\\Program Files (x86)\\Steam',
  steamWebApiKey: null,
  xboxApiKey: null,
  scanOnStart: true,
  minimizeToTray: true,
  catalogSource: '',
  autoSyncCatalog: true,
  updateSource: '',
  checkForAppUpdates: true,
  autoDownloadUpdates: false,
  achievementRiskAccepted: false,
  celebrationSound: true,
  language: 'es',
};

// ── Bus de eventos local ──────────────────────────────────────
type Handler = (payload: never) => void;
const listeners = new Map<string, Set<Handler>>();

function emit<K extends keyof AtreusEvents>(channel: K, payload: AtreusEvents[K]): void {
  for (const h of listeners.get(channel) ?? []) (h as (p: AtreusEvents[K]) => void)(payload);
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
        playtimeMinutes: null,
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

    async commit(appId, patch) {
      await wait(400, 800);
      const snapshot: SteamSnapshot = {
        id: `${Date.now().toString(36)}-mock`, appId,
        createdAt: Math.floor(Date.now() / 1000),
        achievements: structuredClone(achievements), stats: structuredClone(stats),
      };
      snapshots.set(appId, [snapshot, ...(snapshots.get(appId) ?? [])].slice(0, 12));
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
      // El simulacro no tiene un Steam que rechace nada.
      return ok({ applied, rejected: [] });
    },

    async backups(appId) {
      await wait(50, 100);
      return ok(snapshots.get(appId) ?? []);
    },

    async restore(appId, snapshotId) {
      await wait(250, 500);
      const snapshot = snapshots.get(appId)?.find((item) => item.id === snapshotId);
      if (!snapshot) return err(`No existe la copia ${snapshotId}`, 'NOT_FOUND');
      achievements = structuredClone(snapshot.achievements);
      stats = structuredClone(snapshot.stats);
      return ok({ applied: achievements.length + stats.length });
    },

    async checkKey() {
      await wait(400, 800);
      return ok({ ok: true, persona: 'Usuario de prueba', publicProfile: true, message: 'Clave correcta (modo mock).' });
    },

    async resetAll() {
      await wait(500, 900);
      achievements = achievements.map((a) => ({ ...a, unlocked: false, unlockTime: null }));
      stats = stats.map((s) => ({ ...s, value: 0, originalValue: 0 }));
      emit('toast', { level: 'warn', message: 'Logros y estadísticas restablecidos' });
      return ok(undefined);
    },
  },

  xbox: {
    async checkKey() {
      await wait(500, 900);
      return ok({ ok: true, gamertag: 'JugadorDePrueba', titles: 42, message: 'Conectado (modo mock): 42 juegos en el historial.' });
    },
  },

  achievements: {
    /*
     * El mock cubre los tres modos a propósito: si aquí solo hubiera juegos de
     * Steam escribibles, la interfaz de solo lectura y la del registro manual
     * no se podrían ajustar sin tener delante una cuenta de Xbox.
     */
    async list(gameId) {
      await wait(300, 700);
      const game = games.find((g) => g.id === gameId);
      if (!game) return err(`Juego no encontrado: ${gameId}`, 'NOT_FOUND');

      if (game.platform === 'steam') {
        return ok({
          gameId,
          tracking: 'steam' as const,
          writable: true,
          source: 'Cliente de Steam',
          note: null,
          items: achievements,
        });
      }

      // Xbox con clave de OpenXBL: estado real, pero no se puede escribir.
      if (game.platform === 'xbox') {
        return ok({
          gameId,
          tracking: 'steam' as const,
          writable: false,
          source: 'Xbox Live · OpenXBL',
          note: 'Estos son tus logros reales de Xbox, con sus fechas. Xbox no permite desbloquearlos desde fuera del juego: no existe ninguna API para eso, ni oficial ni de terceros, así que aquí solo se leen.',
          items: achievements,
        });
      }

      return ok({
        gameId,
        tracking: 'manual' as const,
        writable: false,
        source: 'Catálogo público de Steam (AppID 000000)',
        note: 'Esta plataforma no publica tus logros sin iniciar sesión, así que la lista es la de la versión de Steam y el progreso lo marcas tú.',
        items: achievements.map((a) => ({ ...a, unlocked: manualMarks.has(`${gameId}|${a.apiName}`) })),
      });
    },

    async mark(gameId, patches) {
      await wait(120, 260);
      for (const patch of patches) {
        const key = `${gameId}|${patch.apiName}`;
        if (patch.unlocked) manualMarks.add(key);
        else manualMarks.delete(key);
      }
      return mockApi.achievements.list(gameId);
    },
  },

  platinum: {
    async report(gameId) {
      await wait(300, 700);
      const game = games.find((g) => g.id === gameId);
      if (!game) return err(`Juego no encontrado: ${gameId}`, 'NOT_FOUND');
      return ok(buildMockReport(game));
    },

    async summaries() {
      await wait(80, 200);
      return ok(games.map((game): PlatinumSummary => {
        const report = buildMockReport(game);
        return {
          gameId: game.id,
          tracking: report.tracking,
          unlocked: report.unlocked,
          total: report.total,
          percent: report.percent,
          complete: report.complete,
          playtimeMinutes: report.playtimeMinutes,
          updatedAt: report.updatedAt,
        };
      }));
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

    async previewDeploy(gameId) {
      await wait(180, 320);
      const active = mods
        .filter((m) => m.gameId === gameId && m.enabled)
        .sort((a, b) => a.order - b.order);
      if (active.length === 0) return err('No hay ningún mod activo que desplegar');

      // Igual que el backend real: una ruta la escribe un solo mod, el último
      // del orden de carga. Sin esta deduplicación el mock enseñaba los dos y
      // la vista parecía correcta donde no lo era.
      const planned = new Map<string, { path: string; modId: string; modName: string; currentlyExists: boolean }>();
      const owners = new Map<string, string[]>();
      for (const mod of active) {
        for (const path of mod.files.length ? mod.files : [`mods/${mod.name}.example`]) {
          const key = path.toLowerCase();
          planned.set(key, { path, modId: mod.id, modName: mod.name, currentlyExists: false });
          owners.set(key, [...(owners.get(key) ?? []), mod.id]);
        }
      }

      return ok({
        root: 'C:\\Juego\\Mods',
        activeMods: active.map((mod) => mod.name),
        files: [...planned.values()].sort((a, b) => a.path.localeCompare(b.path, 'es')),
        conflicts: [...owners.entries()]
          .filter(([, modIds]) => modIds.length > 1)
          .map(([path, modIds]) => ({ path, mods: modIds })),
      });
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

    async discover(gameId) {
      await wait(600, 1200);
      const g = games.find((x) => x.id === gameId);
      if (g?.nativeId !== '2379780' && g?.nativeId !== '322170') {
        return err(
          'Este juego no tiene un catálogo de mods configurado. Añade ' +
          '"mods": { "provider": … } en su definición.',
        );
      }
      return ok(MOCK_REMOTE);
    },

    async installRemote(gameId, remote) {
      await wait(900, 1800);
      const m: Mod = {
        id: `m${Date.now().toString(36)}`, gameId,
        name: remote.name, version: remote.version, author: remote.author,
        description: remote.description, status: 'staged', enabled: false,
        order: mods.length, sizeBytes: remote.sizeBytes ?? 1_000_000,
        installedAt: Math.floor(Date.now() / 1000),
        files: [], conflictsWith: [], error: null,
      };
      mods = [...mods, m];
      emit('mods:updated', { gameId, mods: mods.filter((x) => x.gameId === gameId) });
      return ok(m);
    },
  },

  guides: {
    async list(gameId, category, query, refresh) {
      await wait(400, 900);
      const game = games.find((g) => g.id === gameId);
      const name = game?.name ?? 'el juego';
      return ok(MOCK_GUIDES.map((entry) => ({
        ...entry,
        title: entry.title.replace('Balatro', name) + (query ? ` · ${query}` : ''),
        snippet: `${entry.snippet} (categoría: ${category})`,
      })));
    },

    async read(entry) {
      await wait(500, 1100);
      return ok({
        title: entry.title,
        url: entry.url,
        source: entry.source,
        provider: entry.provider,
        author: entry.author,
        summary: entry.snippet,
        partial: !entry.readable,
        fetchedAt: Date.now(),
        sections: entry.readable
          ? [
            {
              heading: 'Antes de empezar',
              body: ['Texto de ejemplo del modo mock.', '',
                'En la aplicación real aquí va el contenido íntegro de la guía, sección a sección.'].join('\n'),
              images: [],
            },
            {
              heading: 'Logros fáciles',
              body: ['· Primero los que salen jugando.',
                '· Después los que piden un mazo concreto.'].join('\n'),
              images: [],
            },
            { heading: 'Los que cuestan', body: 'Los dos o tres logros raros que deciden el platino, con la ruta recomendada.', images: [] },
          ]
          : [],
      });
    },
  },

  maps: {
    async add(gameId, input) {
      await wait(200, 400);
      extraMaps.push({ id: `user-${Date.now().toString(36)}`, title: input.title,
        description: 'Mapa añadido por ti.', url: input.url, provider: 'manual', removable: true });
      return mockApi.maps.list(gameId);
    },

    async remove(gameId, mapId) {
      await wait(150, 300);
      const index = extraMaps.findIndex((m) => m.id === mapId);
      if (index >= 0) extraMaps.splice(index, 1);
      return mockApi.maps.list(gameId);
    },

    async list(gameId, refresh) {
      await wait(300, 700);
      const game = games.find((g) => g.id === gameId);
      if (!game) return err(`Juego no encontrado: ${gameId}`, 'NOT_FOUND');
      return ok([
        ...MOCK_MAPS.map((map) => ({ ...map, title: `${game.name} · mapa interactivo` })),
        ...extraMaps,
      ]);
    },
  },

  content: {
    async availability() {
      await wait(450, 900);
      const now = Date.now();
      const items: ContentAvailability[] = games.map((game, index) => ({
        gameId: game.id,
        // El mock alterna resultados para poder comprobar los tres filtros.
        guides: index % 3 === 0 ? 0 : MOCK_GUIDES.length,
        readableGuides: index % 3 === 0 ? 0 : MOCK_GUIDES.filter((guide) => guide.readable).length,
        maps: index % 2 === 0 ? MOCK_MAPS.length : 0,
        mods: index % 2 === 1 ? 4 : 0,
        updatedAt: now,
      }));
      return ok(items);
    },
  },

  progress: {
    async get(gameId) { await wait(40, 90); return ok(structuredClone(completionProgress.get(gameId) ?? defaultProgress(gameId))); },
    async save(value) {
      await wait(40, 90);
      const saved = { ...structuredClone(value), updatedAt: Date.now() };
      completionProgress.set(saved.gameId, saved);
      return ok(structuredClone(saved));
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
    async downloadUpdate() { await wait(400, 800); return ok(undefined); },
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
