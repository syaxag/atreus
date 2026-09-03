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
        <Mark />
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

/**
 * La marca de Atreus: la A sobre su peana, una letra y un trofeo a la vez.
 *
 * Va como SVG en línea y no como imagen: son cuatro trazos, y así hereda el
 * color del tema sin pedir un archivo ni pasar por la CSP.
 *
 * Es **la misma geometría** que `scripts/make-icon.mjs`, que es el que genera
 * el icono del ejecutable. Antes no lo era —aquí una A maciza, allí una de
 * trazo— y la aplicación se presentaba con dos marcas distintas según dónde la
 * miraras. Al tocar una hay que tocar la otra: las coordenadas de allí son
 * `[-1, 1]`, y aquí se mapean con `x = (u + 1) · 16`.
 */
function Mark() {
  return (
    <svg width="16" height="16" viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <g
        stroke="var(--bg-base)"
        strokeWidth="3.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d="M9.68 20.48 15.68 7.12" />
        <path d="M22.32 20.48 16.32 7.12" />
        <path d="M12.24 17.28h7.52" />
        <path d="M8.32 23.6h15.36" />
      </g>
    </svg>
  );
}
