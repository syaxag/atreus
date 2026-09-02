import { create } from 'zustand';
import type { Game, GameId, PlatinumSummary, ScanProgress, Settings } from '@shared/types';
import { api } from '@/lib/api';

export type Section = 'library' | 'game' | 'achievements' | 'guides' | 'maps' | 'mods' | 'settings';

export interface Toast {
  id: number;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
}

interface State {
  section: Section;
  games: Game[];
  /** Progreso de logros por juego, para ordenar la biblioteca. */
  platinum: Record<GameId, PlatinumSummary>;
  selectedId: GameId | null;
  /** Juegos que el monitor local ha visto ejecutándose en esta sesión. */
  activeGameIds: GameId[];
  loadingLibrary: boolean;
  scanning: boolean;
  scanProgress: ScanProgress | null;
  settings: Settings | null;
  toasts: Toast[];

  go: (section: Section) => void;
  open: (id: GameId, section?: Section) => void;
  select: (id: GameId | null) => void;
  loadLibrary: () => Promise<void>;
  loadPlatinum: () => Promise<void>;
  scan: () => Promise<void>;
  toggleFavorite: (id: GameId) => Promise<void>;
  loadSettings: () => Promise<void>;
  patchSettings: (patch: Partial<Settings>) => Promise<void>;
  pushToast: (level: Toast['level'], message: string) => void;
  dismissToast: (id: number) => void;
  /** El juego seleccionado, o null. */
  selected: () => Game | null;
}

let toastSeq = 0;

export const useStore = create<State>((set, get) => ({
  section: 'library',
  games: [],
  platinum: {},
  selectedId: null,
  activeGameIds: [],
  loadingLibrary: false,
  scanning: false,
  scanProgress: null,
  settings: null,
  toasts: [],

  go: (section) => set({ section }),
  select: (selectedId) => set({ selectedId }),
  /** Elegir un juego y saltar a su ficha: el gesto principal de la aplicación. */
  open: (id, section = 'game') => set({ selectedId: id, section }),

  async loadLibrary() {
    set({ loadingLibrary: true });
    const res = await api.library.list();
    if (res.ok) {
      set({ games: res.data, loadingLibrary: false });
      if (!get().selectedId && res.data.length > 0) set({ selectedId: res.data[0]!.id });
      void get().loadPlatinum();
    } else {
      set({ loadingLibrary: false });
      get().pushToast('error', res.error);
    }
  },

  async loadPlatinum() {
    const res = await api.platinum.summaries();
    if (!res.ok) return;
    const byId: Record<GameId, PlatinumSummary> = {};
    for (const summary of res.data) byId[summary.gameId] = summary;
    set({ platinum: byId });
  },

  async scan() {
    set({ scanning: true, scanProgress: null });
    const res = await api.library.scan();
    set({ scanning: false, scanProgress: null });
    if (res.ok) {
      set({ games: res.data });
      void get().loadPlatinum();
      get().pushToast('success', `${res.data.length} juegos encontrados`);
    } else {
      get().pushToast('error', res.error);
    }
  },

  async toggleFavorite(id) {
    const game = get().games.find((g) => g.id === id);
    if (!game) return;
    const next = !game.favorite;
    // Optimista: la interfaz responde ya y se revierte si el backend falla.
    set({ games: get().games.map((g) => (g.id === id ? { ...g, favorite: next } : g)) });
    const res = await api.library.setFavorite(id, next);
    if (!res.ok) {
      set({ games: get().games.map((g) => (g.id === id ? { ...g, favorite: !next } : g)) });
      get().pushToast('error', res.error);
    }
  },

  async loadSettings() {
    const res = await api.settings.get();
    if (res.ok) set({ settings: res.data });
    else get().pushToast('error', res.error);
  },

  async patchSettings(patch) {
    const res = await api.settings.set(patch);
    if (res.ok) set({ settings: res.data });
    else get().pushToast('error', res.error);
  },

  pushToast: (level, message) => {
    const id = ++toastSeq;
    set({ toasts: [...get().toasts, { id, level, message }] });
    setTimeout(() => get().dismissToast(id), 4500);
  },

  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  selected: () => {
    const { games, selectedId } = get();
    return games.find((g) => g.id === selectedId) ?? null;
  },
}));

/** Conecta los eventos push del backend al store. Llamar una vez al montar App. */
export function wireEvents(): () => void {
  const store = useStore.getState();
  const offs = [
    api.on('library:scan-progress', (p) => useStore.setState({ scanProgress: p })),
    api.on('library:updated', (games) => useStore.setState({ games })),
    // Cuando Steam, Epic o un acceso directo abre un juego, se convierte en el
    // contexto de trabajo automáticamente: su ficha ya muestra qué le falta
    // para el platino sin que haya que buscarlo.
    api.on('game:started', ({ gameId }) => useStore.setState((state) => ({
      selectedId: gameId,
      section: 'game',
      activeGameIds: state.activeGameIds.includes(gameId)
        ? state.activeGameIds
        : [...state.activeGameIds, gameId],
    }))),
    api.on('game:stopped', ({ gameId }) => {
      useStore.setState((state) => ({
        activeGameIds: state.activeGameIds.filter((id) => id !== gameId),
      }));
      // Acaba de cambiar el tiempo jugado, y puede que también los logros.
      void useStore.getState().loadPlatinum();
    }),
    api.on('toast', ({ level, message }) => store.pushToast(level, message)),
  ];
  return () => offs.forEach((off) => off());
}
