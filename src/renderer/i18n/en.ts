import type { Clave } from './es';

/**
 * English.
 *
 * Está tipado como `Record<Clave, string>` a propósito: **si falta una clave,
 * no compila**. Es lo que evita que un idioma se quede a medias sin que nadie
 * se entere hasta que un usuario ve media pantalla en castellano.
 *
 * Los nombres de las secciones se traducen por lo que significan, no por lo que
 * suenan: "Rutas" son las guías que se siguen hacia un platino, así que
 * *Routes* diría poco y *Guides* dice lo que hay. "Taller" es donde se le mete
 * mano al juego, que en inglés es *Workshop*. "Colección" sí se queda en
 * *Collection*, porque es lo que tiene un coleccionista y esa es la idea.
 */
export const en: Record<Clave, string> = {
  // ── Title bar ──
  'barra.minimizar': 'Minimise',
  'barra.maximizar': 'Maximise',
  'barra.cerrar': 'Close',
  'barra.datosPrueba': 'sample data',

  // ── Sidebar ──
  'lateral.platino': 'platinum',
  'lateral.platinos': 'platinums',
  'lateral.enCurso': '{n} in progress',
  'lateral.nadaEmpezado': 'nothing started',
  'lateral.irColeccion': 'Go to your collection',
  'lateral.coleccion': 'Collection',
  'lateral.actividad': 'Activity',
  'lateral.trofeos': 'Trophies',
  'lateral.trofeosPista': 'achievements, rarity and history',
  'lateral.rutas': 'Guides',
  'lateral.rutasPista': 'full text, read in here',
  'lateral.atlas': 'Atlas',
  'lateral.atlasPista': 'interactive maps',
  'lateral.taller': 'Workshop',
  'lateral.tallerPista': 'install and order mods',
  'lateral.grupoConJuego': 'About this game',
  'lateral.grupoSinJuego': 'Need a game',
  'lateral.sinJuego': 'Once you pick a game, its trophies, guides, maps and workshop will show up here.',
  'lateral.irAColeccion': 'Go to the Collection',
  'lateral.abrirFicha': 'Open {juego}',
  'lateral.platinoConseguido': 'Platinum earned',
  'lateral.trofeosDe': '{hechos}/{total} trophies',
  'lateral.progresoDe': '{juego}: {hechos} of {total} trophies',
  'lateral.ajustes': 'Settings',
  'lateral.ajustesPista': 'Folders, keys, catalogue and updates',
  'lateral.version': 'Installed version',

  // ── Settings: language ──
  'ajustes.idioma': 'Language',
  'ajustes.idiomaPista': "Changes Atreus's interface. Guides and maps stay in whatever language they were written in.",
  'ajustes.idiomaEs': 'Español',
  'ajustes.idiomaEn': 'English',
};
