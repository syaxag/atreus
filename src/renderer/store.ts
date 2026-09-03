import { create } from 'zustand';
import type {
  Game, GameId, PlatinumReport, PlatinumSummary, ScanProgress, Settings,
} from '@shared/types';
import { api } from '@/lib/api';
import { traducir, type Clave, type Huecos } from '@shared/i18n';
import { explicarAviso } from '@/lib/aviso';

export type Section = 'library' | 'activity' | 'game' | 'achievements' | 'guides' | 'maps' | 'mods' | 'settings';

export interface Toast {
  id: number;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
}

/**
 * Un texto sin traducir todavía: la clave y sus huecos.
 *
 * El registro guarda esto y no la frase hecha. Traducir al apuntar la
 * congelaría en el idioma de ese momento, y cambiar de idioma dejaría media
 * lista en el anterior; así se traduce al pintarla, cada vez.
 *
 * Es, en pequeño, el contrato que le falta al backend: mandar con qué se
 * compone la frase en vez de la frase.
 */
export interface Frase {
  clave: Clave;
  huecos?: Huecos;
}

/** Registro breve de lo ocurrido desde que se abrió Atreus. */
export interface ActivityEntry {
  id: number;
  at: number;
  kind: 'scan' | 'game-started' | 'game-stopped' | 'platinum' | 'mods';
  title: Frase;
  detail: Frase | null;
  gameId: GameId | null;
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
  /** Platino recién conseguido, esperando su celebración. */
  celebration: PlatinumReport | null;
  /** Consulta que llega desde un logro pendiente a la vista de guías. */
  guideSearch: string | null;
  activities: ActivityEntry[];
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
  celebrate: (report: PlatinumReport | null) => void;
  openGuideSearch: (id: GameId, query: string) => void;
  clearGuideSearch: () => void;
  addActivity: (entry: Omit<ActivityEntry, 'id' | 'at'>) => void;
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
  celebration: null,
  guideSearch: null,
  activities: [],
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
      get().addActivity({
        kind: 'scan',
        title: { clave: 'act.bibliotecaTitulo' },
        detail: { clave: 'act.juegosEncontrados', huecos: { n: res.data.length } },
        gameId: null,
      });
      get().pushToast('success', tr('act.juegosEncontrados', { n: res.data.length }));
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

  celebrate: (celebration) => set({ celebration }),

  openGuideSearch: (selectedId, query) => set({ selectedId, section: 'guides', guideSearch: query }),
  clearGuideSearch: () => set({ guideSearch: null }),

  /*
   * Un evento repetido del mismo tipo y del mismo juego actualiza al anterior
   * en vez de apilarse. Sin esto, activar cuatro mods llenaba el registro de
   * "Taller actualizado" idénticos y echaba fuera lo que sí importaba: cada
   * cambio en el Taller emite `mods:updated`.
   */
  addActivity: (entry) => set((state) => {
    const ahora = Math.floor(Date.now() / 1000);
    const ultima = state.activities[0];
    const nueva = { ...entry, id: ++toastSeq, at: ahora };
    const repetida = ultima
      && ultima.kind === entry.kind
      && ultima.gameId === entry.gameId
      && ahora - ultima.at < 60;
    return {
      activities: repetida
        ? [{ ...nueva, id: ultima.id }, ...state.activities.slice(1)]
        : [nueva, ...state.activities].slice(0, 60),
    };
  }),

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

/**
 * El traductor fuera de React.
 *
 * Los avisos efímeros no se repintan al cambiar de idioma, así que se arman
 * ya hechos. Lo que sí se queda —el registro de Actividad— guarda la clave.
 */
function tr(clave: Clave, huecos?: Huecos): string {
  return traducir(useStore.getState().settings?.language ?? 'es', clave, huecos);
}

/** El nombre de un juego, o la palabra genérica si ya no está en la biblioteca. */
function nombreDe(id: GameId): string {
  return useStore.getState().games.find((game) => game.id === id)?.name ?? tr('act.juegoSinNombre');
}

/** Conecta los eventos push del backend al store. Llamar una vez al montar App. */
export function wireEvents(): () => void {
  const store = useStore.getState();
  const offs = [
    api.on('library:scan-progress', (p) => useStore.setState({ scanProgress: p })),
    /*
     * El escaneo de arranque y la recarga de definiciones ocurren en el main,
     * no en `scan()`: llegan por aquí. Sin apuntarlo, Actividad decía "aún no
     * hay actividad" justo después de encontrar toda la biblioteca.
     */
    api.on('library:updated', (games) => {
      const previos = useStore.getState().games.length;
      useStore.setState({ games });
      useStore.getState().addActivity({
        kind: 'scan',
        title: { clave: 'act.bibliotecaTitulo' },
        detail: previos === games.length
          ? { clave: 'act.nJuegos', huecos: { n: games.length } }
          : { clave: 'act.nJuegosAntes', huecos: { n: games.length, antes: previos } },
        gameId: null,
      });
    }),
    // El cálculo en segundo plano va rellenando la biblioteca juego a juego.
    api.on('platinum:summaries', (list) => {
      const byId: Record<GameId, PlatinumSummary> = {};
      for (const summary of list) byId[summary.gameId] = summary;
      useStore.setState({ platinum: byId });
    }),
    // Cuando Steam, Epic o un acceso directo abre un juego, se convierte en el
    // contexto de trabajo automáticamente: su ficha ya muestra qué le falta
    // para el platino sin que haya que buscarlo.
    api.on('game:started', ({ gameId }) => {
      const state = useStore.getState();
      const alreadyActive = state.activeGameIds.includes(gameId);
      useStore.setState({
        selectedId: gameId,
        section: 'game',
        activeGameIds: alreadyActive ? state.activeGameIds : [...state.activeGameIds, gameId],
      });
      if (!alreadyActive) {
        state.addActivity({
          kind: 'game-started',
          title: { clave: 'act.juegoIniciado', huecos: { juego: nombreDe(gameId) } },
          detail: { clave: 'act.siguiendoSesion' },
          gameId,
        });
      }
    }),
    api.on('game:stopped', ({ gameId, minutes }) => {
      const state = useStore.getState();
      useStore.setState((state) => ({
        activeGameIds: state.activeGameIds.filter((id) => id !== gameId),
      }));
      state.addActivity({
        kind: 'game-stopped',
        title: { clave: 'act.juegoCerrado', huecos: { juego: nombreDe(gameId) } },
        detail: minutes <= 0
          ? { clave: 'act.sesionTerminada' }
          : minutes === 1
            ? { clave: 'act.unMinutoRegistrado' }
            : { clave: 'act.minutosRegistrados', huecos: { n: minutes } },
        gameId,
      });
      /*
       * Acaba de cambiar el tiempo jugado y puede que también los logros. Se
       * fuerza el recálculo de ese juego: si en esa partida has rematado el
       * platino, el backend lo detecta aquí y la celebración salta sola.
       */
      void api.platinum.report(gameId, true).then(() => useStore.getState().loadPlatinum());
    }),
    // El momento que da nombre a la aplicación: solo llega con platinos nuevos.
    api.on('platinum:achieved', (report) => {
      useStore.setState({ celebration: report });
      useStore.getState().addActivity({
        kind: 'platinum',
        title: { clave: 'act.alCien', huecos: { juego: report.gameName } },
        detail: {
          clave: 'act.logrosCompletados',
          huecos: { hechos: report.unlocked, total: report.total },
        },
        gameId: report.gameId,
      });
      void useStore.getState().loadPlatinum();
    }),
    api.on('mods:updated', ({ gameId, mods }) => {
      const state = useStore.getState();
      state.addActivity({
        kind: 'mods',
        title: { clave: 'act.tallerActualizado', huecos: { juego: nombreDe(gameId) } },
        detail: {
          clave: 'act.modsActivos',
          huecos: { activos: mods.filter((mod) => mod.enabled).length, total: mods.length },
        },
        gameId,
      });
    }),
    api.on('toast', ({ level, notice }) => store.pushToast(level, explicarAviso(tr, notice))),
  ];
  return () => offs.forEach((off) => off());
}
