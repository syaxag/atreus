import { Gem, Trophy, Compass, Map, Package, Settings2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useStore, type Section } from '@/store';

/**
 * Seis destinos, ni uno más.
 *
 * Cinco operan sobre el juego en contexto y están en el orden en que se usan al
 * ir a por un platino: ver qué falta, leer cómo se hace, encontrar dónde está,
 * y solo al final los mods.
 *
 * Los nombres no son los genéricos de un launcher, porque esto no lo es.
 * "Colección" es lo que tiene un coleccionista, no una estantería de programas;
 * "Trofeos" es la palabra con la que se habla de esto de verdad; "Rutas" es lo
 * que se sigue para un platino, que no es lo mismo que un manual; y "Atlas" es
 * un libro de mapas, que es exactamente lo que ofrece.
 */
const ITEMS: { id: Section; label: string; icon: LucideIcon; needsGame?: boolean }[] = [
  { id: 'library', label: 'Colección', icon: Gem },
  { id: 'achievements', label: 'Trofeos', icon: Trophy, needsGame: true },
  { id: 'guides', label: 'Rutas', icon: Compass, needsGame: true },
  { id: 'maps', label: 'Atlas', icon: Map, needsGame: true },
  { id: 'mods', label: 'Mods', icon: Package, needsGame: true },
];

export function Sidebar() {
  const section = useStore((s) => s.section);
  const go = useStore((s) => s.go);
  const selected = useStore((s) => s.selected());
  const summary = useStore((s) => (selected ? s.platinum[selected.id] : undefined));

  return (
    <nav className="flex w-[var(--sidebar-w)] shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex flex-1 flex-col gap-0.5 p-2">
        {ITEMS.map((item) => (
          <Item
            key={item.id}
            {...item}
            disabled={item.needsGame === true && !selected}
            active={section === item.id}
            onClick={() => go(item.id)}
          />
        ))}
      </div>

      {/*
        Juego en contexto: las demás vistas operan sobre él, y es la única
        entrada a su ficha, así que tiene que ser pulsable. Enseña además el
        progreso hacia el platino, que es el dato que se quiere tener siempre a
        la vista mientras se navega por las otras secciones.
      */}
      {selected && (
        <button
          onClick={() => go('game')}
          aria-current={section === 'game' ? 'page' : undefined}
          title={`Abrir la ficha de ${selected.name}`}
          className={cn(
            'group relative border-t border-line px-3 py-2.5 text-left',
            'transition-colors duration-[120ms] ease-atreus',
            section === 'game' ? 'bg-accent-soft' : 'hover:bg-elevated',
          )}
        >
          {section === 'game' && (
            <span className="absolute left-0 top-2.5 bottom-2.5 w-0.5 rounded-full bg-accent" />
          )}
          <p className="text-[11px] uppercase tracking-wide text-faint">Persiguiendo</p>
          <p className="mt-0.5 truncate text-[13px] font-medium" title={selected.name}>
            {selected.name}
          </p>
          {summary && summary.total > 0 && (
            <>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-inset">
                <div
                  className={cn('h-full rounded-full', summary.complete ? 'bg-success' : 'bg-accent')}
                  style={{ width: `${summary.percent}%` }}
                />
              </div>
              <p className={cn('mt-1 text-[11px]', summary.complete ? 'text-success' : 'text-faint')}>
                {summary.complete
                  ? 'Platino conseguido'
                  : `${summary.unlocked}/${summary.total} trofeos`}
              </p>
            </>
          )}
        </button>
      )}

      <div className="border-t border-line p-2">
        <Item
          id="settings"
          label="Ajustes"
          icon={Settings2}
          active={section === 'settings'}
          onClick={() => go('settings')}
        />
      </div>
    </nav>
  );
}

function Item({
  label, icon: Icon, active, disabled, onClick,
}: {
  id: Section;
  label: string;
  icon: LucideIcon;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? 'Elige un juego en la Colección' : undefined}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex h-9 items-center gap-2.5 rounded-sm px-3 text-[13px] font-medium',
        'transition-colors duration-[120ms] ease-atreus',
        disabled
          ? 'cursor-not-allowed text-faint/60'
          : active
            ? 'bg-accent-soft text-fg'
            : 'text-muted hover:bg-elevated hover:text-fg',
      )}
    >
      {/* Barra morada de 2px: la única marca de estado activo. */}
      {active && !disabled && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent" />
      )}
      <Icon size={16} strokeWidth={1.75} />
      {label}
    </button>
  );
}
