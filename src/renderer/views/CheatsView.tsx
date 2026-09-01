import { useCallback, useEffect, useMemo, useState } from 'react';
import { Zap, ShieldOff, Plug, Unplug, Play, TriangleAlert } from 'lucide-react';
import type { CheatDef, CheatState, TrainerSession } from '@shared/types';
import { api } from '@/lib/api';
import { useStore } from '@/store';
import { cn } from '@/lib/cn';
import { Badge, Button, Card, Empty, Input, Slider, Toggle, ViewHeader } from '@/components/ui';

export function CheatsView() {
  const game = useStore((s) => s.selected());
  const settings = useStore((s) => s.settings);
  const pushToast = useStore((s) => s.pushToast);

  // Ver la nota de AchievementsView: el objeto `game` cambia de identidad con
  // cualquier actualización de la biblioteca.
  const gameId = game?.id;
  const isMultiplayer = game?.multiplayer === true;

  const [defs, setDefs] = useState<CheatDef[]>([]);
  const [states, setStates] = useState<Record<string, CheatState>>({});
  const [session, setSession] = useState<TrainerSession | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!gameId) return;
    setSession(null);
    setStates({});
    const d = await api.trainer.definitions(gameId);
    setDefs(d.ok ? d.data : []);
    if (!d.ok) pushToast('error', d.error);
    const s = await api.trainer.session(gameId);
    if (s.ok) setSession(s.data);
  }, [gameId, pushToast]);

  useEffect(() => { void load(); }, [load]);

  // El backend puede cambiar la sesión por su cuenta (el juego se cierra, por ejemplo).
  useEffect(() => {
    const off = api.on('trainer:session', (s) => {
      if (s.gameId === gameId) setSession(s);
    });
    const offState = api.on('trainer:state', (payload) => {
      if (payload.gameId === gameId) {
        setStates((prev) => ({ ...prev, [payload.state.id]: payload.state }));
      }
    });
    return () => { off(); offState(); };
  }, [gameId]);

  const groups = useMemo(() => {
    const map = new Map<string, CheatDef[]>();
    for (const c of defs) {
      const key = c.group ?? 'General';
      const list = map.get(key) ?? [];
      list.push(c);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [defs]);

  const attached = session?.state === 'attached';
  const blocked = session?.state === 'blocked' || isMultiplayer;

  async function attach() {
    if (!game) return;
    setBusy(true);
    const res = await api.trainer.attach(game.id);
    setBusy(false);
    if (!res.ok) return pushToast('error', res.error);
    setSession(res.data);
  }

  async function detach() {
    if (!game) return;
    setBusy(true);
    await api.trainer.detach(game.id);
    setBusy(false);
    setStates({});
  }

  async function onToggle(c: CheatDef, next: boolean) {
    if (!game) return;
    if (next && c.warning && settings?.confirmBeforeCheats) {
      if (!window.confirm(`${c.name}\n\n${c.warning}\n\n¿Activar de todos modos?`)) return;
    }
    const res = await api.trainer.toggle(game.id, c.id, next);
    if (!res.ok) return pushToast('error', res.error);
    setStates((prev) => ({ ...prev, [c.id]: res.data }));
  }

  async function onValue(c: CheatDef, value: number) {
    if (!game) return;
    setStates((prev) => ({
      ...prev,
      [c.id]: { id: c.id, enabled: true, value, resolved: true, error: null },
    }));
    const res = await api.trainer.setValue(game.id, c.id, value);
    if (!res.ok) pushToast('error', res.error);
  }

  async function onTrigger(c: CheatDef) {
    if (!game) return;
    const res = await api.trainer.trigger(game.id, c.id);
    if (!res.ok) pushToast('error', res.error);
  }

  if (!game) {
    return (
      <Empty icon={<Zap size={40} strokeWidth={1.25} />} title="Ningún juego seleccionado"
             hint="Elige un juego en la Biblioteca para ver sus cheats." />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        title={game.name}
        subtitle={<StatusLine session={session} blocked={blocked} count={defs.length} />}
        actions={
          blocked ? (
            <Badge tone="warn"><ShieldOff size={11} className="mr-1" /> Bloqueado</Badge>
          ) : attached ? (
            <Button variant="outline" onClick={detach} disabled={busy}>
              <Unplug size={14} /> Desenganchar
            </Button>
          ) : (
            <Button variant="primary" onClick={attach} disabled={busy || defs.length === 0}>
              <Plug size={14} /> {busy ? 'Buscando…' : 'Enganchar'}
            </Button>
          )
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {blocked ? (
          <Empty
            icon={<ShieldOff size={40} strokeWidth={1.25} />}
            title="El motor de cheats está bloqueado para este juego"
            hint={
              session?.error ??
              'Es un título multijugador. Modificar su memoria afectaría a otros jugadores, ' +
              'así que Atreus no engancha a estos juegos. Los logros sí están disponibles.'
            }
          />
        ) : defs.length === 0 ? (
          <Empty
            icon={<Zap size={40} strokeWidth={1.25} />}
            title="Este juego no tiene definición de cheats"
            hint={`Crea data/games/${game.id.replace(':', '.')}.json siguiendo la plantilla de data/games/README.md.`}
          />
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map(([group, list]) => (
              <section key={group}>
                <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-faint">
                  {group}
                </h2>
                <div className="grid gap-2">
                  {list.map((c) => (
                    <CheatRow
                      key={c.id}
                      def={c}
                      state={states[c.id]}
                      enabled={attached}
                      onToggle={(n) => onToggle(c, n)}
                      onValue={(v) => onValue(c, v)}
                      onTrigger={() => onTrigger(c)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusLine({
  session, blocked, count,
}: { session: TrainerSession | null; blocked: boolean; count: number }) {
  if (blocked) return <>Multijugador · el trainer no se activa en este título</>;
  if (!session || session.state === 'detached') return <>{count} cheats · sin enganchar</>;
  if (session.state === 'searching') return <>Buscando el proceso del juego…</>;
  if (session.state === 'attached') {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-success" />
        Enganchado · pid {session.pid} · base <span className="font-mono">{session.moduleBase}</span>
      </span>
    );
  }
  return <>{session.error ?? 'Error'}</>;
}

function CheatRow({
  def, state, enabled, onToggle, onValue, onTrigger,
}: {
  def: CheatDef;
  state: CheatState | undefined;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  onValue: (value: number) => void;
  onTrigger: () => void;
}) {
  const min = def.write.min ?? 0;
  const max = def.write.max ?? 100;
  const step = def.write.step ?? 1;
  const value = state?.value ?? min;

  return (
    <Card className={cn('px-4 py-3', !enabled && 'opacity-50')}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[13px] font-medium">{def.name}</p>
            {def.hotkey && <Badge mono>{def.hotkey}</Badge>}
            {def.write.freeze && <Badge tone="accent">congelado</Badge>}
            {def.warning && (
              <span title={def.warning} className="text-warn">
                <TriangleAlert size={12} />
              </span>
            )}
          </div>
          {def.description && (
            <p className="mt-0.5 truncate text-[12px] text-faint">{def.description}</p>
          )}
        </div>

        {def.type === 'toggle' && (
          <Toggle checked={state?.enabled ?? false} disabled={!enabled}
                  label={def.name} onChange={onToggle} />
        )}

        {def.type === 'button' && (
          <Button size="sm" variant="outline" disabled={!enabled} onClick={onTrigger}>
            <Play size={12} /> Ejecutar
          </Button>
        )}

        {def.type === 'value' && (
          <div className="flex w-64 shrink-0 items-center gap-3">
            <Slider value={value} min={min} max={max} step={step}
                    disabled={!enabled} onChange={onValue} />
            <Input
              type="number"
              value={value}
              min={min}
              max={max}
              step={step}
              disabled={!enabled}
              onChange={(e) => onValue(Number(e.target.value))}
              className="w-24 shrink-0 text-right font-mono"
            />
          </div>
        )}
      </div>

      {state?.resolved === false && (
        <p className="mt-2 text-[12px] text-danger">
          Patrón no encontrado — la definición no coincide con esta versión del juego.
        </p>
      )}
    </Card>
  );
}
