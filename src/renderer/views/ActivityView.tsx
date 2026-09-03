import { Activity, Gamepad2, Package, ScanSearch, Trophy } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useStore, type ActivityEntry } from '@/store';
import { relative } from '@/lib/format';
import { Card, Empty, ViewHeader } from '@/components/ui';

const ICONS: Record<ActivityEntry['kind'], LucideIcon> = {
  scan: ScanSearch,
  'game-started': Gamepad2,
  'game-stopped': Gamepad2,
  platinum: Trophy,
  mods: Package,
};

/** Lo relevante de la sesión, sin convertir las notificaciones efímeras en ruido. */
export function ActivityView() {
  const activities = useStore((state) => state.activities);
  const games = useStore((state) => state.games);
  const activeGameIds = useStore((state) => state.activeGameIds);
  const open = useStore((state) => state.open);
  const activeGames = games.filter((game) => activeGameIds.includes(game.id));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        title="Actividad"
        subtitle="Lo que ha ocurrido desde que abriste Atreus. Se borra al cerrar la aplicación."
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {activeGames.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-faint">Jugando ahora</h2>
            <div className="flex flex-wrap gap-2">
              {activeGames.map((game) => (
                <button key={game.id} type="button" onClick={() => open(game.id)}
                  className="flex items-center gap-2 rounded-sm border border-[var(--success-line)] bg-surface px-3 py-2 text-[13px] font-medium text-fg transition-colors hover:bg-elevated">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-success" /> {game.name}
                </button>
              ))}
            </div>
          </section>
        )}
        {activities.length === 0 ? (
          <Empty icon={<Activity size={40} strokeWidth={1.25} />} title="Aún no hay actividad"
            hint="Cuando escanees, abras un juego o modifiques el Taller, aparecerá aquí." />
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            {activities.map((entry, index) => {
              const Icon = ICONS[entry.kind];
              const game = entry.gameId ? games.find((item) => item.id === entry.gameId) : null;
              return (
                <Card
                  key={entry.id}
                  hover
                  className="animate-rise flex items-start gap-3 p-3.5"
                  // Lo reciente entra primero; a partir de la décima el
                  // escalonado ya no aporta y solo sería espera.
                  style={{ animationDelay: `${Math.min(index, 9) * 26}ms` }}
                >
                  <div className="mt-0.5 rounded-sm bg-accent-soft p-2 text-accent"><Icon size={15} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[13px] font-medium">{entry.title}</p>
                      <time className="shrink-0 text-[11px] text-faint">{relative(entry.at)}</time>
                    </div>
                    {entry.detail && <p className="mt-0.5 text-[12px] text-muted">{entry.detail}</p>}
                    {game && (
                      <button type="button" onClick={() => open(game.id)}
                        className="mt-2 text-[12px] font-medium text-accent hover:text-accent-hover">
                        Abrir ficha
                      </button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
