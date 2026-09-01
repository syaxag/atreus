import { CheckCircle2, Info, TriangleAlert, XCircle, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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

export function Toaster() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((t) => {
        const Icon = ICONS[t.level];
        return (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex items-start gap-2.5 rounded-md border border-line bg-elevated px-3 py-2.5 shadow-lg"
            style={{ animation: 'atreus-toast 180ms cubic-bezier(.2,.8,.2,1)' }}
          >
            <Icon size={15} className={`mt-0.5 shrink-0 ${COLORS[t.level]}`} />
            <p className="flex-1 text-[13px] leading-snug text-fg">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
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
