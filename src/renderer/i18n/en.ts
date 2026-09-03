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

  // ── Collection ──
  'col.titulo': 'Collection',
  'col.resumen': '{n} games',
  'col.resumenPlatinos': '{n} games · {platinos} platinums · {curso} in progress',
  'col.resumenUnPlatino': '{n} games · 1 platinum · {curso} in progress',
  'col.calculando': '{n} games · working out your progress…',
  'col.anadirExe': 'Add .exe',
  'col.escanear': 'Scan',
  'col.escaneando': 'Scanning…',
  'col.buscar': 'Search your collection…',
  'col.todos': 'All',
  'col.enCurso': 'In progress',
  'col.completos': 'At 100%',
  'col.sinEmpezar': 'Not started',
  'col.favoritos': 'Favourites',
  'col.soloUnJugador': 'Single-player',
  'col.conGuia': 'With readable guide',
  'col.conMapa': 'With map',
  'col.conMods': 'With mods',
  'col.filtroEnLinea': 'Checks online what each game in your collection has',
  'col.ordenarPor': 'Sort by',
  'col.ordenProgreso': 'Closest to platinum',
  'col.ordenJugado': 'Most played',
  'col.ordenNombre': 'Name',
  'col.comprobando': 'Checking guides, maps and mods for {n} games. The first run takes a while; after that the result is reused for ten minutes.',
  'col.comprobado': 'Content checked {cuando}.',
  'col.sinCoincidencias': 'No game matches',
  'col.sinCoincidenciasPista': 'Try another term or change the filter.',
  'col.bienvenidaTitulo': 'Start your first road to platinum',
  'col.bienvenidaPista': 'Atreus sets up your collection in three steps, with no accounts and no passwords.',
  'col.paso1': 'Find your library',
  'col.paso1Pista': 'Looks for games from Steam, Epic, GOG and Xbox.',
  'col.paso2': 'Pick a game',
  'col.paso2Pista': 'Atreus works out your progress and what is left.',
  'col.paso3': 'Follow your route',
  'col.paso3Pista': 'Open guides, maps and your next achievements from its page.',
  'col.escanearAhora': '1. Scan library',
  'col.buscandoJuegos': 'Looking for games…',
  'col.despuesAjustes': 'You can change folders and sources later in Settings.',
  'col.abrirFicha': 'Open {juego}',
  'col.marcarFavorito': 'Add to favourites',
  'col.quitarFavorito': 'Remove from favourites',
  'col.lanzar': 'Launch {juego}',
  'col.verCelebracion': 'Replay the platinum celebration for {juego}',
  'col.verCelebracionCorto': 'Replay the celebration',
  'col.platino': 'Platinum',
  'col.multijugador': 'Multiplayer',

  // ── Settings: language ──
  'ajustes.idioma': 'Language',
  'ajustes.idiomaPista': "Changes Atreus's interface. Guides and maps stay in whatever language they were written in.",
  'ajustes.idiomaEs': 'Español',
  'ajustes.idiomaEn': 'English',
};
