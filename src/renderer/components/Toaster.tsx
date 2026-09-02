import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Info, TriangleAlert, XCircle, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useStore, type Toast } from '@/store';

const ICONS: Record<Toast['level'], LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warn: TriangleAlert,
  error: XCircle,
};

const COLORS: Record<Toast['level'], string> = {
  info: 'text-muted',
  success: 'text-success',
  warn: 'text-warn',
  error: 'text-danger',
};

/** Franja de color a la izquierda: el nivel se lee antes que el texto. */
const EDGES: Record<Toast['level'], string> = {
  info: 'before:bg-[var(--border-strong)]',
  success: 'before:bg-success',
  warn: 'before:bg-warn',
  error: 'before:bg-danger',
};

const EXIT_MS = 160;

export function Toaster() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);

  /**
   * Los que se están yendo.
   *
   * Antes desaparecían de golpe, y con varios apilados el salto de los de abajo
   * costaba de seguir. Se marcan aquí, se les deja terminar la animación de
   * salida y solo entonces se quitan del store.
   */
  const [leaving, setLeaving] = useState<number[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => () => {
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
  }, []);

  function close(id: number) {
    if (timers.current.has(id)) return;
    setLeaving((prev) => [...prev, id]);
    timers.current.set(id, setTimeout(() => {
      timers.current.delete(id);
      setLeaving((prev) => prev.filter((value) => value !== id));
      dismiss(id);
    }, EXIT_MS));
  }

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((t) => {
        const Icon = ICONS[t.level];
        const going = leaving.includes(t.id);
        return (
          <div
            key={t.id}
            role="status"
            className={cn(
              'pointer-events-auto relative flex items-start gap-2.5 overflow-hidden rounded-md',
              'border border-line bg-elevated px-3 py-2.5 pl-4 shadow-lg',
              'before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-[""]',
              EDGES[t.level],
              going ? 'animate-toast-out' : 'animate-toast-in',
            )}
          >
            <Icon size={15} className={cn('mt-0.5 shrink-0', COLORS[t.level])} />
            <p className="flex-1 text-[13px] leading-snug text-fg">{t.message}</p>
            <button
              onClick={() => close(t.id)}
              aria-label="Descartar"
              className="shrink-0 text-faint transition-colors hover:text-fg"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
