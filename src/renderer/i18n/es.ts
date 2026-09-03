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

  // ── Colección ──
  'col.titulo': 'Colección',
  'col.resumen': '{n} juegos',
  'col.resumenPlatinos': '{n} juegos · {platinos} platinos · {curso} en curso',
  'col.resumenUnPlatino': '{n} juegos · 1 platino · {curso} en curso',
  'col.calculando': '{n} juegos · calculando su progreso…',
  'col.anadirExe': 'Añadir .exe',
  'col.escanear': 'Escanear',
  'col.escaneando': 'Escaneando…',
  'col.buscar': 'Buscar en tu colección…',
  'col.todos': 'Todos',
  'col.enCurso': 'En curso',
  'col.completos': 'Al 100 %',
  'col.sinEmpezar': 'Sin empezar',
  'col.favoritos': 'Favoritos',
  'col.soloUnJugador': 'Solo',
  'col.conGuia': 'Con guía legible',
  'col.conMapa': 'Con mapa',
  'col.conMods': 'Con mods',
  'col.filtroEnLinea': 'Comprueba en línea qué tiene cada juego de tu colección',
  'col.ordenarPor': 'Ordenar por',
  'col.ordenProgreso': 'Más cerca del platino',
  'col.ordenJugado': 'Más jugados',
  'col.ordenNombre': 'Nombre',
  'col.comprobando': 'Comprobando guías, mapas y mods de {n} juegos. La primera vez tarda; después el resultado se reutiliza durante diez minutos.',
  'col.comprobado': 'Contenido comprobado {cuando}.',
  'col.sinCoincidencias': 'Ningún juego coincide',
  'col.sinCoincidenciasPista': 'Prueba con otro término o cambia el filtro.',
  'col.bienvenidaTitulo': 'Empieza tu primera ruta al platino',
  'col.bienvenidaPista': 'Atreus prepara tu colección en tres pasos, sin pedirte cuentas ni contraseñas.',
  'col.paso1': 'Detecta tu biblioteca',
  'col.paso1Pista': 'Busca juegos de Steam, Epic, GOG y Xbox.',
  'col.paso2': 'Elige un juego',
  'col.paso2Pista': 'Atreus calcula tu progreso y lo que te falta.',
  'col.paso3': 'Sigue tu ruta',
  'col.paso3Pista': 'Abre guías, mapas y tus próximos logros desde su ficha.',
  'col.escanearAhora': '1. Escanear biblioteca',
  'col.buscandoJuegos': 'Buscando juegos…',
  'col.despuesAjustes': 'Puedes cambiar carpetas y fuentes después en Ajustes.',
  'col.abrirFicha': 'Abrir ficha de {juego}',
  'col.marcarFavorito': 'Marcar favorito',
  'col.quitarFavorito': 'Quitar de favoritos',
  'col.lanzar': 'Lanzar {juego}',
  'col.verCelebracion': 'Ver la celebración del platino de {juego}',
  'col.verCelebracionCorto': 'Ver la celebración',
  'col.platino': 'Platino',
  'col.multijugador': 'Multijugador',

  // ── Ajustes: idioma ──
  'ajustes.idioma': 'Idioma',
  'ajustes.idiomaPista': 'Cambia la interfaz de Atreus. Las guías y los mapas siguen en el idioma en que estén escritos.',
  'ajustes.idiomaEs': 'Español',
  'ajustes.idiomaEn': 'English',
} as const;

/** Toda clave válida de traducción. La define el castellano. */
export type Clave = keyof typeof es;
