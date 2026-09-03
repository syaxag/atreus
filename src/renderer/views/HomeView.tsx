import { useCallback, useEffect, useMemo, useState } from 'react';
import { Compass, Gem, LoaderCircle, Play, Target, Trophy } from 'lucide-react';
import type { Game, PlatinumReport, PlatinumSummary } from '@shared/types';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useStore } from '@/store';
import { duration, percent as fmtPercent, PLATFORM_LABEL, relative } from '@/lib/format';
import { useT } from '@/i18n';
import { GameCover } from '@/components/GameCover';
import { Badge, Button, Card, Empty, Progress, Skeleton, ViewHeader } from '@/components/ui';

/**
 * La portada: lo que hay entre manos, sin buscarlo.
 *
 * Abrir Atreus y caer en la parrilla entera obliga a decidir antes de saber
 * nada. Steam, Xbox o PSNProfiles reciben con tres cosas —qué estás jugando,
 * qué tienes a un paso del platino, qué tocaste ayer— y las tres las sabe
 * Atreus ya: **aquí no se calcula nada nuevo**, se compone lo que la Colección
 * y el informe de platino tenían repartido.
 *
 * El orden de los tres bloques es el orden en que se decide: primero lo que ya
 * estabas haciendo, luego lo que está más cerca de terminarse, y al final lo
 * que se quedó por el camino. Nada de rejillas: en cada bloque cabe lo que se
 * mira de un vistazo, y lo demás está en la Colección, que para eso existe.
 */

/** Cuántos juegos entran en cada bloque. Más que esto ya es una parrilla. */
const CERCA = 6;
const RECIENTES = 5;

export function HomeView() {
  const t = useT();
  const games = useStore((state) => state.games);
  const platinum = useStore((state) => state.platinum);
  const activeGameIds = useStore((state) => state.activeGameIds);
  const loadingLibrary = useStore((state) => state.loadingLibrary);
  const open = useStore((state) => state.open);
  const go = useStore((state) => state.go);

  /**
   * El juego del que va la portada.
   *
   * Manda el que está abierto ahora mismo: si Atreus ve el proceso, es lo que
   * el usuario está haciendo y no hay nada que adivinar. Si no hay ninguno, el
   * último que tocó; y si tampoco, el que tenga más avanzado.
   *
   * El último recurso es un favorito, o el primero que haya. Antes se devolvía
   * `null` y la pantalla se iba al vacío de "escanea tu biblioteca" teniendo
   * dieciséis juegos delante: la biblioteca recién escaneada de quien juega en
   * Epic o en Xbox no trae ni horas ni progreso, y ese es justo el caso.
   */
  const protagonista = useMemo<Game | null>(() => {
    if (games.length === 0) return null;
    const enMarcha = games.find((game) => activeGameIds.includes(game.id));
    if (enMarcha) return enMarcha;

    const jugados = games.filter((game) => game.lastPlayed !== null);
    if (jugados.length > 0) {
      return jugados.reduce((a, b) => ((b.lastPlayed ?? 0) > (a.lastPlayed ?? 0) ? b : a));
    }
    const empezados = games.filter((game) => cerca(platinum[game.id]));
    if (empezados.length > 0) {
      return empezados.reduce((a, b) =>
        ((platinum[b.id]?.percent ?? 0) > (platinum[a.id]?.percent ?? 0) ? b : a));
    }
    return games.find((game) => game.favorite) ?? games[0] ?? null;
  }, [games, activeGameIds, platinum]);

  const enMarcha = protagonista ? activeGameIds.includes(protagonista.id) : false;

  /** Todavía no ha llegado ningún resumen: el cálculo va por detrás. */
  const calculando = Object.keys(platinum).length === 0;

  /**
   * Lo empezado, del más avanzado al menos.
   *
   * Empezado y sin terminar: un juego sin tocar no tiene paso siguiente, y uno
   * al 100 % tampoco. El bloque se llamó un rato "a un paso del platino" y
   * listaba un juego al 2 %: el orden pone delante lo más cerca, pero el
   * título no puede prometer una cercanía que depende de tu biblioteca.
   */
  const aUnPaso = useMemo(() => games
    .filter((game) => game.id !== protagonista?.id && cerca(platinum[game.id]))
    .sort((a, b) => (platinum[b.id]?.percent ?? 0) - (platinum[a.id]?.percent ?? 0))
    .slice(0, CERCA), [games, platinum, protagonista]);

  /** Lo último que tocaste, sin repetir el protagonista. */
  const recientes = useMemo(() => games
    .filter((game) => game.lastPlayed !== null && game.id !== protagonista?.id)
    .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
    .slice(0, RECIENTES), [games, protagonista]);

  if (loadingLibrary && games.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <ViewHeader title={t('lateral.portada')} subtitle={t('portada.subtitulo')} />
        <div className="flex flex-col gap-4 p-6">
          <Skeleton className="h-44 rounded-md" />
          <Skeleton className="h-28 rounded-md" />
        </div>
      </div>
    );
  }

  if (!protagonista) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <ViewHeader title={t('lateral.portada')} subtitle={t('portada.subtitulo')} />
        <Empty
          icon={<Gem size={40} strokeWidth={1.25} />}
          title={t('portada.sinJuegos')}
          hint={t('portada.sinJuegosPista')}
          action={<Button variant="primary" onClick={() => go('library')}>
            <Gem size={14} /> {t('portada.irColeccion')}
          </Button>}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader title={t('lateral.portada')} subtitle={t('portada.subtitulo')} />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto flex max-w-4xl flex-col gap-7">
          <section>
            <Titulo texto={t(enMarcha ? 'portada.jugandoAhora' : 'portada.sigueDonde')} />
            <Protagonista game={protagonista} summary={platinum[protagonista.id]} enMarcha={enMarcha} />
          </section>

          {(aUnPaso.length > 0 || calculando) && (
            <section>
              <Titulo
                texto={t('portada.empezados')}
                pista={t('portada.empezadosPista')}
                accion={<Button size="sm" variant="ghost" onClick={() => go('library')}>
                  {t('portada.verTodos')}
                </Button>}
              />
              {/*
                El progreso se calcula en segundo plano y llega juego a juego.
                Este es el bloque que da sentido a la pantalla, así que mientras
                no haya llegado nada se reserva su sitio en vez de desaparecer:
                al abrir Atreus en frío parecía que no había nada a medias.
              */}
              {calculando ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2">
                  {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[76px] rounded-md" />)}
                </div>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2">
                  {aUnPaso.map((game) => (
                    <Cercano key={game.id} game={game} summary={platinum[game.id]!} onOpen={() => open(game.id)} />
                  ))}
                </div>
              )}
            </section>
          )}

          {recientes.length > 0 && (
            <section>
              <Titulo texto={t('portada.loUltimo')} />
              <Card className="divide-y divide-[var(--border)]">
                {recientes.map((game) => (
                  <Reciente key={game.id} game={game} onOpen={() => open(game.id)} />
                ))}
              </Card>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/** Empezado y sin terminar: lo único que tiene un paso siguiente. */
function cerca(summary: PlatinumSummary | undefined): boolean {
  return !!summary && summary.total > 0 && summary.unlocked > 0 && !summary.complete;
}

function Titulo({
  texto, pista, accion,
}: { texto: string; pista?: string; accion?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h2 className="flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
        {texto}
        {pista && <span className="font-normal normal-case tracking-normal text-faint/70">{pista}</span>}
      </h2>
      {accion}
    </div>
  );
}

/**
 * El juego del que va la portada, con lo que hace falta para volver a él.
 *
 * El siguiente logro es lo único que se pide de más al abrir esta pantalla: un
 * informe, del juego que ya estabas jugando, y cacheado media hora. Es también
 * lo único que convierte la tarjeta en una decisión en vez de un recordatorio.
 */
function Protagonista({
  game, summary, enMarcha,
}: { game: Game; summary: PlatinumSummary | undefined; enMarcha: boolean }) {
  const t = useT();
  const open = useStore((state) => state.open);
  const pushToast = useStore((state) => state.pushToast);
  const [report, setReport] = useState<PlatinumReport | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [lanzando, setLanzando] = useState(false);

  useEffect(() => {
    let vigente = true;
    setReport(null);
    setBuscando(true);
    void api.platinum.report(game.id).then((res) => {
      if (!vigente) return;
      setBuscando(false);
      if (res.ok) setReport(res.data);
    });
    return () => { vigente = false; };
  }, [game.id]);

  const lanzar = useCallback(async () => {
    setLanzando(true);
    const res = await api.library.launch(game.id);
    setLanzando(false);
    if (!res.ok) return pushToast('error', res.error);
    pushToast('success', t('ficha.iniciado', { juego: game.name }));
  }, [game.id, game.name, pushToast, t]);

  const siguiente = report?.remaining[0];
  const hechos = summary?.unlocked ?? 0;
  const total = summary?.total ?? 0;

  return (
    <Card className="flex flex-col gap-4 p-4 sm:flex-row">
      <button
        type="button"
        onClick={() => open(game.id)}
        title={game.name}
        className="group relative w-24 shrink-0 self-start overflow-hidden rounded-sm border border-line"
      >
        <div className="aspect-[2/3] w-full bg-inset">
          <GameCover game={game} />
        </div>
      </button>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => open(game.id)}
            className="truncate rounded-sm text-left text-[17px] font-semibold leading-tight transition-colors hover:text-accent-hover"
          >
            {game.name}
          </button>
          {enMarcha && <Badge tone="success">{t('ficha.enEjecucion')}</Badge>}
          <Badge>{PLATFORM_LABEL[game.platform] ?? game.platform}</Badge>
        </div>

        <p className="mt-1 text-[12px] text-faint">
          {game.playtimeMinutes
            ? t('portada.jugadas', {
              tiempo: duration(game.playtimeMinutes), cuando: relative(game.lastPlayed),
            })
            : t('portada.sinJugar')}
        </p>

        {total > 0 && (
          <div className="mt-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12px] font-medium text-muted">
                {t('portada.trofeosDe', { hechos, total })}
              </span>
              <span className="font-mono text-[12px] text-accent">
                {fmtPercent(summary?.percent ?? 0, 0)}
              </span>
            </div>
            <Progress value={summary?.percent ?? 0} className="mt-1.5" tone={summary?.complete ? 'success' : 'accent'} />
          </div>
        )}

        {/* Por dónde seguir. Mientras se calcula no se deja el hueco vacío:
            esta línea es el motivo de que la tarjeta sea grande. */}
        <div className="mt-3 min-h-[2.5rem] rounded-sm border border-[var(--accent-line)] bg-accent-soft px-3 py-2">
          {buscando ? (
            <p className="flex items-center gap-2 text-[12px] text-muted">
              <LoaderCircle size={13} className="animate-spin text-accent" />
              {t('portada.buscandoSiguiente')}
            </p>
          ) : siguiente ? (
            <>
              <p className="flex items-center gap-1.5 text-[12px] font-medium">
                <Target size={13} className="shrink-0 text-accent" />
                <span className="truncate">
                  {t('portada.empiezaPor', {
                    logro: siguiente.hidden && !siguiente.displayName
                      ? t('ficha.logroOculto')
                      : siguiente.displayName,
                  })}
                </span>
              </p>
              <p className="mt-0.5 truncate text-[11px] text-muted">
                {t('portada.loTieneEl', { porcentaje: fmtPercent(siguiente.globalPercent) })}
              </p>
            </>
          ) : (
            <p className="text-[12px] text-muted">
              {report?.complete ? t('portada.yaEstaTodo') : t('portada.sinSiguiente')}
            </p>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => void lanzar()} disabled={lanzando || enMarcha}>
            {lanzando
              ? <LoaderCircle size={14} className="animate-spin" />
              : <Play size={14} fill="currentColor" />}
            {t('portada.jugar')}
          </Button>
          <Button variant="outline" onClick={() => open(game.id)}>
            <Compass size={14} /> {t('portada.abrirFicha')}
          </Button>
          <Button variant="ghost" onClick={() => open(game.id, 'achievements')}>
            <Trophy size={14} /> {t('lateral.trofeos')}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** Uno de los que están a un paso: cuánto lleva y cuánto le falta. */
function Cercano({
  game, summary, onOpen,
}: { game: Game; summary: PlatinumSummary; onOpen: () => void }) {
  const t = useT();
  const faltan = summary.total - summary.unlocked;
  return (
    <button
      type="button"
      onClick={onOpen}
      title={game.name}
      className={cn(
        'group flex items-center gap-3 rounded-md border border-line bg-surface p-2.5 text-left',
        'transition-colors duration-[120ms] ease-atreus hover:border-line-strong hover:bg-elevated',
      )}
    >
      <div className="h-14 w-10 shrink-0 overflow-hidden rounded-sm bg-inset">
        <GameCover game={game} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{game.name}</p>
        {/* El porcentaje va delante porque es lo que ordena este bloque: sin
            él, "125 logros" encima de "5 logros" parecía un orden roto. */}
        <p className="mt-0.5 flex items-baseline gap-1.5 text-[11px]">
          <span className="font-mono text-accent">{fmtPercent(summary.percent, 0)}</span>
          <span className="truncate text-faint">
            {t(faltan === 1 ? 'portada.faltaUno' : 'portada.faltan', { n: faltan })}
          </span>
        </p>
        <Progress value={summary.percent} className="mt-1.5" />
      </div>
    </button>
  );
}

/** Una fila de "lo último": el nombre, cuándo fue y cuánto llevas. */
function Reciente({ game, onOpen }: { game: Game; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={game.name}
      className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-[120ms] hover:bg-elevated"
    >
      <div className="h-9 w-6 shrink-0 overflow-hidden rounded-[3px] bg-inset">
        <GameCover game={game} />
      </div>
      <p className="min-w-0 flex-1 truncate text-[13px]">{game.name}</p>
      <span className="shrink-0 font-mono text-[11px] text-faint">
        {game.playtimeMinutes ? `${duration(game.playtimeMinutes)} · ` : ''}{relative(game.lastPlayed)}
      </span>
    </button>
  );
}
