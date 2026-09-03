import { useEffect, useRef, useState } from 'react';

/**
 * Un número que sube contando hasta su valor.
 *
 * Solo merece la pena donde el número **es** la información, no donde
 * acompaña: en Atreus eso es el marcador de platinos de la barra lateral, que
 * es el dato de la casa y el que cambia cuando pasa algo que importa. Contar
 * cada cifra de cada tarjeta sería ruido.
 *
 * Va por `requestAnimationFrame` y no por un intervalo: así el navegador puede
 * saltarse fotogramas si la ventana está tapada en vez de acumularlos, y la
 * cuenta termina cuando debe aunque se pierdan por el camino.
 */
export function useContador(valor: number, duracion = 600): number {
  const [mostrado, setMostrado] = useState(valor);
  /** Desde dónde se cuenta: el último valor que llegó a pintarse. */
  const desde = useRef(valor);

  useEffect(() => {
    const inicio = desde.current;
    if (inicio === valor) return;

    // Quien pide menos movimiento recibe el número, no la cuenta.
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (quieto || duracion <= 0) {
      desde.current = valor;
      setMostrado(valor);
      return;
    }

    const t0 = performance.now();
    let frame = 0;
    const paso = (ahora: number) => {
      const avance = Math.min(1, (ahora - t0) / duracion);
      // La misma curva que el resto del sistema: rápido al principio y
      // frenando al final, para que el último número se lea.
      const suave = 1 - (1 - avance) ** 3;
      const actual = Math.round(inicio + (valor - inicio) * suave);
      setMostrado(actual);
      if (avance < 1) frame = requestAnimationFrame(paso);
      else desde.current = valor;
    };
    frame = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(frame);
  }, [valor, duracion]);

  return mostrado;
}
