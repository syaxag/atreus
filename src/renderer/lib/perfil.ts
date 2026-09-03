import type { PlatinumSummary } from '@shared/types';

/**
 * Las cuentas del Perfil y de la Portada.
 *
 * Vivían dentro de sus vistas, y ahí no se pueden probar: un `.tsx` no se
 * puede importar desde los tests sin meter un transformador de JSX y un DOM
 * de mentira, y el proyecto tiene cuatro dependencias en total. Sacadas aquí
 * son funciones puras sobre una lista de resúmenes, que es lo que de verdad
 * tenía casos límite —la racha, sobre todo— y lo que ya falló una vez.
 */

/** Un día desde la época: la unidad en la que se cuenta una racha. */
const DIA = 86_400;

/**
 * La ventana que el Perfil dice contar.
 *
 * El backend guarda los últimos noventa días *en el momento de calcular*
 * (`services/platinum/summaries.ts`), así que un juego que no se recalcula
 * desde hace meses arrastra días que ya no caben en la frase. Se recorta aquí,
 * que es donde está escrita.
 */
export const VENTANA_DIAS = 90;

/** Empezado y sin terminar: lo único que tiene un paso siguiente. */
export function empezado(summary: PlatinumSummary | undefined): boolean {
  return !!summary && summary.total > 0 && summary.unlocked > 0 && !summary.complete;
}

export interface Cuenta {
  hechos: number;
  total: number;
  minutos: number;
  conHoras: number;
  platinos: number;
  enCurso: number;
  conLogros: number;
  media: number;
}

/** Las sumas de toda la biblioteca, de una pasada. */
export function sumar(resumenes: PlatinumSummary[]): Cuenta {
  let hechos = 0;
  let total = 0;
  let minutos = 0;
  let conHoras = 0;
  let platinos = 0;
  let enCurso = 0;
  for (const s of resumenes) {
    hechos += s.unlocked;
    total += s.total;
    if (s.playtimeMinutes) { minutos += s.playtimeMinutes; conHoras += 1; }
    if (s.complete) platinos += 1;
    else if (s.unlocked > 0) enCurso += 1;
  }
  return {
    hechos, total, minutos, conHoras, platinos, enCurso,
    conLogros: resumenes.length,
    media: total > 0 ? (hechos / total) * 100 : 0,
  };
}

/**
 * Lo empezado y sin terminar, contado aparte.
 *
 * El bloque que habla de ello enseñaba la media global y los logros que faltan
 * en toda la biblioteca: dos números de un conjunto distinto del que nombraba
 * el título. Una barra al 64 % debajo de "ocho juegos a medias" no dice nada
 * de esos ocho.
 */
export function sumarEnCurso(resumenes: PlatinumSummary[]): {
  juegos: number; faltan: number; media: number;
} {
  let hechos = 0;
  let total = 0;
  let juegos = 0;
  for (const s of resumenes) {
    if (!empezado(s)) continue;
    hechos += s.unlocked;
    total += s.total;
    juegos += 1;
  }
  return { juegos, faltan: total - hechos, media: total > 0 ? (hechos / total) * 100 : 0 };
}

/**
 * La racha: días seguidos con al menos un logro, contando hacia atrás.
 *
 * Ayer vale como punto de partida además de hoy. Sin eso la racha se rompería
 * cada medianoche y volvería a existir al conseguir el primer logro del día,
 * que es contar el reloj en vez de contar lo que haces.
 *
 * `ahora` entra por parámetro para que se pueda probar sin esperar a mañana.
 */
export function contarRacha(
  resumenes: PlatinumSummary[],
  ahora: number = Date.now(),
): { actual: number; dias: number } {
  const hoy = Math.floor(ahora / 1000 / DIA);
  const desde = hoy - VENTANA_DIAS;
  const dias = new Set<number>();
  for (const s of resumenes) for (const dia of s.unlockDays) if (dia >= desde) dias.add(dia);
  if (dias.size === 0) return { actual: 0, dias: 0 };

  let cursor = dias.has(hoy) ? hoy : hoy - 1;
  let actual = 0;
  while (dias.has(cursor)) { actual += 1; cursor -= 1; }
  return { actual, dias: dias.size };
}
