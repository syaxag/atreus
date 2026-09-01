/**
 * Clasifica lo que viene de los catálogos en "mod" o "cheat".
 *
 * El hallazgo que justifica este archivo: **en muchos juegos los cheats son
 * mods**. Geometry Dash no tiene trainers de memoria, tiene menús de mods —
 * QOLMod, Eclipse, Mega Hack — con millones de descargas, publicados en el
 * mismo catálogo que las texturas. Balatro igual, con DebugPlus.
 *
 * Así que no hace falta un catálogo de cheats que no existe: hace falta
 * reconocerlos entre los mods que ya se descargan.
 *
 * Sin dependencias: se puede probar sin arrancar nada.
 */

export type ModKind = 'mod' | 'cheat';

/**
 * Señales fuertes: si aparecen, casi seguro es un cheat.
 * Se comparan sobre texto normalizado, así que van en minúscula y sin acentos.
 */
const FUERTES = [
  'mod menu', 'modmenu', 'cheat menu', 'trainer', 'cheat engine',
  'god mode', 'godmode', 'noclip', 'no clip', 'aimbot', 'wallhack',
  'infinite money', 'infinite health', 'infinite ammo', 'unlimited money',
  'speedhack', 'speed hack', 'mega hack', 'megahack',
  // "Debug Tools" es el nombre que usa media escena de modding para lo que en
  // realidad es un menú de cheats: DebugPlus de Balatro da dinero infinito y
  // unlock all. Como señal media sola no bastaba y se quedaba fuera.
  'debug tool', 'debug menu', 'cheat sheet', 'admin menu', 'all in one menu',
];

/** Señales medias: cuentan, pero hacen falta dos para decidir. */
const MEDIAS = [
  'cheat', 'hack', 'debug', 'unlock all', 'unlockall', 'free unlock',
  'infinite', 'unlimited', 'invincib', 'inmortal', 'immortal',
  'practice mode', 'bypass', 'bot', 'auto clicker', 'autoclicker',
  'no cooldown', 'instant win', 'one hit', 'onehit',
];

/**
 * Palabras que desmienten: aparecen en mods normales y provocarían falsos
 * positivos. "Debug" en un mod de desarrollo de temas no es un cheat.
 */
const DESMIENTEN = [
  'anti-cheat', 'anticheat', 'anti cheat',
  'texture', 'textura', 'skin', 'icon pack', 'music', 'song', 'sound',
  'translation', 'traduccion', 'language pack',
];

/** Minúsculas, sin acentos, sin puntuación: para comparar con las listas. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface Clasificable {
  name: string;
  description: string;
  categories: string[];
}

/**
 * Decide si algo del catálogo es un cheat.
 *
 * Una señal fuerte basta; dos medias también. Cualquier desmentido lo tumba,
 * porque prefiero dejar un cheat entre los mods que anunciar como cheat un
 * paquete de texturas.
 */
export function classify(item: Clasificable): ModKind {
  const texto = normalizar(
    `${item.name} ${item.description} ${item.categories.join(' ')}`,
  );

  if (DESMIENTEN.some((d) => texto.includes(d))) return 'mod';
  if (FUERTES.some((f) => texto.includes(f))) return 'cheat';

  const medias = MEDIAS.filter((m) => texto.includes(m)).length;
  return medias >= 2 ? 'cheat' : 'mod';
}

/** Por qué se clasificó así, para poder explicarlo en la interfaz. */
export function explain(item: Clasificable): string | null {
  const texto = normalizar(
    `${item.name} ${item.description} ${item.categories.join(' ')}`,
  );
  if (DESMIENTEN.some((d) => texto.includes(d))) return null;

  const fuerte = FUERTES.find((f) => texto.includes(f));
  if (fuerte) return fuerte;

  const medias = MEDIAS.filter((m) => texto.includes(m));
  return medias.length >= 2 ? medias.slice(0, 2).join(' + ') : null;
}
