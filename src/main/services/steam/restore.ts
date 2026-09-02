import type { Achievement, AchievementPatch, GameStat, StatPatch, SteamSnapshot } from '@shared/types';

/**
 * Calcula qué hay que escribir en Steam para volver a una copia.
 *
 * Solo se envía lo que difiere del estado actual: escribir 547 logros para
 * cambiar tres es lento y hace que "restaurados N valores" no diga nada. Los
 * logros protegidos por el servidor y las estadísticas de solo incremento no
 * se pueden retroceder, así que se dejan fuera aunque difieran.
 */
export interface RestorePlan {
  achievements: AchievementPatch[];
  stats: StatPatch[];
  /** Diferencias que Steam no permite revertir. */
  skipped: string[];
}

export function planRestore(
  snapshot: Pick<SteamSnapshot, 'achievements' | 'stats'>,
  current: { achievements: Achievement[]; stats: GameStat[] },
): RestorePlan {
  const plan: RestorePlan = { achievements: [], stats: [], skipped: [] };

  const currentAch = new Map(current.achievements.map((a) => [a.apiName, a]));
  for (const wanted of snapshot.achievements) {
    const now = currentAch.get(wanted.apiName);
    if (!now || now.unlocked === wanted.unlocked) continue;
    if (now.protected) { plan.skipped.push(wanted.apiName); continue; }
    plan.achievements.push({ apiName: wanted.apiName, unlocked: wanted.unlocked });
  }

  const currentStats = new Map(current.stats.map((s) => [s.apiName, s]));
  for (const wanted of snapshot.stats) {
    const now = currentStats.get(wanted.apiName);
    if (!now || now.value === wanted.value) continue;
    if (now.incrementOnly && wanted.value < now.value) { plan.skipped.push(wanted.apiName); continue; }
    plan.stats.push({ apiName: wanted.apiName, value: wanted.value });
  }

  return plan;
}
