import { Minus, Square, X } from 'lucide-react';
import { api, usingMock } from '@/lib/api';
import { Badge } from '@/components/ui';

/**
 * Barra de título propia: la ventana es frameless (ver src/main/index.ts).
 * La zona con `.drag` mueve la ventana; los botones llevan `.no-drag`.
 */
export function TitleBar() {
  return (
    <div className="drag flex h-[var(--titlebar-h)] shrink-0 items-center justify-between border-b border-line bg-surface pl-4">
      <div className="flex items-center gap-2.5">
        <div className="h-3 w-3 rounded-[3px] bg-accent" aria-hidden />
        <span className="text-[13px] font-semibold tracking-tight">Atreus</span>
        {usingMock && (
          <span className="no-drag">
            <Badge tone="warn">datos de prueba</Badge>
          </span>
        )}
      </div>

      <div className="no-drag flex h-full">
        <WindowButton onClick={() => api.app.minimize()} label="Minimizar">
          <Minus size={14} />
        </WindowButton>
        <WindowButton onClick={() => api.app.maximize()} label="Maximizar">
          <Square size={11} />
        </WindowButton>
        <WindowButton onClick={() => api.app.close()} label="Cerrar" danger>
          <X size={14} />
        </WindowButton>
      </div>
    </div>
  );
}

function WindowButton({
  onClick, label, danger, children,
}: {
  onClick: () => void;
  label: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={
        'flex h-full w-11 items-center justify-center text-muted transition-colors duration-[120ms] ease-atreus ' +
        (danger
          ? 'hover:bg-[var(--danger)] hover:text-white'
          : 'hover:bg-elevated hover:text-fg')
      }
    >
      {children}
    </button>
  );
}
