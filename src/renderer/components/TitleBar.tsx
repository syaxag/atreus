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
 * La marca de Atreus: la A dentro de un anillo de completado abierto por abajo.
 *
 * El anillo no es adorno. Es un indicador de progreso, que es el idioma con el
 * que se lee el 100 % de un juego desde hace quince años: así la marca dice qué
 * hace esto en vez de ser una letra en una loseta. Antes el travesaño iba
 * inclinado como un rayo, guiño al icono de cheats; los cheats se fueron de la
 * aplicación y el guiño se quedó apuntando a nada.
 *
 * Va como SVG en línea y no como imagen: son cuatro trazos, y así hereda el
 * color del tema sin pedir un archivo ni pasar por la CSP.
 *
 * Es **la misma geometría** que `scripts/make-icon.mjs`, que genera el icono
 * del ejecutable. Al tocar una hay que tocar la otra: las coordenadas de allí
 * van en `[-1, 1]` y aquí se mapean con `x = (u + 1) · 16`. El anillo tiene
 * radio 0,72 y el hueco va de 0,66 a 2,48 radianes, que son los dos extremos
 * del arco de abajo.
 */
function Mark() {
  return (
    <svg width="16" height="16" viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      {/* El anillo va más grueso que la letra: con un solo grosor, la A se
          hinchaba hasta tocarlo y el contra se cerraba en un borrón. */}
      <path
        d="M6.89 23.05 A11.52 11.52 0 1 1 25.10 23.06"
        fill="none"
        stroke="var(--bg-base)"
        strokeWidth="3.68"
        strokeLinecap="round"
      />
      <g
        stroke="var(--bg-base)"
        strokeWidth="2.62"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d="M12.56 20.16 15.81 11.68" />
        <path d="M19.44 20.16 16.19 11.68" />
        <path d="M14.16 18h3.68" />
      </g>
    </svg>
  );
}
