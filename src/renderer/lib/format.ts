/** Formateo para la interfaz. Todo en español, sin librerías de fechas. */

export function bytes(value: number | null): string {
  if (value === null || value <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = value;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Epoch en segundos → "12 mar 2026, 18:04". */
export function dateTime(epochSeconds: number | null): string {
  if (!epochSeconds) return '—';
  return new Date(epochSeconds * 1000).toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Epoch en segundos → "hace 3 días". */
export function relative(epochSeconds: number | null): string {
  if (!epochSeconds) return 'nunca';
  const diff = Date.now() / 1000 - epochSeconds;
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'second'],
    [3600, 'minute'],
    [86400, 'hour'],
    [2592000, 'day'],
    [31536000, 'month'],
  ];
  const fmt = new Intl.RelativeTimeFormat('es-ES', { numeric: 'auto' });
  let prev = 1;
  for (const [limit, unit] of steps) {
    if (diff < limit) return fmt.format(-Math.round(diff / prev), unit);
    prev = limit;
  }
  return fmt.format(-Math.round(diff / 31536000), 'year');
}

export const PLATFORM_LABEL: Record<string, string> = {
  steam: 'Steam',
  epic: 'Epic',
  gog: 'GOG',
  xbox: 'Xbox',
  ea: 'EA App',
  battlenet: 'Battle.net',
  manual: 'Manual',
};

/** Minutos → "34 h 12 min". Para tiempos de juego, que se leen en horas. */
export function duration(minutes: number | null): string {
  if (minutes === null || minutes <= 0) return '—';
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) return `${rest} min`;
  if (hours >= 100 || rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

/** Horas decimales → "12,5 h". Para estimaciones, que no son exactas. */
export function hours(value: number | null): string {
  if (value === null || value < 0) return '—';
  if (value < 1) return `${Math.round(value * 60)} min`;
  if (value >= 100) return `${Math.round(value)} h`;
  return `${value.toFixed(1).replace('.', ',')} h`;
}

/**
 * Cuánto hace del primer logro: "llevas 2 años y 3 meses".
 *
 * Se dice en años y meses en vez de en días porque un platino largo se mide
 * así, y "hace 843 días" no le dice nada a nadie.
 */
export function span(epochSeconds: number | null): string {
  if (!epochSeconds) return '—';
  const days = Math.floor((Date.now() / 1000 - epochSeconds) / 86400);
  if (days < 1) return 'hoy';
  if (days < 31) return `${days} ${days === 1 ? 'día' : 'días'}`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return `${months} ${months === 1 ? 'mes' : 'meses'}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const yearPart = `${years} ${years === 1 ? 'año' : 'años'}`;
  return rest === 0 ? yearPart : `${yearPart} y ${rest} ${rest === 1 ? 'mes' : 'meses'}`;
}

/** 12.4 → "12,4 %". Los porcentajes de rareza van con coma en castellano. */
export function percent(value: number | null, decimals = 1): string {
  if (value === null) return '—';
  return `${value.toFixed(value < 1 ? 2 : decimals).replace('.', ',')} %`;
}

/** Etiqueta de rareza, la misma escala que usa el informe de platino. */
export function rarity(value: number | null): string {
  if (value === null) return 'Sin datos';
  if (value < 1) return 'Legendario';
  if (value < 5) return 'Ultra raro';
  if (value < 15) return 'Raro';
  if (value < 40) return 'Poco común';
  return 'Común';
}
