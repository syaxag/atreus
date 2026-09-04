import {
  Columns2, Download, Globe, HardDriveDownload, Search, TriangleAlert,
} from 'lucide-react';
import type { Mod, ModDeployPreview, ModProfile, RemoteMod } from '@shared/types';
import { cn } from '@/lib/cn';
import { bytes, numero } from '@/lib/format';
import { useT } from '@/i18n';
import { Badge, Button, Card, Empty, Modal, Skeleton } from '@/components/ui';

/**
 * Las piezas del Taller que no son el Taller.
 *
 * `ModsView` tenía 843 líneas porque llevaba dentro cuatro componentes que no
 * comparten nada con ella salvo estar en el mismo archivo: se les pasa todo por
 * propiedades y ninguno toca el estado de la vista. Aquí se leen enteros sin
 * tener que bajar por quinientas líneas de otra cosa.
 */

export function ProfileComparison({
  open, profiles, mods, leftId, rightId, onLeftChange, onRightChange, onClose,
}: {
  open: boolean;
  profiles: ModProfile[];
  mods: Mod[];
  leftId: string;
  rightId: string;
  onLeftChange: (id: string) => void;
  onRightChange: (id: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const left = profiles.find((profile) => profile.id === leftId);
  const right = profiles.find((profile) => profile.id === rightId);
  const names = new Map(mods.map((mod) => [mod.id, mod.name]));
  const label = (id: string) => names.get(id) ?? t('taller.modEliminado', { id });
  const leftOnly = left?.mods.filter((id) => !right?.mods.includes(id)) ?? [];
  const rightOnly = right?.mods.filter((id) => !left?.mods.includes(id)) ?? [];
  const same = left && right && leftOnly.length === 0 && rightOnly.length === 0;

  return (
    <Modal
      open={open}
      title={t('taller.compararTitulo')}
      icon={<Columns2 size={16} className="text-accent" />}
      onClose={onClose}
      footer={<Button variant="primary" onClick={onClose}>{t('taller.cerrar')}</Button>}
    >
      <p className="text-[13px] leading-5 text-muted">{t('taller.compararPista')}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="text-[12px] font-medium text-muted">{t('taller.perfilA')}
          <select value={leftId} onChange={(event) => onLeftChange(event.target.value)}
            className="mt-1 h-9 w-full rounded-sm border border-line bg-inset px-2 text-[13px] text-fg focus:border-accent focus:outline-none">
            {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
          </select>
        </label>
        <label className="text-[12px] font-medium text-muted">{t('taller.perfilB')}
          <select value={rightId} onChange={(event) => onRightChange(event.target.value)}
            className="mt-1 h-9 w-full rounded-sm border border-line bg-inset px-2 text-[13px] text-fg focus:border-accent focus:outline-none">
            {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
          </select>
        </label>
      </div>
      {left && right && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <ProfileColumn title={t('taller.soloEn', { perfil: left.name })} ids={leftOnly} label={label} />
          <ProfileColumn title={t('taller.soloEn', { perfil: right.name })} ids={rightOnly} label={label} />
        </div>
      )}
      {same && (
        <p className="mt-4 rounded-sm border border-[var(--success-line)] px-3 py-2 text-[12px] text-success">
          {t('taller.mismosMods')}
        </p>
      )}
    </Modal>
  );
}

export function ProfileColumn({ title, ids, label }: { title: string; ids: string[]; label: (id: string) => string }) {
  const t = useT();
  return (
    <section className="min-w-0 rounded-sm border border-line bg-inset p-3">
      <p className="text-[12px] font-semibold text-fg">{title}</p>
      {ids.length === 0 ? <p className="mt-2 text-[12px] text-faint">{t('taller.ninguno')}</p> : (
        <ul className="mt-2 flex flex-col gap-1 text-[12px] text-muted">
          {ids.map((id) => <li key={id} className="truncate" title={label(id)}>• {label(id)}</li>)}
        </ul>
      )}
    </section>
  );
}

export function DeployPreview({
  preview, mods, busy, onClose, onConfirm,
}: {
  preview: ModDeployPreview | null;
  mods: Mod[];
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  const overwritten = preview?.files.filter((file) => file.currentlyExists).length ?? 0;
  // Los nombres salen de la lista instalada, no de `preview.files`: ahí solo
  // está el mod que gana cada ruta, así que un mod que las pierde todas se
  // quedaba sin nombre y la fila del conflicto enseñaba su identificador.
  const namesById = new Map(mods.map((mod) => [mod.id, mod.name]));
  return (
    <Modal
      open={preview !== null}
      title={t('taller.revisarTitulo')}
      icon={<HardDriveDownload size={16} className="text-accent" />}
      onClose={onClose}
      wide
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={busy}>{t('taller.cancelar')}</Button>
        <Button variant="primary" onClick={onConfirm} disabled={busy}>
          <HardDriveDownload size={14} />
          {busy
            ? t('taller.desplegando')
            : t(preview?.files.length === 1 ? 'taller.desplegarUno' : 'taller.desplegarN',
                { n: preview?.files.length ?? 0 })}
        </Button>
      </>}
    >
      {preview && <>
        <p className="text-[13px] leading-5 text-muted">
          {t('taller.seEscribiran')}
          <span className="selectable font-mono text-[11px] text-fg">{preview.root}</span>.
          {overwritten === 0
            ? t('taller.ningunoExiste')
            : t(overwritten === 1 ? 'taller.yaExisteUno' : 'taller.yaExisten', { n: overwritten })}
        </p>
        {preview.conflicts.length > 0 && (
          <div className="mt-3 rounded-sm border border-[var(--warn-line)] bg-[var(--warn-soft,transparent)] p-3 text-[12px] text-warn">
            <div className="flex items-center gap-2 font-medium">
              <TriangleAlert size={14} />
              {t(preview.conflicts.length === 1 ? 'taller.conflictosOrdenUno' : 'taller.conflictosOrden',
                 { n: preview.conflicts.length })}
            </div>
            <p className="mt-1 text-muted">{t('taller.conflictosOrdenPista')}</p>
            <ul className="mt-3 overflow-hidden rounded-sm border border-[var(--warn-line)] bg-surface text-[11px]">
              {preview.conflicts.map((conflict) => {
                const winner = conflict.mods[conflict.mods.length - 1];
                return (
                  <li key={conflict.path} className="border-b border-[var(--warn-line)] px-3 py-2 last:border-0">
                    <p className="truncate font-mono text-fg" title={conflict.path}>{conflict.path}</p>
                    <p className="mt-1 text-muted">
                      {conflict.mods.map((id) => namesById.get(id) ?? id).join(' → ')}
                      {winner && (
                        <span className="text-warn">
                          {t('taller.gana', { mod: namesById.get(winner) ?? winner })}
                        </span>
                      )}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <div className="mt-4 max-h-64 overflow-y-auto rounded-sm border border-line bg-inset font-mono text-[11px]">
          {preview.files.map((file) => (
            <div key={file.path} className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-0">
              <span className={cn('w-20 shrink-0', file.currentlyExists ? 'text-warn' : 'text-success')}>
                {t(file.currentlyExists ? 'taller.archivoRespaldo' : 'taller.archivoNuevo')}
              </span>
              <span className="min-w-0 flex-1 truncate text-fg" title={file.path}>{file.path}</span>
              <span className="max-w-36 truncate text-faint" title={file.modName}>{file.modName}</span>
            </div>
          ))}
        </div>
      </>}
    </Modal>
  );
}

/**
 * Catálogo público del juego: lo que hay disponible sin buscarlo a mano.
 *
 * Cada mod dice de qué tipo es antes de instalarlo: algunos catálogos publican
 * como mod lo que en realidad es un menú de trucos, y quien va a por un platino
 * merece saberlo antes de descargarlo.
 */
export function DiscoverPanel({
  remote, loading, error, query, onQuery, installing, installedNames, onRetry, onInstall,
}: {
  remote: RemoteMod[] | null;
  loading: boolean;
  error: string | null;
  query: string;
  onQuery: (value: string) => void;
  installing: string | null;
  installedNames: Set<string>;
  onRetry: () => void;
  onInstall: (mod: RemoteMod) => void;
}) {
  const t = useT();
  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-16 rounded-md" />)}
      </div>
    );
  }

  if (error) {
    return (
      <Empty
        icon={<Globe size={40} strokeWidth={1.25} />}
        title={t('taller.sinCatalogo')}
        hint={error}
        action={<Button variant="outline" onClick={onRetry}>{t('taller.reintentar')}</Button>}
      />
    );
  }

  if (!remote || remote.length === 0) {
    return <Empty icon={<Globe size={40} strokeWidth={1.25} />} title={t('taller.catalogoVacio')} />;
  }

  const q = query.trim().toLowerCase();
  const visible = q
    ? remote.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.author.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q),
      )
    : remote;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="relative w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={t('taller.buscarCatalogo')}
            className="h-9 w-full rounded-sm border border-line bg-inset pl-8 pr-3 text-[13px] text-fg placeholder:text-faint focus:border-accent focus:outline-none"
          />
        </div>
        <span className="text-[12px] text-faint">
          {t('taller.deN', { visibles: visible.length, total: remote.length })} ·{' '}
          {[...new Set(remote.map((m) => m.source))].join(' + ')}
        </span>
      </div>

      {visible.map((mod) => {
        const already = installedNames.has(mod.name.toLowerCase());
        return (
          <Card key={mod.id} className="defer-render px-4 py-3">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-[13px] font-medium">{mod.name}</p>
                  <Badge mono>v{mod.version}</Badge>
                  {already && <Badge tone="success">{t('taller.badgeInstalado')}</Badge>}
                  {mod.dependencies > 0 && (
                    <Badge tone="warn">
                      {t(mod.dependencies === 1 ? 'taller.dependenciaUna' : 'taller.dependencias',
                         { n: mod.dependencies })}
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 line-clamp-2 text-[12px] text-muted">{mod.description}</p>
                <p className="mt-1 text-[11px] text-faint">
                  {mod.author} · {numero(mod.downloads)} {mod.metric}
                  {mod.sizeBytes ? ` · ${bytes(mod.sizeBytes)}` : ''}
                  {' · '}{mod.source}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {mod.installable === false ? (
                  <Badge tone="accent">{t('taller.steamGestiona')}</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant={already ? 'outline' : 'primary'}
                    onClick={() => onInstall(mod)}
                    disabled={installing !== null}
                  >
                    <Download size={12} />
                    {t(installing === mod.id
                      ? 'taller.instalando'
                      : already ? 'taller.reinstalar' : 'taller.instalar')}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
