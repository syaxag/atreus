/** Une clases condicionales. Sustituto mínimo de clsx, sin dependencia. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
