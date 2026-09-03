import type {
  Achievement, Game, GameStat, GuideEntry, InteractiveMap, Mod, ModProfile, RemoteMod,
} from '@shared/types';

/**
 * Datos falsos para desarrollar la interfaz sin backend.
 * Replican la biblioteca real de la máquina para que las pantallas se vean creíbles.
 */

const now = Math.floor(Date.now() / 1000);
const days = (n: number) => now - n * 86400;

function game(
  nativeId: string,
  name: string,
  extra: Partial<Game> = {},
): Game {
  return {
    id: `steam:${nativeId}`,
    platform: 'steam',
    nativeId,
    name,
    installDir: `C:\\Program Files (x86)\\Steam\\steamapps\\common\\${name}`,
    exePath: null,
    iconUrl: null,
    headerUrl: null,
    portraitUrl: null,
    sizeBytes: null,
    lastPlayed: null,
    playtimeMinutes: null,
    hasDefinition: false,
    multiplayer: false,
    favorite: false,
    ...extra,
  };
}

export const MOCK_GAMES: Game[] = [
  game('2379780', 'Balatro', {
    sizeBytes: 66_662_933, lastPlayed: days(1), hasDefinition: true, favorite: true,
  }),
  game('3017860', 'DOOM: The Dark Ages', {
    sizeBytes: 106_111_645_501, lastPlayed: days(3), hasDefinition: true,
  }),
  game('2806050', 'Halo: Campaign Evolved', {
    sizeBytes: 79_550_108_673, lastPlayed: days(6), hasDefinition: true, favorite: true,
  }),
  game('2050650', 'Resident Evil 4', {
    sizeBytes: 62_400_000_000, lastPlayed: days(21), hasDefinition: true,
  }),
  game('322170', 'Geometry Dash', {
    sizeBytes: 328_394_076, lastPlayed: days(40),
  }),
  game('824270', "KovaaK's", {
    sizeBytes: 8_200_000_000, lastPlayed: days(12),
  }),
  game('1172470', 'Apex Legends', {
    sizeBytes: 81_150_852_733, lastPlayed: days(2), multiplayer: true,
  }),
  game('252950', 'Rocket League', {
    sizeBytes: 22_000_000_000, lastPlayed: days(9), multiplayer: true,
  }),
  game('3527290', 'PEAK', {
    sizeBytes: 4_100_000_000, lastPlayed: days(5), multiplayer: true,
  }),
  game('993090', 'Lossless Scaling', { sizeBytes: 183_809_856 }),
  game('431960', 'Wallpaper Engine', { sizeBytes: 2_400_000_000 }),
];

export const MOCK_ACHIEVEMENTS: Achievement[] = [
  ['ach_first_win', 'Primera victoria', 'Gana tu primera partida.', true, days(30)],
  ['ach_gold_stake', 'Apuesta de oro', 'Completa una partida en apuesta de oro.', true, days(12)],
  ['ach_ante_8', 'Ante 8', 'Alcanza el ante 8 en cualquier mazo.', true, days(11)],
  ['ach_all_jokers', 'Coleccionista', 'Descubre los 150 comodines.', false, null],
  ['ach_100k', 'Seis cifras', 'Consigue una puntuación de 100.000 en una sola mano.', false, null],
  ['ach_no_discard', 'Sin descartes', 'Gana un ante sin descartar ni una carta.', true, days(8)],
  ['ach_flush_five', 'Escalera de cinco', 'Juega una mano de Flush Five.', false, null],
  ['ach_secret_deck', '???', 'Logro oculto.', false, null],
  ['ach_speedrun', 'A contrarreloj', 'Completa una partida en menos de 20 minutos.', true, days(4)],
  ['ach_perfect', 'Sin fallos', 'Termina una partida sin perder ni una ronda.', false, null],
].map(([apiName, displayName, description, unlocked, unlockTime]) => ({
  apiName: apiName as string,
  displayName: displayName as string,
  description: description as string,
  iconUrl: null,
  iconGrayUrl: null,
  hidden: (displayName as string) === '???',
  unlocked: unlocked as boolean,
  unlockTime: unlockTime as number | null,
  protected: false,
  // Rareza inventada pero verosímil: cuanto más raro, más abajo en la lista.
  globalPercent: Math.round((90 / (1 + (apiName as string).length % 9)) * 10) / 10,
}));

export const MOCK_STATS: GameStat[] = [
  { apiName: 'games_played', displayName: 'Partidas jugadas', type: 'int', value: 214, originalValue: 214, incrementOnly: true, permission: 0 },
  { apiName: 'games_won', displayName: 'Partidas ganadas', type: 'int', value: 58, originalValue: 58, incrementOnly: true, permission: 0 },
  { apiName: 'best_score', displayName: 'Mejor puntuación', type: 'int', value: 84_320, originalValue: 84_320, incrementOnly: false, permission: 0 },
  { apiName: 'highest_ante', displayName: 'Ante más alto', type: 'int', value: 12, originalValue: 12, incrementOnly: false, permission: 0 },
  { apiName: 'total_playtime', displayName: 'Tiempo total (h)', type: 'float', value: 61.5, originalValue: 61.5, incrementOnly: true, permission: 0 },
  { apiName: 'jokers_found', displayName: 'Comodines descubiertos', type: 'int', value: 131, originalValue: 131, incrementOnly: true, permission: 0 },
  { apiName: 'win_rate', displayName: 'Tasa de victoria', type: 'avgrate', value: 0.271, originalValue: 0.271, incrementOnly: false, permission: 2 },
  { apiName: 'cards_played', displayName: 'Cartas jugadas', type: 'int', value: 48_902, originalValue: 48_902, incrementOnly: true, permission: 0 },
];

export const MOCK_MODS: Mod[] = [
  { id: 'm1', gameId: 'steam:2379780', name: 'Steamodded', version: '1.0.0-beta', author: 'Steamopollys', description: 'Cargador de mods para Balatro.', status: 'deployed', enabled: true, order: 0, sizeBytes: 2_400_000, installedAt: days(20), files: ['Mods/Steamodded/'], conflictsWith: [], error: null },
  { id: 'm2', gameId: 'steam:2379780', name: 'Cryptid', version: '0.5.2', author: 'MathIsFun', description: 'Añade más de 200 comodines nuevos.', status: 'deployed', enabled: true, order: 1, sizeBytes: 8_100_000, installedAt: days(14), files: ['Mods/Cryptid/init.lua', 'Mods/Cryptid/ui.lua'], conflictsWith: [], error: null },
  { id: 'm3', gameId: 'steam:2379780', name: 'Talisman', version: '2.1.0', author: 'MathIsFun', description: 'Soporte para puntuaciones enormes.', status: 'staged', enabled: false, order: 2, sizeBytes: 900_000, installedAt: days(6), files: ['Mods/Talisman/'], conflictsWith: [], error: null },
  { id: 'm4', gameId: 'steam:2379780', name: 'Mejor UI', version: '1.3', author: 'anon', description: 'Rediseño de la interfaz de la tienda.', status: 'staged', enabled: false, order: 3, sizeBytes: 450_000, installedAt: days(3), files: ['Mods/Cryptid/ui.lua'], conflictsWith: ['m2'], error: null },
  { id: 'm5', gameId: 'steam:2379780', name: 'Paquete de texturas HD', version: null, author: null, description: null, status: 'error', enabled: false, order: 4, sizeBytes: 120_000_000, installedAt: days(1), files: [], conflictsWith: [], error: 'El archivo no contiene una carpeta Mods/ reconocible.' },
];

export const MOCK_PROFILES: ModProfile[] = [
  { id: 'p1', gameId: 'steam:2379780', name: 'Partida limpia', mods: [], launchArgs: '', isActive: false },
  { id: 'p2', gameId: 'steam:2379780', name: 'Modded', mods: ['m1', 'm2'], launchArgs: '', isActive: true },
];

/** Catálogo público simulado, con la forma que devuelve Thunderstore. */
export const MOCK_REMOTE: RemoteMod[] = [
  ['Steamodded', 'Steamodded', '26.829.0', 'A Balatro Modding Framework', 395, 761856],
  ['lovely', 'Thunderstore', '0.9.0', 'Lovely is a runtime lua injector for LÖVE 2d', 22554, 1824768],
  ['Cryptid', 'MathIsFun0', '0.5.2', 'Añade más de 200 comodines nuevos', 18420, 8300000],
  ['Talisman', 'MathIsFun0', '2.1.0', 'Soporte para puntuaciones enormes', 15308, 921600],
  ['JokerDisplay', 'nh6574', '1.8.4', 'Muestra el valor de cada comodín en tiempo real', 12044, 430080],
  ['Bunco', 'Firch', '0.6.1', 'Mazos, comodines y mejoras cosméticas', 9877, 5242880],
  ['DebugPlus', 'WilsontheWolf', '1.7.0', 'Better Debug Tools for Balatro: consola, dinero infinito y unlock all', 778, 210000],
  ['MoreSpeed', 'Steamopollys', '0.8.2', 'Speed hack para acelerar las animaciones del juego', 51126, 90000],
].map(([name, author, version, description, downloads, sizeBytes]) => ({
  id: `${author as string}/${name as string}`,
  name: name as string,
  author: author as string,
  version: version as string,
  description: description as string,
  downloads: downloads as number,
  sizeBytes: sizeBytes as number,
  iconUrl: null,
  pageUrl: `https://thunderstore.io/c/balatro/p/${author as string}/${name as string}/`,
  downloadUrl: `https://thunderstore.io/package/download/${author as string}/${name as string}/${version as string}/`,
  fileName: `${author as string}-${name as string}-${version as string}.zip`,
  categories: ['Mods'],
  dependencies: 0,
  source: 'Thunderstore',
  metric: 'descargas',
  kind: (/debug|cheat|hack|menu/i.test(name as string) ? 'cheat' : 'mod') as 'mod' | 'cheat',
  deferred: false,
}));

/** Horas jugadas simuladas, para que la ficha del juego no salga vacía. */
export const MOCK_PLAYTIME: Record<string, number> = {
  'steam:2379780': 3_690,
  'steam:3017860': 1_240,
  'steam:2806050': 620,
  'steam:2050650': 2_880,
  'steam:322170': 15_400,
};

export const MOCK_GUIDES: GuideEntry[] = [
  {
    id: 'steam:1',
    title: 'Balatro · guía completa de logros en español',
    snippet: 'Cada logro explicado, con el mazo y la apuesta recomendados para sacarlo sin repetir partidas.',
    url: 'https://steamcommunity.com/sharedfiles/filedetails/?id=1',
    source: { kind: 'steam' },
    provider: 'steam', author: 'unjugador', rating: 5, language: 'es', readable: true,
  },
  {
    id: 'steam:2',
    title: '100% Achievement Guide',
    snippet: 'Every achievement, ordered from easiest to hardest, with build suggestions.',
    url: 'https://steamcommunity.com/sharedfiles/filedetails/?id=2',
    source: { kind: 'steam' },
    provider: 'steam', author: 'someone', rating: 4, language: 'en', readable: true,
  },
  {
    id: 'wiki:balatro.fandom.com:10',
    title: 'Achievements',
    snippet: 'Listado completo de logros con sus condiciones exactas.',
    url: 'https://balatro.fandom.com/wiki/Achievements',
    source: { kind: 'wiki', site: 'balatro' },
    provider: 'wiki', author: null, rating: null, language: 'en', readable: true,
  },
];

export const MOCK_MAPS: InteractiveMap[] = [
  {
    id: 'mapgenie:demo',
    label: { kind: 'mapgenie', game: 'Balatro' },
    blurb: { kind: 'mapgenie' },
    url: 'https://mapgenie.io/',
    provider: 'MapGenie',
  },
];
