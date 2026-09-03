import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check, CheckSquare2, ChevronLeft, ExternalLink, FileText, Gamepad2, Globe,
  LoaderCircle, Plus, RefreshCw, Search, Star, Trophy,
} from 'lucide-react';
import type {
  CompletionProgress, GuideCategory, GuideDocument, GuideEntry,
} from '@shared/types';
import { api } from '@/lib/api';
import { useStore } from '@/store';
import { Badge, Button, Card, Empty, Input, Skeleton, ViewHeader } from '@/components/ui';

/**
 * Guías con texto, no con enlaces.
 *
 * Atreus busca solo —el usuario elige qué quiere, no teclea una consulta— y
 * pone delante las fuentes de las que sabe extraer el contenido entero. Las que
 * no dejan extraerse se marcan como tales en vez de abrirse en una hoja vacía,
 * que era el defecto de la versión anterior.
 */

const CATEGORIES: { id: GuideCategory; label: string }[] = [
  { id: 'platinum', label: '100 % / platino' },
  { id: 'achievements', label: 'Logros' },
  { id: 'collectibles', label: 'Coleccionables' },
  { id: 'walkthrough', label: 'Walkthrough' },
  { id: 'bosses', label: 'Jefes' },
];

export function GuidesView() {
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
      title="Ningún juego seleccionado"
      hint="Elige un juego en la Colección para que Atreus busque sus guías." />;
  }

  if (document) {
    return <Reader document={document} onBack={() => setDocument(null)} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        title={`Rutas · ${game.name}`}
        subtitle="Buscadas automáticamente. Las que Atreus sabe leer se abren aquí dentro, con su texto completo."
        actions={<Button variant="outline" onClick={() => void load(true)} disabled={refreshing}>
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : undefined} />
          {refreshing ? 'Actualizando…' : 'Actualizar'}
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
              {item.label}
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
            placeholder="Afinar la búsqueda (opcional)…"
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
              title="No se encontró ninguna guía"
              hint={error ?? 'Prueba otra categoría o escribe algo concreto en el buscador de arriba.'}
              action={<Button variant="outline" onClick={() => void load(true)}>Reintentar</Button>} />
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
  return (
    <article className="rounded-md border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-semibold leading-snug">{entry.title}</h2>
          {entry.snippet && <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-muted">{entry.snippet}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge mono>{entry.source}</Badge>
            {entry.language === 'es' && <Badge tone="accent">Español</Badge>}
            {entry.author && <span className="text-[11px] text-faint">por {entry.author}</span>}
            {entry.rating !== null && (
              <span className="flex items-center gap-0.5 text-[11px] text-faint">
                <Star size={10} fill="currentColor" /> {entry.rating}/5
              </span>
            )}
            {!entry.readable && (
              <span className="flex items-center gap-1 text-[11px] text-faint">
                <Globe size={10} /> puede que solo salga un extracto
              </span>
            )}
          </div>
        </div>
        <Button size="sm" variant={entry.readable ? 'primary' : 'outline'} disabled={busy} onClick={onOpen}>
          {busy ? <LoaderCircle size={14} className="animate-spin" /> : <FileText size={14} />}
          {busy ? 'Cargando' : 'Leer aquí'}
        </Button>
      </div>
    </article>
  );
}

function Reader({ document, onBack }: { document: GuideDocument; onBack: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
        <Button size="sm" variant="ghost" onClick={onBack}><ChevronLeft size={15} /> Rutas</Button>
        <p className="mx-2 min-w-0 flex-1 truncate text-[12px] text-muted">{document.title}</p>
        <Badge mono>{document.source}</Badge>
        <Button size="sm" variant="outline" onClick={() => void api.settings.openPath(document.url)}>
          <ExternalLink size={13} /> Abrir fuera
        </Button>
      </div>

      <article className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-[22px] font-semibold leading-tight">{document.title}</h1>
          {document.author && <p className="mt-1 text-[12px] text-faint">por {document.author}</p>}
          {document.summary && <p className="mt-3 text-[13px] leading-6 text-muted">{document.summary}</p>}

          <p className="mt-4 border-y border-line py-2.5 text-[11px] leading-5 text-faint">
            Texto de {document.source}, mostrado dentro de Atreus con enlace a la fuente original.
            Atreus no aloja ni republica guías: si quieres apoyar a quien la escribió, ábrela fuera.
          </p>

          {document.partial ? (
            <Empty
              icon={<FileText size={28} />}
              title="Esta fuente no permite extraer su texto"
              hint="Se conserva su resumen. Ábrela en el navegador para leerla entera."
              action={<Button variant="outline" onClick={() => void api.settings.openPath(document.url)}>
                <ExternalLink size={14} /> Abrir en el navegador
              </Button>} />
          ) : (
            <div className="mt-5 flex flex-col gap-6">
              {document.sections.map((section, index) => (
                <section key={`${section.heading}-${index}`}>
                  <h2 className="text-[15px] font-semibold">{section.heading}</h2>
                  <p className="mt-1.5 whitespace-pre-line text-[13px] leading-6 text-muted">{section.body}</p>
                  {section.images.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
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
    </div>
  );
}

/** Checklist local del juego. No toca logros ni partidas: vive solo aquí. */
function Checklist({ gameId }: { gameId: string }) {
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
          <h2 className="text-[13px] font-semibold">Tu ruta</h2>
        </div>
        <Badge tone={done === total && total > 0 ? 'success' : 'accent'}>{done}/{total}</Badge>
      </div>
      <p className="mt-1 text-[12px] leading-5 text-faint">
        Notas y objetivos que te apuntas tú. Se guardan solo en este equipo.
      </p>

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
            placeholder="Añadir objetivo…" className="min-w-0" />
          <Button size="sm" type="submit" disabled={!draft.trim()} aria-label="Añadir objetivo">
            <Plus size={14} />
          </Button>
        </form>

        <label className="mt-4 block text-[12px] font-medium text-muted" htmlFor="completion-notes">
          Notas de la partida
        </label>
        <textarea
          id="completion-notes"
          key={progress.gameId}
          defaultValue={progress.notes}
          onBlur={(event) => void save({ ...progress, notes: event.target.value })}
          placeholder="Rutas, jefes, coleccionables pendientes…"
          className="mt-1.5 h-24 w-full resize-y rounded-sm border border-line bg-inset p-2 text-[12px] text-fg placeholder:text-faint focus:border-accent focus:outline-none"
        />
      </>}
    </Card>
  );
}
