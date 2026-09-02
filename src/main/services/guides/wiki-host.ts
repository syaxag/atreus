/**
 * De qué host puede colgar la wiki de un juego.
 *
 * No hay buscador público que se pueda consultar —el de Fandom está detrás de
 * Cloudflare—, así que el host se deduce del nombre y se comprueba uno a uno.
 * Va aparte del resto del servicio porque no toca la red y así se puede probar.
 */

/** "The Witcher 3: Wild Hunt" → "thewitcher3". */
export function slug(name: string): string {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 40);
}

/**
 * Nombres con los que puede estar registrada la wiki, del más específico al
 * más general.
 *
 * Una wiki casi nunca lleva el título completo de la tienda: la de
 * "Resident Evil 4" es `residentevil`, y la de "DOOM: The Dark Ages" es `doom`.
 * Se prueba primero el nombre entero —hay sagas con wiki por entrega— y luego
 * se va recortando el subtítulo y el número de entrega.
 */
export function hostCandidates(gameName: string): string[] {
  const variants = [gameName];
  const beforeColon = gameName.split(/[:–-]/)[0]?.trim();
  if (beforeColon && beforeColon !== gameName) variants.push(beforeColon);
  // Sin el número o el numeral romano final: la saga suele compartir wiki.
  const withoutNumber = (beforeColon ?? gameName).replace(/\s+(\d+|[ivx]+)$/i, '').trim();
  if (withoutNumber && !variants.includes(withoutNumber)) variants.push(withoutNumber);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const variant of variants) {
    const key = slug(variant);
    // Menos de cuatro letras da falsos positivos garantizados.
    if (key.length < 4 || seen.has(key)) continue;
    seen.add(key);
    // wiki.gg va primero: muchas comunidades se mudaron ahí desde Fandom.
    out.push(`${key}.wiki.gg`, `${key}.fandom.com`);
  }
  return out;
}

