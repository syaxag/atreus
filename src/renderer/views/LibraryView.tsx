import { useEffect, useMemo, useState } from 'react';
import {
  Check, Search, RefreshCw, Star, Play, Gem, Globe, Plus, Trophy, Users, LoaderCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useStore } from '@/store';
import { cn } from '@/lib/cn';
import { duration, PLATFORM_LABEL, relative } from '@/lib/format';
import { useT, type Clave } from '@/i18n';
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

/*
 * Dos familias de filtro, y conviene que se noten distintas.
 *
 * Las cinco primeras salen de lo que Atreus ya sabe y son instantáneas. Las
 * tres últimas van a preguntar a las guías, a los mapas y a los catálogos de
 * mods de cada juego: cuestan red y tardan. Presentarlas como nueve fichas
 * iguales prometía lo mismo de todas.
 */
const FILTERS: { id: Filter; label: Clave }[] = [
  { id: 'all', label: 'col.todos' },
  { id: 'in-progress', label: 'col.enCurso' },
  { id: 'complete', label: 'col.completos' },
  { id: 'untouched', label: 'col.sinEmpezar' },
  { id: 'favorites', label: 'col.favoritos' },
  { id: 'solo', label: 'col.soloUnJugador' },
];

const CONTENT_FILTERS: { id: Filter; label: Clave }[] = [
  { id: 'guides', label: 'col.conGuia' },
  { id: 'maps', label: 'col.conMapa' },
  { id: 'mods', label: 'col.conMods' },
];

const SORTS: { id: Sort; label: Clave }[] = [
  { id: 'progress', label: 'col.ordenProgreso' },
  { id: 'played', label: 'col.ordenJugado' },
  { id: 'name', label: 'col.ordenNombre' },
];

export function LibraryView() {
  const t = useT();
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
        title={t('col.titulo')}
        subtitle={
          scanning && progress
            ? progress.message
            : summarize(games, platinum, t)
        }
        actions={
          <>
            <Button variant="outline" onClick={addManual}>
              <Plus size={14} /> {t('col.anadirExe')}
            </Button>
            <Button variant="primary" onClick={scan} disabled={scanning}>
              <RefreshCw size={14} className={scanning ? 'animate-spin' : undefined} />
              {t(scanning ? 'col.escaneando' : 'col.escanear')}
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
            placeholder={t('col.buscar')}
            className="w-full pl-8 pr-14"
          />
          {/* El atajo existía desde el principio y no lo sabía nadie. Se
              esconde al escribir para no estorbar encima del texto. */}
          {query === '' && (
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-[4px] border border-line bg-elevated px-1.5 py-0.5 font-sans text-[10px] font-medium text-faint">
              Ctrl K
            </kbd>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f.id}
              size="sm"
              variant={filter === f.id ? 'primary' : 'ghost'}
              onClick={() => setFilter(f.id)}
            >
              {t(f.label)}
            </Button>
          ))}

          {/* La raya separa lo que Atreus ya sabe de lo que va a ir a mirar. */}
          <span className="mx-1 h-4 w-px shrink-0 bg-line-strong" aria-hidden="true" />

          {CONTENT_FILTERS.map((f) => (
            <Button
              key={f.id}
              size="sm"
              variant={filter === f.id ? 'primary' : 'ghost'}
              onClick={() => setFilter(f.id)}
              title={t('col.filtroEnLinea')}
            >
              <Globe size={11} className={filter === f.id ? undefined : 'text-faint'} />
              {t(f.label)}
            </Button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-[12px] text-faint">
          {t('col.ordenarPor')}
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as Sort)}
            className="h-7 rounded-sm border border-line bg-inset px-2 text-[12px] text-fg focus:border-accent focus:outline-none"
          >
            {SORTS.map((option) => (
              <option key={option.id} value={option.id}>{t(option.label)}</option>
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
                <span className="text-muted">{t('col.comprobando', { n: games.length })}</span>
              </>
            ) : (
              <>
                <Check size={14} className="shrink-0 text-success" />
                <span className="text-muted">{t('col.comprobado', { cuando: comprobadoHace ?? '' })}</span>
              </>
            )}
          </div>
        )}

        {loading || loadingContent ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(158px,1fr))] gap-4">
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="aspect-[2/3] rounded-md" />
            ))}
          </div>
        ) : visible.length === 0 ? games.length === 0 ? (
          <CollectionOnboarding onScan={scan} onAddManual={addManual} scanning={scanning} />
        ) : (
          <Empty
            icon={<Gem size={40} strokeWidth={1.25} />}
            title={t('col.sinCoincidencias')}
            hint={t('col.sinCoincidenciasPista')}
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

  /*
   * El póster vertical primero, y el banner apaisado solo como red.
   *
   * Un póster 2:3 llena la tarjeta; un banner 16:9 dentro de un hueco 2:3 hay
   * que recortarlo, y se come la mitad de la imagen. Por eso se intenta el
   * póster de la caché local, luego el de Steam directamente, y solo después
   * lo apaisado. Los estrenos muy recientes no tienen póster en el CDN
   * —comprobado con dos de la biblioteca de prueba—, y para esos el recorte
   * del banner es mejor que un hueco.
   */
  const fallbacks = useMemo(() => {
    const list: string[] = [];
    if (game.portraitUrl) list.push(game.portraitUrl);
    if (game.platform === 'steam' && game.nativeId) {
      list.push(`https://cdn.cloudflare.steamstatic.com/steam/apps/${game.nativeId}/library_600x900_2x.jpg`);
      list.push(`https://cdn.cloudflare.steamstatic.com/steam/apps/${game.nativeId}/library_600x900.jpg`);
    }
    if (game.headerUrl) list.push(game.headerUrl);
    if (game.platform === 'steam' && game.nativeId) {
      list.push(`https://cdn.cloudflare.steamstatic.com/steam/apps/${game.nativeId}/header.jpg`);
      list.push(`https://cdn.cloudflare.steamstatic.com/steam/apps/${game.nativeId}/capsule_616x353.jpg`);
      list.push(`https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${game.nativeId}/header.jpg`);
    }
    // Una cadena vacía es una candidata que el navegador acepta y no pinta:
    // deja un `<img>` roto de 0×0 en vez de caer a las iniciales. Medido en
    // Minecraft, que llegaba con la dirección en blanco.
    return list.filter((url) => url.trim().length > 0);
  }, [game.portraitUrl, game.headerUrl, game.platform, game.nativeId]);

  /**
   * Las carátulas que no estaban en disco se descargan en segundo plano y
   * llegan por `library:updated`. Guardar la URL en un estado inicial dejaba la
   * tarjeta con las iniciales para siempre: el índice se reinicia cuando la
   * lista de candidatas cambia, y la imagen aparece sola.
   */
  useEffect(() => { setFallbackIndex(0); }, [fallbacks]);

  const imgSrc = fallbacks[fallbackIndex] ?? null;

  /*
   * Un banner apaisado no se estira para llenar un hueco vertical.
   *
   * Medido: los juegos sin póster caían a su banner de 460×215 metido con
   * `cover` en una tarjeta de 217×325. Eso amplía **1,5 veces en vertical** y
   * recorta el 69 % del ancho: la imagen sale pixelada y descuadrada, que es
   * justo como se veía.
   *
   * La proporción no se sabe hasta que la imagen carga —puede ganar cualquiera
   * de las candidatas—, así que se mide al cargarla. Si es apaisada, se
   * presenta como lo hacen Playnite o GOG cuando les falta el arte vertical:
   * el propio banner difuminado llenando el fondo y el banner entero encima,
   * sin recortar ni ampliar. Parece hecho a propósito en vez de roto.
   */
  const [proporcion, setProporcion] = useState<number | null>(null);
  const apaisada = proporcion !== null && proporcion > 1.1;

  if (imgSrc) {
    return (
      <div className="relative h-full w-full overflow-hidden">
        {apaisada && (
          <div
            aria-hidden="true"
            className="absolute inset-0 scale-125 bg-cover bg-center opacity-45 blur-lg"
            style={{ backgroundImage: `url("${imgSrc}")` }}
          />
        )}
        <img
          src={imgSrc}
          alt=""
          onError={() => setFallbackIndex((value) => value + 1)}
          onLoad={(event) => {
            const { naturalWidth: w, naturalHeight: h } = event.currentTarget;
            if (w > 0 && h > 0) setProporcion(w / h);
          }}
          loading="lazy"
          decoding="async"
          className={cn(
            'relative h-full w-full transition-transform duration-500 ease-atreus group-hover:scale-[1.07]',
            apaisada ? 'object-contain' : 'object-cover',
          )}
        />
        {/* Con el banner centrado sobra sitio arriba y abajo: el nombre lo
            ocupa, que es lo que haría falta leer de todos modos. */}
        {apaisada && (
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2.5 pb-2 pt-6 text-center text-[12px] font-semibold leading-tight text-white">
            {game.name}
          </span>
        )}
      </div>
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

function summarize(
  games: Game[],
  platinum: Record<string, PlatinumSummary>,
  t: (clave: Clave, huecos?: Record<string, string | number>) => string,
): string {
  const known = games
    .map((game) => platinum[game.id])
    .filter((s): s is PlatinumSummary => !!s && s.total > 0);
  const platinos = known.filter((s) => s.complete).length;
  const enCurso = known.filter((s) => s.unlocked > 0 && !s.complete).length;
  if (known.length === 0) return t('col.calculando', { n: games.length });
  if (enCurso === 0) return t('col.resumen', { n: games.length });
  /*
   * El singular tiene su propia clave y no se compone.
   *
   * Decía "1 platinums": el número iba por un hueco y la palabra estaba fija en
   * plural. Con dos idiomas y más por venir, la frase entera por caso es lo
   * único que sobrevive a las lenguas que declinan de otra manera.
   */
  return t(platinos === 1 ? 'col.resumenUnPlatino' : 'col.resumenPlatinos', {
    n: games.length, platinos, curso: enCurso,
  });
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
        'defer-render-lg',
        /*
         * La entrada escalonada, solo en la primera pantalla.
         *
         * `animate-rise` rellena hacia atrás (`both`), o sea que mantiene la
         * tarjeta invisible hasta que su animación arranca. Y `content-visibility`
         * **no arranca las animaciones de lo que se salta**: una tarjeta que
         * entraba en la rejilla justo fuera de vista se quedaba en blanco, con su
         * hueco reservado, hasta que se desplazaba hasta ella. Se veía como un
         * agujero en la parrilla.
         *
         * Las doce primeras son las que se ven al abrir, que es donde el gesto
         * significa algo; las demás aparecen sin más, que es lo que hacían de
         * todos modos al llegar a ellas.
         */
        index < 12 && 'animate-rise',
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
      style={index < 12 ? { animationDelay: `${index * 22}ms` } : undefined}
      /*
       * Toda la tarjeta abre, menos sus controles.
       *
       * Antes había un botón invisible cubriéndola entera y el contenido iba
       * con `pointer-events: none` para dejar pasar el clic; eso también
       * apagaba los tooltips, y el nombre recortado se quedaba sin su `title`
       * justo donde más falta hace. Preguntar por el botón más cercano
       * devuelve el ratón a su sitio: el teclado entra por el nombre, que es
       * un botón de verdad y lleva el nombre accesible de la tarjeta.
       */
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button')) return;
        open();
      }}
    >
      {/*
        2:3, la proporción del póster. Es el cambio que separa "una tabla con
        miniaturas" de "una estantería de juegos", y es la forma en la que
        Steam, GOG y Playnite enseñan una biblioteca desde hace años.
      */}
      <div className="relative flex aspect-[2/3] items-center justify-center overflow-hidden bg-inset">
        <GameCoverImage game={game} />

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); void toggleFavorite(game.id); }}
          aria-label={game.favorite ? 'Quitar de favoritos' : 'Marcar favorito'}
          className={cn(
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
            className="absolute left-2 top-2 rounded-sm bg-surface/80 p-1 backdrop-blur-sm transition-transform duration-[120ms] hover:scale-110"
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
          className="absolute bottom-2 left-2 rounded-sm bg-accent p-1.5 text-white opacity-0 shadow-md transition-all duration-[120ms] hover:bg-accent-hover hover:scale-110 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Play size={13} fill="currentColor" />
        </button>
      </div>

      <div className="flex flex-col gap-1.5 p-3">
        {/* El nombre es el botón: es la entrada de teclado a la ficha y el
            nombre accesible de la tarjeta, y ahora vuelve a tener tooltip. */}
        <button
          type="button"
          onClick={open}
          title={game.name}
          className="truncate rounded-sm text-left text-[13px] font-medium transition-colors duration-[120ms] hover:text-accent-hover"
        >
          {game.name}
        </button>

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
