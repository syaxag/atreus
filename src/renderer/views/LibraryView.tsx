import { useEffect, useMemo, useState } from 'react';
import {
  Check, Search, RefreshCw, Star, Play, Gem, Plus, Trophy, Users, LoaderCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useStore } from '@/store';
import { cn } from '@/lib/cn';
import { duration, PLATFORM_LABEL, relative } from '@/lib/format';
import { Badge, Button, Empty, Input, Progress, Skeleton, ViewHeader } from '@/components/ui';
import type { ContentAvailability, Game, PlatinumSummary } from '@shared/types';
import trofeo from '@/assets/trofeo.png';

/**
 * Los filtros de una biblioteca de cazador de platinos: qué estoy persiguiendo,
 * qué ya conseguí y qué ni he empezado.
 */
type Filter = 'all' | 'favorites' | 'in-progress' | 'complete' | 'untouched' | 'solo' | 'guides' | 'maps' | 'mods';
type Sort = 'progress' | 'name' | 'played';

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
  { id: 'in-progress', label: 'En curso' },
  { id: 'complete', label: 'Al 100 %' },
  { id: 'untouched', label: 'Sin empezar' },
  { id: 'favorites', label: 'Favoritos' },
  { id: 'solo', label: 'Solo' },
  { id: 'guides', label: 'Con guía legible' },
  { id: 'maps', label: 'Con mapa' },
  { id: 'mods', label: 'Con mods' },
];

const SORTS: { id: Sort; label: string }[] = [
  { id: 'progress', label: 'Más cerca del platino' },
  { id: 'played', label: 'Más jugados' },
  { id: 'name', label: 'Nombre' },
];

export function LibraryView() {
  const games = useStore((s) => s.games);
  const loading = useStore((s) => s.loadingLibrary);
  const scanning = useStore((s) => s.scanning);
  const progress = useStore((s) => s.scanProgress);
  const scan = useStore((s) => s.scan);
  const pushToast = useStore((s) => s.pushToast);

  const platinum = useStore((s) => s.platinum);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('progress');
  const [content, setContent] = useState<Record<string, ContentAvailability>>({});
  const [loadingContent, setLoadingContent] = useState(false);

  const needsContent = filter === 'guides' || filter === 'maps' || filter === 'mods';
  const contentComplete = games.length > 0 && games.every((game) => content[game.id] !== undefined);
  /** La comprobación más antigua de las que hay: es la edad real del índice. */
  const comprobadoHace = useMemo(() => {
    const marcas = Object.values(content).map((item) => item.updatedAt);
    return marcas.length > 0 ? relative(Math.min(...marcas)) : null;
  }, [content]);

  /*
   * Comprobar toda la biblioteca cuesta red, por eso ocurre solo cuando el
   * usuario pide uno de estos filtros. El main agrupa, limita y cachea las
   * consultas; cambiar entre guía/mapa/mod después es inmediato.
   */
  useEffect(() => {
    if (!needsContent || loadingContent || contentComplete) return;
    let alive = true;
    setLoadingContent(true);
    void api.content.availability().then((response) => {
      if (!alive) return;
      setLoadingContent(false);
      if (!response.ok) { pushToast('error', response.error); return; }
      setContent(Object.fromEntries(response.data.map((item) => [item.gameId, item])));
    });
    return () => { alive = false; };
    // `loadingContent` no es dependencia a propósito: cambiarlo no debe
    // cancelar la consulta que acabamos de iniciar.
  }, [needsContent, contentComplete, games, pushToast]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return games
      .filter((g) => (q ? g.name.toLowerCase().includes(q) : true))
      .filter((g) => {
        const summary = platinum[g.id];
        if (filter === 'favorites') return g.favorite;
        if (filter === 'complete') return summary?.complete === true;
        if (filter === 'in-progress') {
          return summary !== undefined && summary.total > 0 && summary.unlocked > 0 && !summary.complete;
        }
        if (filter === 'untouched') return !summary || summary.unlocked === 0;
        if (filter === 'solo') return !g.multiplayer;
        const available = content[g.id];
        if (filter === 'guides') return (available?.readableGuides ?? 0) > 0;
        if (filter === 'maps') return (available?.maps ?? 0) > 0;
        if (filter === 'mods') return (available?.mods ?? 0) > 0;
        return true;
      })
      .sort((a, b) => {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        if (sort === 'name') return a.name.localeCompare(b.name, 'es');
        if (sort === 'played') return (b.playtimeMinutes ?? 0) - (a.playtimeMinutes ?? 0);
        /*
         * "Más cerca del platino" no es simplemente el porcentaje más alto: un
         * juego al 100 % ya está hecho y estorba arriba, y uno al 0 % ni se ha
         * empezado. Lo que interesa es lo que está a medias y casi terminado.
         */
        return score(platinum[b.id]) - score(platinum[a.id]);
      });
  }, [games, query, filter, sort, platinum, content]);

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
        title="Colección"
        subtitle={
          scanning && progress
            ? progress.message
            : summarize(games, platinum)
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

      <div className="flex flex-wrap items-center gap-3 border-b border-line px-6 py-3">
        <div className="relative w-full max-w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input
            id="library-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en tu colección…"
            className="w-full pl-8"
          />
        </div>
        <div className="flex flex-wrap gap-1">
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
        <label className="ml-auto flex items-center gap-2 text-[12px] text-faint">
          Ordenar por
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as Sort)}
            className="h-7 rounded-sm border border-line bg-inset px-2 text-[12px] text-fg focus:border-accent focus:outline-none"
          >
            {SORTS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {/* Estos tres filtros preguntan de verdad a las guías, los mapas y los
            catálogos de mods de cada juego. Es lento la primera vez y hace
            falta decirlo: si no, la colección desaparece sin explicación. */}
        {needsContent && (loadingContent || comprobadoHace !== null) && (
          <div
            className="mb-4 flex items-center gap-2.5 rounded-sm border border-line bg-surface px-3.5 py-2.5 text-[12px]"
            role="status"
            aria-live="polite"
          >
            {loadingContent ? (
              <>
                <LoaderCircle size={14} className="shrink-0 animate-spin text-accent" />
                <span className="text-muted">
                  Comprobando guías, mapas y mods de {games.length} juegos. La primera vez
                  tarda; después el resultado se reutiliza durante diez minutos.
                </span>
              </>
            ) : (
              <>
                <Check size={14} className="shrink-0 text-success" />
                <span className="text-muted">Contenido comprobado {comprobadoHace}.</span>
              </>
            )}
          </div>
        )}

        {loading || loadingContent ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-[186px] rounded-md" />
            ))}
          </div>
        ) : visible.length === 0 ? games.length === 0 ? (
          <CollectionOnboarding onScan={scan} onAddManual={addManual} scanning={scanning} />
        ) : (
          <Empty
            icon={<Gem size={40} strokeWidth={1.25} />}
            title="Ningún juego coincide"
            hint="Prueba con otro término o cambia el filtro."
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
            {visible.map((g, i) => <GameCard key={g.id} game={g} index={i} summary={platinum[g.id]} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function CollectionOnboarding({
  onScan, onAddManual, scanning,
}: { onScan: () => Promise<void>; onAddManual: () => Promise<void>; scanning: boolean }) {
  const steps = [
    ['1', 'Detecta tu biblioteca', 'Busca juegos de Steam, Epic, GOG y Xbox.'],
    ['2', 'Elige un juego', 'Atreus calcula tu progreso y lo que te falta.'],
    ['3', 'Sigue tu ruta', 'Abre guías, mapas y tus próximos logros desde su ficha.'],
  ] as const;

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center py-10 text-center">
      <Gem size={40} strokeWidth={1.25} className="text-accent" />
      <h2 className="mt-4 text-[20px] font-semibold">Empieza tu primera ruta al platino</h2>
      <p className="mt-1 max-w-lg text-[13px] text-muted">Atreus prepara tu colección en tres pasos, sin pedirte cuentas ni contraseñas.</p>
      <ol className="mt-7 grid w-full grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3 text-left">
        {steps.map(([number, title, hint]) => (
          <li key={number} className="rounded-md border border-line bg-surface p-4">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent">{number}</span>
            <p className="mt-3 text-[13px] font-semibold">{title}</p>
            <p className="mt-1 text-[12px] leading-5 text-muted">{hint}</p>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button variant="primary" onClick={() => void onScan()} disabled={scanning}>
          <RefreshCw size={14} className={scanning ? 'animate-spin' : undefined} />
          {scanning ? 'Buscando juegos…' : '1. Escanear biblioteca'}
        </Button>
        <Button variant="outline" onClick={() => void onAddManual()}>
          <Plus size={14} /> Añadir un .exe
        </Button>
      </div>
      <p className="mt-4 flex items-center gap-1.5 text-[11px] text-faint"><Check size={13} className="text-success" /> Puedes cambiar carpetas y fuentes después en Ajustes.</p>
    </div>
  );
}

function GameCoverImage({ game }: { game: Game }) {
  const [fallbackIndex, setFallbackIndex] = useState(0);

  const fallbacks = useMemo(() => {
    const list: string[] = [];
    if (game.headerUrl) list.push(game.headerUrl);
    if (game.platform === 'steam' && game.nativeId) {
      list.push(`https://cdn.cloudflare.steamstatic.com/steam/apps/${game.nativeId}/header.jpg`);
      list.push(`https://cdn.cloudflare.steamstatic.com/steam/apps/${game.nativeId}/capsule_616x353.jpg`);
      list.push(`https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${game.nativeId}/header.jpg`);
    }
    return list;
  }, [game.headerUrl, game.platform, game.nativeId]);

  /**
   * Las carátulas que no estaban en disco se descargan en segundo plano y
   * llegan por `library:updated`. Guardar la URL en un estado inicial dejaba la
   * tarjeta con las iniciales para siempre: el índice se reinicia cuando la
   * lista de candidatas cambia, y la imagen aparece sola.
   */
  useEffect(() => { setFallbackIndex(0); }, [fallbacks]);

  const imgSrc = fallbacks[fallbackIndex] ?? null;

  if (imgSrc) {
    return (
      <img
        src={imgSrc}
        alt=""
        onError={() => setFallbackIndex((value) => value + 1)}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover transition-transform duration-500 ease-atreus group-hover:scale-[1.07]"
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-elevated via-surface to-inset p-4 text-center">
      <div className="flex flex-col items-center gap-1">
        <span className="select-none text-2xl font-bold tracking-wider text-accent/70">
          {game.name.slice(0, 2).toUpperCase()}
        </span>
        <span className="line-clamp-2 select-none text-[11px] font-medium text-faint">
          {game.name}
        </span>
        <span className="mt-2 rounded-sm border border-line px-1.5 py-0.5 text-[10px] font-medium text-muted">
          {PLATFORM_LABEL[game.platform] ?? game.platform}
        </span>
      </div>
    </div>
  );
}

/**
 * Prioridad en el orden "más cerca del platino".
 *
 * Un juego a medio hacer va antes que uno terminado y que uno sin tocar,
 * porque es el único donde queda algo que decidir hoy.
 */
function score(summary: PlatinumSummary | undefined): number {
  if (!summary || summary.total === 0) return -1;
  if (summary.complete) return -0.5;
  if (summary.unlocked === 0) return 0;
  return summary.percent;
}

function summarize(games: Game[], platinum: Record<string, PlatinumSummary>): string {
  const known = games
    .map((game) => platinum[game.id])
    .filter((s): s is PlatinumSummary => !!s && s.total > 0);
  const platinos = known.filter((s) => s.complete).length;
  const enCurso = known.filter((s) => s.unlocked > 0 && !s.complete).length;
  if (known.length === 0) return `${games.length} juegos · calculando su progreso…`;
  // Se cuentan platinos, no porcentajes: es la unidad de esta aplicación.
  const partes = [`${games.length} juegos`];
  partes.push(platinos === 1 ? '1 platino' : `${platinos} platinos`);
  if (enCurso > 0) partes.push(`${enCurso} en curso`);
  return partes.join(' · ');
}

function GameCard({
  game, index, summary,
}: { game: Game; index: number; summary: PlatinumSummary | undefined }) {
  const select = useStore((s) => s.select);
  const go = useStore((s) => s.go);
  const selectedId = useStore((s) => s.selectedId);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const pushToast = useStore((s) => s.pushToast);
  const celebrate = useStore((s) => s.celebrate);
  const [abriendo, setAbriendo] = useState(false);

  const active = selectedId === game.id;
  const platino = summary?.complete === true;

  /**
   * Revive la celebración desde la propia Colección.
   *
   * La tarjeta solo tiene el resumen, y la celebración necesita el informe
   * entero —las horas, la dificultad, lo que tardaste—, así que se pide al
   * abrir. Está cacheado media hora, o sea que casi siempre es instantáneo.
   */
  async function verCelebracion(e: React.MouseEvent) {
    e.stopPropagation();
    setAbriendo(true);
    const res = await api.platinum.report(game.id);
    setAbriendo(false);
    if (!res.ok) return pushToast('error', res.error);
    celebrate(res.data);
  }

  async function launch(e: React.MouseEvent) {
    e.stopPropagation();
    const res = await api.library.launch(game.id);
    if (!res.ok) return pushToast('error', res.error);
    pushToast('info', res.data.pid
      ? `${game.name} lanzado (pid ${res.data.pid})`
      : `${game.name} lanzado`);
  }

  function open() {
    select(game.id);
    go('game');
  }

  return (
    <article
      className={cn(
        'group relative flex cursor-pointer flex-col overflow-hidden rounded-md border bg-surface text-left',
        'defer-render-lg animate-rise',
        'transition-[transform,border-color,box-shadow] duration-[180ms] ease-atreus',
        'hover:-translate-y-1 hover:border-accent hover:shadow-lg hover:shadow-accent/15',
        // Un juego rematado se reconoce de un vistazo en la parrilla: es el
        // único que cambia de color de borde sin que lo toques.
        platino
          ? 'border-[var(--success-line)] shadow-md shadow-emerald-500/10'
          : active ? 'border-accent shadow-md shadow-accent/20' : 'border-line',
      )}
      // El escalonado se corta pronto: con veinte tarjetas ya se ha leído el
      // gesto, y esperar a la número cuarenta solo sería lentitud disfrazada.
      style={{ animationDelay: `${Math.min(index, 14) * 22}ms` }}
    >
      {/* El botón de abrir es hermano de los controles de favorito y lanzar.
          Así no hay botones dentro de otro botón para teclado o lectores. */}
      <button
        type="button"
        onClick={open}
        aria-label={`Abrir ficha de ${game.name}`}
        className="absolute inset-0 z-0 rounded-md focus-visible:outline-accent"
      />
      <div className="relative z-10 flex aspect-[16/9] pointer-events-none items-center justify-center overflow-hidden bg-inset">
        <GameCoverImage game={game} />

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); void toggleFavorite(game.id); }}
          aria-label={game.favorite ? 'Quitar de favoritos' : 'Marcar favorito'}
          className={cn(
            'pointer-events-auto',
            'absolute right-2 top-2 rounded-sm bg-surface/80 p-1.5 backdrop-blur-sm transition-all duration-[120ms]',
            'focus-visible:opacity-100',
            game.favorite
              ? 'text-accent opacity-100'
              : 'text-muted opacity-0 hover:text-fg group-hover:opacity-100',
          )}
        >
          <Star size={15} fill={game.favorite ? 'currentColor' : 'none'} />
        </button>

        {/* El trofeo, solo en los que están al 100 %: es la recompensa de la
            parrilla, y desde aquí se puede volver a ver su celebración. */}
        {platino && (
          <button
            type="button"
            onClick={verCelebracion}
            aria-label={`Ver la celebración del platino de ${game.name}`}
            title="Ver la celebración"
            className="pointer-events-auto absolute left-2 top-2 rounded-sm bg-surface/80 p-1 backdrop-blur-sm transition-transform duration-[120ms] hover:scale-110"
          >
            {abriendo
              ? <LoaderCircle size={20} className="animate-spin text-accent" />
              : <img src={trofeo} alt="" className="h-6 w-auto drop-shadow-[0_2px_8px_rgba(139,92,246,.8)]" />}
          </button>
        )}

        <button
          type="button"
          onClick={launch}
          aria-label={`Lanzar ${game.name}`}
          className="pointer-events-auto absolute bottom-2 left-2 rounded-sm bg-accent p-1.5 text-white opacity-0 shadow-md transition-all duration-[120ms] hover:bg-accent-hover hover:scale-110 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Play size={13} fill="currentColor" />
        </button>
      </div>

      <div className="relative z-10 pointer-events-none flex flex-col gap-1.5 p-3">
        <p className="truncate text-[13px] font-medium" title={game.name}>{game.name}</p>

        {/* El progreso hacia el platino es lo primero que se mira en esta
            aplicación, así que ocupa el sitio que antes tenían las etiquetas. */}
        {summary && summary.total > 0 ? <>
          <Progress
            value={summary.percent}
            tone={summary.complete ? 'success' : 'accent'}
            className="h-1"
            label={`${game.name}: ${summary.unlocked} de ${summary.total} logros`} />
          <p className={cn('flex items-center gap-1 text-[11px]', platino ? 'text-success' : 'text-faint')}>
            <Trophy size={10} className={platino ? 'text-success' : 'text-accent'} />
            {platino
              ? <span className="font-medium">Platino</span>
              : <>
                {summary.unlocked}/{summary.total}
                <span className="tabular-nums">· {summary.percent.toFixed(0)} %</span>
              </>}
            {summary.playtimeMinutes ? <span>· {duration(summary.playtimeMinutes)}</span> : null}
          </p>
        </> : <>
          <div className="flex items-center gap-1.5">
            <Badge>{PLATFORM_LABEL[game.platform] ?? game.platform}</Badge>
            {game.multiplayer && <Badge tone="warn"><Users size={10} className="mr-1" /> Multijugador</Badge>}
          </div>
          <p className="text-[11px] text-faint">
            {game.playtimeMinutes ? `${duration(game.playtimeMinutes)} · ` : ''}{relative(game.lastPlayed)}
          </p>
        </>}
      </div>
    </article>
  );
}
