import type { PlatinumDifficulty, PlatinumEstimate } from '@shared/types';

/**
 * La aritmética del platino, sin tocar red ni disco.
 *
 * Va aparte para poder probarla con números a mano: es la parte de la
 * aplicación que más fácil miente si nadie la vigila, porque un número puesto
 * en pantalla parece un hecho aunque sea una corazonada.
 */

/**
 * Cuánto "cuesta" un logro según lo raro que sea.
 *
 * No es una hora ni un minuto: es un peso relativo. Un logro que tiene el 60 %
 * de la gente vale 1; uno que tiene el 0,5 % vale casi cinco veces más. Los
 * tramos salen de cómo Steam reparte la rareza en la práctica, no de una
 * fórmula elegante, porque la distribución real no es continua.
 */
export function weightOf(percent: number | null): number {
  if (percent === null) return 1.5; // sin dato: ni fácil ni difícil
  if (percent >= 50) return 1;
  if (percent >= 25) return 1.3;
  if (percent >= 10) return 1.9;
  if (percent >= 5) return 2.6;
  if (percent >= 1) return 3.6;
  return 5;
}

export interface DifficultyInput {
  total: number;
  /** Porcentaje global de cada logro del juego; null donde no se conoce. */
  percents: (number | null)[];
}

const LABELS: [number, string][] = [
  [2, 'Muy asequible'],
  [4, 'Asequible'],
  [6, 'Exigente'],
  [8, 'Difícil'],
  [10, 'Brutal'],
];

export function difficultyOf(input: DifficultyInput): PlatinumDifficulty | null {
  const known = input.percents.filter((p): p is number => p !== null);
  if (known.length === 0 || input.total === 0) return null;

  const rarest = Math.min(...known);
  const ultraRare = known.filter((p) => p < 5).length;

  // El logro más raro marca el suelo: un platino es tan duro como su peor paso.
  let score =
    rarest >= 40 ? 2
      : rarest >= 20 ? 3
        : rarest >= 10 ? 4
          : rarest >= 5 ? 5
            : rarest >= 2 ? 6
              : rarest >= 1 ? 7
                : rarest >= 0.5 ? 8
                  : rarest >= 0.2 ? 9
                    : 10;

  // Un solo logro imposible es un obstáculo; diez son una campaña entera.
  if (ultraRare >= 10) score += 1;
  else if (ultraRare >= 4) score += 0.5;
  // Una lista corta y común se hace en una tarde, por muy raro que sea el peor.
  if (input.total <= 12 && rarest >= 15) score -= 1;

  score = Math.max(1, Math.min(10, Math.round(score * 2) / 2));
  const label = LABELS.find(([max]) => score <= max)?.[1] ?? 'Brutal';

  const parts = [`El logro más raro lo tiene el ${format(rarest)} % de los jugadores.`];
  if (ultraRare > 0) {
    parts.push(`${ultraRare} ${ultraRare === 1 ? 'logro está' : 'logros están'} por debajo del 5 %.`);
  }
  if (known.length < input.total) {
    parts.push(`Steam solo publica la rareza de ${known.length} de los ${input.total}.`);
  }

  return { score, label, rarestPercent: rarest, ultraRare, explanation: parts.join(' ') };
}

export interface EstimateInput {
  unlocked: number;
  total: number;
  /** Minutos jugados según la plataforma; null si no se saben. */
  playtimeMinutes: number | null;
  /** Rareza de los logros ya conseguidos. */
  unlockedPercents: (number | null)[];
  /** Rareza de los que faltan. */
  remainingPercents: (number | null)[];
  /** Dificultad ya calculada, para el caso en que no haya horas jugadas. */
  difficulty: PlatinumDifficulty | null;
}

/** Horas medias por logro cuando no hay nada tuyo con lo que medir. */
const COMMUNITY_HOURS_PER_WEIGHT = 0.55;

export function estimateOf(input: EstimateInput): PlatinumEstimate | null {
  const { unlocked, total, playtimeMinutes } = input;
  if (total === 0) return null;

  const remainingCount = total - unlocked;
  const remainingWeight = input.remainingPercents.reduce<number>((sum, p) => sum + weightOf(p), 0);
  const unlockedWeight = input.unlockedPercents.reduce<number>((sum, p) => sum + weightOf(p), 0);
  const playedHours = playtimeMinutes === null ? null : playtimeMinutes / 60;

  if (remainingCount === 0) {
    return {
      totalHours: round(playedHours ?? 0),
      remainingHours: 0,
      basis: playedHours === null ? 'community' : 'measured',
      confidence: 'high',
      explanation: 'Ya están todos los logros. Esto es el tiempo que te ha costado.',
    };
  }

  // Camino bueno: tus horas y tus propios logros dicen cuánto te cuesta a ti.
  if (playedHours !== null && playedHours >= 0.5 && unlocked >= 3 && unlockedWeight > 0) {
    const hoursPerWeight = playedHours / unlockedWeight;
    const remainingHours = hoursPerWeight * remainingWeight;
    const solid = unlocked >= 10 && playedHours >= 2;
    return {
      totalHours: round(playedHours + remainingHours),
      remainingHours: round(remainingHours),
      basis: 'measured',
      confidence: solid ? 'high' : 'medium',
      explanation:
        `Con tus ${round(playedHours)} h llevas ${unlocked} de ${total} logros. ` +
        `Lo que falta es ${round(remainingWeight / Math.max(unlockedWeight, 0.001), 2)} veces más ` +
        'costoso que lo ya hecho, según la rareza de cada logro.',
    };
  }

  // Has jugado poco: se usa el ritmo de la comunidad y solo se suma lo tuyo.
  if (playedHours !== null && playedHours > 0) {
    const remainingHours = remainingWeight * COMMUNITY_HOURS_PER_WEIGHT;
    return {
      totalHours: round(playedHours + remainingHours),
      remainingHours: round(remainingHours),
      basis: 'projected',
      confidence: 'low',
      explanation:
        `Aún has jugado poco (${round(playedHours)} h), así que la estimación sale de la ` +
        'rareza de los logros que te faltan, no de tu ritmo.',
    };
  }

  // Ni horas ni logros: solo se puede hablar del juego, no de ti.
  const totalWeight = remainingWeight + unlockedWeight;
  const totalHours = totalWeight * COMMUNITY_HOURS_PER_WEIGHT;
  return {
    totalHours: round(totalHours),
    remainingHours: round(remainingWeight * COMMUNITY_HOURS_PER_WEIGHT),
    basis: 'community',
    confidence: 'low',
    explanation:
      input.difficulty
        ? `Estimación general del juego (${input.difficulty.label.toLowerCase()}); ` +
          'se afinará en cuanto Atreus vea horas jugadas tuyas.'
        : 'Estimación general del juego; se afinará en cuanto haya horas jugadas tuyas.',
  };
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function format(value: number): string {
  return value < 1 ? value.toFixed(2).replace('.', ',') : value.toFixed(1).replace('.', ',');
}
