import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Trophy, Lock, RotateCcw, Save, EyeOff, History, ShieldAlert, Filter, NotebookPen,
  Eye, BookOpen, Map as MapIcon,
} from 'lucide-react';
import type { Achievement, AchievementSet, GameStat, SteamSnapshot } from '@shared/types';
import { api } from '@/lib/api';
import { useStore } from '@/store';
import { cn } from '@/lib/cn';
import { comparar, dateTime, percent as fmtPercent, rarity, rarityToken } from '@/lib/format';
import { explicarNota, nombreFuente } from '@/lib/platino';
import { useT, type Clave } from '@/i18n';
import {
  Badge, Button, Empty, Input, Modal, Progress, Skeleton, Toggle, ViewHeader,
} from '@/components/ui';

type Tab = 'achievements' | 'stats' | 'backups';

/**
 * Orden de la lista.
 *
 * Geometry Dash tiene 547 logros y Call of Duty 157: en el orden en que los
 * manda Steam, que para la mayoría de juegos es arbitrario, esa lista es un
 * muro. Por defecto se ponen delante los más comunes, que es por donde conviene
 * empezar, igual que hace la ficha del juego.
 */
type Sort = 'common' | 'rare' | 'name' | 'steam';

const SORTS: { id: Sort; label: Clave }[] = [
  { id: 'common', label: 'tro.ordenFaciles' },
  { id: 'rare', label: 'tro.ordenRaros' },
  { id: 'name', label: 'tro.ordenNombre' },
  { id: 'steam', label: 'tro.ordenJuego' },
];

export function AchievementsView() {
  const t = useT();
  const game = useStore((s) => s.selected());
  const pushToast = useStore((s) => s.pushToast);
  const openGuideSearch = useStore((s) => s.openGuideSearch);
  const go = useStore((s) => s.go);

  // Se extraen los identificadores porque el objeto `game` se reconstruye cada
  // vez que cambia la biblioteca (marcar un favorito, un escaneo…). Si los
  // efectos dependieran de él, marcar una estrella reabriría la sesión de Steam
  // y releería los cientos de logros del juego.
  const gameId = game?.id;
  const appId = game?.nativeId;

  const [tab, setTab] = useState<Tab>('achievements');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * De dónde salen los logros de este juego. Manda sobre casi todo lo demás:
   * si la plataforma no publica el progreso, la vista pasa a ser un registro
   * que rellenas tú, y ni el aviso de riesgo ni el botón de guardar en Steam
   * tienen sentido.
   */
  const [set, setSet] = useState<AchievementSet | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [stats, setStats] = useState<GameStat[]>([]);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [backups, setBackups] = useState<SteamSnapshot[]>([]);
  /** Filtro rápido: casi siempre interesa solo lo que falta. */
  const [onlyRemaining, setOnlyRemaining] = useState(false);
  const [sort, setSort] = useState<Sort>('common');

  /*
   * Aviso de riesgo. No se enseña al entrar —sería un peaje en cada visita—
   * sino la primera vez que se intenta cambiar algo, que es cuando importa.
   * La acción que lo disparó se guarda y se ejecuta si el usuario acepta.
   */
  const riskAccepted = useStore((s) => s.settings?.achievementRiskAccepted ?? false);
  const patchSettings = useStore((s) => s.patchSettings);
  const [riskOpen, setRiskOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pendingAction = useRef<(() => void) | null>(null);

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
    if (!gameId) return;
    setLoading(true);
    setError(null);
    setAchPatch({});
    setStatPatch({});
    setStatDrafts({});

    // Una sola llamada, valga el juego de la tienda que valga: el backend
    // decide si puede hablar con Steam o si toca el catálogo público.
    const response = await api.achievements.list(gameId);
    if (!response.ok) {
      setError(response.error);
      setLoading(false);
      return;
    }
    setSet(response.data);
    setAchievements(response.data.items);

    // Estadísticas e historial solo existen cuando manda el cliente de Steam.
    if (response.data.writable && appId) {
      const [s, b] = await Promise.all([api.steam.stats(appId), api.steam.backups(appId)]);
      if (s.ok) setStats(s.data);
      if (b.ok) setBackups(b.data);
    } else {
      setStats([]);
      setBackups([]);
    }
    setLoading(false);
  }, [gameId, appId]);

  useEffect(() => {
    void load();
    // Cada sesión es un proceso hijo de Steam. Sin este cierre, visitar cinco
    // juegos deja cinco procesos vivos hasta que se cierre la app.
    return () => { if (appId) void api.steam.close(appId); };
  }, [load, appId]);

  // Al cambiar de juego se descarta lo anterior en vez de enseñar los logros
  // del juego previo mientras cargan los nuevos.
  useEffect(() => {
    setSet(null);
    setAchievements([]);
    setStats([]);
    setQuery('');
    setTab('achievements');
  }, [gameId]);

  const unlockedOf = (a: Achievement) => achPatch[a.apiName] ?? a.unlocked;
  /** El borrador manda mientras el campo tiene el foco; si no, el valor real. */
  const valueOf = (s: GameStat): string =>
    statDrafts[s.apiName] ?? String(statPatch[s.apiName] ?? s.value);

  const writable = set?.writable ?? false;
  const manual = set?.tracking === 'manual';
  /*
   * Estado real que no se puede escribir: Xbox por OpenXBL, o un juego de Steam
   * leído por la Web API con el cliente cerrado. Aquí los interruptores no son
   * un control, son un indicador, y tienen que comportarse como tal: dejarlos
   * activos hacía que "Guardar" fallara con un error que no ayudaba a nadie.
   */
  const readOnly = set?.tracking === 'steam' && !writable;
  const pendingCount =
    Object.keys(achPatch).length + Object.keys(statPatch).length;
  const unlockingCount = Object.values(achPatch).filter(Boolean).length;
  const lockingCount = Object.values(achPatch).filter((value) => !value).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = achievements.filter((a) => {
      if (onlyRemaining && a.unlocked) return false;
      if (!q) return true;
      return a.displayName.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.apiName.toLowerCase().includes(q);
    });
    if (sort === 'steam') return filtered;
    // Los logros sin rareza conocida van al final en los dos órdenes: no se
    // sabe si son fáciles o imposibles, así que no deberían encabezar nada.
    const rank = (value: number | null) => (value === null ? -1 : value);
    return [...filtered].sort((a, b) => {
      if (sort === 'name') return comparar(a.displayName, b.displayName);
      if (sort === 'rare') {
        const ra = a.globalPercent ?? 101;
        const rb = b.globalPercent ?? 101;
        return ra - rb;
      }
      return rank(b.globalPercent) - rank(a.globalPercent);
    });
  }, [achievements, query, onlyRemaining, sort]);

  const unlockedTotal = achievements.filter(unlockedOf).length;

  /**
   * Puerta del aviso de riesgo.
   *
   * Cualquier cosa que altere logros pasa por aquí. Si el usuario todavía no ha
   * leído el aviso, la acción se aparca y se enseña; si ya lo leyó, se ejecuta
   * sin más ceremonia.
   */
  function guard(action: () => void): void {
    // Marcar tu propio registro no desbloquea nada en ninguna plataforma, así
    // que el aviso solo tiene sentido cuando Atreus va a escribir en Steam.
    if (!writable || riskAccepted) { action(); return; }
    pendingAction.current = action;
    setRiskOpen(true);
  }

  function acceptRisk(): void {
    setRiskOpen(false);
    void patchSettings({ achievementRiskAccepted: true });
    const action = pendingAction.current;
    pendingAction.current = null;
    action?.();
  }

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
    if (!gameId) return;
    const patches = Object.entries(achPatch).map(([apiName, unlocked]) => ({ apiName, unlocked }));
    setSaving(true);
    const res = writable && appId
      ? await api.steam.commit(appId, {
        achievements: patches,
        stats: Object.entries(statPatch).map(([apiName, value]) => ({ apiName, value })),
      })
      : await api.achievements.mark(gameId, patches);
    setSaving(false);
    if (!res.ok) return pushToast('error', res.error);

    // Steam puede aceptar unos y rechazar otros. Decirlo importa: callarlo es
    // lo que hacía que un logro "guardado" no apareciera nunca en el perfil.
    const rechazados = 'rejected' in res.data ? res.data.rejected : [];
    if (rechazados.length > 0) {
      pushToast('warn', rechazados.length === patches.length
        ? t('tro.ningunoAceptado')
        : t('tro.rechazadosParcial', { rechazados: rechazados.length, total: patches.length }));
    } else {
      pushToast('success', t(writable ? 'tro.escritoEnSteam' : 'tro.registroActualizado'));
    }
    await load();
  }

  async function restore(snapshot: SteamSnapshot) {
    if (!appId) return;
    setSaving(true);
    const res = await api.steam.restore(appId, snapshot.id);
    setSaving(false);
    if (!res.ok) return pushToast('error', res.error);
    pushToast('success', t('tro.restaurados', { n: res.data.applied }));
    await load();
  }

  if (!game) {
    return (
      <Empty
        icon={<Trophy size={40} strokeWidth={1.25} />}
        title={t('tro.sinJuego')}
        hint={t('tro.sinJuegoPista')}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        title={`${t('lateral.trofeos')} · ${game.name}`}
        subtitle={
          loading
            ? t('tro.buscando')
            : error
              ? undefined
              : t(writable ? 'tro.conEstadisticas' : 'tro.deLogros', {
                hechos: unlockedTotal, total: achievements.length, stats: stats.length,
              })
        }
        actions={writable ? (
          <div className="flex gap-1 rounded-sm border border-line p-0.5">
            <Button size="sm" variant={tab === 'achievements' ? 'primary' : 'ghost'}
                    onClick={() => setTab('achievements')}>{t('tro.pestanaLogros')}</Button>
            <Button size="sm" variant={tab === 'stats' ? 'primary' : 'ghost'}
                    onClick={() => setTab('stats')}>{t('tro.pestanaStats')}</Button>
            <Button size="sm" variant={tab === 'backups' ? 'primary' : 'ghost'}
                    onClick={() => setTab('backups')}><History size={14} /> {t('tro.pestanaHistorial')}</Button>
          </div>
        ) : undefined}
      />

      {error ? (
        <Empty
          icon={<Lock size={40} strokeWidth={1.25} />}
          title={t('tro.errorTitulo')}
          hint={error}
          action={<Button variant="outline" onClick={load}><RotateCcw size={14} /> {t('tro.reintentar')}</Button>}
        />
      ) : !loading && achievements.length === 0 ? (
        <Empty
          icon={<Trophy size={40} strokeWidth={1.25} />}
          title={t('tro.sinListaTitulo')}
          hint={set?.note ? explicarNota(t, set.note) : t('tro.sinListaPista')}
          action={<Button variant="outline" onClick={load}><RotateCcw size={14} /> {t('tro.reintentar')}</Button>}
        />
      ) : tab === 'achievements' ? (
        <>
          {set?.note && (manual || readOnly) && (
            <div className="flex items-start gap-2.5 border-b border-line bg-inset px-6 py-3">
              {readOnly
                ? <Eye size={15} className="mt-0.5 shrink-0 text-accent" />
                : <NotebookPen size={15} className="mt-0.5 shrink-0 text-accent" />}
              <div className="min-w-0">
                <p className="text-[13px] font-medium">
                  {readOnly
                    ? t('tro.soloLectura', { fuente: nombreFuente(t, set.source) })
                    : t('tro.tuRegistro')}
                </p>
                <p className="mt-0.5 text-[12px] leading-5 text-muted">
                  {explicarNota(t, set.note)}
                  {!readOnly && t('tro.tuRegistroPista')}
                </p>
              </div>
            </div>
          )}

          {achievements.length > 0 && (
            <div className="border-b border-line px-6 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[13px]">
                  <span className="font-semibold">{unlockedTotal}</span>
                  {/* La cifra va aparte porque lleva su propio peso; el resto
                      es una frase entera, no un trozo recortado de otra. */}
                  <span className="text-muted"> {t('tro.deTotalLogros', { total: achievements.length })}</span>
                </p>
                <p className="text-[13px] font-semibold tabular-nums">
                  {/* Por `percent()`, que sigue al idioma: aquí el separador
                      decimal estaba puesto a mano y en inglés salía "78,9 %". */}
                  {fmtPercent((unlockedTotal / achievements.length) * 100)}
                </p>
              </div>
              <Progress
                value={(unlockedTotal / achievements.length) * 100}
                tone={unlockedTotal === achievements.length ? 'success' : 'accent'}
                className="mt-2" />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 border-b border-line px-6 py-3">
            <div className="relative w-full max-w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)}
                     placeholder={t('tro.buscarLogro')} className="w-full pl-8" />
            </div>
            <div className="flex flex-wrap gap-1">
              <Button size="sm" variant={onlyRemaining ? 'primary' : 'outline'}
                      onClick={() => setOnlyRemaining((value) => !value)}>
                <Filter size={13} /> {t('tro.soloFaltan')}
              </Button>
              <label className="flex items-center gap-1.5 text-[12px] text-faint">
                {t('tro.orden')}
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
              {visible.length !== achievements.length && (
                <span className="text-[12px] text-faint">
                  {t('tro.deN', { visibles: visible.length, total: achievements.length })}
                </span>
              )}
              {!readOnly && <>
                <Button size="sm" variant="outline" onClick={() => guard(() => setAll(true))}>{t('tro.marcarTodos')}</Button>
                <Button size="sm" variant="outline" onClick={() => guard(() => setAll(false))}>{t('tro.desmarcar')}</Button>
                <Button size="sm" variant="outline" onClick={() => guard(invert)}>{t('tro.invertir')}</Button>
              </>}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex flex-col gap-px p-3">
                {Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-11" />)}
              </div>
            ) : visible.length === 0 ? (
              <Empty title={t('tro.sinCoincidencias')} hint={t('tro.sinCoincidenciasPista')} />
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 2xl:grid-cols-3">
                {visible.map((a) => {
                  const on = unlockedOf(a);
                  const dirty = a.apiName in achPatch;
                  const token = rarityToken(a.globalPercent);
                  const legendario = a.globalPercent !== null && a.globalPercent < 1;
                  return (
                    <div
                      key={a.apiName}
                      className={cn(
                        'relative flex min-h-20 items-center gap-3 overflow-hidden rounded-md border border-line bg-surface p-3 pl-4',
                        // Un juego puede traer más de quinientos logros: sin
                        // esto, cada desplazamiento repinta los quinientos.
                        'defer-render',
                        'transition-colors duration-[120ms] hover:bg-elevated hover:border-accent/40',
                        dirty && 'border-accent bg-accent-soft',
                      )}
                    >
                      {/* La banda de rareza en el canto. En una rejilla de
                          quinientos logros es lo que deja barrer con la vista
                          buscando los que van a costar el platino. */}
                      {a.globalPercent !== null && (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-0 left-0 w-1"
                          style={{ background: `var(${token})` }}
                        />
                      )}
                      <div
                        className={cn(
                          'flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-line bg-inset text-[18px] font-semibold shadow-sm',
                          on ? 'text-accent' : 'text-faint',
                        )}
                      >
                        <AchievementIcon achievement={a} unlocked={on} />
                      </div>

                      <div className="min-w-0 flex-1 self-stretch py-0.5">
                        <div className="flex items-center gap-2">
                          <p className={cn('truncate text-[13px] font-medium', !on && 'text-muted')}>
                            {a.displayName}
                          </p>
                          {a.hidden && <Badge>{t('tro.oculto')}</Badge>}
                          {a.protected && <Badge tone="warn">{t('tro.protegido')}</Badge>}
                          {/* La rareza global es lo que dice si este logro es
                              el que va a costar el platino, así que va junto al
                              nombre y no escondida en un detalle. */}
                          {a.globalPercent !== null && (
                            <span
                              className="inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-sm border px-1.5 text-[11px] font-semibold tabular-nums"
                              style={{
                                color: `var(${token})`,
                                borderColor: `var(${token})`,
                                // Solo lo legendario se ilumina. Si brillara
                                // todo, no destacaría nada.
                                boxShadow: legendario ? '0 0 10px var(--rare-legendario-glow)' : undefined,
                              }}
                            >
                              {fmtPercent(a.globalPercent)}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[12px] leading-4 text-faint">{a.description}</p>
                        {a.globalPercent !== null && (
                          <p className="mt-0.5 text-[11px] font-medium" style={{ color: `var(${token})` }}>
                            {rarity(a.globalPercent)}
                          </p>
                        )}
                        {!on && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openGuideSearch(game.id, a.displayName)}
                            >
                              <BookOpen size={12} /> {t('tro.buscarGuia')}
                            </Button>
                            {needsMap(a) && (
                              <Button size="sm" variant="ghost" onClick={() => go('maps')}>
                                <MapIcon size={12} /> {t('tro.verMapa')}
                              </Button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Un logro activado sin fecha se contradice a la vista.
                          Mientras el cambio no se guarde, se dice que está
                          pendiente en vez de enseñar un guion. */}
                      <span
                        className={cn(
                          'hidden shrink-0 self-end font-mono text-[10px] xl:block',
                          dirty ? 'text-accent-hover' : 'text-faint',
                        )}
                      >
                        {dirty
                          ? t(on ? 'tro.sinGuardar' : 'tro.seBorrara')
                          : dateTime(a.unlockTime)}
                      </span>

                      <Toggle
                        checked={on}
                        disabled={a.protected || readOnly}
                        label={a.displayName}
                        onChange={(next) => guard(() => toggleOne(a, next))}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : tab === 'stats' ? (
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
                     className={cn('defer-render flex min-h-[52px] items-center gap-3 border-b border-line px-6 py-2',
                                   dirty && 'bg-accent-soft')}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{s.displayName}</p>
                    <p className="truncate font-mono text-[11px] text-faint">{s.apiName}</p>
                  </div>
                  {s.incrementOnly && <Badge tone="warn">{t('tro.soloIncrementa')}</Badge>}
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
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col gap-px p-3">
              {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-14" />)}
            </div>
          ) : backups.length === 0 ? (
            <Empty
              icon={<History size={40} strokeWidth={1.25} />}
              title={t('tro.sinCopiasTitulo')}
              hint={t('tro.sinCopiasPista')}
            />
          ) : backups.map((snapshot) => (
            <div key={snapshot.id} className="flex min-h-[56px] items-center gap-3 border-b border-line px-6 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">{t('tro.copiaAnterior')}</p>
                <p className="text-[12px] text-faint">
                  {dateTime(snapshot.createdAt)} · {snapshot.achievements.length} logros · {snapshot.stats.length} estadísticas
                </p>
              </div>
              <Button size="sm" variant="outline" disabled={saving} onClick={() => void restore(snapshot)}>
                <RotateCcw size={14} /> Restaurar
              </Button>
            </div>
          ))}
        </div>
      )}

      <RiskDialog open={riskOpen} onCancel={() => { pendingAction.current = null; setRiskOpen(false); }} onAccept={acceptRisk} />

      <Modal
        open={confirmOpen && writable}
        title={t('tro.confirmarTitulo')}
        icon={<Save size={16} className="text-accent" />}
        onClose={() => setConfirmOpen(false)}
        footer={<>
          <Button variant="ghost" onClick={() => setConfirmOpen(false)}>{t('tro.cancelar')}</Button>
          <Button variant="primary" disabled={saving}
                  onClick={() => { setConfirmOpen(false); void commit(); }}>
            <Save size={14} /> {t('tro.escribirSteam')}
          </Button>
        </>}
      >
        <p className="text-[13px] leading-6 text-muted">
          {t('tro.seVanAEscribir', {
            desbloqueos: unlockingCount,
            bloqueos: lockingCount,
            stats: Object.keys(statPatch).length === 0
              ? ''
              : Object.keys(statPatch).length === 1
                ? t('tro.ademasUnaStat')
                : t('tro.ademasStats', { n: Object.keys(statPatch).length }),
          })}
        </p>
        <p className="mt-3 text-[12px] leading-5 text-faint">{t('tro.copiaAntes')}</p>
      </Modal>

      {pendingCount > 0 && (
        <div className="flex shrink-0 items-center justify-between border-t-2 border-accent bg-elevated px-6 py-3">
          <p className="text-[13px]">
            {pendingCount === 1 ? t('tro.unCambio') : t('tro.nCambios', { n: pendingCount })}
          </p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => { setAchPatch({}); setStatPatch({}); setStatDrafts({}); }}
            >
              {t('tro.descartar')}
            </Button>
            <Button
              variant="primary"
              disabled={saving}
              onClick={() => (writable ? setConfirmOpen(true) : void commit())}
            >
              <Save size={14} />
              {t(saving
                ? 'tro.guardando'
                : writable ? 'tro.guardarSteam' : 'tro.guardarRegistro')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Los mapas ayudan cuando el propio texto apunta a lugares o coleccionables. */
function needsMap(achievement: Achievement): boolean {
  return /coleccion|collect|ubicaci[oó]n|location|mapa|map\b|tesoro|treasure|secreto|secret|reliquia|relic/i
    .test(`${achievement.displayName} ${achievement.description}`);
}

/**
 * El icono del logro, tal como lo enseña Steam.
 *
 * Steam publica dos imágenes por logro: la de color y la apagada. Antes se
 * cogía siempre la de color y se apagaba con un filtro CSS, que no es lo mismo
 * — la versión gris de Steam suele ser otro dibujo, no el mismo en gris. Ahora
 * se pide la que toca según el estado, con la otra de reserva y, como último
 * intento, el mismo archivo en el otro CDN de Valve: uno de los dos responde
 * casi siempre, y así el icono aparece incluso cuando el cliente todavía no lo
 * ha descargado a su caché.
 */
function AchievementIcon({ achievement, unlocked }: { achievement: Achievement; unlocked: boolean }) {
  const chain = useMemo(() => {
    const preferred = unlocked ? achievement.iconUrl : achievement.iconGrayUrl;
    const other = unlocked ? achievement.iconGrayUrl : achievement.iconUrl;
    const urls = [preferred, other].filter((url): url is string => Boolean(url));
    // Valve sirve lo mismo desde dos dominios; si uno falla, el otro vale.
    const mirrors = urls
      .filter((url) => url.startsWith('https://cdn.cloudflare.steamstatic.com/'))
      .map((url) => url.replace('https://cdn.cloudflare.steamstatic.com/', 'https://media.steampowered.com/'));
    return [...new Set([...urls, ...mirrors])];
  }, [achievement.iconUrl, achievement.iconGrayUrl, unlocked]);

  const [index, setIndex] = useState(0);

  // Al cambiar de juego —o al pasar de bloqueado a desbloqueado— se vuelve a
  // empezar por la primera opción en vez de quedarse en la reserva anterior.
  useEffect(() => { setIndex(0); }, [chain]);

  const src = chain[index] ?? null;

  if (src) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setIndex((value) => value + 1)}
        loading="lazy"
        decoding="async"
        className={cn(
          'h-full w-full object-cover transition-all duration-200 ease-atreus',
          // El icono gris de Steam ya viene apagado; bajarle más la opacidad
          // sería apagarlo dos veces.
          !unlocked && !achievement.iconGrayUrl && 'opacity-40 grayscale contrast-75',
          !unlocked && 'saturate-[.85]',
        )}
      />
    );
  }

  if (achievement.hidden) {
    return <EyeOff size={16} className={cn(!unlocked && 'opacity-40')} />;
  }

  return (
    <span className={cn('select-none font-bold', !unlocked && 'opacity-40')}>
      {achievement.displayName.charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * El aviso antes de tocar un logro.
 *
 * Se sale del tono habitual de la aplicación a propósito: no es una nota al
 * pie, es la única pantalla que pide una decisión informada. Dice las tres
 * cosas que hacen falta y ninguna más — qué hace, qué no pasa, y qué se pierde
 * de verdad — sin dramatizar ni quitarle importancia.
 */
function RiskDialog({
  open, onAccept, onCancel,
}: { open: boolean; onAccept: () => void; onCancel: () => void }) {
  const t = useT();
  return (
    <Modal
      open={open}
      title={t('tro.avisoTitulo')}
      icon={<ShieldAlert size={18} className="text-warn" />}
      onClose={onCancel}
      footer={<>
        <Button variant="ghost" onClick={onCancel}>{t('tro.avisoMejorNo')}</Button>
        <Button variant="primary" onClick={onAccept}>{t('tro.avisoContinuar')}</Button>
      </>}
    >
      <p className="text-[13px] leading-6">{t('aviso.entradilla')}</p>

      <div className="mt-4 flex flex-col gap-3">
        <Point tone="ok" title={t('tro.avisoNoBaneable')}>
          {t('aviso.noBaneableCuerpo')}
        </Point>

        <Point tone="warn" title={t('tro.avisoArruina')}>
          {t('aviso.arruinaCuerpo')}
        </Point>

        <Point tone="warn" title={t('tro.avisoSinVuelta')}>
          {t('aviso.sinVueltaCuerpo')}
        </Point>
      </div>

      {/* La salida va partida en dos claves con el enlace en medio: una sola
          cadena con etiquetas dentro obligaría a traducir HTML, y eso es
          justo donde una traducción rompe la interfaz. */}
      <p className="mt-4 rounded-sm border border-line bg-inset px-3 py-2.5 text-[12px] leading-5 text-muted">
        {t('aviso.salidaAntes')}
        <strong className="text-fg">{t('tro.avisoJugandoFuerte')}</strong>
        {t('aviso.salidaDespues')}
      </p>

      <p className="mt-3 text-[11px] leading-5 text-faint">{t('aviso.soloUnaVez')}</p>
    </Modal>
  );
}

function Point({
  tone, title, children,
}: { tone: 'ok' | 'warn'; title: string; children: React.ReactNode }) {
  return (
    <div className={cn(
      'rounded-sm border-l-2 pl-3',
      tone === 'ok' ? 'border-[var(--success-line)]' : 'border-[var(--warn-line)]',
    )}>
      <p className={cn('text-[13px] font-semibold', tone === 'ok' ? 'text-success' : 'text-warn')}>
        {title}
      </p>
      <p className="mt-0.5 text-[12px] leading-5 text-muted">{children}</p>
    </div>
  );
}
