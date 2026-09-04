import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Lo que llega tarde no se pinta.
 *
 * Cinco vistas cargaban así:
 *
 *     useEffect(() => { void cargar(); }, [gameId]);
 *
 * y dentro, un `await` seguido de `setState`. Abrir el juego A y saltar a B
 * antes de que Steam contestara pintaba **los logros de A sobre B**: la
 * respuesta lenta llegaba después y nadie comprobaba que siguiera valiendo. No
 * es raro de provocar —Steam tarda segundos y la barra lateral está a un clic—,
 * y lo que se veía era un juego con los logros de otro.
 *
 * El patrón bueno ya existía en el proyecto, en `HomeView`: un `let vigente` en
 * el efecto que se apaga al desmontar. Estaba en una vista de seis. Aquí se
 * escribe una vez.
 *
 * No es un `AbortController`: la petición sigue su curso —el IPC ya está en
 * marcha y cortarlo no ahorra nada—, lo que se descarta es su **resultado**.
 */

/** Lo que devuelve `useCarga`. */
export interface Carga<T> {
  /** Lo último que llegó a tiempo. `null` mientras no haya llegado nada. */
  datos: T | null;
  /** true mientras hay una petición vigente en el aire. */
  cargando: boolean;
  /** El error de la última carga, ya traducido por quien la escribió. */
  error: string | null;
  /** Vuelve a pedir. Lo que estuviera en el aire deja de contar. */
  recargar: () => void;
}

/**
 * Ejecuta `pedir` cuando cambian las dependencias y descarta lo que llegue de
 * una petición ya superada.
 *
 * `pedir` devuelve los datos o lanza; el mensaje del error es lo que acaba en
 * `error`. Se envuelve en `useCallback` por quien lo usa, como cualquier
 * dependencia de efecto.
 */
export function useCarga<T>(
  pedir: () => Promise<T>,
  activo = true,
): Carga<T> {
  const [datos, setDatos] = useState<T | null>(null);
  const [cargando, setCargando] = useState(activo);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  /*
   * El número de la petición vigente.
   *
   * Un contador y no un booleano: con `let vigente` dentro del efecto basta
   * para el desmontaje, pero `recargar()` no desmonta nada, así que dos cargas
   * seguidas de la misma vista competirían igual. Cada carga se queda con su
   * número y solo escribe si al terminar sigue siendo el último.
   */
  const vigente = useRef(0);

  useEffect(() => {
    if (!activo) {
      setCargando(false);
      return;
    }

    const mio = ++vigente.current;
    setCargando(true);
    setError(null);

    void (async () => {
      try {
        const valor = await pedir();
        if (vigente.current !== mio) return; // llegó tarde: ya hay otra
        setDatos(valor);
      } catch (e) {
        if (vigente.current !== mio) return;
        setDatos(null);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (vigente.current === mio) setCargando(false);
      }
    })();

    /*
     * Al desmontar o al cambiar de juego, se invalida lo que esté en el aire.
     * Sin esto, React avisa por consola de un `setState` sobre un componente
     * que ya no está, y lo que es peor, la vista nueva hereda datos viejos.
     *
     * El linter avisa de que `vigente.current` habrá cambiado para cuando esto
     * se ejecute. Es exactamente lo que se busca: la regla está pensada para
     * refs que apuntan a un nodo del DOM, y esta es un contador cuyo valor de
     * ahora mismo es el que hay que invalidar.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { vigente.current++; };
  }, [pedir, activo, intento]);

  const recargar = useCallback(() => setIntento((n) => n + 1), []);

  return { datos, cargando, error, recargar };
}

/**
 * El guardia suelto, para las cargas que ya están escritas a mano.
 *
 * `useCarga` sirve cuando la vista carga una cosa y pinta esa cosa. Las vistas
 * grandes no son así: el Taller pide mods y perfiles a la vez, y aparte el
 * catálogo remoto cuando abres su pestaña. Ahí lo que hace falta no es otra
 * forma de cargar, sino poder preguntar *"¿lo que acabo de esperar sigue
 * valiendo?"*.
 *
 *     const turno = useTurno();
 *     const cargar = useCallback(async () => {
 *       const vigente = turno();
 *       const res = await api.mods.list(gameId);
 *       if (!vigente()) return;   // cambiaste de juego mientras tanto
 *       setMods(res.data);
 *     }, [gameId, turno]);
 *
 * Es el patrón que `GuidesView` ya tenía escrito a mano con un `useRef(0)`, y
 * que a las demás vistas les faltaba. Ahora hay una sola copia.
 */
export function useTurno(): () => () => boolean {
  const ultimo = useRef(0);

  // Al desmontar se invalida todo lo que quede en el aire: ningún `setState`
  // sobre una vista que ya no está.
  useEffect(() => () => { ultimo.current++; }, []);

  return useCallback(() => {
    const mio = ++ultimo.current;
    return () => ultimo.current === mio;
  }, []);
}
