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
  manual: 'Manual',
};
