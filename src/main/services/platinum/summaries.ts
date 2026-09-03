import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { Achievement, GameId, PlatinumReport, PlatinumSummary } from '@shared/types';

/**
 * El resumen de la biblioteca: leerlo, escribirlo y recortarlo del informe.
 *
 * Va aparte **y sin tocar Electron** por el mismo motivo que `estimate.ts`: es
 * la parte que se puede probar con archivos de mentira en un directorio
 * temporal, y falta le hacía. El fallo que costó una tarde —los resúmenes
 * viviendo en la carpeta que Chromium limpia— era invisible para el typecheck
 * y para los tests porque ningún test tocaba disco.
 *
 * Aquí no se decide *dónde* está el archivo: eso lo pone quien llama. Así el
 * test le da un temporal y la aplicación le da el suyo.
 */

/** Un día desde la época, que es la unidad en la que se cuenta una racha. */
const DIA = 86_400;

/** Cuántos días de actividad se guardan. Una racha no mira más atrás. */
export const VENTANA_DIAS = 90;

/**
 * Con qué versión del cálculo se guardó un resumen.
 *
 * Sube cuando el resumen empieza a llevar algo que antes no llevaba. El
 * calentamiento recalcula lo que se quedó atrás, y por eso existe: sin esto,
 * la dificultad y el siguiente logro de la tarjeta solo aparecerían en los
 * juegos que volvieras a jugar, que es una función a medias disfrazada de
 * función entera.
 *
 * 2 — dificultad, siguiente logro, el más raro que tienes, último desbloqueo
 *     y días con actividad.
 */
export const SUMMARY_SCHEMA = 2;

export interface LecturaResumenes {
  resumenes: Record<GameId, PlatinumSummary>;
  /**
   * Qué pasó con un archivo que **existía** y no se pudo leer.
   *
   * Se devuelve en vez de registrarse aquí para que este módulo no dependa del
   * registro —y por tanto de Electron—, y para que un test pueda comprobarlo
   * sin leer una línea de log.
   */
  ilegible: { archivo: string; apartadoEn: string | null; error: string } | null;
}

/**
 * Lee los resúmenes guardados.
 *
 * Un archivo que no existe es lo normal la primera vez y no es noticia. Uno
 * que existe y no se puede leer **sí lo es**: antes se descartaba en silencio,
 * y con él todos los resúmenes de la biblioteca. Ahora se aparta como `.roto`
 * en vez de dejarlo a merced de la siguiente escritura, y quien llama decide
 * qué contar.
 */
export function leerResumenes(archivo: string): LecturaResumenes {
  try {
    const raw = JSON.parse(readFileSync(archivo, 'utf8')) as unknown;
    const leido = raw && typeof raw === 'object' ? (raw as Record<GameId, PlatinumSummary>) : {};
    return { resumenes: completar(leido), ilegible: null };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    if (!existsSync(archivo)) return { resumenes: {}, ilegible: null };

    const roto = `${archivo}.roto`;
    try {
      renameSync(archivo, roto);
      return { resumenes: {}, ilegible: { archivo, apartadoEn: roto, error } };
    } catch {
      return { resumenes: {}, ilegible: { archivo, apartadoEn: null, error } };
    }
  }
}

/**
 * Rellena lo que una versión anterior no guardaba.
 *
 * Se hace **al leer**, no al usar: si no, cada sitio que mire un resumen
 * tendría que acordarse de que ciertos campos pueden faltar, y el contrato
 * dice que no faltan.
 */
function completar(leido: Record<GameId, PlatinumSummary>): Record<GameId, PlatinumSummary> {
  return Object.fromEntries(Object.entries(leido).map(([id, resumen]) => [id, {
    ...resumen,
    difficulty: resumen.difficulty ?? null,
    next: resumen.next ?? null,
    rarest: resumen.rarest ?? null,
    lastUnlockAt: resumen.lastUnlockAt ?? null,
    unlockDays: resumen.unlockDays ?? [],
    schema: resumen.schema ?? 1,
  }]));
}

/**
 * Guarda todos los resúmenes de una vez, sin dejar el archivo a medias.
 *
 * Se escribe a un temporal y se renombra: si la aplicación se va justo en
 * medio —y en Windows se va cuando el usuario cierra la ventana— lo que queda
 * en disco es el archivo anterior entero, no medio JSON que no se puede leer.
 */
export function guardarResumenes(archivo: string, resumenes: Record<GameId, PlatinumSummary>): void {
  const temp = `${archivo}.tmp`;
  writeFileSync(temp, JSON.stringify(resumenes, null, 2), 'utf8');
  renameSync(temp, archivo);
}

/**
 * Recorta del informe lo que necesita la biblioteca.
 *
 * Los campos que no hacen falta para ordenar están a propósito: son con los
 * que la Colección, la Portada y el Perfil **deciden**, y salen gratis porque
 * el informe ya los tenía calculados.
 */
export function resumenDe(report: PlatinumReport, unlocked: Achievement[]): PlatinumSummary {
  return {
    gameId: report.gameId,
    unlocked: report.unlocked,
    total: report.total,
    percent: report.percent,
    complete: report.complete,
    playtimeMinutes: report.playtimeMinutes,
    tracking: report.tracking,
    difficulty: report.difficulty
      ? { score: report.difficulty.score, tier: report.difficulty.tier }
      : null,
    // El primero de `remaining` es el más común de los que faltan, que es por
    // donde conviene seguir. Lo mismo que enseña la ficha.
    next: report.remaining[0]
      ? {
        name: report.remaining[0].displayName,
        hidden: report.remaining[0].hidden,
        percent: report.remaining[0].globalPercent,
      }
      : null,
    rarest: masRaro(unlocked),
    lastUnlockAt: report.lastUnlockAt,
    unlockDays: diasRecientes(unlocked),
    schema: SUMMARY_SCHEMA,
    updatedAt: report.updatedAt,
  };
}

/**
 * El logro más raro que **ya tienes** en este juego.
 *
 * Mira los conseguidos, no los que faltan: es la vitrina, no la lista de la
 * compra. Sin rareza publicada no hay vitrina que enseñar.
 */
function masRaro(unlocked: Achievement[]): { name: string; percent: number } | null {
  let mejor: Achievement | null = null;
  for (const item of unlocked) {
    if (item.globalPercent === null) continue;
    if (!mejor || item.globalPercent < mejor.globalPercent!) mejor = item;
  }
  return mejor ? { name: mejor.displayName, percent: mejor.globalPercent! } : null;
}

/** Los días con algún desbloqueo dentro de la ventana, sin repetir y en orden. */
function diasRecientes(unlocked: Achievement[]): number[] {
  const desde = Math.floor(Date.now() / 1000 / DIA) - VENTANA_DIAS;
  const dias = new Set<number>();
  for (const item of unlocked) {
    if (!item.unlockTime || item.unlockTime <= 0) continue;
    const dia = Math.floor(item.unlockTime / DIA);
    if (dia >= desde) dias.add(dia);
  }
  return [...dias].sort((a, b) => a - b);
}
