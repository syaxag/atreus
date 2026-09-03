import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, ExternalLink, LoaderCircle, Map as MapIcon, Plus, RotateCw, Trash2,
  Gamepad2,
} from 'lucide-react';
import type { InteractiveMap } from '@shared/types';
import { api } from '@/lib/api';
import { useStore } from '@/store';
import { useT } from '@/i18n';
import { proveedorMapa, textoMapa, tituloMapa } from '@/lib/contenido';
import { Badge, Button, Card, Empty, Input, Modal, Skeleton, ViewHeader } from '@/components/ui';

/**
 * Mapas interactivos, abiertos dentro de Atreus.
 *
 * El mapa no se redibuja: se carga el del proveedor en un `<webview>`, que es
 * un contexto aislado sin acceso al puente `window.atreus` ni al disco. Así
 * funcionan los marcadores, los filtros y el progreso reales del mapa, en vez
 * del atlas de juguete que había antes y que solo existía para dos juegos.
 */

export function MapsView() {
  const t = useT();
  const game = useStore((state) => state.selected());
  const pushToast = useStore((state) => state.pushToast);
  const gameId = game?.id;

  const [maps, setMaps] = useState<InteractiveMap[] | null>(null);
  const [active, setActive] = useState<InteractiveMap | null>(null);
  const [loadingFrame, setLoadingFrame] = useState(false);
  const [frameError, setFrameError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: '', url: '' });
  const [saving, setSaving] = useState(false);
  const [refreshingMaps, setRefreshingMaps] = useState(false);
  const frame = useRef<HTMLElement & {
    reload(): void; goBack(): void; goForward(): void; canGoBack(): boolean;
  } | null>(null);

  const loadMaps = useCallback(async (refresh = false) => {
    if (!gameId) { setMaps(null); return; }
    if (refresh) setRefreshingMaps(true);
    setMaps(null);
    const response = await api.maps.list(gameId, refresh);
    if (refresh) setRefreshingMaps(false);
    if (!response.ok) { setMaps([]); pushToast('error', response.error); return; }
    setMaps(response.data);
    // Con un solo mapa no tiene sentido obligar a elegir.
    if (response.data.length === 1) setActive(response.data[0]!);
  }, [gameId, pushToast]);

  useEffect(() => {
    setActive(null);
    void loadMaps();
  }, [gameId, loadMaps]);

  // Un proveedor puede bloquear el webview o dejar de existir. Nunca se debe
  // quedar un lienzo blanco sin explicar qué pasó ni cómo continuar.
  useEffect(() => {
    setFrameError(null);
    setLoadingFrame(active !== null);
  }, [active]);

  /*
   * El plazo se cuenta hasta `dom-ready`, no hasta que la página entera calle.
   *
   * Medido contra mapgenie.io: el documento está listo a los 5 s y el mapa ya
   * se usa, pero `did-stop-loading` no llega hasta los 29 porque detrás siguen
   * cargándose cientos de marcos de sincronización de anuncios. Con el plazo
   * atado a eso, el aviso de "tarda demasiado" saltaba encima de un mapa que
   * funcionaba, y volvía a saltar cada vez que un marco nuevo reabría la carga.
   */
  useEffect(() => {
    if (!active || !loadingFrame) return;
    const timeout = window.setTimeout(() => {
      setLoadingFrame(false);
      setFrameError(t('atlas.tarda'));
    }, 20_000);
    return () => window.clearTimeout(timeout);
  }, [active, loadingFrame, t]);

  // El <webview> no emite eventos de React: hay que engancharse a los suyos.
  const attach = useCallback((node: HTMLElement | null) => {
    frame.current = node as typeof frame.current;
    if (!node) return;

    /*
     * Solo el marco principal cuenta. `did-start-loading` y `did-stop-loading`
     * hablan de la pestaña entera: con 479 marcos de anuncios encendiéndose y
     * apagándose, encendían y apagaban el cartel de carga sin parar. `load-commit`
     * sí dice si la navegación es del marco principal, y `dom-ready` es el
     * momento en que el mapa se puede usar.
     */
    const commit = (event: Event) => {
      if ((event as Event & { isMainFrame?: boolean }).isMainFrame !== true) return;
      setFrameError(null);
      setLoadingFrame(true);
    };
    const listo = () => setLoadingFrame(false);
    /*
     * `did-fail-load` también salta por un subrecurso o un subframe: los
     * anuncios y los trackers de un mapa fallan a diario y el mapa se ve
     * perfectamente. Solo el marco principal significa que no hay mapa. El
     * código -3 (ERR_ABORTED) es una navegación cancelada, no un fallo.
     */
    const fail = (event: Event) => {
      const detail = event as Event & { isMainFrame?: boolean; errorCode?: number };
      if (detail.isMainFrame !== true || detail.errorCode === -3) return;
      setLoadingFrame(false);
      setFrameError(t('atlas.noAbre'));
    };
    node.addEventListener('load-commit', commit);
    node.addEventListener('dom-ready', listo);
    node.addEventListener('did-fail-load', fail);
  }, [t]);

  async function addMap() {
    if (!gameId) return;
    setSaving(true);
    const response = await api.maps.add(gameId, { title: draft.title.trim(), url: draft.url.trim() });
    setSaving(false);
    if (!response.ok) return pushToast('error', response.error);
    setMaps(response.data);
    setAdding(false);
    setDraft({ title: '', url: '' });
    pushToast('success', t('atlas.mapaAnadido'));
  }

  async function removeMap(mapId: string) {
    if (!gameId) return;
    const response = await api.maps.remove(gameId, mapId);
    if (!response.ok) return pushToast('error', response.error);
    setMaps(response.data);
  }

  function retryFrame() {
    setFrameError(null);
    setLoadingFrame(true);
    frame.current?.reload();
  }

  if (!game || !gameId) {
    return <Empty
      icon={<Gamepad2 size={40} strokeWidth={1.25} />}
      title={t('atlas.sinJuego')}
      hint={t('atlas.sinJuegoPista')} />;
  }

  if (active) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
          <Button size="sm" variant="ghost" onClick={() => setActive(null)}>
            <ArrowLeft size={14} /> {t('lateral.atlas')}
          </Button>
          <div className="mx-1 h-5 w-px bg-line" />
          <Button size="sm" variant="ghost" aria-label={t('atlas.atras')} onClick={() => frame.current?.goBack()}>
            <ArrowLeft size={14} />
          </Button>
          <Button size="sm" variant="ghost" aria-label={t('atlas.adelante')} onClick={() => frame.current?.goForward()}>
            <ArrowRight size={14} />
          </Button>
          <Button size="sm" variant="ghost" aria-label={t('atlas.recargar')} onClick={() => frame.current?.reload()}>
            <RotateCw size={14} className={loadingFrame ? 'animate-spin' : undefined} />
          </Button>
          <p className="mx-2 min-w-0 flex-1 truncate text-[12px] text-muted">
            {tituloMapa(t, active.label)}
          </p>
          <Badge mono>{proveedorMapa(t, active)}</Badge>
          <Button size="sm" variant="outline" onClick={() => void api.settings.openPath(active.url)}>
            <ExternalLink size={13} /> {t('atlas.abrirFuera')}
          </Button>
        </div>
        {/*
          Partición propia y **persistente**.

          Propia, para que la sesión del mapa no se mezcle con nada más de la
          aplicación. Persistente, por dos motivos medidos: sin disco no hay
          caché, así que cada apertura se descargaba el mapa entero otra vez; y
          lo que marcas en el mapa —que es media gracia de MapGenie, y lo que
          promete la descripción de esta misma vista— vive en su cookie y se
          perdía al cerrar Atreus.
        */}
        <div className="relative min-h-0 flex-1 bg-white">
          <webview
            ref={attach as never}
            src={active.url}
            partition="persist:atreus-maps"
            allowpopups={undefined}
            className="h-full w-full bg-white"
          />
          {loadingFrame && !frameError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface text-center" role="status" aria-live="polite">
              <LoaderCircle size={24} className="animate-spin text-accent" />
              <div>
                <p className="text-[14px] font-medium text-fg">{t('atlas.cargando')}</p>
                <p className="mt-1 text-[12px] text-muted">{t('atlas.cargandoPista')}</p>
              </div>
            </div>
          )}
          {frameError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-surface p-6 text-center" role="alert">
              <MapIcon size={32} className="text-warn" />
              <div className="max-w-md">
                <p className="text-[14px] font-semibold text-fg">{t('atlas.falloTitulo')}</p>
                <p className="mt-1 text-[12px] leading-5 text-muted">{frameError}</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="sm" variant="outline" onClick={retryFrame}>
                  <RotateCw size={13} /> {t('atlas.reintentar')}
                </Button>
                <Button size="sm" variant="primary" onClick={() => void api.settings.openPath(active.url)}>
                  <ExternalLink size={13} /> {t('atlas.abrirFuera')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        title={`${t('lateral.atlas')} · ${game.name}`}
        subtitle={t('atlas.subtitulo')}
        actions={<>
          <Button variant="outline" onClick={() => void loadMaps(true)} disabled={refreshingMaps}>
            <RotateCw size={14} className={refreshingMaps ? 'animate-spin' : undefined} />
            {t(refreshingMaps ? 'atlas.actualizando' : 'atlas.actualizar')}
          </Button>
          <Button variant="outline" onClick={() => setAdding(true)}>
            <Plus size={14} /> {t('atlas.anadirMapa')}
          </Button>
        </>} />
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {maps === null ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 2 }, (_, index) => <Skeleton key={index} className="h-28" />)}
          </div>
        ) : maps.length === 0 ? (
          <Empty
            icon={<MapIcon size={40} strokeWidth={1.25} />}
            title={t('atlas.sinMapaTitulo')}
            hint={t('atlas.sinMapaPista', { juego: game.name })}
            action={<div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => void api.settings.openPath(
                  `https://duckduckgo.com/?q=${encodeURIComponent(
                    t('atlas.consultaBusqueda', { juego: game.name }),
                  )}`,
                )}
              >
                <ExternalLink size={14} /> {t('atlas.buscarNavegador')}
              </Button>
              <Button variant="primary" onClick={() => setAdding(true)}>
                <Plus size={14} /> {t('atlas.anadirManual')}
              </Button>
            </div>} />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
            {maps.map((map) => (
              <Card key={map.id} className="flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <MapIcon size={18} className="text-accent" />
                  <div className="flex items-center gap-1.5">
                    <Badge mono>{proveedorMapa(t, map)}</Badge>
                    {map.removable && (
                      <Button size="sm" variant="ghost"
                              aria-label={t('atlas.quitarMapa', { mapa: tituloMapa(t, map.label) })}
                              title={t('atlas.quitarMapaPista')}
                              onClick={() => void removeMap(map.id)}>
                        <Trash2 size={13} />
                      </Button>
                    )}
                  </div>
                </div>
                <h2 className="mt-3 text-[14px] font-semibold">{tituloMapa(t, map.label)}</h2>
                <p className="mt-1 flex-1 text-[12px] leading-5 text-muted">{textoMapa(t, map.blurb)}</p>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="primary" onClick={() => setActive(map)}>
                    {loadingFrame ? <LoaderCircle size={13} className="animate-spin" /> : <MapIcon size={13} />}
                    {t('atlas.abrirAqui')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void api.settings.openPath(map.url)}>
                    <ExternalLink size={13} />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/*
        La salida para los juegos que no cubre nadie. La dirección se guarda en
        la ficha del juego, en la capa del usuario, así que sobrevive a las
        actualizaciones de Atreus y se puede llevar de un equipo a otro.
      */}
      <Modal
        open={adding}
        title={t('atlas.modalTitulo')}
        icon={<MapIcon size={16} className="text-accent" />}
        onClose={() => setAdding(false)}
        footer={<>
          <Button variant="ghost" onClick={() => setAdding(false)}>{t('atlas.cancelar')}</Button>
          <Button variant="primary" disabled={saving || !draft.title.trim() || !draft.url.trim()}
                  onClick={() => void addMap()}>
            {saving ? <LoaderCircle size={14} className="animate-spin" /> : <Plus size={14} />}
            {t('atlas.guardar')}
          </Button>
        </>}
      >
        <p className="text-[13px] leading-6 text-muted">
          {t('atlas.modalCuerpo', { juego: game.name })}
        </p>
        <label className="mt-4 block text-[12px] font-medium text-muted" htmlFor="map-title">
          {t('atlas.nombre')}
        </label>
        <Input id="map-title" value={draft.title} className="mt-1 w-full"
               placeholder={t('atlas.nombrePista')}
               onChange={(event) => setDraft((d) => ({ ...d, title: event.target.value }))} />
        <label className="mt-3 block text-[12px] font-medium text-muted" htmlFor="map-url">
          {t('atlas.direccion')}
        </label>
        <Input id="map-url" value={draft.url} className="mt-1 w-full font-mono text-[12px]"
               placeholder="https://…"
               onChange={(event) => setDraft((d) => ({ ...d, url: event.target.value }))} />
        <p className="mt-2 text-[11px] text-faint">{t('atlas.direccionPista')}</p>
      </Modal>
    </div>
  );
}
