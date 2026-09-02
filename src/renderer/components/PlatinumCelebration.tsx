import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { PlatinumReport } from '@shared/types';
import trofeo from '@/assets/trofeo.png';
import { duration, hours, span } from '@/lib/format';
import { sonarPlatino } from '@/lib/sonido';
import { useStore } from '@/store';
import { Button } from '@/components/ui';

/**
 * La celebración del platino.
 *
 * Reproduce la coreografía del vídeo original —retroceso que revela el trofeo,
 * estallido de luz, cintas girando y reposo entre estrellas— pero dibujada aquí
 * en vez de incrustar el vídeo. Así no arrastra la marca de agua, se ve nítida
 * a cualquier tamaño de ventana, pesa unos kilobytes en lugar de cinco megas, y
 * puede decir de qué juego se trata y lo que costó, que es lo que convierte una
 * animación bonita en el remate de algo tuyo.
 *
 * Nada se queda quieto cuando termina la entrada: el trofeo flota, el
 * resplandor respira, las cintas siguen girando y las ascuas suben desde abajo.
 * Una animación que se congela a los tres segundos se siente rota.
 *
 * Todo el movimiento es CSS: lo compone la GPU y no compite con el juego si lo
 * tienes abierto detrás. Con `prefers-reduced-motion` el sistema lo deja quieto
 * (ver theme.css) y entonces esto es una tarjeta con el trofeo, sin más.
 */

/** Motas de polvo estelar repartidas por el fondo. */
const ESTRELLAS = 46;
/** Chispas que salen disparadas en el estallido. */
const CHISPAS = 28;
/** Ascuas que suben sin parar desde el borde inferior. */
const ASCUAS = 16;

interface Mota {
  izq: number;
  arr: number;
  tam: number;
  retardo: number;
  duracion: number;
}

interface Chispa {
  angulo: number;
  distancia: number;
  retardo: number;
  tam: number;
}

/**
 * Posiciones estables mientras la celebración esté abierta.
 *
 * Se calculan una vez con `useMemo`: si se recalcularan en cada repintado, las
 * motas saltarían de sitio a mitad de la animación. El generador es propio y
 * determinista, así que dos celebraciones del mismo juego se ven igual.
 */
function useConfeti(semilla: string) {
  return useMemo(() => {
    let estado = [...semilla].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
    const azar = () => {
      estado = (estado * 1664525 + 1013904223) >>> 0;
      return estado / 0xffffffff;
    };
    const estrellas: Mota[] = Array.from({ length: ESTRELLAS }, () => ({
      izq: azar() * 100,
      arr: azar() * 100,
      tam: 1 + azar() * 2.6,
      retardo: azar() * 2.4,
      duracion: 2.2 + azar() * 2.6,
    }));
    const chispas: Chispa[] = Array.from({ length: CHISPAS }, (_, i) => ({
      angulo: (360 / CHISPAS) * i + azar() * 8,
      distancia: 140 + azar() * 200,
      retardo: azar() * 0.18,
      tam: 2 + azar() * 3,
    }));
    const ascuas: Mota[] = Array.from({ length: ASCUAS }, () => ({
      izq: azar() * 100,
      arr: 0,
      tam: 1.5 + azar() * 2.5,
      retardo: azar() * 9,
      duracion: 7 + azar() * 6,
    }));
    return { estrellas, chispas, ascuas };
  }, [semilla]);
}

export function PlatinumCelebration({
  report, onClose,
}: { report: PlatinumReport; onClose: () => void }) {
  const { estrellas, chispas, ascuas } = useConfeti(report.gameId);
  const conSonido = useStore((state) => state.settings?.celebrationSound ?? true);
  // El botón de cerrar aparece cuando la animación ya ha dicho lo suyo: antes
  // sería una invitación a saltarse justo lo que se ha ganado.
  const [listo, setListo] = useState(false);

  useEffect(() => {
    if (conSonido) sonarPlatino();
    // El sonido suena una vez por celebración, no cada vez que React repinta.
  }, [report.gameId, conSonido]);

  useEffect(() => {
    const t = setTimeout(() => setListo(true), 3000);
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', escape);
    return () => { clearTimeout(t); window.removeEventListener('keydown', escape); };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Platino conseguido en ${report.gameName}`}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden bg-[#07070b]/95 backdrop-blur-md"
    >
      {/* Polvo estelar y ascuas: el fondo nunca se queda inmóvil. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {estrellas.map((mota, i) => (
          <span
            key={`e${i}`}
            className="celebra-estrella"
            style={{
              left: `${mota.izq}%`,
              top: `${mota.arr}%`,
              width: `${mota.tam}px`,
              height: `${mota.tam}px`,
              animationDelay: `${mota.retardo}s`,
              animationDuration: `${mota.duracion}s`,
            }}
          />
        ))}
        {ascuas.map((mota, i) => (
          <span
            key={`a${i}`}
            className="celebra-ascua"
            style={{
              left: `${mota.izq}%`,
              width: `${mota.tam}px`,
              height: `${mota.tam}px`,
              animationDelay: `${mota.retardo}s`,
              animationDuration: `${mota.duracion}s`,
            }}
          />
        ))}
      </div>

      <div className="relative flex flex-col items-center px-6">
        <div className="relative flex items-center justify-center">
          {/* Resplandor de entrada, y detrás otro que respira sin parar. */}
          <div aria-hidden="true" className="celebra-respira" />
          <div aria-hidden="true" className="celebra-halo" />
          {/* El estallido: un anillo que se expande y se apaga. */}
          <div aria-hidden="true" className="celebra-onda" />
          {/* Las chispas del estallido, disparadas en todas direcciones. */}
          <div aria-hidden="true" className="absolute inset-0">
            {chispas.map((chispa, i) => (
              <span
                key={i}
                className="celebra-chispa"
                style={{
                  width: `${chispa.tam}px`,
                  height: `${chispa.tam}px`,
                  transform: `rotate(${chispa.angulo}deg)`,
                  ['--distancia' as string]: `${chispa.distancia}px`,
                  animationDelay: `${0.72 + chispa.retardo}s`,
                }}
              />
            ))}
          </div>

          {/*
            Dos cintas orbitando en sentidos contrarios y con distinta
            inclinación. Cada capa hace una sola cosa —aparecer, inclinar,
            girar— porque dos animaciones sobre el mismo transform se pisan.
          */}
          <div aria-hidden="true" className="celebra-orbita">
            <div className="celebra-orbita-inclina">
              <div className="celebra-orbita-gira"><span className="celebra-anillo" /></div>
            </div>
            <div className="celebra-orbita-inclina inversa">
              <div className="celebra-orbita-gira inversa">
                <span className="celebra-anillo tenue" />
              </div>
            </div>
          </div>

          {/* Envoltorio que flota; dentro, el que entra. Separados por lo mismo. */}
          <div className="celebra-flota relative">
            <img
              src={trofeo}
              alt=""
              className="celebra-entrada h-[46vh] max-h-[420px] min-h-[220px] w-auto"
            />
          </div>
        </div>

        <div className="celebra-texto mt-6 flex flex-col items-center text-center">
          <p className="text-[12px] font-semibold uppercase tracking-[0.32em] text-accent">
            Platino conseguido
          </p>
          <h1 className="mt-2 max-w-2xl text-[30px] font-semibold leading-tight">
            {report.gameName}
          </h1>
          <p className="mt-2 text-[14px] text-muted">
            {report.total} de {report.total} logros · los tienes todos
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            <Dato titulo="Te costó" valor={duration(report.playtimeMinutes)} />
            {report.firstUnlockAt && (
              <Dato titulo="Lo perseguiste" valor={span(report.firstUnlockAt)} />
            )}
            {report.difficulty && (
              <Dato
                titulo="Dificultad"
                valor={`${report.difficulty.score}/10`}
                pie={report.difficulty.label} />
            )}
            {report.estimate && (
              <Dato titulo="Estimado" valor={hours(report.estimate.totalHours)} />
            )}
          </div>

          <Button
            variant="outline"
            className={`mt-8 transition-opacity duration-500 ${listo ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
            onClick={onClose}
          >
            <X size={14} /> Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}

function Dato({ titulo, valor, pie }: { titulo: string; valor: string; pie?: string }) {
  return (
    <div className="flex flex-col items-center">
      <p className="text-[11px] uppercase tracking-wide text-faint">{titulo}</p>
      <p className="mt-0.5 text-[18px] font-semibold tabular-nums">{valor}</p>
      {pie && <p className="text-[11px] text-muted">{pie}</p>}
    </div>
  );
}
