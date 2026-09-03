import { useEffect, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, CSSProperties, InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Primitivas de interfaz. Todo el color sale de las variables de theme.css:
 * ningún componente escribe un literal. Ver docs/DESIGN.md.
 */

// ── Button ────────────────────────────────────────────────────
type Variant = 'primary' | 'ghost' | 'outline' | 'danger';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover active:bg-accent-press',
  ghost: 'text-muted hover:text-fg hover:bg-elevated',
  outline: 'border border-line text-fg hover:border-line-strong hover:bg-elevated',
  danger: 'border border-line text-danger hover:bg-[var(--danger-soft)] hover:border-[var(--danger-line)]',
};

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[13px] gap-1.5',
  md: 'h-9 px-3.5 text-[13px] gap-2',
};

export function Button({
  variant = 'ghost', size = 'md', className, children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-sm font-medium whitespace-nowrap',
        'transition-[color,background-color,border-color,transform] duration-[120ms] ease-atreus',
        // Un hundimiento de un 2 % al pulsar: no se ve, se nota.
        'active:scale-[0.98]',
        // 40% hacía que las acciones deshabilitadas prácticamente desaparecieran
        // sobre el fondo oscuro. Se mantienen inactivas, pero siguen siendo legibles.
        'disabled:opacity-55 disabled:pointer-events-none',
        VARIANTS[variant], SIZES[size], className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ── Toggle ────────────────────────────────────────────────────
export function Toggle({
  checked, onChange, disabled, label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-[120ms] ease-atreus',
        'disabled:opacity-55 disabled:pointer-events-none',
        checked ? 'bg-accent' : 'bg-line-strong',
      )}
    >
      {/*
        `left-0` no sobra: un <button> trae `text-align: center` del navegador y
        Tailwind no lo resetea, así que un hijo `absolute` sin ancla horizontal
        toma como posición estática el **centro** del botón, no su borde. Sin
        esta línea el pulgar salía a media pista estando apagado y se desbordaba
        por la derecha al encenderse, que es justo lo que se veía.
      */}
      <span
        className={cn(
          'absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white',
          'transition-transform duration-[120ms] ease-atreus',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

// ── Input ─────────────────────────────────────────────────────
export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        // Sin ancho por defecto a propósito: lo fija quien lo usa. Si aquí
        // hubiera `w-full`, un `w-36` del llamante no ganaría de forma fiable.
        'h-9 rounded-sm border border-line bg-inset px-3 text-[13px] text-fg',
        'placeholder:text-faint selectable',
        'transition-colors duration-[120ms] ease-atreus',
        'focus:border-accent focus:outline-none',
        'disabled:opacity-55',
        className,
      )}
      {...rest}
    />
  );
}

// ── Slider ────────────────────────────────────────────────────
export function Slider({
  value, min, max, step, onChange, disabled,
}: {
  value: number; min: number; max: number; step: number;
  onChange: (next: number) => void; disabled?: boolean;
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <input
      type="range"
      value={value} min={min} max={max} step={step} disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className="atreus-slider h-1 w-full cursor-pointer appearance-none rounded-full disabled:opacity-40"
      style={{
        background:
          `linear-gradient(to right, var(--accent) ${pct}%, var(--border-strong) ${pct}%)`,
      }}
    />
  );
}

// ── Card ──────────────────────────────────────────────────────
/**
 * `hover` es para las tarjetas que son **filas de una lista**, no para los
 * paneles. Un panel que se ilumina al pasar por encima promete que se puede
 * pulsar; una fila de una lista larga, en cambio, necesita decir dónde está el
 * cursor cuando hay veinte iguales seguidas.
 */
export function Card({
  className, children, hover, style,
}: { className?: string; children: ReactNode; hover?: boolean; style?: CSSProperties }) {
  return (
    <div
      style={style}
      className={cn(
        'rounded-md border border-line bg-surface',
        hover && 'transition-colors duration-[120ms] ease-atreus hover:border-line-strong hover:bg-elevated',
        className,
      )}
    >
      {children}
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────────
type Tone = 'neutral' | 'accent' | 'success' | 'warn' | 'danger';

const TONES: Record<Tone, string> = {
  neutral: 'border-line text-muted',
  accent: 'border-[var(--accent-line)] bg-accent-soft text-accent-hover',
  success: 'border-[var(--success-line)] text-success',
  warn: 'border-[var(--warn-line)] text-warn',
  danger: 'border-[var(--danger-line)] text-danger',
};

export function Badge({
  tone = 'neutral', mono, children,
}: { tone?: Tone; mono?: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-sm border px-1.5 text-[11px] font-medium',
        mono && 'font-mono',
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

// ── Skeleton ──────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-sm', className)} />;
}

// ── Empty ─────────────────────────────────────────────────────
export function Empty({
  icon, title, hint, action,
}: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="animate-view flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      {icon && <div className="animate-flota text-faint">{icon}</div>}
      <div>
        <p className="text-[15px] font-medium text-fg">{title}</p>
        {hint && <p className="mt-1 max-w-sm text-[13px] text-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

// ── Cabecera de vista ─────────────────────────────────────────
export function ViewHeader({
  title, subtitle, actions,
}: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
      <div className="min-w-0">
        <h1 className="truncate text-[24px] font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>}
    </header>
  );
}

// ── Barra de progreso ─────────────────────────────────────────
/**
 * Progreso hacia el 100 %. Es el elemento que más se repite en la aplicación,
 * así que lleva el valor accesible puesto: un lector de pantalla lee el
 * porcentaje sin depender del texto que haya al lado.
 */
export function Progress({
  value, tone = 'accent', className, label,
}: { value: number; tone?: 'accent' | 'success'; className?: string; label?: string }) {
  const clamped = Math.max(0, Math.min(100, value));

  /*
   * Se llena al aparecer, en vez de estar ya lleno.
   *
   * Es la barra que más se repite en la aplicación: verla crecer una vez es lo
   * que hace que una parrilla de dieciséis juegos se lea como un progreso y no
   * como un gráfico estático. Se pinta desde cero y se sube al valor en el
   * fotograma siguiente, que es cuando el navegador ya tiene con qué animar.
   */
  const [dibujado, setDibujado] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDibujado(clamped));
    return () => cancelAnimationFrame(frame);
  }, [clamped]);

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? 'Progreso de logros'}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-inset', className)}
    >
      {/*
        Escala en vez de ancho: el sistema de diseño solo anima `opacity` y
        `transform`, y animar el ancho obliga al motor a rehacer el diseño en
        cada fotograma de cada tarjeta visible.
      */}
      <div
        className={cn(
          'h-full origin-left rounded-full transition-transform duration-500 ease-atreus',
          tone === 'success' ? 'bg-success' : 'bg-accent',
        )}
        style={{ transform: `scaleX(${dibujado / 100})` }}
      />
    </div>
  );
}

// ── Medidor de dificultad ─────────────────────────────────────
/** Diez muescas, de 1 a 10. Es la escala con la que ya cuenta la gente. */
export function DifficultyMeter({ score, className }: { score: number; className?: string }) {
  const filled = Math.round(score);
  return (
    <div className={cn('flex items-center gap-[3px]', className)} aria-label={`Dificultad ${score} de 10`}>
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-3.5 w-1.5 rounded-[1px]',
            i < filled
              ? filled >= 8 ? 'bg-danger' : filled >= 6 ? 'bg-warn' : 'bg-accent'
              : 'bg-inset',
          )}
        />
      ))}
    </div>
  );
}

// ── Diálogo modal ─────────────────────────────────────────────
/**
 * Cuántos modales hay abiertos.
 *
 * Los atajos globales de la aplicación se callan mientras haya alguno: si no,
 * Ctrl+K navega por detrás del diálogo y lo deja huérfano sobre otra vista.
 */
let modalesAbiertos = 0;
export const hayModalAbierto = (): boolean => modalesAbiertos > 0;

/**
 * Ventana emergente bloqueante.
 *
 * Cierra con Escape y con clic fuera, pero el consumidor decide si el botón de
 * confirmar existe: el aviso de logros, por ejemplo, exige una acción explícita.
 */
export function Modal({
  open, title, icon, onClose, children, footer, wide,
}: {
  open: boolean;
  title: string;
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  // Casi todos los consumidores pasan una función nueva en cada render. Se lee
  // por referencia para que el efecto dependa solo de `open` y no vuelva a
  // robar el foco mientras se escribe dentro del diálogo.
  const cerrar = useRef(onClose);
  cerrar.current = onClose;

  /*
   * Al abrirse, el foco se queda en el botón que abrió el diálogo, que está
   * fuera: un `onKeyDown` en el propio diálogo no llega a oír nada. Se trae el
   * foco y se escucha Escape en la ventana, en fase de captura, para que la
   * tecla no siga su camino hasta los atajos globales.
   */
  useEffect(() => {
    if (!open) return;
    modalesAbiertos++;
    dialog.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      cerrar.current();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      modalesAbiertos--;
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm animate-view"
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // Enfocable por código, no con el tabulador: es donde aterriza el foco
        // al abrir, y desde ahí el tabulador recorre el contenido en orden.
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className={cn(
          'flex max-h-full w-full flex-col overflow-hidden rounded-md border border-line bg-surface shadow-2xl',
          'focus:outline-none animate-modal',
          wide ? 'max-w-3xl' : 'max-w-lg',
        )}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-5 py-3.5">
          {icon}
          <h2 className="text-[15px] font-semibold">{title}</h2>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
