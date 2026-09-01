import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
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
        'transition-colors duration-[120ms] ease-atreus',
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
      <span
        className={cn(
          'absolute top-0.5 h-4 w-4 rounded-full bg-white',
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
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-md border border-line bg-surface', className)}>{children}</div>
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
  return <div className={cn('animate-pulse rounded-sm bg-elevated', className)} />;
}

// ── Empty ─────────────────────────────────────────────────────
export function Empty({
  icon, title, hint, action,
}: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      {icon && <div className="text-faint">{icon}</div>}
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
