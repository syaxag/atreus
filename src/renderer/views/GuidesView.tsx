import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check, CheckSquare2, ChevronLeft, ExternalLink, FileText, Gamepad2, Globe,
  LoaderCircle, Plus, RefreshCw, Search, Star, Trophy,
} from 'lucide-react';
import type {
  CompletionProgress, GuideCategory, GuideDocument, GuideEntry,
} from '@shared/types';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useStore } from '@/store';
import { useT, type Clave } from '@/i18n';
import { nombreGuia } from '@/lib/contenido';
import { Badge, Button, Card, Empty, Input, Skeleton, ViewHeader } from '@/components/ui';

/**
 * Guías con texto, no con enlaces.
 *
 * Atreus busca solo —el usuario elige qué quiere, no teclea una consulta— y
 * pone delante las fuentes de las que sabe extraer el contenido entero. Las que
 * no dejan extraerse se marcan como tales en vez de abrirse en una hoja vacía,
 * que era el defecto de la versión anterior.
 */

const CATEGORIES: { id: GuideCategory; label: Clave }[] = [
  { id: 'platinum', label: 'rutas.catPlatino' },
  { id: 'achievements', label: 'rutas.catLogros' },
  { id: 'collectibles', label: 'rutas.catColeccionables' },
  { id: 'walkthrough', label: 'rutas.catWalkthrough' },
  { id: 'bosses', label: 'rutas.catJefes' },
];

export function GuidesView() {
  const t = useT();
  const game = useStore((state) => state.selected());
  const pushToast = useStore((state) => state.pushToast);
  const guideSearch = useStore((state) => state.guideSearch);
  const clearGuideSearch = useStore((state) => state.clearGuideSearch);
  const gameId = game?.id;

  const [category, setCategory] = useState<GuideCategory>('platinum');
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [entries, setEntries] = useState<GuideEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [document, setDocument] = useState<GuideDocument | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  /** Evita que una búsqueda lenta anterior pise la categoría o el logro actual. */
  const requestId = useRef(0);

  const load = useCallback(async (refresh = false) => {
    if (!gameId) return;
    const currentRequest = ++requestId.current;
    if (refresh) setRefreshing(true);
    else setRefreshing(false);
    setEntries(null);
    setError(null);
    const response = await api.guides.list(gameId, category, submitted || undefined, refresh);
    if (currentRequest !== requestId.current) return;
    setRefreshing(false);
    if (!response.ok) { setEntries([]); setError(response.error); return; }
    setEntries(response.data);
  }, [gameId, category, submitted]);

  useEffect(() => { setDocument(null); void load(); }, [load]);

  // Llegar desde un logro conserva su nombre como búsqueda, pero deja la caja
  // editable: Atreus propone contexto, no finge saber qué guía lo contiene.
  useEffect(() => {
    if (!guideSearch) return;
    setCategory('achievements');
    setQuery(guideSearch);
    setSubmitted(guideSearch);
    clearGuideSearch();
  }, [guideSearch, clearGuideSearch]);

  async function open(entry: GuideEntry) {
    setReading(entry.url);
    const response = await api.guides.read(entry);
    setReading(null);
    if (!response.ok) { pushToast('error', response.error); return; }
    setDocument(response.data);
  }

  if (!game || !gameId) {
    return <Empty
      icon={<Gamepad2 size={40} strokeWidth={1.25} />}
      title={t('rutas.sinJuego')}
      hint={t('rutas.sinJuegoPista')} />;
  }

  if (document) {
    return <Reader document={document} onBack={() => setDocument(null)} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        title={`${t('lateral.rutas')} · ${game.name}`}
        subtitle={t('rutas.subtitulo')}
        actions={<Button variant="outline" onClick={() => void load(true)} disabled={refreshing}>
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : undefined} />
          {t(refreshing ? 'rutas.actualizando' : 'rutas.actualizar')}
        </Button>}
      />

      <div className="flex flex-wrap items-center gap-3 border-b border-line px-6 py-3">
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map((item) => (
            <Button
              key={item.id}
              size="sm"
              variant={category === item.id ? 'primary' : 'ghost'}
              onClick={() => setCategory(item.id)}
            >
              {item.id === 'platinum' && <Trophy size={13} />}
              {t(item.label)}
            </Button>
          ))}
        </div>
        <form
          className="relative ml-auto w-full max-w-xs"
          onSubmit={(event) => { event.preventDefault(); setSubmitted(query.trim()); }}
        >
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('rutas.afinar')}
            className="w-full pl-8"
          />
        </form>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto px-6 py-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-w-0">
          {entries === null ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-24" />)}
            </div>
          ) : entries.length === 0 ? (
            <Empty
              icon={<Search size={40} strokeWidth={1.25} />}
              title={t('rutas.sinResultados')}
              hint={error ?? t('rutas.sinResultadosPista')}
              action={<Button variant="outline" onClick={() => void load(true)}>{t('rutas.reintentar')}</Button>} />
          ) : (
            <div className="flex flex-col gap-2">
              {entries.map((entry) => (
                <GuideCard
                  key={entry.url}
                  entry={entry}
                  busy={reading === entry.url}
                  onOpen={() => void open(entry)} />
              ))}
            </div>
          )}
        </section>
        <aside><Checklist gameId={gameId} /></aside>
      </div>
    </div>
  );
}

function GuideCard({ entry, busy, onOpen }: { entry: GuideEntry; busy: boolean; onOpen: () => void }) {
  const t = useT();
  return (
    <article className="rounded-md border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-semibold leading-snug">{entry.title}</h2>
          {entry.snippet && <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-muted">{entry.snippet}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge mono>{nombreGuia(t, entry.source)}</Badge>
            {entry.language === 'es' && <Badge tone="accent">{t('rutas.enCastellano')}</Badge>}
            {entry.author && (
              <span className="text-[11px] text-faint">{t('rutas.porAutor', { autor: entry.author })}</span>
            )}
            {entry.rating !== null && (
              <span className="flex items-center gap-0.5 text-[11px] text-faint">
                <Star size={10} fill="currentColor" /> {entry.rating}/5
              </span>
            )}
            {!entry.readable && (
              <span className="flex items-center gap-1 text-[11px] text-faint">
                <Globe size={10} /> {t('rutas.soloExtracto')}
              </span>
            )}
          </div>
        </div>
        <Button size="sm" variant={entry.readable ? 'primary' : 'outline'} disabled={busy} onClick={onOpen}>
          {busy ? <LoaderCircle size={14} className="animate-spin" /> : <FileText size={14} />}
          {t(busy ? 'rutas.cargando' : 'rutas.leerAqui')}
        </Button>
      </div>
    </article>
  );
}

/**
 * El lector de una guía.
 *
 * Es el único sitio de Atreus donde se lee de verdad, no se ojea: una guía de
 * platino de Steam son párrafos seguidos durante media hora y puede traer
 * treinta secciones. Por eso aquí el texto es más grande y más claro que en el
 * resto de la aplicación, la columna se mide en caracteres y no en píxeles, y
 * hay un índice para no scrollear a ciegas.
 */
function Reader({ document, onBack }: { document: GuideDocument; onBack: () => void }) {
  const t = useT();
  const scroll = useRef<HTMLElement | null>(null);
  const [avance, setAvance] = useState(0);
  const [activa, setActiva] = useState(0);
  const conIndice = !document.partial && document.sections.length >= 3;

  /*
   * Cuánto llevas leído y en qué sección estás.
   *
   * Se calcula al vuelo desde el contenedor en vez de con un observador por
   * sección: son dos lecturas de `offsetTop` por evento y evita montar treinta
   * `IntersectionObserver` en una guía larga.
   */
  const alDesplazar = useCallback(() => {
    const nodo = scroll.current;
    if (!nodo) return;
    const recorrible = nodo.scrollHeight - nodo.clientHeight;
    setAvance(recorrible > 0 ? (nodo.scrollTop / recorrible) * 100 : 0);

    const secciones = [...nodo.querySelectorAll<HTMLElement>('[data-seccion]')];
    // La activa es la última cuyo encabezado ya ha pasado por arriba.
    let cual = 0;
    for (const [i, s] of secciones.entries()) {
      if (s.offsetTop - nodo.scrollTop <= 120) cual = i;
    }
    setActiva(cual);
  }, []);

  function irA(indice: number) {
    const nodo = scroll.current;
    const destino = nodo?.querySelectorAll<HTMLElement>('[data-seccion]')[indice];
    if (nodo && destino) nodo.scrollTo({ top: destino.offsetTop - 16, behavior: 'smooth' });
  }

  /*
   * El índice sigue a la lectura.
   *
   * En una guía de cincuenta secciones, marcar la activa no sirve de nada si
   * está fuera de la parte visible del índice: por la sección 45 el resalte
   * queda debajo del borde y desde fuera parece que no marca ninguna.
   * `block: 'nearest'` mueve solo lo justo, y solo el índice.
   */
  const indice = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const marcada = indice.current?.querySelector<HTMLElement>('button[aria-current]');
    marcada?.scrollIntoView({ block: 'nearest' });
  }, [activa]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ChevronLeft size={15} /> {t('lateral.rutas')}
        </Button>
        <p className="mx-2 min-w-0 flex-1 truncate text-[12px] text-muted">
          {document.title || t('rutas.guiaSinTitulo')}
        </p>
        <Badge mono>{nombreGuia(t, document.source)}</Badge>
        <Button size="sm" variant="outline" onClick={() => void api.settings.openPath(document.url)}>
          <ExternalLink size={13} /> {t('rutas.abrirFuera')}
        </Button>
      </div>

      {/* Cuánto queda. En una guía de treinta secciones, la barra de
          desplazamiento sola no dice gran cosa. */}
      <div className="h-0.5 w-full shrink-0 bg-inset">
        <div
          className="h-full origin-left bg-accent"
          style={{ transform: `scaleX(${avance / 100})` }}
        />
      </div>

      <div className="flex min-h-0 flex-1">
      <article
        ref={scroll as never}
        onScroll={alDesplazar}
        className="min-h-0 flex-1 overflow-y-auto px-6 py-5"
      >
        {/* La columna se mide en caracteres: a 65 el ojo vuelve al principio de
            la línea siguiente sin perderse, que es de lo que va leer. */}
        <div className="mx-auto max-w-[65ch]">
          <h1 className="text-[22px] font-semibold leading-tight">
            {document.title || t('rutas.guiaSinTitulo')}
          </h1>
          {document.author && (
            <p className="mt-1 text-[12px] text-faint">{t('rutas.porAutor', { autor: document.author })}</p>
          )}
          {document.summary && <p className="mt-3 text-[13px] leading-6 text-muted">{document.summary}</p>}

          <p className="mt-4 border-y border-line py-2.5 text-[11px] leading-5 text-faint">
            {t('rutas.textoDe', { fuente: nombreGuia(t, document.source) })}
          </p>

          {document.partial ? (
            <Empty
              icon={<FileText size={28} />}
              title={t('rutas.parcialTitulo')}
              hint={t('rutas.parcialPista')}
              action={<Button variant="outline" onClick={() => void api.settings.openPath(document.url)}>
                <ExternalLink size={14} /> {t('rutas.abrirNavegador')}
              </Button>} />
          ) : (
            <div className="mt-6 flex flex-col gap-8">
              {document.sections.map((section, index) => (
                <section key={`${section.heading}-${index}`} data-seccion={index}>
                  <h2 className="text-[17px] font-semibold leading-snug">{section.heading}</h2>
                  {/* 15 px y interlineado 1,75: es texto para leer seguido, no
                      una etiqueta que se ojea. */}
                  <p className="mt-2 whitespace-pre-line text-[15px] leading-[1.75] text-[var(--text-read)]">
                    {section.body}
                  </p>
                  {section.images.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {section.images.map((src) => (
                        <img key={src} src={src} alt="" loading="lazy"
                          className="max-h-64 rounded-sm border border-line object-contain" />
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}
        </div>
      </article>

      {/* El índice, solo cuando hay secciones que justifiquen uno y sitio para
          ponerlo. El umbral es lg (1024 px) y no xl: la ventana por defecto mide 1200,
          así que con xl el índice no habría aparecido nunca. */}
      {conIndice && (
        <nav ref={indice as never} className="hidden w-56 shrink-0 overflow-y-auto border-l border-line px-3 py-5 lg:block">
          <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-faint">
            {t('rutas.enEstaGuia')}
          </p>
          <ul className="mt-2 flex flex-col gap-0.5">
            {document.sections.map((section, index) => (
              <li key={`${section.heading}-${index}`}>
                <button
                  type="button"
                  onClick={() => irA(index)}
                  aria-current={index === activa ? 'true' : undefined}
                  className={cn(
                    'w-full rounded-sm px-2 py-1.5 text-left text-[12px] leading-snug',
                    'transition-colors duration-[120ms] ease-atreus',
                    index === activa
                      ? 'bg-accent-soft font-medium text-fg'
                      : 'text-muted hover:bg-elevated hover:text-fg',
                  )}
                >
                  {section.heading}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
      </div>
    </div>
  );
}

/** Checklist local del juego. No toca logros ni partidas: vive solo aquí. */
function Checklist({ gameId }: { gameId: string }) {
  const t = useT();
  const pushToast = useStore((state) => state.pushToast);
  const [progress, setProgress] = useState<CompletionProgress | null>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setProgress(null);
    void api.progress.get(gameId).then((response) => {
      if (response.ok) setProgress(response.data);
      else pushToast('error', response.error);
    });
  }, [gameId, pushToast]);

  async function save(next: CompletionProgress) {
    setProgress(next);
    const response = await api.progress.save(next);
    if (!response.ok) { pushToast('error', response.error); return; }
    setProgress(response.data);
  }

  const done = progress?.items.filter((item) => item.done).length ?? 0;
  const total = progress?.items.length ?? 0;

  return (
    <Card className="sticky top-0 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CheckSquare2 size={16} className="text-accent" />
          <h2 className="text-[13px] font-semibold">{t('rutas.tuRuta')}</h2>
        </div>
        <Badge tone={done === total && total > 0 ? 'success' : 'accent'}>{done}/{total}</Badge>
      </div>
      <p className="mt-1 text-[12px] leading-5 text-faint">{t('rutas.tuRutaPista')}</p>

      {!progress ? (
        <div className="mt-4 flex flex-col gap-2"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
      ) : <>
        <div className="mt-4 flex flex-col gap-1">
          {progress.items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => void save({
                ...progress,
                items: progress.items.map((it) => it.id === item.id ? { ...it, done: !it.done } : it),
              })}
              className="flex items-center gap-2 rounded-sm px-1.5 py-2 text-left text-[12px] transition-colors hover:bg-elevated"
            >
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${item.done ? 'border-accent bg-accent text-white' : 'border-line'}`}>
                {item.done && <Check size={11} />}
              </span>
              <span className={item.done ? 'text-faint line-through' : 'text-fg'}>{item.label}</span>
            </button>
          ))}
        </div>

        <form
          className="mt-3 flex gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            const label = draft.trim();
            if (!label) return;
            setDraft('');
            void save({
              ...progress,
              items: [...progress.items, {
                id: `custom-${Date.now().toString(36)}`, label, kind: 'note', done: false,
              }],
            });
          }}
        >
          <Input value={draft} onChange={(event) => setDraft(event.target.value)}
            placeholder={t('rutas.anadirObjetivo')} className="min-w-0" />
          <Button size="sm" type="submit" disabled={!draft.trim()} aria-label={t('rutas.anadirObjetivoBoton')}>
            <Plus size={14} />
          </Button>
        </form>

        <label className="mt-4 block text-[12px] font-medium text-muted" htmlFor="completion-notes">
          {t('rutas.notas')}
        </label>
        <textarea
          id="completion-notes"
          key={progress.gameId}
          defaultValue={progress.notes}
          onBlur={(event) => void save({ ...progress, notes: event.target.value })}
          placeholder={t('rutas.notasPista')}
          className="mt-1.5 h-24 w-full resize-y rounded-sm border border-line bg-inset p-2 text-[12px] text-fg placeholder:text-faint focus:border-accent focus:outline-none"
        />
      </>}
    </Card>
  );
}
