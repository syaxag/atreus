import { useEffect, useMemo, useState } from 'react';
import type { Game } from '@shared/types';
import { PLATFORM_LABEL } from '@/lib/format';

/**
 * La carátula de un juego, con su cadena de respaldos.
 *
 * Vivía dentro de la Colección, que era la única que pintaba juegos. La
 * Portada también los pinta, y duplicar esta cadena habría sido duplicar el
 * criterio de qué imagen vale: el póster vertical primero, y las iniciales
 * antes que un banner ampliado.
 */

export function GameCover({ game }: { game: Game }) {
  const [fallbackIndex, setFallbackIndex] = useState(0);

  /*
   * El póster vertical primero, y el banner apaisado solo como red.
   *
   * Un póster 2:3 llena la tarjeta; un banner 16:9 dentro de un hueco 2:3 hay
   * que recortarlo, y se come la mitad de la imagen. Por eso se intenta el
   * póster de la caché local, luego el de Steam directamente, y solo después
   * lo apaisado. Los estrenos muy recientes no tienen póster en el CDN
   * —comprobado con dos de la biblioteca de prueba—, y para esos el recorte
   * del banner es mejor que un hueco.
   */
  const fallbacks = useMemo(() => {
    const list: string[] = [];
    if (game.portraitUrl) list.push(game.portraitUrl);
    if (game.platform === 'steam' && game.nativeId) {
      const cdn = `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.nativeId}`;
      list.push(`${cdn}/library_600x900_2x.jpg`, `${cdn}/library_600x900.jpg`);
      // El hero mide 1920×620: recortarlo a 2:3 lo **reduce**, así que sale
      // nítido y llena la tarjeta igual que un póster.
      list.push(`${cdn}/library_hero_2x.jpg`, `${cdn}/library_hero.jpg`);
    }
    /*
     * El banner apaisado ya no entra: mide 460×215 y llenar una tarjeta de
     * 217×325 con él exige ampliarlo 1,5 veces y recortarle el 69 % del ancho.
     * Eso era lo que se veía pixelado. Antes que eso, la tarjeta de iniciales,
     * que al menos se lee y no rompe la parrilla.
     *
     * La cadena vacía se filtra porque el navegador acepta `src=""`, no pinta
     * nada y **tampoco dispara `onError`**: la tarjeta se quedaba con un
     * `<img>` de 0×0 en vez de caer a las iniciales.
     */
    return list.filter((url) => url.trim().length > 0);
  }, [game.portraitUrl, game.platform, game.nativeId]);

  /**
   * Las carátulas que no estaban en disco se descargan en segundo plano y
   * llegan por `library:updated`. Guardar la URL en un estado inicial dejaba la
   * tarjeta con las iniciales para siempre: el índice se reinicia cuando la
   * lista de candidatas cambia, y la imagen aparece sola.
   */
  useEffect(() => { setFallbackIndex(0); }, [fallbacks]);

  const imgSrc = fallbacks[fallbackIndex] ?? null;

  /*
   * Todas las tarjetas se tratan igual: la imagen llena el hueco.
   *
   * Hubo un intento de tratar aparte las apaisadas —el banner entero, centrado,
   * sobre su propia versión difuminada—, y era peor: entre pósters que llenan
   * de borde a borde, esas dos cantaban como un error y repetían el título. El
   * problema no era cómo colocarlas, era **de dónde salía la imagen**: se
   * resuelve dando una fuente que se pueda recortar sin ampliar, no con una
   * excepción de maquetación. Ver `steamPosterUrls` en covers.ts.
   */
  if (imgSrc) {
    return (
      <img
        src={imgSrc}
        alt=""
        onError={() => setFallbackIndex((value) => value + 1)}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover transition-transform duration-500 ease-atreus group-hover:scale-[1.07]"
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-elevated via-surface to-inset p-4 text-center">
      <div className="flex flex-col items-center gap-1">
        <span className="select-none text-2xl font-bold tracking-wider text-accent/70">
          {game.name.slice(0, 2).toUpperCase()}
        </span>
        <span className="line-clamp-2 select-none text-[11px] font-medium text-faint">
          {game.name}
        </span>
        <span className="mt-2 rounded-sm border border-line px-1.5 py-0.5 text-[10px] font-medium text-muted">
          {PLATFORM_LABEL[game.platform] ?? game.platform}
        </span>
      </div>
    </div>
  );
}
