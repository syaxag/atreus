import { LibraryBig, Trophy, Zap, Package, Settings2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useStore, type Section } from '@/store';

const ITEMS: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: 'library', label: 'Biblioteca', icon: LibraryBig },
  { id: 'achievements', label: 'Logros', icon: Trophy },
  { id: 'cheats', label: 'Cheats', icon: Zap },
  { id: 'mods', label: 'Mods', icon: Package },
];

export function Sidebar() {
  const section = useStore((s) => s.section);
  const go = useStore((s) => s.go);
  const selected = useStore((s) => s.selected());

  return (
    <nav className="flex w-[var(--sidebar-w)] shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex flex-1 flex-col gap-0.5 p-2">
        {ITEMS.map((item) => (
          <Item
            key={item.id}
            {...item}
            active={section === item.id}
            onClick={() => go(item.id)}
          />
        ))}
      </div>

      {/* Juego en contexto: las vistas de Logros, Cheats y Mods operan sobre él. */}
      {selected && (
        <div className="border-t border-line px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-faint">En contexto</p>
          <p className="mt-0.5 truncate text-[13px] font-medium" title={selected.name}>
            {selected.name}
          </p>
        </div>
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
  label, icon: Icon, active, onClick,
}: {
  id: Section;
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex h-9 items-center gap-2.5 rounded-sm px-3 text-[13px] font-medium',
        'transition-colors duration-[120ms] ease-atreus',
        active
          ? 'bg-accent-soft text-fg'
          : 'text-muted hover:bg-elevated hover:text-fg',
      )}
    >
      {/* Barra morada de 2px: la única marca de estado activo. */}
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent" />
      )}
      <Icon size={16} strokeWidth={1.75} />
      {label}
    </button>
  );
}
