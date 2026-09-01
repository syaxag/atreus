import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertOctagon, RotateCcw, ScrollText } from 'lucide-react';
import { api } from '@/lib/api';

/**
 * Red de seguridad del renderer.
 *
 * Sin esto, cualquier error de React deja la ventana **en blanco**, sin pista de
 * qué pasó: el peor fallo posible, porque no se puede ni contar. Aquí se ve el
 * mensaje, la pila y un botón para recargar sin cerrar la app.
 */

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // La consola del renderer no queda en el registro del main, así que al
    // menos se deja aquí para poder copiarla.
    console.error('[atreus] error no capturado en la interfaz', error, info);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  private reload = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-base px-8">
        <AlertOctagon size={40} strokeWidth={1.25} className="text-danger" />

        <div className="text-center">
          <h1 className="text-[18px] font-semibold">Algo se rompió en la interfaz</h1>
          <p className="mt-1 text-[13px] text-muted">
            El fallo está en la ventana, no en tus datos. Nada de lo guardado se ha tocado.
          </p>
        </div>

        <pre className="selectable max-h-56 w-full max-w-2xl overflow-auto rounded-md border border-line bg-inset p-3 font-mono text-[11px] leading-relaxed text-danger">
          {error.message}
          {error.stack ? `\n\n${error.stack}` : ''}
          {componentStack ? `\n\nComponentes:${componentStack}` : ''}
        </pre>

        <div className="flex gap-2">
          <button
            onClick={this.reload}
            className="inline-flex h-9 items-center gap-2 rounded-sm bg-accent px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover"
          >
            <RotateCcw size={14} /> Recargar la ventana
          </button>
          <button
            onClick={() => void api.app.openLogs()}
            className="inline-flex h-9 items-center gap-2 rounded-sm border border-line px-3.5 text-[13px] font-medium text-fg transition-colors hover:border-line-strong hover:bg-elevated"
          >
            <ScrollText size={14} /> Ver el registro
          </button>
        </div>
      </div>
    );
  }
}
