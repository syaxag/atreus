import { traducir, type Clave, type Huecos } from '@shared/i18n';
import { getSettings } from './services/settings';

/**
 * El traductor del proceso principal.
 *
 * Casi todo lo que Atreus dice lo pinta el renderer, que tiene su propio hook.
 * Aquí queda lo que construye Electron y el renderer no puede tocar: el menú
 * de la bandeja. Lee el idioma de los ajustes cada vez, que es barato —están
 * cacheados en memoria— y evita tener que invalidar nada.
 */
export function t(clave: Clave, huecos?: Huecos): string {
  return traducir(getSettings().language, clave, huecos);
}
