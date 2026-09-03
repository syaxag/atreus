import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { PlatinumReport } from '@shared/types';
import celebracion from '@/assets/celebracion.mp4';
import { duration, hours, span } from '@/lib/format';
import { ESTALLIDO_S, sonarPlatino } from '@/lib/sonido';
import { useStore } from '@/store';
import { useT } from '@/i18n';
import { Button } from '@/components/ui';

/**
 * La celebración del platino.
 *
 * La animación es **el vídeo del propio trofeo**, con la marca de agua quitada
 * y compuesto en modo `screen`: su fondo negro no pinta nada, así que el trofeo
 * y sus partículas se funden con el fondo de la ventana sin recuadro visible.
 *
 * Hubo antes una recreación en CSS. Se descartó: por bien resuelta que
 * estuviera, no alcanza el acabado de un render 3D, y aquí lo que se celebra
 * merece verse bien. El vídeo pesa 1,8 MB y va incrustado, así que funciona sin
 * conexión igual que el resto.
 *
 * Encima del vídeo va lo que el vídeo no puede saber: de qué juego se trata,
 * cuánto costó y cómo de duro era.
 */

/**
 * Al acabar, se vuelve aquí en vez de al principio.
 *
 * El vídeo empieza con un acercamiento que solo tiene sentido la primera vez;
 * repetirlo en bucle marearía. Desde este punto es deriva de partículas, que
 * encadena sin que se note el salto y deja la escena viva mientras la miras.
 */
const BUCLE_DESDE_S = 6.4;

export function PlatinumCelebration({
  report, onClose,
}: { report: PlatinumReport; onClose: () => void }) {
  const t = useT();
  const conSonido = useStore((state) => state.settings?.celebrationSound ?? true);
  const video = useRef<HTMLVideoElement | null>(null);
  // El botón de cerrar aparece pasado el estallido: antes sería una invitación
  // a saltarse justo lo que se ha ganado.
  const [listo, setListo] = useState(false);

  useEffect(() => {
    if (conSonido) sonarPlatino();
    // Suena una vez por celebración, no cada vez que React repinta.
  }, [report.gameId, conSonido]);

  useEffect(() => {
    const t = setTimeout(() => setListo(true), (ESTALLIDO_S + 1.2) * 1000);
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', escape);
    return () => { clearTimeout(t); window.removeEventListener('keydown', escape); };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('celebra.aria', { juego: report.gameName })}
      /*
        El fondo va **opaco del todo**, no traslúcido. Con el vídeo compuesto en
        modo `screen`, cualquier claridad que se cuele por detrás delata su
        recuadro: el negro del vídeo es más oscuro que la ventana difuminada y
        se dibuja el rectángulo. Sobre negro puro, el rectángulo desaparece.
      */
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden bg-[#06060a]"
    >
      <div className="relative flex flex-col items-center">
        <div className="relative flex items-center justify-center">
          <video
            ref={video}
            src={celebracion}
            autoPlay
            muted
            playsInline
            aria-hidden="true"
            onEnded={() => {
              const el = video.current;
              if (!el) return;
              el.currentTime = BUCLE_DESDE_S;
              void el.play();
            }}
            className="celebra-video relative h-[56vh] max-h-[600px] min-h-[240px] w-auto"
          />
        </div>

        {/* Debajo del vídeo, no encima: en el estallido la luz llena el cuadro
            y cualquier texto puesto ahí se vuelve ilegible. */}
        <div className="celebra-texto mt-1 flex flex-col items-center px-6 text-center">
          <p className="text-[12px] font-semibold uppercase tracking-[0.32em] text-accent">
            {t('celebra.titulo')}
          </p>
          <h1 className="mt-2 max-w-2xl text-[30px] font-semibold leading-tight">
            {report.gameName}
          </h1>
          <p className="mt-2 text-[14px] text-muted">
            {t('celebra.todos', { total: report.total })}
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            <Dato titulo={t('celebra.teCosto')} valor={duration(report.playtimeMinutes)} />
            {report.firstUnlockAt && (
              <Dato titulo={t('celebra.loPerseguiste')} valor={span(report.firstUnlockAt)} />
            )}
            {report.difficulty && (
              <Dato
                titulo={t('celebra.dificultad')}
                valor={`${report.difficulty.score}/10`}
                pie={report.difficulty.label} />
            )}
            {report.estimate && (
              <Dato titulo={t('celebra.estimado')} valor={hours(report.estimate.totalHours)} />
            )}
          </div>

          <Button
            variant="outline"
            className={`mt-7 transition-opacity duration-500 ${listo ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
            onClick={onClose}
          >
            <X size={14} /> {t('celebra.cerrar')}
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
