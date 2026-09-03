import { useCallback, useEffect, useState } from 'react';
import {
  BookOpen, Clock, Gamepad2, Gauge, Hourglass, LoaderCircle, Map, NotebookPen, Package, Play,
  RefreshCw, Sparkles, Target, Trophy,
} from 'lucide-react';
import type { PlatinumReport, PlatinumSummary } from '@shared/types';
import trofeo from '@/assets/trofeo.png';
import { api } from '@/lib/api';
import { useStore } from '@/store';
import { duration, hours, PLATFORM_LABEL, percent, rarity, rarityToken, relative, span } from '@/lib/format';
import {
  Badge, Button, Card, DifficultyMeter, Empty, ProgressRing, Skeleton,
} from '@/components/ui';

/**
 * La ficha del juego: la pantalla para la que existe la aplicación.
 *
 * Responde de un vistazo a las cuatro preguntas de quien caza un platino:
 * cuánto llevas, cuánto tiempo te ha costado ya, cuánto te queda y cómo de duro
 * es lo que falta. Todo lo demás son atajos a las otras vistas.
 */

const SHORTCUTS = [
  { section: 'achievements' as const, label: 'Trofeos', hint: 'Progreso, rareza y desbloqueo', icon: Trophy },
  { section: 'guides' as const, label: 'Rutas', hint: 'Guías con su texto completo aquí dentro', icon: BookOpen },
  { section: 'maps' as const, label: 'Atlas', hint: 'Mapa interactivo del juego', icon: Map },
  { section: 'mods' as const, label: 'Taller', hint: 'Workshop y catálogos públicos', icon: Package },
];

export function GameView() {
  const game = useStore((state) => state.selected());
  const isRunning = useStore((state) => (game ? state.activeGameIds.includes(game.id) : false));
  const go = useStore((state) => state.go);
  const pushToast = useStore((state) => state.pushToast);
  const loadPlatinum = useStore((state) => state.loadPlatinum);
  const gameId = game?.id;
  /*
   * El resumen que ya tiene la biblioteca. Sirve para pintar el anillo desde
   * el primer fotograma mientras se calcula el informe completo, en vez de
   * enseñar un esqueleto teniendo el dato principal a mano.
   */
  const resumen = useStore((state) => (gameId ? state.platinum[gameId] : undefined));

  const [report, setReport] = useState<PlatinumReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [readableGuideCount, setReadableGuideCount] = useState<number | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (!gameId) return;
    setLoading(true);
    const response = await api.platinum.report(gameId, refresh);
    setLoading(false);
    if (!response.ok) {
      setReport(null);
      setReadableGuideCount(null);
      pushToast('error', response.error);
      return;
    }
    setReport(response.data);
    setReadableGuideCount(null);
    // La recomendación no inventa una guía por logro: dice cuántas rutas de
    // platino legibles hay antes de mandar al usuario a esa pantalla.
    void api.guides.list(gameId, 'platinum').then((guides) => {
      setReadableGuideCount(guides.ok ? guides.data.filter((guide) => guide.readable).length : 0);
    });
    void loadPlatinum();
  }, [gameId, pushToast, loadPlatinum]);

  useEffect(() => { setReport(null); void load(); }, [load]);

  if (!game) {
    return <Empty
      icon={<Gamepad2 size={40} strokeWidth={1.25} />}
      title="Ningún juego seleccionado"
      hint="Elige un juego en la Colección para ver cuánto te falta para su platino." />;
  }

  async function play() {
    const current = useStore.getState().selected();
    if (!current) return;
    const response = await api.library.launch(current.id);
    if (!response.ok) return pushToast('error', response.error);
    pushToast('info', `${current.name} iniciado`);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/*
        La ficha se abre con la carátula del juego, no con un título sobre gris.
        El arte ya estaba en la aplicación —de fondo de ventana, al 20 % y bajo
        otra capa al 85 %, o sea invisible—; aquí se usa de verdad, con dos
        degradados que le devuelven el contraste al texto sin apagarla.
      */}
      <header className="relative shrink-0 overflow-hidden border-b border-line">
        {game.headerUrl && (
          <>
            <div
              aria-hidden="true"
              className="animate-hero absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url("${game.headerUrl}")` }}
            />
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-[var(--bg-surface)] via-[var(--bg-surface)]/90 to-transparent" />
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[var(--bg-base)] via-transparent to-transparent" />
          </>
        )}
        <div className="relative flex flex-wrap items-end justify-between gap-4 px-6 py-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{PLATFORM_LABEL[game.platform] ?? game.platform}</Badge>
              {isRunning && (
                <Badge tone="success">
                  <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
                  En ejecución
                </Badge>
              )}
              {game.multiplayer && <Badge tone="warn">Multijugador</Badge>}
            </div>
            <h1 className="mt-2 truncate text-[28px] font-semibold leading-tight drop-shadow-[0_2px_12px_rgba(0,0,0,.8)]">
              {game.name}
            </h1>
            <p className="mt-0.5 text-[12px] text-muted">
              {duration(game.playtimeMinutes)} jugadas · última partida {relative(game.lastPlayed)}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" disabled={loading} onClick={() => void load(true)} title="Volver a calcular el informe">
              <RefreshCw size={14} className={loading ? 'animate-spin' : undefined} /> Actualizar
            </Button>
            <Button variant="primary" onClick={() => void play()}><Play size={14} fill="currentColor" /> Jugar</Button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {loading && !report ? (
          <ReportSkeleton gameName={game.name} resumen={resumen} />
        ) : report ? (
          <Report report={report} readableGuideCount={readableGuideCount} onRefresh={() => void load(true)} />
        ) : null}

        <section className="mt-6">
          <h2 className="mb-2 text-[13px] font-semibold">Seguir desde aquí</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
            {SHORTCUTS.map(({ section, label, hint, icon: Icon }) => (
              <Card key={section} className="p-4">
                <Icon size={18} className="text-accent" />
                <h3 className="mt-3 text-[14px] font-semibold">{label}</h3>
                <p className="mt-1 min-h-8 text-[12px] text-muted">{hint}</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => go(section)}>Abrir</Button>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Report({
  report, readableGuideCount, onRefresh,
}: { report: PlatinumReport; readableGuideCount: number | null; onRefresh: () => void }) {
  const go = useStore((state) => state.go);
  const celebrate = useStore((state) => state.celebrate);
  const hasAchievements = report.total > 0;

  return <>
    <Card className={report.complete ? 'relative min-h-[196px] overflow-hidden p-5' : 'p-5'}>
      {/*
        Al 100 %, el trofeo preside su propia tarjeta, entero.

        Antes iba a `h-[84%]` y centrado, y se cortaba por abajo. Un porcentaje
        de altura se mide contra la altura de la tarjeta, y esa altura la decide
        el contenido: en cuanto la fila de arriba envuelve —ventana estrecha,
        un nombre largo, una insignia de más— la referencia cambia y el 84 % de
        entonces ya no es el de ahora.

        Lo que se cortaba no era el trofeo: era **su resplandor**. El trofeo
        medía 163 px en una tarjeta de 196 —17 px de aire por lado, medidos— y
        cabía. Pero la sombra iba a `0 12px 34px`, que llega unos 46 px por
        debajo de la imagen, y la tarjeta recorta lo que se sale. Ese corte
        limpio del halo bajo la peana es lo que se ve como una imagen cortada.

        Así que el trofeo baja a 78 % —21 px de aire por lado— y la sombra se
        acorta a un alcance de 18. Cabe todo, halo incluido.

        Y no vale anclarlo a los dos bordes con `top-5 bottom-5`: una imagen es
        un elemento reemplazado, y con la altura en `auto` toma su altura
        intrínseca y se ignora el `bottom`. Probado: 1024 px de alto
        desbordando 849 la tarjeta.
      */}
      {report.complete && <>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 top-1/2 h-[240%] w-[46%] -translate-y-1/2 bg-[radial-gradient(circle_at_60%_50%,rgba(139,92,246,.26),transparent_65%)]"
        />
        <img
          src={trofeo}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute right-8 top-1/2 h-[78%] w-auto -translate-y-1/2 drop-shadow-[0_4px_14px_rgba(109,40,217,.5)]"
        />
      </>}
      <div className="relative flex flex-wrap items-center gap-6">
        {/* El anillo es el titular: la cifra dentro, y el trazo recorriendo el
            círculo al abrir. Sin logros no se dibuja un cero, que miente. */}
        {hasAchievements && (
          <ProgressRing
            value={report.percent}
            tone={report.complete ? 'success' : 'accent'}
            label={`${report.gameName}: ${report.unlocked} de ${report.total} logros`}
          >
            <span className="text-[28px] font-semibold leading-none tabular-nums">
              {Math.round(report.percent)}
              <span className="text-[15px] font-medium text-muted"> %</span>
            </span>
            <span className="mt-1 text-[11px] tabular-nums text-faint">
              {report.unlocked}/{report.total}
            </span>
          </ProgressRing>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Trophy size={16} className={report.complete ? 'text-success' : 'text-accent'} />
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">
              {report.complete ? 'Platino conseguido' : 'Camino al platino'}
            </h2>
          </div>
          <p className="mt-2 text-[15px] leading-6 text-fg">
            {hasAchievements
              ? report.complete
                ? `Los ${report.total} logros, todos tuyos.`
                : <>Te faltan <span className="font-semibold text-accent">{report.total - report.unlocked}</span> logros de {report.total}.</>
              : 'Sin datos de logros para este juego'}
          </p>
          {/* Un platino se enseña. El botón deja revivir la celebración cuando
              te apetezca, no solo el día que cayó. */}
          {report.complete && (
            <Button size="sm" variant="outline" className="mt-3" onClick={() => celebrate(report)}>
              <Sparkles size={13} /> Ver la celebración
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Decir de dónde sale el progreso no es un detalle: un 40 % medido
              por Steam y un 40 % que has marcado tú no valen lo mismo. */}
          {report.tracking === 'manual' && (
            <Badge tone="accent"><NotebookPen size={11} className="mr-1" /> Progreso marcado por ti</Badge>
          )}
          {/* Estando completo no hace falta insignia: lo dicen el titular, el
              100,0 % y el trofeo. Y así no se pisan. */}
        </div>
      </div>
      {/* Aquí había una barra de progreso a lo ancho de la tarjeta. Con el
          anillo delante contaba lo mismo dos veces, y de las dos la barra era
          la que menos decía. El valor accesible lo lleva el anillo. */}
      {report.warning && (
        <p className="mt-3 rounded-sm border border-[var(--warn-line)] bg-[var(--warn-soft,transparent)] px-3 py-2 text-[12px] leading-5 text-warn">
          {report.warning}
        </p>
      )}
    </Card>

    <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
      <Metric
        icon={<Clock size={15} />}
        label="Tiempo jugado"
        value={duration(report.playtimeMinutes)}
        hint={report.trackedMinutes > 0
          ? `${duration(report.trackedMinutes)} observados por Atreus`
          : 'Según tu cuenta de la plataforma'}
      />
      <Metric
        icon={<Hourglass size={15} />}
        label={report.complete ? 'Te costó' : 'Persiguiéndolo'}
        value={report.firstUnlockAt ? span(report.firstUnlockAt) : '—'}
        hint={report.firstUnlockAt
          ? `Desde tu primer logro${report.lastUnlockAt ? `, último ${relative(report.lastUnlockAt)}` : ''}`
          : 'Aún no has desbloqueado ningún logro'}
      />
      <Metric
        icon={<Target size={15} />}
        label={report.complete ? 'Tiempo total' : 'Te queda'}
        value={report.estimate ? hours(report.complete ? report.estimate.totalHours : report.estimate.remainingHours) : '—'}
        hint={report.estimate
          ? report.complete
            ? 'Horas invertidas hasta el 100 %'
            : `De unas ${hours(report.estimate.totalHours)} en total · ${CONFIDENCE[report.estimate.confidence]}`
          : 'Hace falta al menos un logro para estimar'}
      />
      <Metric
        icon={<Gauge size={15} />}
        label="Dificultad del platino"
        value={report.difficulty ? `${format(report.difficulty.score)}/10` : '—'}
        hint={report.difficulty?.label ?? 'Steam no publica la rareza de este juego'}
        extra={report.difficulty ? <DifficultyMeter score={report.difficulty.score} className="mt-2" /> : undefined}
      />
    </div>

    {(report.estimate || report.difficulty) && (
      <Card className="mt-3 p-4">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-accent" />
          <h3 className="text-[13px] font-semibold">Cómo salen estos números</h3>
        </div>
        <ul className="mt-2 flex flex-col gap-1.5 text-[12px] leading-5 text-muted">
          {report.estimate && <li>· {report.estimate.explanation}</li>}
          {report.difficulty && <li>· {report.difficulty.explanation}</li>}
        </ul>
        {report.sources.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-[11px] text-faint">
            <p>Fuentes: {report.sources.join(' · ')} · actualizado {relative(report.updatedAt)}</p>
            <Button size="sm" variant="ghost" onClick={onRefresh} title="Volver a consultar fuentes y progreso">
              <RefreshCw size={13} /> Actualizar datos
            </Button>
          </div>
        )}
      </Card>
    )}

    {!report.complete && report.remaining.length > 0 && (
      <NextStep report={report} readableGuideCount={readableGuideCount} />
    )}

    {report.remaining.length > 0 && (
      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-[13px] font-semibold">
            Lo que te falta · empieza por arriba
          </h2>
          <Button size="sm" variant="outline" onClick={() => go('achievements')}>
            Ver los {report.remaining.length}
          </Button>
        </div>
        <Card className="divide-y divide-line">
          {report.remaining.slice(0, 8).map((item, index) => {
            const token = rarityToken(item.globalPercent);
            const legendario = item.globalPercent !== null && item.globalPercent < 1;
            return (
              <div
                key={item.apiName}
                className="animate-rise group flex items-center gap-3 px-4 py-2.5 transition-colors duration-[120ms] hover:bg-elevated"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                {/* La banda de rareza a la izquierda del icono: en una lista de
                    ocho, es lo que deja ver de un vistazo cuál es el que duele. */}
                <span
                  aria-hidden="true"
                  className="h-8 w-0.5 shrink-0 rounded-full"
                  style={{ background: `var(${token})` }}
                />
                {item.iconUrl
                  ? <img src={item.iconUrl} alt=""
                         className="h-8 w-8 shrink-0 rounded-sm opacity-70 transition-opacity duration-[120ms] group-hover:opacity-100" />
                  : <div className="h-8 w-8 shrink-0 rounded-sm bg-inset" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">
                    {item.hidden && !item.displayName ? 'Logro oculto' : item.displayName}
                  </p>
                  <p className="truncate text-[12px] text-muted">{item.description || 'Sin descripción'}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className="text-[12px] font-semibold tabular-nums"
                    style={{
                      color: `var(${token})`,
                      textShadow: legendario ? '0 0 12px var(--rare-legendario-glow)' : undefined,
                    }}
                  >
                    {percent(item.globalPercent)}
                  </p>
                  <p className="text-[11px] text-faint">{rarity(item.globalPercent)}</p>
                </div>
              </div>
            );
          })}
        </Card>
        {report.remaining.length > 8 && (
          <p className="mt-2 text-[12px] text-faint">
            Ordenados del más común al más raro: los de abajo son los que deciden el platino.
          </p>
        )}
      </section>
    )}
  </>;
}

/** El informe ya ordena de lo más común a lo más raro: empezar ahí reduce
 * fricción sin fingir que sabemos el tiempo exacto de un logro individual. */
function NextStep({
  report, readableGuideCount,
}: { report: PlatinumReport; readableGuideCount: number | null }) {
  const go = useStore((state) => state.go);
  const next = report.remaining[0]!;
  const label = next.hidden && !next.displayName ? 'Logro oculto' : next.displayName;

  return (
    <Card className="mt-4 border-[var(--accent-line)] bg-[var(--accent-soft)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Target size={18} className="mt-0.5 shrink-0 text-accent" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">Qué hago ahora</p>
            <h2 className="mt-1 text-[15px] font-semibold">Empieza por {label}</h2>
            <p className="mt-1 max-w-2xl text-[12px] leading-5 text-muted">
              {next.description || 'Es el siguiente logro pendiente más asequible.'} · Lo tiene el {percent(next.globalPercent)} de jugadores.
              {report.estimate ? ` Te quedan unas ${hours(report.estimate.remainingHours)} para el 100 % completo.` : ''}
            </p>
            <p className="mt-1 text-[11px] text-faint">
              {readableGuideCount === null
                ? 'Buscando rutas que puedas leer aquí…'
                : readableGuideCount > 0
                  ? `${readableGuideCount} ${readableGuideCount === 1 ? 'guía legible' : 'guías legibles'} para el platino.`
                  : 'No hay una guía legible disponible todavía; puedes revisar los logros.'}
            </p>
          </div>
        </div>
        {/* Mientras la búsqueda no ha vuelto no se sabe a dónde manda este
            botón, y anunciar "Ver logros" para cambiarlo a "Abrir rutas" un
            segundo después es peor que esperar. */}
        {readableGuideCount === null ? (
          <Button size="sm" variant="primary" disabled>
            <LoaderCircle size={13} className="animate-spin" /> Buscando rutas…
          </Button>
        ) : (
          <Button size="sm" variant="primary" onClick={() => go(readableGuideCount > 0 ? 'guides' : 'achievements')}>
            {readableGuideCount > 0 ? <BookOpen size={13} /> : <Trophy size={13} />}
            {readableGuideCount > 0 ? 'Abrir rutas' : 'Ver logros'}
          </Button>
        )}
      </div>
    </Card>
  );
}

const CONFIDENCE: Record<'low' | 'medium' | 'high', string> = {
  low: 'estimación gruesa',
  medium: 'estimación razonable',
  high: 'estimación fiable',
};

function format(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1).replace('.', ',');
}

function Metric({
  icon, label, value, hint, extra,
}: { icon: React.ReactNode; label: string; value: string; hint: string; extra?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-faint">
        {icon}
        <p className="text-[11px] font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-1.5 text-[22px] font-semibold leading-tight">{value}</p>
      {extra}
      <p className="mt-1 text-[11px] leading-4 text-muted">{hint}</p>
    </Card>
  );
}

/**
 * Lo que se ve mientras llega el informe.
 *
 * Si Atreus ya sabe cuántos logros llevas —lo guarda el resumen de la
 * biblioteca, que es lo que ordena la Colección— **se enseña ya**, con su
 * anillo, y solo esperan los números que hay que calcular. Antes toda la ficha
 * era un esqueleto durante los segundos que tarda el informe en frío, teniendo
 * el dato principal a mano.
 */
function ReportSkeleton({ gameName, resumen }: { gameName: string; resumen?: PlatinumSummary }) {
  const sabemos = resumen !== undefined && resumen.total > 0;

  return <>
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-6">
        {sabemos ? (
          <ProgressRing
            value={resumen.percent}
            tone={resumen.complete ? 'success' : 'accent'}
            label={`${gameName}: ${resumen.unlocked} de ${resumen.total} logros`}
          >
            <span className="text-[28px] font-semibold leading-none tabular-nums">
              {Math.round(resumen.percent)}
              <span className="text-[15px] font-medium text-muted"> %</span>
            </span>
            <span className="mt-1 text-[11px] tabular-nums text-faint">
              {resumen.unlocked}/{resumen.total}
            </span>
          </ProgressRing>
        ) : (
          <Skeleton className="h-[132px] w-[132px] rounded-full" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[13px] text-muted" role="status" aria-live="polite">
            <RefreshCw size={14} className="animate-spin text-accent" />
            <span>Leyendo logros, horas y rareza de {gameName}…</span>
          </div>
          <Skeleton className="mt-3 h-4 w-2/3" />
          <Skeleton className="mt-2 h-4 w-1/2" />
        </div>
      </div>
    </Card>
    <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
      {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28" />)}
    </div>
  </>;
}
