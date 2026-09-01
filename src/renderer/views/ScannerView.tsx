import { useCallback, useEffect, useState } from 'react';
import {
  Crosshair, Plug, Unplug, RotateCcw, ShieldOff, Search, Pencil, Wand2, Copy,
} from 'lucide-react';
import type {
  DerivedResolve, MemType, ScanCandidate, ScanMode, ScanSession, ScanSummary,
} from '@shared/types';
import { api } from '@/lib/api';
import { useStore } from '@/store';
import { cn } from '@/lib/cn';
import { Badge, Button, Card, Empty, Input, Skeleton, ViewHeader } from '@/components/ui';

/**
 * Buscador de memoria.
 *
 * El flujo es el clásico: buscar un valor que conoces, cambiarlo en el juego,
 * filtrar lo que cambió, repetir. Cuando quedan pocas direcciones, se prueba
 * escribiendo en ellas y se convierte la buena en un `resolve` reutilizable.
 */

const TYPES: { id: MemType; label: string }[] = [
  { id: 'i32', label: 'Entero 32' },
  { id: 'i64', label: 'Entero 64' },
  { id: 'f32', label: 'Decimal 32' },
  { id: 'f64', label: 'Decimal 64' },
  { id: 'i16', label: 'Entero 16' },
  { id: 'u8', label: 'Byte' },
];

const MODES: { id: ScanMode; label: string; hint: string }[] = [
  { id: 'eq', label: 'Igual a', hint: 'El valor que ves ahora en el juego' },
  { id: 'changed', label: 'Cambió', hint: 'Sirve cuando no sabes el número exacto' },
  { id: 'unchanged', label: 'No cambió', hint: 'Descarta todo lo que se movió' },
  { id: 'increased', label: 'Subió', hint: 'Tras ganar vida, dinero, munición…' },
  { id: 'decreased', label: 'Bajó', hint: 'Tras gastar o recibir daño' },
];

export function ScannerView() {
  const game = useStore((s) => s.selected());
  const pushToast = useStore((s) => s.pushToast);
  const gameId = game?.id;
  const isMultiplayer = game?.multiplayer === true;

  const [session, setSession] = useState<ScanSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState<MemType>('i32');
  const [value, setValue] = useState('');
  const [mode, setMode] = useState<ScanMode>('eq');
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [candidates, setCandidates] = useState<ScanCandidate[]>([]);
  const [progress, setProgress] = useState<{ scanned: number; total: number } | null>(null);
  const [derived, setDerived] = useState<{ address: string; paths: DerivedResolve[] } | null>(null);

  const load = useCallback(async () => {
    if (!gameId) return;
    setSummary(null);
    setCandidates([]);
    setDerived(null);
    const res = await api.scanner.session(gameId);
    if (res.ok) setSession(res.data);
  }, [gameId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const offSession = api.on('scanner:session', (s) => {
      if (s.gameId === gameId) setSession(s);
    });
    const offProgress = api.on('scanner:progress', (p) => {
      if (p.gameId === gameId) setProgress({ scanned: p.scanned, total: p.total });
    });
    return () => { offSession(); offProgress(); };
  }, [gameId]);

  const attached = session?.state === 'attached' || session?.state === 'scanning';
  const blocked = session?.state === 'blocked' || isMultiplayer;
  const scanning = session?.state === 'scanning' || busy;

  async function refreshList() {
    if (!gameId) return;
    const res = await api.scanner.list(gameId, 200);
    if (res.ok) setCandidates(res.data);
  }

  async function attach() {
    if (!gameId) return;
    setBusy(true);
    const res = await api.scanner.attach(gameId);
    setBusy(false);
    if (!res.ok) return pushToast('error', res.error);
    setSession(res.data);
  }

  async function detach() {
    if (!gameId) return;
    await api.scanner.detach(gameId);
    setSummary(null);
    setCandidates([]);
    setDerived(null);
  }

  async function firstScan() {
    if (!gameId) return;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return pushToast('warn', 'Escribe el valor que buscas');

    setBusy(true);
    setProgress({ scanned: 0, total: 1 });
    const res = await api.scanner.first(gameId, type, parsed);
    setBusy(false);
    setProgress(null);
    if (!res.ok) return pushToast('error', res.error);

    setSummary(res.data);
    if (res.data.truncated) {
      pushToast('warn', 'Demasiadas coincidencias: cambia el valor en el juego y filtra.');
    }
    await refreshList();
  }

  async function nextScan() {
    if (!gameId) return;
    const parsed = Number(value);
    if (mode === 'eq' && !Number.isFinite(parsed)) {
      return pushToast('warn', 'El modo "igual a" necesita un valor');
    }

    setBusy(true);
    const res = await api.scanner.next(gameId, mode, mode === 'eq' ? parsed : undefined);
    setBusy(false);
    if (!res.ok) return pushToast('error', res.error);

    setSummary(res.data);
    await refreshList();
  }

  async function reset() {
    if (!gameId) return;
    await api.scanner.reset(gameId);
    setSummary(null);
    setCandidates([]);
    setDerived(null);
  }

  async function poke(address: string) {
    if (!gameId) return;
    const raw = window.prompt(`Escribir en ${address}`, String(candidates.find((c) => c.address === address)?.value ?? 0));
    if (raw === null) return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return pushToast('warn', 'Valor no numérico');

    const res = await api.scanner.poke(gameId, address, parsed);
    if (!res.ok) return pushToast('error', res.error);
    await refreshList();
  }

  async function derive(address: string) {
    if (!gameId) return;
    setBusy(true);
    const res = await api.scanner.derive(gameId, address);
    setBusy(false);
    if (!res.ok) return pushToast('error', res.error);
    setDerived({ address, paths: res.data });
  }

  if (!game) {
    return (
      <Empty icon={<Crosshair size={40} strokeWidth={1.25} />} title="Ningún juego seleccionado"
             hint="Elige un juego en la Biblioteca para buscar valores en su memoria." />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        title={game.name}
        subtitle={<Status session={session} blocked={blocked} summary={summary} />}
        actions={
          blocked ? (
            <Badge tone="warn"><ShieldOff size={11} className="mr-1" /> Bloqueado</Badge>
          ) : attached ? (
            <>
              <Button variant="outline" onClick={reset} disabled={scanning || !summary}>
                <RotateCcw size={14} /> Reiniciar
              </Button>
              <Button variant="outline" onClick={detach} disabled={scanning}>
                <Unplug size={14} /> Desenganchar
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={attach} disabled={busy}>
              <Plug size={14} /> {busy ? 'Buscando el juego…' : 'Enganchar'}
            </Button>
          )
        }
      />

      {progress && progress.total > 1 && (
        <div className="h-0.5 w-full bg-elevated">
          <div
            className="h-full bg-accent transition-[width] duration-200 ease-atreus"
            style={{ width: `${Math.round((progress.scanned / progress.total) * 100)}%` }}
          />
        </div>
      )}

      {blocked ? (
        <Empty
          icon={<ShieldOff size={40} strokeWidth={1.25} />}
          title="El buscador está bloqueado para este juego"
          hint={
            session?.error ??
            'Es un título multijugador. Buscar y escribir en su memoria afectaría a otros ' +
            'jugadores, así que Atreus no engancha a estos juegos.'
          }
        />
      ) : !attached ? (
        <Empty
          icon={<Crosshair size={40} strokeWidth={1.25} />}
          title="Engancha el juego para empezar"
          hint={
            'Abre el juego, pulsa Enganchar y busca un valor que veas en pantalla: ' +
            'dinero, vida, munición. Luego cámbialo en el juego y filtra hasta que quede una dirección.'
          }
        />
      ) : (
        <>
          {/* Controles de búsqueda */}
          <div className="flex flex-col gap-3 border-b border-line px-6 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-16 shrink-0 text-[12px] text-faint">Tipo</span>
              {TYPES.map((t) => (
                <Button
                  key={t.id}
                  size="sm"
                  variant={type === t.id ? 'primary' : 'ghost'}
                  disabled={summary !== null}
                  onClick={() => setType(t.id)}
                >
                  {t.label}
                </Button>
              ))}
              {summary !== null && (
                <span className="text-[11px] text-faint">
                  el tipo se fija en la primera búsqueda
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="w-16 shrink-0 text-[12px] text-faint">Valor</span>
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void (summary ? nextScan() : firstScan());
                }}
                placeholder="Lo que ves en el juego"
                className="w-52"
              />
              {summary === null ? (
                <Button variant="primary" onClick={firstScan} disabled={scanning}>
                  <Search size={14} /> {scanning ? 'Buscando…' : 'Primera búsqueda'}
                </Button>
              ) : (
                <Button variant="primary" onClick={nextScan} disabled={scanning}>
                  <Search size={14} /> {scanning ? 'Filtrando…' : 'Filtrar'}
                </Button>
              )}
            </div>

            {summary !== null && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-16 shrink-0 text-[12px] text-faint">Filtro</span>
                {MODES.map((m) => (
                  <Button
                    key={m.id}
                    size="sm"
                    variant={mode === m.id ? 'primary' : 'ghost'}
                    title={m.hint}
                    onClick={() => setMode(m.id)}
                  >
                    {m.label}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Resultados */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {scanning && candidates.length === 0 ? (
              <div className="flex flex-col gap-px p-3">
                {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : summary === null ? (
              <Empty
                title="Sin búsqueda todavía"
                hint="Escribe arriba el valor que ves en el juego y pulsa Primera búsqueda."
              />
            ) : summary.count === 0 ? (
              <Empty
                title="No queda ninguna dirección"
                hint="El filtro las descartó todas. Reinicia y prueba con otro valor o con menos pasos."
              />
            ) : summary.count > 400 ? (
              <Empty
                icon={<Search size={40} strokeWidth={1.25} />}
                title={`${summary.count.toLocaleString('es-ES')} direcciones`}
                hint="Aún son demasiadas para mirarlas. Cambia el valor en el juego y filtra otra vez."
              />
            ) : (
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-base">
                  <tr className="border-b border-line text-[11px] uppercase tracking-wide text-faint">
                    <th className="px-6 py-2 text-left font-medium">Dirección</th>
                    <th className="px-3 py-2 text-left font-medium">Módulo</th>
                    <th className="px-3 py-2 text-right font-medium">Anterior</th>
                    <th className="px-3 py-2 text-right font-medium">Ahora</th>
                    <th className="px-6 py-2 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr
                      key={c.address}
                      className={cn(
                        'border-b border-line transition-colors hover:bg-elevated',
                        derived?.address === c.address && 'bg-accent-soft',
                      )}
                    >
                      <td className="px-6 py-2 font-mono text-[12px] selectable">{c.address}</td>
                      <td className="px-3 py-2 text-[12px] text-muted">
                        {c.module ? <Badge tone="accent">{c.module}</Badge> : <span className="text-faint">heap</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-[12px] text-faint">{c.previous}</td>
                      <td className={cn(
                        'px-3 py-2 text-right font-mono text-[12px]',
                        c.value !== c.previous && 'text-accent-hover',
                      )}>
                        {c.value}
                      </td>
                      <td className="px-6 py-2">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => poke(c.address)}>
                            <Pencil size={12} /> Probar
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => derive(c.address)} disabled={busy}>
                            <Wand2 size={12} /> Convertir
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {derived && <DerivedPanel derived={derived} onClose={() => setDerived(null)} />}
        </>
      )}
    </div>
  );
}

function Status({
  session, blocked, summary,
}: { session: ScanSession | null; blocked: boolean; summary: ScanSummary | null }) {
  if (blocked) return <>Multijugador · el buscador no se activa en este título</>;
  if (!session || session.state === 'idle') return <>Sin enganchar</>;
  if (session.state === 'error') return <>{session.error}</>;
  if (session.state === 'scanning') return <>Recorriendo la memoria…</>;

  if (summary) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-success" />
        Pasada {summary.pass} · {summary.count.toLocaleString('es-ES')} direcciones
        {summary.truncated && ' (recortado)'} · {summary.elapsedMs} ms
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-1.5 rounded-full bg-success" />
      Enganchado · pid {session.pid}
    </span>
  );
}

/** Resultado de convertir una dirección en algo reutilizable. */
function DerivedPanel({
  derived, onClose,
}: { derived: { address: string; paths: DerivedResolve[] }; onClose: () => void }) {
  const pushToast = useStore((s) => s.pushToast);

  return (
    <div className="shrink-0 border-t-2 border-accent bg-elevated px-6 py-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[13px] font-medium">
          Formas estables de volver a <span className="font-mono">{derived.address}</span>
        </p>
        <Button size="sm" variant="ghost" onClick={onClose}>Cerrar</Button>
      </div>

      <div className="flex flex-col gap-2">
        {derived.paths.map((path, i) => {
          const snippet = JSON.stringify(path.resolve, null, 2);
          return (
            <Card key={i} className="px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Badge tone={path.kind === 'static' ? 'success' : 'accent'}>
                    {path.kind === 'static' ? 'estática' : 'puntero'}
                  </Badge>
                  <p className="mt-1 text-[12px] leading-snug text-muted">{path.explanation}</p>
                  <pre className="selectable mt-2 overflow-x-auto rounded-sm bg-inset p-2 font-mono text-[11px] text-fg">
                    {snippet}
                  </pre>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(snippet);
                    pushToast('success', 'Copiado. Pégalo en el "resolve" del cheat.');
                  }}
                >
                  <Copy size={12} /> Copiar
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
