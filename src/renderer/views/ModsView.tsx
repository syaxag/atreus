import { useCallback, useEffect, useState } from 'react';
import {
  Package, Plus, Trash2, ArrowUp, ArrowDown, HardDriveDownload, Eraser, TriangleAlert,
  Layers, Check, X, Upload,
} from 'lucide-react';
import type { Mod, ModProfile } from '@shared/types';
import { api } from '@/lib/api';
import { useStore } from '@/store';
import { cn } from '@/lib/cn';
import { bytes } from '@/lib/format';
import { Badge, Button, Card, Empty, Skeleton, Toggle, ViewHeader } from '@/components/ui';

/** Extensiones que el backend sabe extraer. Ver services/mods/archive.ts. */
const ARCHIVE_RE = /\.(zip|7z|rar)$/i;

export function ModsView() {
  const game = useStore((s) => s.selected());
  const pushToast = useStore((s) => s.pushToast);

  // Ver la nota de AchievementsView.
  const gameId = game?.id;

  const [mods, setMods] = useState<Mod[]>([]);
  const [profiles, setProfiles] = useState<ModProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  /** true mientras se arrastra un archivo sobre la zona de mods. */
  const [dragging, setDragging] = useState(false);

  const load = useCallback(async () => {
    if (!gameId) return;
    setLoading(true);
    const [m, p] = await Promise.all([api.mods.list(gameId), api.mods.profiles(gameId)]);
    setMods(m.ok ? [...m.data].sort((a, b) => a.order - b.order) : []);
    setProfiles(p.ok ? p.data : []);
    if (!m.ok) pushToast('error', m.error);
    setLoading(false);
  }, [gameId, pushToast]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const off = api.on('mods:updated', (payload) => {
      if (payload.gameId === gameId) {
        setMods([...payload.mods].sort((a, b) => a.order - b.order));
      }
    });
    return off;
  }, [gameId]);

  /** Sin ruta abre el diálogo del sistema; con ruta instala directamente. */
  async function install(archivePath?: string) {
    if (!gameId) return;
    setBusy(true);
    const res = await api.mods.install(gameId, archivePath);
    setBusy(false);
    if (!res.ok) return pushToast('error', res.error);
    pushToast('success', `${res.data.name} instalado`);
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
      pushToast('warn', 'Suelta un archivo .zip, .7z o .rar');
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
    const name = window.prompt('Nombre del perfil', 'Nuevo perfil');
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
    pushToast('success', `Perfil "${res.data.name}" guardado`);
    await load();
  }

  async function deleteProfile(profile: ModProfile) {
    if (!gameId) return;
    if (!window.confirm(`¿Borrar el perfil "${profile.name}"?`)) return;
    const res = await api.mods.deleteProfile(gameId, profile.id);
    if (!res.ok) return pushToast('error', res.error);
    await load();
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
    if (!window.confirm(`¿Desinstalar "${mod.name}"?\n\nSe borrarán sus archivos del staging.`)) return;
    const res = await api.mods.uninstall(game.id, mod.id);
    if (!res.ok) pushToast('error', res.error);
  }

  async function deploy() {
    if (!game) return;
    setBusy(true);
    const res = await api.mods.deploy(game.id);
    setBusy(false);
    if (!res.ok) pushToast('error', res.error);
  }

  async function purge() {
    if (!game) return;
    if (!window.confirm('¿Revertir el despliegue?\n\nEl directorio del juego vuelve a su estado limpio.')) return;
    setBusy(true);
    const res = await api.mods.purge(game.id);
    setBusy(false);
    if (!res.ok) pushToast('error', res.error);
  }

  if (!game) {
    return (
      <Empty icon={<Package size={40} strokeWidth={1.25} />} title="Ningún juego seleccionado"
             hint="Elige un juego en la Biblioteca para gestionar sus mods." />
    );
  }

  const active = profiles.find((p) => p.isActive);
  const enabledCount = mods.filter((m) => m.enabled).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        title={game.name}
        subtitle={
          `${mods.length} mods · ${enabledCount} activos` +
          (active ? ` · perfil "${active.name}"` : '')
        }
        actions={
          <>
            <Button variant="outline" onClick={() => install()} disabled={busy}>
              <Plus size={14} /> Instalar
            </Button>
            <Button variant="outline" onClick={purge} disabled={busy}>
              <Eraser size={14} /> Purgar
            </Button>
            <Button variant="primary" onClick={deploy} disabled={busy || enabledCount === 0}>
              <HardDriveDownload size={14} /> {busy ? 'Trabajando…' : 'Desplegar'}
            </Button>
          </>
        }
      />

      {/* Perfiles: guardan qué mods están activos y en qué orden. */}
      <div className="flex items-center gap-2 border-b border-line px-6 py-2.5">
        <Layers size={14} className="shrink-0 text-faint" />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {profiles.length === 0 ? (
            <span className="text-[12px] text-faint">Sin perfiles guardados</span>
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
                  aria-label={`Borrar perfil ${p.name}`}
                  className="ml-0.5 rounded-sm p-1 text-faint transition-colors hover:text-danger"
                >
                  <X size={11} />
                </button>
              </span>
            ))
          )}
        </div>
        <Button size="sm" variant="outline" onClick={saveCurrentAsProfile} disabled={busy}>
          Guardar actual
        </Button>
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
            <p className="text-[13px] font-medium">Suelta el archivo para instalarlo</p>
            <p className="text-[12px] text-muted">.zip · .7z · .rar</p>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-16 rounded-md" />)}
          </div>
        ) : mods.length === 0 ? (
          <Empty
            icon={<Package size={40} strokeWidth={1.25} />}
            title="Sin mods instalados"
            hint="Arrastra aquí un .zip, .7z o .rar, o usa el botón. Los archivos se guardan aparte y se despliegan al juego por enlace duro, así que se pueden revertir sin residuos."
            action={
              <Button variant="primary" onClick={() => install()}>
                <Plus size={14} /> Instalar mod
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            {mods.map((mod, i) => (
              <Card key={mod.id} className={cn('px-4 py-3', !mod.enabled && 'opacity-60')}>
                <div className="flex items-center gap-3">
                  <span className="w-6 shrink-0 text-center font-mono text-[12px] text-faint">
                    {i + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[13px] font-medium">{mod.name}</p>
                      {mod.version && <Badge mono>v{mod.version}</Badge>}
                      {mod.status === 'deployed' && <Badge tone="success">desplegado</Badge>}
                      {mod.status === 'error' && <Badge tone="danger">error</Badge>}
                      {mod.conflictsWith.length > 0 && (
                        <Badge tone="warn">
                          <TriangleAlert size={10} className="mr-1" /> conflicto
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-[12px] text-faint">
                      {mod.error ?? mod.description ?? mod.author ?? '—'} · {bytes(mod.sizeBytes)}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button size="sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir">
                      <ArrowUp size={13} />
                    </Button>
                    <Button size="sm" onClick={() => move(i, 1)} disabled={i === mods.length - 1} aria-label="Bajar">
                      <ArrowDown size={13} />
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => remove(mod)} aria-label="Desinstalar">
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
          </div>
        )}
      </div>
    </div>
  );
}
