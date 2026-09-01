import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Search, Trophy, Lock, RotateCcw, Save, EyeOff } from 'lucide-react';
import type { Achievement, GameStat } from '@shared/types';
import { api } from '@/lib/api';
import { useStore } from '@/store';
import { cn } from '@/lib/cn';
import { dateTime } from '@/lib/format';
import { Badge, Button, Empty, Input, Skeleton, Toggle, ViewHeader } from '@/components/ui';

type Tab = 'achievements' | 'stats';

/** Alto fijo de fila; la virtualización lo necesita para calcular el scroll. */
const ROW_HEIGHT = 44;

export function AchievementsView() {
  const game = useStore((s) => s.selected());
  const pushToast = useStore((s) => s.pushToast);

  // Se extraen los identificadores porque el objeto `game` se reconstruye cada
  // vez que cambia la biblioteca (marcar un favorito, un escaneo…). Si los
  // efectos dependieran de él, marcar una estrella reabriría la sesión de Steam
  // y releería los cientos de logros del juego.
  const gameId = game?.id;
  const appId = game?.nativeId;

  const [tab, setTab] = useState<Tab>('achievements');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [stats, setStats] = useState<GameStat[]>([]);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  /** Cambios sin guardar. Nada se escribe en Steam hasta pulsar Guardar. */
  const [achPatch, setAchPatch] = useState<Record<string, boolean>>({});
  const [statPatch, setStatPatch] = useState<Record<string, number>>({});
  /**
   * Texto en crudo de los campos de estadística mientras se escriben.
   *
   * Sin esto no se puede borrar el campo para teclear otro número: al quedar
   * vacío no parsea, se descarta el cambio y el input vuelve al valor original
   * de golpe. El texto vive aquí y solo pasa a `statPatch` cuando es un número.
   */
  const [statDrafts, setStatDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!appId) return;
    setLoading(true);
    setError(null);
    setAchPatch({});
    setStatPatch({});
    setStatDrafts({});

    const session = await api.steam.open(appId);
    if (!session.ok) {
      setError(session.error);
      setLoading(false);
      return;
    }
    if (session.data.state !== 'connected') {
      setError(session.data.error ?? 'No se pudo conectar con Steam');
      setLoading(false);
      return;
    }

    const [a, s] = await Promise.all([
      api.steam.achievements(appId),
      api.steam.stats(appId),
    ]);
    if (!a.ok) setError(a.error);
    else setAchievements(a.data);
    if (s.ok) setStats(s.data);
    setLoading(false);
  }, [appId]);

  useEffect(() => {
    void load();
    // Cada sesión es un proceso hijo de Steam. Sin este cierre, visitar cinco
    // juegos deja cinco procesos vivos hasta que se cierre la app.
    return () => { if (appId) void api.steam.close(appId); };
  }, [load, appId]);

  // Al cambiar de juego se descarta lo anterior en vez de enseñar los logros
  // del juego previo mientras cargan los nuevos.
  useEffect(() => {
    setAchievements([]);
    setStats([]);
    setQuery('');
    setTab('achievements');
  }, [gameId]);

  const unlockedOf = (a: Achievement) => achPatch[a.apiName] ?? a.unlocked;
  /** El borrador manda mientras el campo tiene el foco; si no, el valor real. */
  const valueOf = (s: GameStat): string =>
    statDrafts[s.apiName] ?? String(statPatch[s.apiName] ?? s.value);

  const pendingCount =
    Object.keys(achPatch).length + Object.keys(statPatch).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return achievements;
    return achievements.filter(
      (a) =>
        a.displayName.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.apiName.toLowerCase().includes(q),
    );
  }, [achievements, query]);

  const unlockedTotal = achievements.filter(unlockedOf).length;

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  function setAll(next: boolean) {
    const patch: Record<string, boolean> = { ...achPatch };
    for (const a of visible) {
      if (a.protected) continue;
      if (a.unlocked === next) delete patch[a.apiName];
      else patch[a.apiName] = next;
    }
    setAchPatch(patch);
  }

  function invert() {
    const patch: Record<string, boolean> = { ...achPatch };
    for (const a of visible) {
      if (a.protected) continue;
      const next = !unlockedOf(a);
      if (a.unlocked === next) delete patch[a.apiName];
      else patch[a.apiName] = next;
    }
    setAchPatch(patch);
  }

  function toggleOne(a: Achievement, next: boolean) {
    setAchPatch((prev) => {
      const copy = { ...prev };
      if (a.unlocked === next) delete copy[a.apiName];
      else copy[a.apiName] = next;
      return copy;
    });
  }

  function editStat(s: GameStat, raw: string) {
    setStatDrafts((prev) => ({ ...prev, [s.apiName]: raw }));

    const parsed = s.type === 'int' ? parseInt(raw, 10) : parseFloat(raw);
    setStatPatch((prev) => {
      const copy = { ...prev };
      if (Number.isNaN(parsed) || parsed === s.originalValue) delete copy[s.apiName];
      else copy[s.apiName] = parsed;
      return copy;
    });
  }

  /** Al salir del campo se descarta el borrador y manda el valor efectivo. */
  function commitStatDraft(s: GameStat) {
    setStatDrafts((prev) => {
      const copy = { ...prev };
      delete copy[s.apiName];
      return copy;
    });
  }

  async function commit() {
    if (!appId) return;
    setSaving(true);
    const res = await api.steam.commit(appId, {
      achievements: Object.entries(achPatch).map(([apiName, unlocked]) => ({ apiName, unlocked })),
      stats: Object.entries(statPatch).map(([apiName, value]) => ({ apiName, value })),
    });
    setSaving(false);
    if (!res.ok) return pushToast('error', res.error);
    await load();
  }

  if (!game) {
    return (
      <Empty
        icon={<Trophy size={40} strokeWidth={1.25} />}
        title="Ningún juego seleccionado"
        hint="Elige un juego en la Biblioteca para ver y editar sus logros."
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        title={game.name}
        subtitle={
          loading
            ? 'Conectando con Steam…'
            : error
              ? undefined
              : `${unlockedTotal} de ${achievements.length} logros · ${stats.length} estadísticas`
        }
        actions={
          <div className="flex gap-1 rounded-sm border border-line p-0.5">
            <Button size="sm" variant={tab === 'achievements' ? 'primary' : 'ghost'}
                    onClick={() => setTab('achievements')}>Logros</Button>
            <Button size="sm" variant={tab === 'stats' ? 'primary' : 'ghost'}
                    onClick={() => setTab('stats')}>Estadísticas</Button>
          </div>
        }
      />

      {error ? (
        <Empty
          icon={<Lock size={40} strokeWidth={1.25} />}
          title="No se pudo leer los logros"
          hint={error}
          action={<Button variant="outline" onClick={load}><RotateCcw size={14} /> Reintentar</Button>}
        />
      ) : tab === 'achievements' ? (
        <>
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-6 py-3">
            <div className="relative w-full max-w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)}
                     placeholder="Buscar logro…" className="w-full pl-8" />
            </div>
            <div className="flex flex-wrap gap-1">
              <Button size="sm" variant="outline" onClick={() => setAll(true)}>Marcar todos</Button>
              <Button size="sm" variant="outline" onClick={() => setAll(false)}>Desmarcar</Button>
              <Button size="sm" variant="outline" onClick={invert}>Invertir</Button>
            </div>
          </div>

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex flex-col gap-px p-3">
                {Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-11" />)}
              </div>
            ) : visible.length === 0 ? (
              <Empty title="Ningún logro coincide" hint="Prueba con otro término de búsqueda." />
            ) : (
              // Virtualizada: hay juegos con cientos de logros (Geometry Dash
              // tiene 547) y pintarlos todos deja la lista a tirones.
              <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                {virtualizer.getVirtualItems().map((row) => {
                  const a = visible[row.index]!;
                  const on = unlockedOf(a);
                  const dirty = a.apiName in achPatch;
                  return (
                    <div
                      key={a.apiName}
                      className={cn(
                        'absolute left-0 top-0 flex w-full items-center gap-3 border-b border-line px-6',
                        'transition-colors duration-[120ms] hover:bg-elevated',
                        dirty && 'bg-accent-soft',
                      )}
                      style={{ height: ROW_HEIGHT, transform: `translateY(${row.start}px)` }}
                    >
                      <div
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-inset text-[13px] font-semibold',
                          on ? 'text-accent' : 'text-faint',
                        )}
                      >
                        {a.iconUrl ? (
                          <img
                            src={a.iconUrl}
                            alt=""
                            loading="lazy"
                            // Los bloqueados en gris, como en el cliente de Steam.
                            className={cn(
                              'h-full w-full object-cover',
                              !on && 'opacity-40 grayscale',
                            )}
                          />
                        ) : a.hidden ? (
                          <EyeOff size={13} className={cn(!on && 'opacity-40')} />
                        ) : (
                          <span className={cn(!on && 'opacity-40')}>
                            {a.displayName.charAt(0)}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className={cn('truncate text-[13px] font-medium', !on && 'text-muted')}>
                            {a.displayName}
                          </p>
                          {a.hidden && <Badge>oculto</Badge>}
                          {a.protected && <Badge tone="warn">protegido</Badge>}
                        </div>
                        <p className="truncate text-[12px] text-faint">{a.description}</p>
                      </div>

                      <span className="shrink-0 font-mono text-[11px] text-faint">
                        {dateTime(a.unlockTime)}
                      </span>

                      <Toggle
                        checked={on}
                        disabled={a.protected}
                        label={a.displayName}
                        onChange={(next) => toggleOne(a, next)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col gap-px p-3">
              {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-11" />)}
            </div>
          ) : (
            stats.map((s) => {
              const dirty = s.apiName in statPatch;
              return (
                <div key={s.apiName}
                     className={cn('flex min-h-[52px] items-center gap-3 border-b border-line px-6 py-2',
                                   dirty && 'bg-accent-soft')}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{s.displayName}</p>
                    <p className="truncate font-mono text-[11px] text-faint">{s.apiName}</p>
                  </div>
                  {s.incrementOnly && <Badge tone="warn">solo incrementa</Badge>}
                  <Badge mono>{s.type}</Badge>
                  <Input
                    type="number"
                    value={valueOf(s)}
                    step={s.type === 'int' ? 1 : 0.001}
                    onChange={(e) => editStat(s, e.target.value)}
                    onBlur={() => commitStatDraft(s)}
                    aria-label={s.displayName}
                    className="w-32 shrink-0 text-right font-mono"
                  />
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Banda de cambios pendientes: la escritura en Steam es siempre explícita. */}
      {pendingCount > 0 && (
        <div className="flex shrink-0 items-center justify-between border-t-2 border-accent bg-elevated px-6 py-3">
          <p className="text-[13px]">
            <span className="font-semibold text-accent-hover">{pendingCount}</span>
            {pendingCount === 1 ? ' cambio sin guardar' : ' cambios sin guardar'}
          </p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => { setAchPatch({}); setStatPatch({}); setStatDrafts({}); }}
            >
              Descartar
            </Button>
            <Button variant="primary" onClick={commit} disabled={saving}>
              <Save size={14} /> {saving ? 'Guardando…' : 'Guardar en Steam'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
