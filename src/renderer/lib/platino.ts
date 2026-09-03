import type { DifficultyTier, PlatinumDifficulty, PlatinumEstimate } from '@shared/types';
import type { Clave, Huecos } from '@/i18n/traducir';
import { hours, numero, percent } from '@/lib/format';

/**
 * La prosa del informe de platino.
 *
 * El proceso principal manda los números y aquí se arma la frase, porque el
 * renderer es el único que sabe en qué idioma está la interfaz. Antes venía
 * redactada del backend y se quedaba en castellano dijera lo que dijera
 * Ajustes: *Exigente* seguía siendo *Exigente* con la aplicación en inglés.
 *
 * De paso, los números salen ya con la configuración regional puesta: la
 * explicación de la dificultad decía "0,30 %" incluso en inglés, porque la
 * coma se la ponía el backend a mano.
 */

type Traductor = (clave: Clave, huecos?: Huecos) => string;

/** La palabra de cada tramo de dificultad. */
export const DIFICULTAD: Record<DifficultyTier, Clave> = {
  veryEasy: 'ficha.difMuyAsequible',
  easy: 'ficha.difAsequible',
  demanding: 'ficha.difExigente',
  hard: 'ficha.difDificil',
  brutal: 'ficha.difBrutal',
};

/** De qué depende la dificultad: el peor logro, cuántos hay así, y qué se sabe. */
export function explicarDificultad(t: Traductor, dificultad: PlatinumDifficulty): string {
  const partes = [t('ficha.masRaroLoTiene', { porcentaje: percent(dificultad.rarestPercent) })];
  if (dificultad.ultraRare > 0) {
    partes.push(t(
      dificultad.ultraRare === 1 ? 'ficha.bajoElCincoUno' : 'ficha.bajoElCinco',
      { n: dificultad.ultraRare },
    ));
  }
  if (dificultad.knownPercents < dificultad.total) {
    partes.push(t('ficha.rarezaParcial', {
      conocidos: dificultad.knownPercents, total: dificultad.total,
    }));
  }
  return partes.join(' ');
}

/** De dónde sale la estimación de horas, según con qué se haya podido calcular. */
export function explicarEstimacion(t: Traductor, estimacion: PlatinumEstimate): string {
  const motivo = estimacion.reason;
  switch (motivo.kind) {
    case 'done':
      return t('ficha.yaEstanTodos');
    case 'measured':
      return t('ficha.conTusHoras', {
        horas: hours(motivo.playedHours),
        hechos: motivo.unlocked,
        total: motivo.total,
        veces: numero(motivo.costRatio),
      });
    case 'projected':
      return t('ficha.hasJugadoPoco', { horas: hours(motivo.playedHours) });
    case 'community':
      return motivo.tier
        ? t('ficha.estimacionGeneralCon', {
          dificultad: t(DIFICULTAD[motivo.tier]).toLocaleLowerCase(),
        })
        : t('ficha.estimacionGeneral');
  }
}
