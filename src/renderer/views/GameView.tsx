import { useCallback, useEffect, useState } from 'react';
import {
  BookOpen, Clock, Gamepad2, Gauge, Hourglass, Map, NotebookPen, Package, Play, RefreshCw,
  Sparkles, Target, Trophy,
} from 'lucide-react';
import type { PlatinumReport } from '@shared/types';
import trofeo from '@/assets/trofeo.png';
import { api } from '@/lib/api';
import { useStore } from '@/store';
import { duration, hours, PLATFORM_LABEL, percent, rarity, relative, span } from '@/lib/format';
import {
  Badge, Button, Card, DifficultyMeter, Empty, Progress, Skeleton, ViewHeader,
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
      <ViewHeader
        title={game.name}
        subtitle={`${PLATFORM_LABEL[game.platform] ?? game.platform} · última partida ${relative(game.lastPlayed)}`}
        actions={<>
          {isRunning && <Badge tone="success">En ejecución</Badge>}
          <Button size="sm" variant="ghost" disabled={loading} onClick={() => void load(true)} title="Volver a calcular el informe">
            <RefreshCw size={14} className={loading ? 'animate-spin' : undefined} /> Actualizar
          </Button>
          <Button variant="primary" onClick={() => void play()}><Play size={14} fill="currentColor" /> Jugar</Button>
        </>}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {loading && !report ? <ReportSkeleton gameName={game.name} /> : report ? (
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
        Al 100 %, el trofeo preside su propia tarjeta. La tarjeta crece para que
        quepa **entero**: sangrado por arriba y por abajo se veía cortado por la
        mitad, que es peor que no ponerlo. Va centrado a la derecha, con su
        resplandor, y la cifra sigue siendo lo primero que se lee.
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
          className="pointer-events-none absolute right-8 top-1/2 h-[84%] w-auto -translate-y-1/2 drop-shadow-[0_12px_34px_rgba(109,40,217,.55)]"
        />
      </>}
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Trophy size={16} className={report.complete ? 'text-success' : 'text-accent'} />
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">
              {report.complete ? 'Platino conseguido' : 'Camino al platino'}
            </h2>
          </div>
          <p className="mt-2 text-[40px] font-semibold leading-none">
            {hasAchievements ? `${report.percent.toFixed(1).replace('.', ',')} %` : '—'}
          </p>
          <p className="mt-1 text-[13px] text-muted">
            {hasAchievements
              ? report.complete
                ? `${report.total} de ${report.total} logros · los tienes todos`
                : `${report.unlocked} de ${report.total} logros · faltan ${report.total - report.unlocked}`
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
      {hasAchievements && (
        <Progress
          value={report.percent}
          tone={report.complete ? 'success' : 'accent'}
          // Al 100 % la barra se queda corta a propósito: a lo ancho le cruzaba
          // la base al trofeo, y la barra llena ya se lee de sobra.
          className={report.complete ? 'relative mt-4 h-2 max-w-[58%]' : 'mt-4 h-2'}
          label={`${report.unlocked} de ${report.total} logros`}
        />
      )}
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
          {report.remaining.slice(0, 8).map((item) => (
            <div key={item.apiName} className="flex items-center gap-3 px-4 py-2.5">
              {item.iconUrl
                ? <img src={item.iconUrl} alt="" className="h-8 w-8 shrink-0 rounded-sm opacity-70" />
                : <div className="h-8 w-8 shrink-0 rounded-sm bg-inset" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">
                  {item.hidden && !item.displayName ? 'Logro oculto' : item.displayName}
                </p>
                <p className="truncate text-[12px] text-muted">{item.description || 'Sin descripción'}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[12px] font-medium tabular-nums">{percent(item.globalPercent)}</p>
                <p className="text-[11px] text-faint">{rarity(item.globalPercent)}</p>
              </div>
            </div>
          ))}
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
        <Button size="sm" variant="primary" onClick={() => go(readableGuideCount ? 'guides' : 'achievements')}>
          {readableGuideCount ? <BookOpen size={13} /> : <Trophy size={13} />}
          {readableGuideCount ? 'Abrir rutas' : 'Ver logros'}
        </Button>
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

function ReportSkeleton({ gameName }: { gameName: string }) {
  return <>
    <div className="mb-4 flex items-center gap-2 text-[13px] text-muted" role="status" aria-live="polite">
      <RefreshCw size={14} className="animate-spin text-accent" />
      <span>Leyendo logros, horas y rareza de {gameName}…</span>
    </div>
    <Skeleton className="h-40" />
    <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
      {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28" />)}
    </div>
  </>;
}
