import { Gem, Trophy, Compass, Map, Package, Settings2, Activity, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Progress } from '@/components/ui';
import { useContador } from '@/lib/contar';
import { useStore, type Section } from '@/store';

/**
 * Seis destinos, ni uno más, en dos grupos que no son lo mismo.
 *
 * Dos valen siempre. Los otros cuatro **operan sobre el juego en contexto** y
 * no significan nada sin él: por eso van debajo del juego y sangrados, no
 * mezclados con los primeros. Antes estaban todos en la misma lista y el juego
 * que los gobierna aparecía al final de la barra, lejos y sin relación visible;
 * pulsar "Trofeos" sin haber elegido nada no hacía nada y no lo explicaba.
 *
 * Los nombres no son los genéricos de un launcher, porque esto no lo es.
 * "Colección" es lo que tiene un coleccionista, no una estantería de programas;
 * "Trofeos" es la palabra con la que se habla de esto de verdad; "Rutas" es lo
 * que se sigue para un platino, que no es lo mismo que un manual; "Atlas" es un
 * libro de mapas, que es exactamente lo que ofrece; y "Taller" es como se ha
 * llamado siempre en español el sitio donde se le mete mano a un juego.
 *
 * Que tengan carácter no quita que haya que decir qué hacen: cada uno del
 * segundo grupo lleva su descripción debajo. Un nombre bonito que hay que
 * adivinar es un nombre que estorba.
 */
interface Destino {
  id: Section;
  label: string;
  icon: LucideIcon;
  hint?: string;
}

const GENERALES: Destino[] = [
  { id: 'library', label: 'Colección', icon: Gem },
  { id: 'activity', label: 'Actividad', icon: Activity },
];

const DEL_JUEGO: Destino[] = [
  { id: 'achievements', label: 'Trofeos', icon: Trophy, hint: 'logros, rareza e historial' },
  { id: 'guides', label: 'Rutas', icon: Compass, hint: 'guías con su texto completo' },
  { id: 'maps', label: 'Atlas', icon: Map, hint: 'mapas interactivos' },
  { id: 'mods', label: 'Taller', icon: Package, hint: 'instalar y ordenar mods' },
];

export function Sidebar() {
  const section = useStore((s) => s.section);
  const go = useStore((s) => s.go);
  const selected = useStore((s) => s.selected());
  const platinum = useStore((s) => s.platinum);
  const summary = selected ? platinum[selected.id] : undefined;

  /*
   * El marcador de la casa. Un cazador de platinos lleva la cuenta de dos
   * cosas: cuántos tiene y cuántos está persiguiendo. Tenerlo siempre delante
   * es lo que separa esto de una lista de juegos instalados.
   */
  const marcador = useMemo(() => {
    const todos = Object.values(platinum).filter((s) => s.total > 0);
    return {
      platinos: todos.filter((s) => s.complete).length,
      enCurso: todos.filter((s) => s.unlocked > 0 && !s.complete).length,
    };
  }, [platinum]);

  // El marcador sube contando: es el número que da nombre a la aplicación y
  // el que cambia cuando de verdad ha pasado algo.
  const platinosMostrados = useContador(marcador.platinos);

  return (
    <nav className="flex w-[var(--sidebar-w)] shrink-0 flex-col overflow-y-auto border-r border-line bg-surface">
      <button
        onClick={() => go('library')}
        title="Ir a tu colección"
        className="flex shrink-0 items-center gap-3 border-b border-line px-3 py-3 text-left transition-colors duration-[120ms] hover:bg-elevated"
      >
        <span className="text-[26px] font-semibold leading-none tabular-nums text-fg">
          {platinosMostrados}
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] uppercase tracking-wide text-accent">
            {marcador.platinos === 1 ? 'platino' : 'platinos'}
          </span>
          <span className="block truncate text-[11px] text-faint">
            {marcador.enCurso > 0 ? `${marcador.enCurso} en curso` : 'nada empezado'}
          </span>
        </span>
      </button>

      <div className="flex flex-col gap-0.5 p-2">
        {GENERALES.map((item) => (
          <Item
            key={item.id}
            {...item}
            active={section === item.id}
            onClick={() => go(item.id)}
          />
        ))}
      </div>

      <Grupo titulo={selected ? 'Sobre este juego' : 'Necesitan un juego'} />

      {selected ? (
        <>
          {/*
            El juego en contexto, justo encima de lo que gobierna. Es además la
            única entrada a su ficha, y enseña el progreso hacia el platino, que
            es el dato que se quiere tener a la vista mientras se navega.
          */}
          <button
            onClick={() => go('game')}
            aria-current={section === 'game' ? 'page' : undefined}
            title={`Abrir la ficha de ${selected.name}`}
            className={cn(
              'group relative mx-2 rounded-sm px-2.5 py-2 text-left',
              'transition-colors duration-[120ms] ease-atreus',
              section === 'game' ? 'bg-accent-soft' : 'hover:bg-elevated',
            )}
          >
            {section === 'game' && (
              <span className="animate-marca absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-accent" />
            )}
            {/* Sin un segundo rótulo encima: el del grupo ya dice de qué va
                esto, y dos etiquetas en mayúsculas seguidas no informan más. */}
            <p className="flex items-center gap-1 text-[13px] font-medium">
              <span className="min-w-0 truncate" title={`Abrir la ficha de ${selected.name}`}>
                {selected.name}
              </span>
              <ChevronRight
                size={13}
                className="shrink-0 text-faint transition-transform duration-[120ms] group-hover:translate-x-0.5"
              />
            </p>
            {summary && summary.total > 0 && (
              <>
                <Progress
                  value={summary.percent}
                  tone={summary.complete ? 'success' : 'accent'}
                  className="mt-1.5 h-1"
                  label={`${selected.name}: ${summary.unlocked} de ${summary.total} trofeos`}
                />
                <p className={cn('mt-1 text-[11px]', summary.complete ? 'text-success' : 'text-faint')}>
                  {summary.complete
                    ? 'Platino conseguido'
                    : `${summary.unlocked}/${summary.total} trofeos`}
                </p>
              </>
            )}
          </button>

          <div className="flex flex-col gap-0.5 p-2 pt-1.5">
            {DEL_JUEGO.map((item) => (
              <Item
                key={item.id}
                {...item}
                sangrado
                active={section === item.id}
                onClick={() => go(item.id)}
              />
            ))}
          </div>
        </>
      ) : (
        /*
         * Cuatro elementos apagados no dicen por qué están apagados; una frase
         * sí. Se ve poco: en cuanto la biblioteca carga, `loadLibrary` elige el
         * primer juego. Es la barra de una instalación recién estrenada, que es
         * justo cuando más falta hace saber qué va a pasar aquí.
         */
        <div className="mx-2 rounded-sm border border-dashed border-line px-3 py-3">
          <p className="text-[12px] leading-5 text-muted">
            Cuando tengas un juego elegido, aquí estarán sus trofeos, sus rutas,
            sus mapas y su taller.
          </p>
          <button
            onClick={() => go('library')}
            className="mt-2 flex items-center gap-1 text-[12px] font-medium text-accent transition-colors hover:text-accent-hover"
          >
            Ir a la Colección <ChevronRight size={12} />
          </button>
        </div>
      )}

      <div className="flex-1" />

      <div className="shrink-0 border-t border-line p-2">
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

/** Rótulo de grupo: separa lo que vale siempre de lo que necesita un juego. */
function Grupo({ titulo }: { titulo: string }) {
  return (
    <p className="mt-1 px-4 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">
      {titulo}
    </p>
  );
}

function Item({
  label, hint, icon: Icon, active, sangrado, onClick,
}: Destino & {
  active: boolean;
  sangrado?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group/item relative flex items-center gap-2.5 rounded-sm px-3 text-left text-[13px] font-medium',
        'transition-colors duration-[120ms] ease-atreus',
        hint ? 'py-1.5' : 'h-9',
        sangrado && 'ml-2',
        active ? 'bg-accent-soft text-fg' : 'text-muted hover:bg-elevated hover:text-fg',
      )}
    >
      {/* Barra morada de 2px: la única marca de estado activo. Crece desde su
          centro para que el salto entre secciones se vea llegar. */}
      {active && (
        <span className="animate-marca absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent" />
      )}
      <Icon
        size={16}
        strokeWidth={1.75}
        className={cn(
          'shrink-0 transition-transform duration-[180ms] ease-atreus',
          'group-hover/item:scale-110',
          active && 'scale-110',
        )}
      />
      <span className="min-w-0">
        {label}
        {hint && (
          <span className="block truncate text-[11px] font-normal leading-tight text-faint">
            {hint}
          </span>
        )}
      </span>
    </button>
  );
}
