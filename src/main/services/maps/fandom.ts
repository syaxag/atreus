import { net } from 'electron';
import { log } from '../../logger';
import { wikiHost } from '../guides/wiki';

const logger = log('maps:fandom');

/**
 * Mapas interactivos de Fandom.
 *
 * MapGenie cubre unos doscientos juegos y ahí se acaba: para todo lo demás, el
 * Atlas caía en una página cualquiera de la wiki, que es texto con una imagen,
 * no un mapa con el que se pueda trabajar.
 *
 * Fandom tiene su propia extensión de mapas interactivos —los de verdad, con
 * capas, filtros y marcadores que se pueden tachar— y los guarda en un espacio
 * de nombres propio, el **2900**. Eso lo hace consultable por máquina en
 * miles de wikis a la vez, sin lista que mantener.
 *
 * Lo comprobado al añadirlo: la wiki de The Elder Scrolls publica diez o más;
 * las de Halo y Resident Evil, ninguno. Esto amplía la cobertura, no la
 * resuelve: un mapa interactivo tiene que haberlo hecho alguien antes.
 */

const TIMEOUT_MS = 8_000;
const MAX = 6;

interface Pagina {
  pageid: number;
  title: string;
}

/** Los mapas de la wiki de este juego, o lista vacía si no tiene. */
export async function fandomMaps(gameName: string): Promise<{ title: string; url: string; host: string }[]> {
  const host = await wikiHost(gameName);
  // Solo Fandom: wiki.gg y las demás no tienen este espacio de nombres.
  if (!host || !host.endsWith('.fandom.com')) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `https://${host}/api.php?action=query&list=allpages&apnamespace=2900`
      + `&aplimit=${MAX}&format=json`;
    const response = await net.fetch(url, {
      headers: { 'User-Agent': 'Atreus/0.1 (launcher personal)', Accept: 'application/json' },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json() as { query?: { allpages?: Pagina[] } };
    const paginas = data.query?.allpages ?? [];
    if (paginas.length === 0) return [];

    logger.info(`${gameName}: ${paginas.length} mapa(s) interactivo(s) en ${host}`);
    return paginas.map((pagina) => ({
      // El título llega como "Map:Alik'r Desert"; el prefijo no aporta nada al
      // leerlo en una tarjeta.
      title: pagina.title.replace(/^Map:/i, ''),
      url: `https://${host}/wiki/${encodeURIComponent(pagina.title.replace(/ /g, '_'))}`,
      host,
    }));
  } catch (e) {
    logger.warn(`no se pudieron consultar los mapas de ${gameName}:`, e);
    return [];
  } finally {
    clearTimeout(timer);
  }
}
