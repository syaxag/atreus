import type {
  DifficultyTier, Notice, Platform, PlatinumDifficulty, PlatinumEstimate, SourceRef,
} from '@shared/types';
import type { Clave, Huecos } from '@shared/i18n';
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

/** El nombre legible de una fuente de datos. */
export function nombreFuente(t: Traductor, fuente: SourceRef): string {
  switch (fuente.id) {
    case 'none': return t('fuente.ninguna');
    case 'steam-client': return t('fuente.steamCliente');
    case 'steam-webapi': return t('fuente.steamWebapi');
    case 'steam-catalog': return t('fuente.steamCatalogo', { appId: fuente.appId });
    case 'xbox-openxbl': return t('fuente.xbox');
    case 'steam-rarity': return t('fuente.steamRareza');
    case 'steam-playtime': return t('fuente.steamHoras');
    case 'atreus-sessions': return t('fuente.sesiones');
  }
}

/** Cómo se llama una plataforma dentro de una frase. */
const PLATAFORMA: Record<Platform, Clave> = {
  steam: 'plat.steam',
  epic: 'plat.epic',
  gog: 'plat.gog',
  xbox: 'plat.xbox',
  ea: 'plat.ea',
  battlenet: 'plat.battlenet',
  manual: 'plat.manual',
};

/**
 * Por qué el progreso es como es.
 *
 * `definition` es la única que devuelve texto tal cual: lo escribió quien hizo
 * la ficha de ese juego, y Atreus no traduce lo que encuentra.
 */
export function explicarNota(t: Traductor, nota: Notice): string {
  switch (nota.kind) {
    case 'definition': return nota.text;
    case 'noAchievements': return t('nota.sinLogros');
    case 'noWrite': return t('nota.noEscribible');
    case 'xboxReadOnly': return t('nota.xboxSoloLectura');
    case 'steamClosed': return t('nota.steamCerrado');
    case 'noList': return t('nota.sinLista');
    case 'noRarity': return t('nota.sinRareza');
    case 'unreadable':
      return nota.detail
        ? t('nota.ilegibleDetalle', { detalle: nota.detail })
        : t('nota.ilegible');
    case 'notOnSteam':
      return t('nota.noEnSteam', {
        juego: nota.game, plataforma: t(PLATAFORMA[nota.platform]),
      });
    case 'manual': {
      const base = t('nota.manual', { plataforma: t(PLATAFORMA[nota.platform]) });
      // En Xbox hay salida —una clave de OpenXBL— y merece decirse aquí, que
      // es donde el usuario se está encontrando el problema.
      return nota.platform === 'xbox' ? base + t('nota.manualXbox') : base;
    }
    case 'manualSteamFailed':
      return nota.detail
        ? t('nota.steamFalloDetalle', { detalle: nota.detail })
        : t('nota.steamFallo');
  }
}
