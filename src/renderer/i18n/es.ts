/**
 * Castellano. **Este archivo manda**: sus claves definen el contrato.
 *
 * Los demás idiomas se declaran como `Record<Clave, string>` sobre estas, así
 * que una cadena sin traducir no compila. Es el mismo truco que impide que un
 * evento del contrato IPC se quede a medias.
 *
 * Las claves van por superficie —`barra.`, `lateral.`, `ajustes.`— y describen
 * *dónde* está el texto, no lo que dice: si el texto cambia, la clave sigue
 * valiendo. Los huecos se escriben `{asi}` y se rellenan al traducir.
 */
export const es = {
  // ── Barra de título ──
  'barra.minimizar': 'Minimizar',
  'barra.maximizar': 'Maximizar',
  'barra.cerrar': 'Cerrar',
  'barra.datosPrueba': 'datos de prueba',

  // ── Barra lateral ──
  'lateral.platino': 'platino',
  'lateral.platinos': 'platinos',
  'lateral.enCurso': '{n} en curso',
  'lateral.nadaEmpezado': 'nada empezado',
  'lateral.irColeccion': 'Ir a tu colección',
  'lateral.coleccion': 'Colección',
  'lateral.actividad': 'Actividad',
  'lateral.trofeos': 'Trofeos',
  'lateral.trofeosPista': 'logros, rareza e historial',
  'lateral.rutas': 'Rutas',
  'lateral.rutasPista': 'guías con su texto completo',
  'lateral.atlas': 'Atlas',
  'lateral.atlasPista': 'mapas interactivos',
  'lateral.taller': 'Taller',
  'lateral.tallerPista': 'instalar y ordenar mods',
  'lateral.grupoConJuego': 'Sobre este juego',
  'lateral.grupoSinJuego': 'Necesitan un juego',
  'lateral.sinJuego': 'Cuando tengas un juego elegido, aquí estarán sus trofeos, sus rutas, sus mapas y su taller.',
  'lateral.irAColeccion': 'Ir a la Colección',
  'lateral.abrirFicha': 'Abrir la ficha de {juego}',
  'lateral.platinoConseguido': 'Platino conseguido',
  'lateral.trofeosDe': '{hechos}/{total} trofeos',
  'lateral.progresoDe': '{juego}: {hechos} de {total} trofeos',
  'lateral.ajustes': 'Ajustes',
  'lateral.ajustesPista': 'Carpetas, claves, catálogo y actualizaciones',
  'lateral.version': 'Versión instalada',

  // ── Ajustes: idioma ──
  'ajustes.idioma': 'Idioma',
  'ajustes.idiomaPista': 'Cambia la interfaz de Atreus. Las guías y los mapas siguen en el idioma en que estén escritos.',
  'ajustes.idiomaEs': 'Español',
  'ajustes.idiomaEn': 'English',
} as const;

/** Toda clave válida de traducción. La define el castellano. */
export type Clave = keyof typeof es;
