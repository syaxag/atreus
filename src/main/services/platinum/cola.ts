import type { GameId } from '@shared/types';

/**
 * El recorrido de la cola del calentamiento, sin Electron delante.
 *
 * Vive aparte de `warmup.ts` por lo mismo que `summaries.ts` vive aparte de
 * `index.ts`: aquí no se importa nada de la aplicación, así que se puede probar
 * con relojes y juegos de mentira. Y hacía falta, porque lo que había estaba
 * mal y nadie podía verlo:
 *
 *     for (const gameId of cola) {
 *       if (hayPartida()) { await esperar(60_000); continue; }
 *       ...
 *     }
 *
 * El comentario prometía "se reintenta más tarde en vez de abandonar", pero
 * `continue` **avanza el iterador**: ese juego no se reintentaba nunca. Con una
 * partida abierta la cola entera se descartaba a razón de un minuto por juego,
 * en silencio, y esos juegos se quedaban sin resumen hasta un escaneo manual o
 * un reinicio de Atreus.
 *
 * Ahora el índice **no avanza** mientras hay una partida: se espera y se
 * reintenta el mismo juego. Con un tope, porque una sesión de ocho horas no
 * debe dejar el calentamiento girando para siempre sobre el primer juego de la
 * lista; agotado el tope, ese juego se salta y se dice cuántos quedaron así.
 */

export interface Recorrido {
  /** ¿Hay una partida abierta ahora mismo? Jugar manda sobre calcular. */
  hayPartida: () => boolean;
  /** Calcula el informe de un juego. Si lanza, ese juego se da por perdido. */
  calcular: (gameId: GameId) => Promise<void>;
  /** Duerme. Lo inyecta quien llama para que un test no tarde media hora. */
  esperar: (ms: number) => Promise<void>;
  /** ¿Nos han dicho que paremos? Se consulta tras cada espera. */
  parado: () => boolean;
  /** Aviso de que un juego ya está listo, para ir rellenando la biblioteca. */
  hecho?: (gameId: GameId) => void;
  /** Aviso de que un juego se perdió, con el motivo. */
  fallo?: (gameId: GameId, error: unknown) => void;
  /** Respiro entre juegos. */
  pausaMs: number;
  /** Cuánto se espera cuando hay una partida abierta. */
  pausaOcupadoMs: number;
  /** Cuántas esperas se admiten por juego antes de saltárselo. */
  esperasMaximas: number;
}

export interface Resultado {
  /** Juegos calculados. */
  hechos: number;
  /** Juegos que fallaron al calcularse. */
  fallidos: number;
  /** Juegos saltados por agotar la espera con una partida abierta. */
  aplazados: number;
  /** true si se salió por `parado()` antes de terminar la cola. */
  interrumpido: boolean;
}

export async function recorrer(cola: readonly GameId[], op: Recorrido): Promise<Resultado> {
  const resultado: Resultado = { hechos: 0, fallidos: 0, aplazados: 0, interrumpido: false };

  // Por índice y a mano: el `for...of` de antes avanzaba solo, que era justo
  // el defecto. Aquí `i` sube donde se decide que suba.
  let i = 0;
  let esperas = 0;

  while (i < cola.length) {
    if (op.parado()) {
      resultado.interrumpido = true;
      return resultado;
    }

    const gameId = cola[i]!;

    if (op.hayPartida()) {
      if (esperas >= op.esperasMaximas) {
        // Se lleva esperando demasiado por este juego. Se aplaza y se sigue,
        // que es mejor que dejar la cola entera parada detrás de él.
        resultado.aplazados++;
        i++;
        esperas = 0;
        continue;
      }
      esperas++;
      await op.esperar(op.pausaOcupadoMs);
      // Sin `i++`: se vuelve a mirar **este** juego. Ahí estaba el fallo.
      continue;
    }

    esperas = 0;

    try {
      await op.calcular(gameId);
      resultado.hechos++;
      op.hecho?.(gameId);
    } catch (e) {
      resultado.fallidos++;
      op.fallo?.(gameId, e);
    }

    i++;

    // Nada de dormir después del último: la cola ya está hecha.
    if (i < cola.length) await op.esperar(op.pausaMs);
  }

  if (op.parado()) resultado.interrumpido = true;
  return resultado;
}
