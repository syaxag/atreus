import { useMemo } from 'react';
import { CalendarDays, Flame, Gauge, Gem, Sparkles, Timer, Trophy } from 'lucide-react';
import type { DifficultyTier, PlatinumSummary } from '@shared/types';
import { useStore } from '@/store';
import { cn } from '@/lib/cn';
import { duration, numero, percent as fmtPercent, rarityToken, relative } from '@/lib/format';
import { DIFICULTAD } from '@/lib/platino';
import { useT } from '@/i18n';
import { Card, Empty, Progress, ViewHeader } from '@/components/ui';

/**
 * Tu perfil: lo que llevas hecho, sumado.
 *
 * No calcula nada que el informe de platino no supiera ya. Lo que hace es
 * **sumarlo**, que es lo que no estaba en ninguna parte: cada ficha contaba su
 * juego y nadie contaba al jugador. Un cazador de platinos lleva la cuenta de
 * eso —cuántos logros, cuántas horas, cuál es el más raro que tiene— y hasta
 * ahora había que abrir dieciséis fichas para saberlo.
 *
 * Todo sale de los resúmenes, que ya están en memoria: esta pantalla no abre
 * una sola sesión de Steam ni pide un informe.
 */

/** Un día desde la época: la unidad en la que se cuenta una racha. */
const DIA = 86_400;

export function ProfileView() {
  const t = useT();
  const games = useStore((state) => state.games);
  const platinum = useStore((state) => state.platinum);
  const go = useStore((state) => state.go);
  const open = useStore((state) => state.open);

  const resumenes = useMemo(
    () => Object.values(platinum).filter((s) => s.total > 0),
    [platinum],
  );

  const cuenta = useMemo(() => sumar(resumenes), [resumenes]);
  const racha = useMemo(() => contarRacha(resumenes), [resumenes]);

  /** El más raro de todos los que tienes, y de qué juego es. */
  const joya = useMemo(() => {
    let mejor: { summary: PlatinumSummary; nombre: string; porcentaje: number } | null = null;
    for (const summary of resumenes) {
      if (!summary.rarest) continue;
      if (mejor && summary.rarest.percent >= mejor.porcentaje) continue;
      mejor = { summary, nombre: summary.rarest.name, porcentaje: summary.rarest.percent };
    }
    return mejor;
  }, [resumenes]);

  /** Cómo de duros fueron los platinos que ya tienes. */
  const tramos = useMemo(() => {
    const cuentas = new Map<DifficultyTier, number>();
    for (const summary of resumenes) {
      if (!summary.complete || !summary.difficulty) continue;
      cuentas.set(summary.difficulty.tier, (cuentas.get(summary.difficulty.tier) ?? 0) + 1);
    }
    return [...cuentas.entries()].sort((a, b) => b[1] - a[1]);
  }, [resumenes]);

  const ultimo = useMemo(() => {
    let mejor: PlatinumSummary | null = null;
    for (const summary of resumenes) {
      if (summary.lastUnlockAt === null) continue;
      if (!mejor || summary.lastUnlockAt > (mejor.lastUnlockAt ?? 0)) mejor = summary;
    }
    return mejor;
  }, [resumenes]);

  const nombreDe = (gameId: string) => games.find((game) => game.id === gameId)?.name ?? gameId;

  if (resumenes.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <ViewHeader title={t('lateral.perfil')} subtitle={t('perfil.subtitulo')} />
        <Empty
          icon={<Trophy size={40} strokeWidth={1.25} />}
          title={t('perfil.sinDatos')}
          hint={t('perfil.sinDatosPista')}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader title={t('lateral.perfil')} subtitle={t('perfil.subtitulo')} />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto flex max-w-4xl flex-col gap-4">

          {/* Las cuatro cifras que un cazador de platinos se sabe de memoria. */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
            <Cifra
              icon={<Gem size={15} />}
              label={t('perfil.platinos')}
              valor={numero(cuenta.platinos)}
              pie={t('perfil.deNJuegos', { n: cuenta.conLogros })}
            />
            <Cifra
              icon={<Trophy size={15} />}
              label={t('perfil.logros')}
              valor={numero(cuenta.hechos)}
              pie={t('perfil.deNTotales', { n: numero(cuenta.total) })}
            />
            <Cifra
              icon={<Timer size={15} />}
              label={t('perfil.horas')}
              valor={duration(cuenta.minutos)}
              pie={t('perfil.enNJuegos', { n: cuenta.conHoras })}
            />
            <Cifra
              icon={<Gauge size={15} />}
              label={t('perfil.media')}
              valor={fmtPercent(cuenta.media, 0)}
              pie={t('perfil.mediaPista')}
            />
          </div>

          {/*
            La vitrina. Un platino es el recuerdo de lo que costó, y el logro
            más raro que tienes es la prueba: por eso lleva su color de rareza,
            que es la única excepción declarada al acento único.
          */}
          {joya && (
            <Card className="p-4">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
                <Sparkles size={13} /> {t('perfil.loMasRaro')}
              </div>
              <button
                type="button"
                onClick={() => open(joya.summary.gameId)}
                className="mt-2 block max-w-full text-left"
              >
                <p className="truncate text-[17px] font-semibold leading-tight transition-colors hover:text-accent-hover">
                  {joya.nombre}
                </p>
                <p className="mt-0.5 truncate text-[12px] text-muted">
                  {nombreDe(joya.summary.gameId)}
                </p>
              </button>
              <p
                className="mt-2 font-mono text-[13px] font-medium"
                style={{ color: `var(${rarityToken(joya.porcentaje)})` }}
              >
                {t('perfil.loTieneEl', { porcentaje: fmtPercent(joya.porcentaje) })}
              </p>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/*
              La racha se cuenta hacia atrás desde hoy sobre los días en que
              conseguiste algo, sumando los de todos los juegos. Ayer también
              cuenta como día vivo: si no, la racha se rompería cada mañana
              hasta que jugaras.
            */}
            <Card className="p-4">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
                <Flame size={13} /> {t('perfil.racha')}
              </div>
              <p className="mt-2 text-[26px] font-semibold leading-none tabular-nums">
                {racha.actual > 0 ? numero(racha.actual) : '—'}
              </p>
              <p className="mt-1 text-[12px] text-muted">
                {racha.actual > 0
                  ? t(racha.actual === 1 ? 'perfil.rachaUnDia' : 'perfil.rachaDias', { n: racha.actual })
                  : t('perfil.sinRacha')}
              </p>
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-faint">
                <CalendarDays size={12} />
                {t('perfil.diasActivos', { n: racha.dias })}
              </p>
              {ultimo?.lastUnlockAt && (
                <p className="mt-1 truncate text-[11px] text-faint">
                  {t('perfil.ultimoLogro', {
                    juego: nombreDe(ultimo.gameId), cuando: relative(ultimo.lastUnlockAt),
                  })}
                </p>
              )}
            </Card>

            {/* De qué están hechos tus platinos. */}
            <Card className="p-4">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
                <Gem size={13} /> {t('perfil.deQueEstanHechos')}
              </div>
              {tramos.length === 0 ? (
                <p className="mt-2 text-[12px] text-muted">{t('perfil.sinPlatinos')}</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {tramos.map(([tramo, n]) => (
                    <li key={tramo} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 truncate text-[12px] text-muted">
                        {t(DIFICULTAD[tramo])}
                      </span>
                      <Progress value={(n / cuenta.platinos) * 100} className="h-1.5 flex-1" tone="success" />
                      <span className="w-6 shrink-0 text-right font-mono text-[12px] text-faint">{n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* Lo que tienes a medias, para que el perfil no sea solo un museo. */}
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
                <Trophy size={13} /> {t('perfil.enCurso')}
              </div>
              <button
                type="button"
                onClick={() => go('library')}
                className="text-[12px] text-muted transition-colors hover:text-accent-hover"
              >
                {t('portada.verTodos')}
              </button>
            </div>
            <p className="mt-2 text-[12px] text-muted">
              {t('perfil.enCursoCuerpo', {
                curso: cuenta.enCurso, faltan: numero(cuenta.total - cuenta.hechos),
              })}
            </p>
            <Progress value={cuenta.media} className="mt-3" />
          </Card>

        </div>
      </div>
    </div>
  );
}

function Cifra({
  icon, label, valor, pie,
}: { icon: React.ReactNode; label: string; valor: string; pie: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
        <span className="text-accent">{icon}</span> {label}
      </div>
      <p className={cn('mt-2 text-[26px] font-semibold leading-none tabular-nums')}>{valor}</p>
      <p className="mt-1 truncate text-[12px] text-muted">{pie}</p>
    </Card>
  );
}

/** Las sumas de toda la biblioteca, de una pasada. */
function sumar(resumenes: PlatinumSummary[]) {
  let hechos = 0;
  let total = 0;
  let minutos = 0;
  let conHoras = 0;
  let platinos = 0;
  let enCurso = 0;
  for (const s of resumenes) {
    hechos += s.unlocked;
    total += s.total;
    if (s.playtimeMinutes) { minutos += s.playtimeMinutes; conHoras += 1; }
    if (s.complete) platinos += 1;
    else if (s.unlocked > 0) enCurso += 1;
  }
  return {
    hechos, total, minutos, conHoras, platinos, enCurso,
    conLogros: resumenes.length,
    media: total > 0 ? (hechos / total) * 100 : 0,
  };
}

/**
 * La racha: días seguidos con al menos un logro, contando hacia atrás.
 *
 * Ayer vale como punto de partida además de hoy. Sin eso la racha se rompería
 * cada medianoche y volvería a existir al conseguir el primer logro del día,
 * que es contar el reloj en vez de contar lo que haces.
 */
function contarRacha(resumenes: PlatinumSummary[]): { actual: number; dias: number } {
  const dias = new Set<number>();
  for (const s of resumenes) for (const dia of s.unlockDays) dias.add(dia);
  if (dias.size === 0) return { actual: 0, dias: 0 };

  const hoy = Math.floor(Date.now() / 1000 / DIA);
  let cursor = dias.has(hoy) ? hoy : hoy - 1;
  let actual = 0;
  while (dias.has(cursor)) { actual += 1; cursor -= 1; }
  return { actual, dias: dias.size };
}

