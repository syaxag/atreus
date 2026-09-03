import type { GuideSource, InteractiveMap, MapBlurb, MapLabel } from '@shared/types';
import type { Clave, Huecos } from '@shared/i18n';

/**
 * Cómo se llama lo que Atreus encuentra fuera.
 *
 * La línea es la de siempre: **el contenido no se traduce, la etiqueta sí**.
 * El título de una guía de Steam se queda como lo escribió su autor; que sea
 * "una guía de la comunidad de Steam" lo dice Atreus, y lo dice en el idioma
 * que hayas elegido. Lo mismo con un mapa: el nombre de la página de la wiki
 * viene de fuera, y "mapa interactivo" lo ponemos nosotros.
 */

type Traductor = (clave: Clave, huecos?: Huecos) => string;

/** El nombre de la fuente de una guía. */
export function nombreGuia(t: Traductor, fuente: GuideSource): string {
  switch (fuente.kind) {
    case 'steam': return t('rutas.fuenteSteam');
    case 'wiki': return t('rutas.fuenteWiki', { sitio: fuente.site });
    case 'web': return fuente.domain;
  }
}

/** El título de un mapa. */
export function tituloMapa(t: Traductor, etiqueta: MapLabel): string {
  switch (etiqueta.kind) {
    case 'catalog': return etiqueta.title;
    case 'mapgenie': return t('atlas.mapaDe', { juego: etiqueta.game });
    case 'page': return t('atlas.paginaDe', { juego: etiqueta.game, pagina: etiqueta.page });
  }
}

/** Qué se dice de un mapa debajo de su nombre. */
export function textoMapa(t: Traductor, resumen: MapBlurb): string {
  switch (resumen.kind) {
    case 'text': return resumen.text;
    case 'mapgenie': return t('atlas.blurbMapgenie');
    case 'fandom': return t('atlas.blurbFandom');
    case 'wikiPage': return t('atlas.blurbWiki');
  }
}

/** De dónde sale un mapa; los del catálogo no tienen sitio del que venir. */
export function proveedorMapa(t: Traductor, mapa: InteractiveMap): string {
  return mapa.provider ?? t('atlas.provCatalogo');
}
