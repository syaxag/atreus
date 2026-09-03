/**
 * Formateo para la interfaz. Sin librerías de fechas.
 *
 * La configuración regional vive aquí en una variable de módulo en vez de
 * pasarse por parámetro: estas funciones se llaman desde cuarenta sitios y
 * enhebrar el idioma por todos ellos habría sido ruido en cada firma. La fija
 * `configurarLocale()` cuando cambian los ajustes, y `Intl` hace el resto.
 *
 * Se enteró de que hacía falta al traducir la ficha: con la interfaz en inglés
 * seguía diciendo "hace 34 minutos" y "7,6 h".
 */

let locale = 'es-ES';

/**
 * Las palabras de `span()`.
 *
 * `Intl` no cubre "2 años y 3 meses": esa frase se compone a mano, así que las
 * palabras tienen que entrar de fuera. Vienen del mismo diccionario que el
 * resto de la interfaz, inyectadas al fijar el idioma, para no tener dos sitios
 * donde traducir "meses".
 */
export interface Unidades {
  hoy: string; dia: string; dias: string;
  mes: string; meses: string;
  anio: string; anios: string; y: string;
}

let unidades: Unidades = {
  hoy: 'hoy', dia: 'día', dias: 'días',
  mes: 'mes', meses: 'meses',
  anio: 'año', anios: 'años', y: 'y',
};

/** La llama el renderer al arrancar y cada vez que cambia el idioma. */
export function configurarLocale(siguiente: string, palabras?: Unidades): void {
  locale = siguiente;
  if (palabras) unidades = palabras;
}

/** El separador decimal del idioma activo: coma en castellano, punto en inglés. */
function conDecimales(valor: number, decimales: number): string {
  return valor.toLocaleString(locale, {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

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
  return new Date(epochSeconds * 1000).toLocaleString(locale, {
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
  const fmt = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
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
  return `${conDecimales(value, 1)} h`;
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
  if (days < 1) return unidades.hoy;
  if (days < 31) return `${days} ${days === 1 ? unidades.dia : unidades.dias}`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return `${months} ${months === 1 ? unidades.mes : unidades.meses}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const yearPart = `${years} ${years === 1 ? unidades.anio : unidades.anios}`;
  return rest === 0
    ? yearPart
    : `${yearPart} ${unidades.y} ${rest} ${rest === 1 ? unidades.mes : unidades.meses}`;
}

/** 12.4 → "12,4 %". Los porcentajes de rareza van con coma en castellano. */
export function percent(value: number | null, decimals = 1): string {
  if (value === null) return '—';
  return `${conDecimales(value, value < 1 ? 2 : decimals)} %`;
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

/**
 * Color de la rareza, en la misma escala que `rarity()`.
 *
 * Devuelve el token, no el color: el componente lo mete en `var(...)`. Es la
 * única escala de color de la aplicación y codifica un dato ordinal, no un
 * gusto — ver la nota de theme.css.
 */
export function rarityToken(value: number | null): string {
  if (value === null) return '--text-faint';
  if (value < 1) return '--rare-legendario';
  if (value < 5) return '--rare-ultra';
  if (value < 15) return '--rare-raro';
  if (value < 40) return '--rare-poco';
  return '--rare-comun';
}
