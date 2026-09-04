import { useEffect, useMemo, useState } from 'react';
import {
  Package, Plus, Trash2, ArrowUp, ArrowDown, HardDriveDownload, Eraser, TriangleAlert,
  Layers, Check, X, Upload, Globe, Search, Columns2,
} from 'lucide-react';
import type { Mod, ModDeployPreview, ModProfile, RemoteMod } from '@shared/types';
import { api } from '@/lib/api';
import { useStore } from '@/store';
import { cn } from '@/lib/cn';
import { bytes, comparar } from '@/lib/format';
import { useT } from '@/i18n';
import { useMods } from '@/hooks/useMods';
import {
  DeployPreview, DiscoverPanel, ProfileComparison,
} from './taller/piezas';
import { Badge, Button, Card, Empty, Skeleton, Toggle, ViewHeader } from '@/components/ui';

/** Extensiones que el backend sabe extraer. Ver services/mods/archive.ts. */
const ARCHIVE_RE = /\.(zip|7z)$/i;
/** El extractor que trae Atreus no lleva el códec Rar, y conviene decirlo. */
const RAR_RE = /\.rar$/i;
type InstalledSort = 'order' | 'name' | 'recent' | 'status';

export function ModsView() {
  const t = useT();
  const game = useStore((s) => s.selected());
  const pushToast = useStore((s) => s.pushToast);

  // Ver la nota de AchievementsView.
  const gameId = game?.id;

  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ModDeployPreview | null>(null);
  const [preparingPreview, setPreparingPreview] = useState(false);
  /** true mientras se arrastra un archivo sobre la zona de mods. */
  const [dragging, setDragging] = useState(false);

  // ── Catálogo público ──
  /**
   * De dónde salen los datos del Taller. Ver `hooks/useMods.ts`.
   *
   * Lo que queda en esta vista es lo que es de la vista: la pestaña, los
   * filtros, los diálogos y el arrastrar y soltar.
   */
  const {
    mods, profiles, cargando: loading,
    remote, remoteError, cargandoRemote: loadingRemote,
    recargar: load, descubrir: discover, ponerMods: setMods,
  } = useMods(gameId, (mensaje) => pushToast('error', mensaje));

  const [tab, setTab] = useState<'installed' | 'discover'>('installed');
  const [query, setQuery] = useState('');
  const [installing, setInstalling] = useState<string | null>(null);
  const [installedQuery, setInstalledQuery] = useState('');
  const [installedSort, setInstalledSort] = useState<InstalledSort>('order');
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareLeft, setCompareLeft] = useState('');
  const [compareRight, setCompareRight] = useState('');

  useEffect(() => {
    if (tab === 'discover' && remote === null && !loadingRemote && !remoteError) {
      void discover();
    }
  }, [tab, remote, loadingRemote, remoteError, discover]);

  // Lo que sí es de la vista: la pestaña y los filtros vuelven a su sitio.
  useEffect(() => {
    setTab('installed');
    setInstalledQuery(''); setInstalledSort('order');
  }, [gameId]);

  /** Sin ruta abre el diálogo del sistema; con ruta instala directamente. */
  async function install(archivePath?: string) {
    if (!gameId) return;
    setBusy(true);
    const res = await api.mods.install(gameId, archivePath);
    setBusy(false);
    if (!res.ok) return pushToast('error', res.error);
    pushToast('success', t('taller.instalado', { mod: res.data.name }));
  }

  // ── Arrastrar y soltar ──────────────────────────────────────
  // Electron expone la ruta real del archivo soltado, así que se instala sin
  // pasar por el diálogo.
  async function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (!gameId) return;

    const files = [...event.dataTransfer.files] as (File & { path?: string })[];
    const paths = files
      .map((f) => f.path)
      .filter((path): path is string => typeof path === 'string' && ARCHIVE_RE.test(path));

    if (paths.length === 0) {
      pushToast('warn', t(files.some((f) => RAR_RE.test(f.path ?? ''))
        ? 'taller.sinRar'
        : 'taller.sueltaArchivo'));
      return;
    }
    for (const path of paths) await install(path);
  }

  // ── Perfiles ────────────────────────────────────────────────
  async function activateProfile(profileId: string) {
    if (!gameId) return;
    const res = await api.mods.activateProfile(gameId, profileId);
    if (!res.ok) return pushToast('error', res.error);
    await load();
  }

  /** Guarda la selección y el orden actuales como un perfil nuevo. */
  async function saveCurrentAsProfile() {
    if (!gameId) return;
    const name = window.prompt(t('taller.nombrePerfil'), t('taller.perfilNuevo'));
    if (!name?.trim()) return;

    const res = await api.mods.saveProfile({
      id: `p${Date.now().toString(36)}`,
      gameId,
      name: name.trim(),
      mods: mods.filter((m) => m.enabled).map((m) => m.id),
      launchArgs: '',
      isActive: false,
    });
    if (!res.ok) return pushToast('error', res.error);
    pushToast('success', t('taller.perfilGuardado', { perfil: res.data.name }));
    await load();
  }

  async function installFromCatalog(mod: RemoteMod) {
    if (!gameId) return;
    setInstalling(mod.id);
    const res = await api.mods.installRemote(gameId, mod);
    setInstalling(null);
    if (!res.ok) return pushToast('error', res.error);
    pushToast('success', t('taller.instaladoDesde', { mod: res.data.name, fuente: mod.source }));
  }

  async function deleteProfile(profile: ModProfile) {
    if (!gameId) return;
    if (!window.confirm(t('taller.borrarPerfil', { perfil: profile.name }))) return;
    const res = await api.mods.deleteProfile(gameId, profile.id);
    if (!res.ok) return pushToast('error', res.error);
    await load();
  }

  function openComparison() {
    const first = profiles.find((profile) => profile.isActive) ?? profiles[0];
    const second = profiles.find((profile) => profile.id !== first?.id) ?? first;
    if (!first || !second) return;
    setCompareLeft(first.id);
    setCompareRight(second.id);
    setCompareOpen(true);
  }

  async function setEnabled(mod: Mod, enabled: boolean) {
    if (!game) return;
    setMods((prev) => prev.map((m) => (m.id === mod.id ? { ...m, enabled } : m)));
    const res = await api.mods.setEnabled(game.id, mod.id, enabled);
    if (!res.ok) {
      setMods((prev) => prev.map((m) => (m.id === mod.id ? { ...m, enabled: !enabled } : m)));
      pushToast('error', res.error);
    }
  }

  async function move(index: number, delta: number) {
    if (!game) return;
    const next = [...mods];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const a = next[index];
    const b = next[target];
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;
    setMods(next);
    const res = await api.mods.reorder(game.id, next.map((m) => m.id));
    if (!res.ok) pushToast('error', res.error);
  }

  async function remove(mod: Mod) {
    if (!game) return;
    if (!window.confirm(t('taller.confirmarDesinstalar', { mod: mod.name }))) return;
    const res = await api.mods.uninstall(game.id, mod.id);
    if (!res.ok) pushToast('error', res.error);
  }

  async function prepareDeploy() {
    if (!game) return;
    setPreparingPreview(true);
    const result = await api.mods.previewDeploy(game.id);
    setPreparingPreview(false);
    if (!result.ok) return pushToast('error', result.error);
    setPreview(result.data);
  }

  async function deploy() {
    if (!game) return;
    setBusy(true);
    const res = await api.mods.deploy(game.id);
    setBusy(false);
    if (!res.ok) return pushToast('error', res.error);
    setPreview(null);
  }

  async function purge() {
    if (!game) return;
    if (!window.confirm(t('taller.confirmarPurgar'))) return;
    setBusy(true);
    const res = await api.mods.purge(game.id);
    setBusy(false);
    if (!res.ok) pushToast('error', res.error);
  }

  /*
   * Antes del retorno por "no hay juego", no después.
   *
   * Estaba debajo, y eso es un hook que se ejecuta en unos renders y en otros
   * no: al deseleccionar el juego React encontraba menos hooks de los que tenía
   * apuntados y tiraba la vista entera. Nunca dio la cara porque hace falta
   * pasar de un juego a ninguno con el Taller abierto. Lo cazó el linter, no
   * una prueba ni el compilador.
   */
  const visibleMods = useMemo(() => {
    const search = installedQuery.trim().toLowerCase();
    const filtered = search
      ? mods.filter((mod) => `${mod.name} ${mod.author ?? ''} ${mod.description ?? ''}`.toLowerCase().includes(search))
      : mods;
    return [...filtered].sort((a, b) => {
      if (installedSort === 'name') return comparar(a.name, b.name);
      if (installedSort === 'recent') return b.installedAt - a.installedAt;
      if (installedSort === 'status') return Number(b.enabled) - Number(a.enabled) || a.order - b.order;
      return a.order - b.order;
    });
  }, [mods, installedQuery, installedSort]);

  if (!game) {
    return (
      <Empty icon={<Package size={40} strokeWidth={1.25} />} title={t('taller.sinJuego')}
             hint={t('taller.sinJuegoPista')} />
    );
  }

  const active = profiles.find((p) => p.isActive);
  const enabledCount = mods.filter((m) => m.enabled).length;
  const conflictingEnabled = mods.filter((m) => m.enabled && m.conflictsWith.length > 0).length;
  const canReorder = installedSort === 'order' && !installedQuery.trim();

  /*
   * La distinción que todo el Taller da por sabida: **activar no es desplegar**.
   *
   * Un mod activo vive en el almacén de Atreus y no toca el juego hasta que se
   * pulsa Desplegar. Eso lo decía un distintivo pequeño por fila, así que
   * activabas tres mods, abrías el juego y no pasaba nada. Aquí se resume: hay
   * cambios pendientes si algún mod activo no está desplegado, o si algo
   * desplegado ya no está activo y sigue escrito en el juego.
   */
  const desplegados = mods.filter((mod) => mod.status === 'deployed');
  const sinDesplegar = mods.filter((mod) => mod.enabled && mod.status !== 'deployed').length;
  const sobrantes = desplegados.filter((mod) => !mod.enabled).length;
  const pendiente = sinDesplegar + sobrantes;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        title={`${t('lateral.taller')} · ${game.name}`}
        subtitle={t(active ? 'taller.resumenPerfil' : 'taller.resumen', {
          n: mods.length, activos: enabledCount, perfil: active?.name ?? '',
        })}
        actions={
          <>
            <div className="mr-1 flex gap-1 rounded-sm border border-line p-0.5">
              <Button
                size="sm"
                variant={tab === 'installed' ? 'primary' : 'ghost'}
                onClick={() => setTab('installed')}
              >
                {t('taller.pestanaInstalados')}
              </Button>
              <Button
                size="sm"
                variant={tab === 'discover' ? 'primary' : 'ghost'}
                onClick={() => setTab('discover')}
              >
                <Globe size={12} /> {t('taller.pestanaDescubrir')}
              </Button>
            </div>
            <Button variant="outline" onClick={() => install()} disabled={busy}>
              <Plus size={14} /> {t('taller.instalar')}
            </Button>
            <Button variant="outline" onClick={purge} disabled={busy}>
              <Eraser size={14} /> {t('taller.purgar')}
            </Button>
            <Button variant="primary" onClick={prepareDeploy} disabled={busy || preparingPreview || enabledCount === 0}>
              <HardDriveDownload size={14} /> {t(preparingPreview ? 'taller.preparando' : 'taller.desplegar')}
            </Button>
          </>
        }
      />

      {/*
        Qué hay escrito en el juego ahora mismo.

        Sin esto, activabas tres mods, abrías el juego y no pasaba nada: lo que
        se activa vive en el almacén de Atreus hasta que se despliega, y eso
        solo lo decía un distintivo pequeño en cada fila.
      */}
      {mods.length > 0 && (
        <div
          className={cn(
            'flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-6 py-2 text-[12px]',
            pendiente > 0
              ? 'border-[var(--warn-line)] bg-[var(--warn-soft,transparent)] text-warn'
              : 'border-line text-muted',
          )}
          role="status"
        >
          {pendiente > 0 ? (
            <>
              <TriangleAlert size={13} className="shrink-0" />
              <span className="font-medium">{t('taller.pendienteTitulo')}</span>
              <span className="text-muted">
                {sinDesplegar > 0 && t(
                  sinDesplegar === 1 ? 'taller.pendienteActivosUno' : 'taller.pendienteActivos',
                  { n: sinDesplegar },
                )}
                {sinDesplegar > 0 && sobrantes > 0 && '; '}
                {sobrantes > 0 && t(
                  sobrantes === 1 ? 'taller.pendienteSobrantesUno' : 'taller.pendienteSobrantes',
                  { n: sobrantes },
                )}
                {t('taller.pendienteCierre')}
              </span>
            </>
          ) : (
            <>
              <Check size={13} className="shrink-0 text-success" />
              <span>
                {desplegados.length > 0
                  ? t(desplegados.length === 1 ? 'taller.desplegadoUno' : 'taller.desplegados',
                      { n: desplegados.length })
                  : t('taller.nadaDesplegado')}
              </span>
            </>
          )}
        </div>
      )}

      {/* Perfiles: guardan qué mods están activos y en qué orden. */}
      <div className="flex items-center gap-2 border-b border-line px-6 py-2.5">
        <Layers size={14} className="shrink-0 text-faint" />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {profiles.length === 0 ? (
            <span className="text-[12px] text-faint">{t('taller.sinPerfiles')}</span>
          ) : (
            profiles.map((p) => (
              <span key={p.id} className="flex items-center">
                <Button
                  size="sm"
                  variant={p.isActive ? 'primary' : 'ghost'}
                  onClick={() => activateProfile(p.id)}
                >
                  {p.isActive && <Check size={12} />}
                  {p.name}
                  <span className="text-[11px] opacity-60">{p.mods.length}</span>
                </Button>
                <button
                  type="button"
                  onClick={() => deleteProfile(p)}
                  aria-label={t('taller.borrarPerfilAria', { perfil: p.name })}
                  className="ml-0.5 rounded-sm p-1 text-faint transition-colors hover:text-danger"
                >
                  <X size={11} />
                </button>
              </span>
            ))
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant="outline" onClick={openComparison} disabled={profiles.length < 2}>
            <Columns2 size={13} /> {t('taller.comparar')}
          </Button>
          <Button size="sm" variant="outline" onClick={saveCurrentAsProfile} disabled={busy}>
            {t('taller.guardarActual')}
          </Button>
        </div>
      </div>

      <div
        className="relative min-h-0 flex-1 overflow-y-auto p-6"
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={(e) => {
          // Solo se apaga al salir del contenedor, no al pasar sobre un hijo.
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDragging(false);
        }}
        onDrop={onDrop}
      >
        {dragging && (
          <div className="pointer-events-none absolute inset-3 z-10 flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-accent bg-accent-soft">
            <Upload size={28} className="text-accent" />
            <p className="text-[13px] font-medium">{t('taller.sueltaAqui')}</p>
            <p className="text-[12px] text-muted">.zip · .7z</p>
          </div>
        )}

        {tab === 'discover' ? (
          <DiscoverPanel
            remote={remote}
            loading={loadingRemote}
            error={remoteError}
            query={query}
            onQuery={setQuery}
            installing={installing}
            installedNames={new Set(mods.map((m) => m.name.toLowerCase()))}
            onRetry={discover}
            onInstall={installFromCatalog}
          />
        ) : loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-16 rounded-md" />)}
          </div>
        ) : <>
          <Card className="mb-3 border-accent/30 bg-accent-soft px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[13px] font-medium">{t('taller.seguroTitulo')}</p>
                <p className="mt-0.5 text-[12px] leading-5 text-muted">
                  {t('taller.seguroAntes')}<strong>{t('taller.seguroPurgar')}</strong>{t('taller.seguroDespues')}
                </p>
              </div>
              {conflictingEnabled > 0
                ? <Badge tone="warn">
                    <TriangleAlert size={11} className="mr-1" />
                    {t(conflictingEnabled === 1 ? 'taller.conflictosUno' : 'taller.conflictos',
                       { n: conflictingEnabled })}
                  </Badge>
                : <Badge tone="success"><Check size={11} className="mr-1" />{t('taller.sinConflictos')}</Badge>}
            </div>
          </Card>
        {mods.length === 0 ? (
          <Empty
            icon={<Package size={40} strokeWidth={1.25} />}
            title={t('taller.sinModsTitulo')}
            hint={t('taller.sinModsPista')}
            action={
              <Button variant="primary" onClick={() => install()}>
                <Plus size={14} /> {t('taller.instalarMod')}
              </Button>
            }
          />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <div className="relative w-full max-w-xs">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
                <input value={installedQuery} onChange={(event) => setInstalledQuery(event.target.value)}
                  placeholder={t('taller.buscarInstalados')}
                  className="h-9 w-full rounded-sm border border-line bg-inset pl-8 pr-3 text-[13px] text-fg placeholder:text-faint focus:border-accent focus:outline-none" />
              </div>
              <label className="flex items-center gap-1.5 text-[12px] text-faint">
                {t('taller.ordenar')}
                <select value={installedSort} onChange={(event) => setInstalledSort(event.target.value as InstalledSort)}
                  className="h-8 rounded-sm border border-line bg-inset px-2 text-[12px] text-fg focus:border-accent focus:outline-none">
                  <option value="order">{t('taller.ordenCarga')}</option>
                  <option value="name">{t('taller.ordenNombre')}</option>
                  <option value="recent">{t('taller.ordenRecientes')}</option>
                  <option value="status">{t('taller.ordenActivos')}</option>
                </select>
              </label>
              <span className="text-[12px] text-faint">
                {t('taller.deN', { visibles: visibleMods.length, total: mods.length })}
              </span>
              {!canReorder && <span className="text-[11px] text-faint">{t('taller.paraReordenar')}</span>}
            </div>
            {visibleMods.length === 0 ? (
              <Empty title={t('taller.sinCoincidencias')} hint={t('taller.sinCoincidenciasPista')} />
            ) : <div className="flex flex-col gap-2">
            {visibleMods.map((mod) => (
              <Card key={mod.id} hover className={cn('defer-render px-4 py-3', !mod.enabled && 'opacity-60')}>
                <div className="flex items-center gap-3">
                  <span className="w-6 shrink-0 text-center font-mono text-[12px] text-faint">
                    {mod.order + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[13px] font-medium">{mod.name}</p>
                      {mod.version && <Badge mono>v{mod.version}</Badge>}
                      {mod.status === 'deployed' && <Badge tone="success">{t('taller.badgeDesplegado')}</Badge>}
                      {mod.status === 'error' && <Badge tone="danger">{t('taller.badgeError')}</Badge>}
                      {mod.conflictsWith.length > 0 && (
                        <Badge tone="warn">
                          <TriangleAlert size={10} className="mr-1" /> {t('taller.badgeConflicto')}
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-[12px] text-faint">
                      {mod.error ?? mod.description ?? mod.author ?? '—'} · {bytes(mod.sizeBytes)}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {canReorder && <>
                      <Button size="sm" onClick={() => move(mod.order, -1)} disabled={mod.order === 0} aria-label={t('taller.subir')}>
                        <ArrowUp size={13} />
                      </Button>
                      <Button size="sm" onClick={() => move(mod.order, 1)} disabled={mod.order === mods.length - 1} aria-label={t('taller.bajar')}>
                        <ArrowDown size={13} />
                      </Button>
                    </>}
                    <Button size="sm" variant="danger" onClick={() => remove(mod)} aria-label={t('taller.desinstalar')}>
                      <Trash2 size={13} />
                    </Button>
                    <div className="ml-2">
                      <Toggle
                        checked={mod.enabled}
                        disabled={mod.status === 'error'}
                        label={mod.name}
                        onChange={(next) => setEnabled(mod, next)}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            ))}
            </div>}
          </>
        )}</>}
      </div>
      <DeployPreview
        preview={preview}
        mods={mods}
        busy={busy}
        onClose={() => setPreview(null)}
        onConfirm={deploy}
      />
      <ProfileComparison
        open={compareOpen}
        profiles={profiles}
        mods={mods}
        leftId={compareLeft}
        rightId={compareRight}
        onLeftChange={setCompareLeft}
        onRightChange={setCompareRight}
        onClose={() => setCompareOpen(false)}
      />
    </div>
  );
}
