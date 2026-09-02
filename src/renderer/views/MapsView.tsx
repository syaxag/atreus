import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, ExternalLink, LoaderCircle, Map as MapIcon, RotateCw, Gamepad2,
} from 'lucide-react';
import type { InteractiveMap } from '@shared/types';
import { api } from '@/lib/api';
import { useStore } from '@/store';
import { Badge, Button, Card, Empty, Skeleton, ViewHeader } from '@/components/ui';

/**
 * Mapas interactivos, abiertos dentro de Atreus.
 *
 * El mapa no se redibuja: se carga el del proveedor en un `<webview>`, que es
 * un contexto aislado sin acceso al puente `window.atreus` ni al disco. Así
 * funcionan los marcadores, los filtros y el progreso reales del mapa, en vez
 * del atlas de juguete que había antes y que solo existía para dos juegos.
 */

export function MapsView() {
  const game = useStore((state) => state.selected());
  const pushToast = useStore((state) => state.pushToast);
  const gameId = game?.id;

  const [maps, setMaps] = useState<InteractiveMap[] | null>(null);
  const [active, setActive] = useState<InteractiveMap | null>(null);
  const [loadingFrame, setLoadingFrame] = useState(false);
  const frame = useRef<HTMLElement & {
    reload(): void; goBack(): void; goForward(): void; canGoBack(): boolean;
  } | null>(null);

  useEffect(() => {
    if (!gameId) { setMaps(null); return; }
    setMaps(null);
    setActive(null);
    void api.maps.list(gameId).then((response) => {
      if (!response.ok) { setMaps([]); pushToast('error', response.error); return; }
      setMaps(response.data);
      // Con un solo mapa no tiene sentido obligar a elegir.
      if (response.data.length === 1) setActive(response.data[0]!);
    });
  }, [gameId, pushToast]);

  // El <webview> no emite eventos de React: hay que engancharse a los suyos.
  const attach = useCallback((node: HTMLElement | null) => {
    frame.current = node as typeof frame.current;
    if (!node) return;
    const start = () => setLoadingFrame(true);
    const stop = () => setLoadingFrame(false);
    node.addEventListener('did-start-loading', start);
    node.addEventListener('did-stop-loading', stop);
  }, []);

  if (!game || !gameId) {
    return <Empty
      icon={<Gamepad2 size={40} strokeWidth={1.25} />}
      title="Ningún juego seleccionado"
      hint="Elige un juego en la Biblioteca para abrir su mapa interactivo." />;
  }

  if (active) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
          <Button size="sm" variant="ghost" onClick={() => setActive(null)}>
            <ArrowLeft size={14} /> Mapas
          </Button>
          <div className="mx-1 h-5 w-px bg-line" />
          <Button size="sm" variant="ghost" aria-label="Atrás" onClick={() => frame.current?.goBack()}>
            <ArrowLeft size={14} />
          </Button>
          <Button size="sm" variant="ghost" aria-label="Adelante" onClick={() => frame.current?.goForward()}>
            <ArrowRight size={14} />
          </Button>
          <Button size="sm" variant="ghost" aria-label="Recargar" onClick={() => frame.current?.reload()}>
            <RotateCw size={14} className={loadingFrame ? 'animate-spin' : undefined} />
          </Button>
          <p className="mx-2 min-w-0 flex-1 truncate text-[12px] text-muted">{active.title}</p>
          <Badge mono>{active.provider}</Badge>
          <Button size="sm" variant="outline" onClick={() => void api.settings.openPath(active.url)}>
            <ExternalLink size={13} /> Abrir fuera
          </Button>
        </div>
        {/*
          `partition` sin persistencia: la sesión del mapa no se mezcla con
          nada más de la aplicación y no queda nada guardado al cerrar.
        */}
        <webview
          ref={attach as never}
          src={active.url}
          partition="atreus-maps"
          allowpopups={undefined}
          className="min-h-0 flex-1 bg-white"
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        title={`Mapas · ${game.name}`}
        subtitle="Mapas interactivos reales, con sus coleccionables y sus filtros, dentro de Atreus." />
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {maps === null ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 2 }, (_, index) => <Skeleton key={index} className="h-28" />)}
          </div>
        ) : maps.length === 0 ? (
          <Empty
            icon={<MapIcon size={40} strokeWidth={1.25} />}
            title="No hay mapa interactivo para este juego"
            hint={`Atreus busca ${game.name} en el directorio público de MapGenie y en el catálogo. ` +
              'Si aparece uno más adelante, saldrá aquí sin actualizar la aplicación.'}
            action={<Button
              variant="outline"
              onClick={() => void api.settings.openPath(
                `https://duckduckgo.com/?q=${encodeURIComponent(`${game.name} mapa interactivo coleccionables`)}`,
              )}
            >
              <ExternalLink size={14} /> Buscarlo en el navegador
            </Button>} />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
            {maps.map((map) => (
              <Card key={map.id} className="flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <MapIcon size={18} className="text-accent" />
                  <Badge mono>{map.provider}</Badge>
                </div>
                <h2 className="mt-3 text-[14px] font-semibold">{map.title}</h2>
                <p className="mt-1 flex-1 text-[12px] leading-5 text-muted">{map.description}</p>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="primary" onClick={() => setActive(map)}>
                    {loadingFrame ? <LoaderCircle size={13} className="animate-spin" /> : <MapIcon size={13} />} Abrir aquí
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
    </div>
  );
}
