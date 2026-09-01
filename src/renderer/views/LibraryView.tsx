import { useMemo, useState } from 'react';
import {
  Search, RefreshCw, Star, Play, LibraryBig, Zap, ShieldOff, Plus,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useStore } from '@/store';
import { cn } from '@/lib/cn';
import { bytes, PLATFORM_LABEL, relative } from '@/lib/format';
import { Badge, Button, Empty, Input, Skeleton, ViewHeader } from '@/components/ui';
import type { Game } from '@shared/types';

type Filter = 'all' | 'favorites' | 'cheats' | 'installed';

/** Orden de las fases del escaneo, para traducirlas a un porcentaje. */
const SCAN_PHASES = ['steam', 'epic', 'gog', 'xbox', 'enrich', 'done'] as const;

function scanPercent(progress: { phase: string } | null): number {
  if (!progress) return 6;
  const index = SCAN_PHASES.indexOf(progress.phase as (typeof SCAN_PHASES)[number]);
  if (index < 0) return 6;
  return Math.round(((index + 1) / SCAN_PHASES.length) * 100);
}

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'favorites', label: 'Favoritos' },
  { id: 'cheats', label: 'Con cheats' },
  { id: 'installed', label: 'Instalados' },
];

export function LibraryView() {
  const games = useStore((s) => s.games);
  const loading = useStore((s) => s.loadingLibrary);
  const scanning = useStore((s) => s.scanning);
  const progress = useStore((s) => s.scanProgress);
  const scan = useStore((s) => s.scan);
  const pushToast = useStore((s) => s.pushToast);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return games
      .filter((g) => (q ? g.name.toLowerCase().includes(q) : true))
      .filter((g) => {
        if (filter === 'favorites') return g.favorite;
        if (filter === 'cheats') return g.hasDefinition && !g.multiplayer;
        if (filter === 'installed') return g.installDir !== null;
        return true;
      })
      .sort((a, b) => {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        return a.name.localeCompare(b.name, 'es');
      });
  }, [games, query, filter]);

  async function addManual() {
    const picked = await api.settings.pickFile('Elige el ejecutable del juego', [
      { name: 'Ejecutables', extensions: ['exe'] },
    ]);
    if (!picked.ok) return pushToast('error', picked.error);
    if (!picked.data) return;
    const added = await api.library.addManual(picked.data);
    if (!added.ok) return pushToast('error', added.error);
    pushToast('success', `${added.data.name} añadido`);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        title="Biblioteca"
        subtitle={
          scanning && progress
            ? progress.message
            : `${games.length} juegos · ${games.filter((g) => g.hasDefinition).length} con definición`
        }
        actions={
          <>
            <Button variant="outline" onClick={addManual}>
              <Plus size={14} /> Añadir .exe
            </Button>
            <Button variant="primary" onClick={scan} disabled={scanning}>
              <RefreshCw size={14} className={scanning ? 'animate-spin' : undefined} />
              {scanning ? 'Escaneando…' : 'Escanear'}
            </Button>
          </>
        }
      />

      {/* Progreso del escaneo por fases: `found` va subiendo pero no se sabe el
          total hasta el final, así que se avanza por fase completada. */}
      {scanning && (
        <div className="h-0.5 w-full bg-elevated">
          <div
            className="h-full bg-accent transition-[width] duration-300 ease-atreus"
            style={{ width: `${scanPercent(progress)}%` }}
          />
        </div>
      )}

      <div className="flex items-center gap-3 border-b border-line px-6 py-3">
        <div className="relative w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar juego…"
            className="w-full pl-8"
          />
        </div>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f.id}
              size="sm"
              variant={filter === f.id ? 'primary' : 'ghost'}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="aspect-[3/4] rounded-md" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <Empty
            icon={<LibraryBig size={40} strokeWidth={1.25} />}
            title={games.length === 0 ? 'La biblioteca está vacía' : 'Ningún juego coincide'}
            hint={
              games.length === 0
                ? 'Escanea para detectar tus juegos de Steam, Epic, GOG y Xbox, o añade un ejecutable a mano.'
                : 'Prueba con otro término o cambia el filtro.'
            }
            action={
              games.length === 0 ? (
                <Button variant="primary" onClick={scan}>
                  <RefreshCw size={14} /> Escanear ahora
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
            {visible.map((g) => <GameCard key={g.id} game={g} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function GameCard({ game }: { game: Game }) {
  const select = useStore((s) => s.select);
  const go = useStore((s) => s.go);
  const selectedId = useStore((s) => s.selectedId);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const pushToast = useStore((s) => s.pushToast);

  const active = selectedId === game.id;

  async function launch(e: React.MouseEvent) {
    e.stopPropagation();
    const res = await api.library.launch(game.id);
    if (!res.ok) return pushToast('error', res.error);
    // Steam, Epic y Xbox se lanzan por URL y no devuelven pid; enseñar "pid 0"
    // solo confunde.
    pushToast('info', res.data.pid
      ? `${game.name} lanzado (pid ${res.data.pid})`
      : `${game.name} lanzado`);
  }

  function open() {
    select(game.id);
    go('achievements');
  }

  // La tarjeta es un <div> con rol de botón, no un <button>: dentro lleva
  // acciones propias (favorito, lanzar) y anidar botones es HTML inválido,
  // además de dejar el foco por teclado inservible.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      }}
      aria-label={game.name}
      className={cn(
        'group relative flex cursor-pointer flex-col overflow-hidden rounded-md border bg-surface text-left',
        'transition-[transform,border-color] duration-[180ms] ease-atreus',
        'hover:-translate-y-0.5 hover:border-accent',
        active ? 'border-accent' : 'border-line',
      )}
    >
      {/* Carátula: mientras no haya imágenes reales, la inicial sobre un degradado. */}
      <div className="relative flex aspect-[3/4] items-center justify-center bg-inset">
        {game.headerUrl ? (
          <img src={game.headerUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="select-none text-[44px] font-semibold text-faint">
            {game.name.charAt(0).toUpperCase()}
          </span>
        )}

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); void toggleFavorite(game.id); }}
          aria-label={game.favorite ? 'Quitar de favoritos' : 'Marcar favorito'}
          className={cn(
            'absolute right-2 top-2 rounded-sm p-1.5 transition-opacity duration-[120ms]',
            'focus-visible:opacity-100',
            game.favorite
              ? 'text-accent opacity-100'
              : 'text-muted opacity-0 hover:text-fg group-hover:opacity-100',
          )}
        >
          <Star size={15} fill={game.favorite ? 'currentColor' : 'none'} />
        </button>

        <button
          type="button"
          onClick={launch}
          aria-label={`Lanzar ${game.name}`}
          className="absolute bottom-2 left-2 rounded-sm bg-accent p-1.5 text-white opacity-0 transition-opacity duration-[120ms] hover:bg-accent-hover focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Play size={13} fill="currentColor" />
        </button>
      </div>

      <div className="flex flex-col gap-1.5 p-3">
        <p className="truncate text-[13px] font-medium" title={game.name}>{game.name}</p>
        <div className="flex items-center gap-1.5">
          <Badge>{PLATFORM_LABEL[game.platform] ?? game.platform}</Badge>
          {game.multiplayer ? (
            <Badge tone="warn"><ShieldOff size={10} className="mr-1" /> MP</Badge>
          ) : game.hasDefinition ? (
            <Badge tone="accent"><Zap size={10} className="mr-1" /> Cheats</Badge>
          ) : null}
        </div>
        <p className="text-[11px] text-faint">
          {bytes(game.sizeBytes)} · {relative(game.lastPlayed)}
        </p>
      </div>
    </div>
  );
}
