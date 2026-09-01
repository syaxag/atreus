import { net } from 'electron';
import type { GameId, RemoteMod } from '@shared/types';
import { log } from '../../logger';
import { getDefinition } from '../catalog/definitions';
import { classify } from './classify';

const logger = log('mods:providers');

/**
 * Proveedores de mods: catálogos públicos de los que se puede sacar lo que hay
 * disponible para un juego sin que nadie lo teclee a mano.
 *
 * Cada juego declara el suyo en `data/games/<id>.json`:
 *
 *   "mods": { "provider": { "kind": "thunderstore", "community": "balatro" } }
 *   "mods": { "provider": { "kind": "geode" } }
 *
 * Esto cubre **mods**. Los **cheats** no salen de aquí y no pueden salir: un
 * patrón AoB es una dirección de una compilación concreta, y no existe ningún
 * catálogo público legible por máquina que los publique. Los trainers de las
 * apps comerciales los escriben personas, uno a uno. Ver docs/SCOPE.md.
 */

import type { ModProviderSpec } from '../catalog/definitions';

export type ModProvider = ModProviderSpec;

/** Timeout de red. Un catálogo caído no debe colgar la interfaz. */
const TIMEOUT_MS = 25_000;
const USER_AGENT = 'Atreus/0.1 (launcher personal)';

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await net.fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// ── Thunderstore ──────────────────────────────────────────────
interface TsVersion {
  version_number: string;
  description: string;
  download_url: string;
  downloads: number;
  file_size: number;
  icon: string | null;
  dependencies: string[];
  date_created: string;
}

interface TsPackage {
  name: string;
  full_name: string;
  owner: string;
  package_url: string;
  is_deprecated: boolean;
  has_nsfw_content: boolean;
  rating_score: number;
  categories: string[];
  versions: TsVersion[];
}

async function listThunderstore(community: string): Promise<RemoteMod[]> {
  const packages = await fetchJson<TsPackage[]>(
    `https://thunderstore.io/c/${encodeURIComponent(community)}/api/v1/package/`,
  );

  return packages
    .filter((p) => !p.is_deprecated && !p.has_nsfw_content && p.versions.length > 0)
    .map((p) => {
      const latest = p.versions[0]!;
      return {
        id: p.full_name,
        name: p.name.replace(/_/g, ' '),
        author: p.owner,
        version: latest.version_number,
        description: latest.description,
        downloads: latest.downloads,
        sizeBytes: latest.file_size,
        iconUrl: latest.icon,
        pageUrl: p.package_url,
        downloadUrl: latest.download_url,
        // El archivo de Thunderstore es siempre un zip, aunque la URL no lo diga.
        fileName: `${p.full_name}-${latest.version_number}.zip`,
        categories: p.categories,
        dependencies: latest.dependencies.length,
        source: 'Thunderstore',
        metric: 'descargas',
        kind: 'mod' as const,
        deferred: false,
      };
    })
    .sort((a, b) => b.downloads - a.downloads);
}

// ── Geode (Geometry Dash) ─────────────────────────────────────
interface GeodeVersion {
  name: string;
  description: string | null;
  version: string;
  download_link: string;
  download_count: number;
}

interface GeodeMod {
  id: string;
  featured: boolean;
  download_count: number;
  repository: string | null;
  developers: { display_name: string; is_owner: boolean }[];
  versions: GeodeVersion[];
  tags?: string[];
}

interface GeodePage {
  payload: { data: GeodeMod[]; count: number };
}

async function listGeode(): Promise<RemoteMod[]> {
  // El índice está paginado; con dos páginas ya hay de sobra para elegir.
  const out: RemoteMod[] = [];
  for (const page of [1, 2]) {
    const body = await fetchJson<GeodePage>(
      `https://api.geode-sdk.org/v1/mods?per_page=100&page=${page}&sort=downloads`,
    );
    for (const mod of body.payload.data) {
      const latest = mod.versions[0];
      if (!latest) continue;
      const owner = mod.developers.find((d) => d.is_owner) ?? mod.developers[0];
      out.push({
        id: mod.id,
        name: latest.name,
        author: owner?.display_name ?? 'desconocido',
        version: latest.version,
        description: latest.description ?? '',
        downloads: mod.download_count,
        sizeBytes: null,
        iconUrl: null,
        pageUrl: mod.repository ?? `https://geode-sdk.org/mods/${mod.id}`,
        downloadUrl: latest.download_link,
        // Geode entrega un .geode, que se despliega entero sin extraer.
        fileName: `${mod.id}.geode`,
        categories: mod.tags ?? [],
        dependencies: 0,
        source: 'Geode',
        metric: 'descargas',
        kind: 'mod' as const,
        deferred: false,
      });
    }
    if (body.payload.data.length < 100) break;
  }
  return out.sort((a, b) => b.downloads - a.downloads);
}

// ── GameBanana ────────────────────────────────────────────────
interface GbRecord {
  _idRow: number;
  _sName: string;
  _bHasFiles?: boolean;
  _bIsObsolete?: boolean;
  _nLikeCount?: number;
  _nViewCount?: number;
  _aSubmitter?: { _sName?: string };
  _aRootCategory?: { _sName?: string };
  _aTags?: { _sValue?: string }[];
  _aPreviewMedia?: { _aImages?: { _sBaseUrl?: string; _sFile220?: string }[] };
}

interface GbSubfeed {
  _aRecords: GbRecord[];
  _aMetadata?: { _nRecordCount?: number };
}

interface GbProfile {
  _sName?: string;
  _sDescription?: string;
  _aFiles?: { _sFile?: string; _nFilesize?: number; _sDownloadUrl?: string }[];
}

/**
 * GameBanana no publica descargas por mod en el listado, sino "me gusta", y
 * **no da la URL de descarga** hasta que se pide la ficha completa. Pedirla
 * para los 148 mods de un juego serían 148 peticiones, así que los mods salen
 * marcados como `deferred` y la URL se resuelve solo al instalar.
 */
async function listGameBanana(gameId: number): Promise<RemoteMod[]> {
  const out: RemoteMod[] = [];

  // Las páginas van de 15 en 15 y cada una es una petición. En serie, ocho
  // páginas tardaban varios segundos; en paralelo cuesta casi lo mismo que una.
  const pages = await Promise.allSettled(
    [1, 2, 3, 4, 5, 6, 7, 8].map((page) =>
      fetchJson<GbSubfeed>(
        `https://gamebanana.com/apiv11/Game/${gameId}/Subfeed` +
        `?_nPage=${page}&_sSort=default&_csvModelInclusions=Mod`,
      ),
    ),
  );

  for (const result of pages) {
    if (result.status !== 'fulfilled') continue;
    const records = result.value._aRecords ?? [];
    for (const r of records) {
      if (r._bIsObsolete || r._bHasFiles === false) continue;
      const image = r._aPreviewMedia?._aImages?.[0];
      out.push({
        id: String(r._idRow),
        name: r._sName,
        author: r._aSubmitter?._sName ?? 'desconocido',
        version: '',
        description: r._aRootCategory?._sName ?? '',
        downloads: r._nLikeCount ?? 0,
        sizeBytes: null,
        iconUrl: image?._sBaseUrl && image._sFile220
          ? `${image._sBaseUrl}/${image._sFile220}`
          : null,
        pageUrl: `https://gamebanana.com/mods/${r._idRow}`,
        // Se rellena al instalar; ver `resolve`.
        downloadUrl: '',
        fileName: '',
        categories: (r._aTags ?? []).map((t) => t._sValue ?? '').filter(Boolean),
        dependencies: 0,
        source: 'GameBanana',
        metric: 'me gusta',
        kind: 'mod' as const,
        deferred: true,
      });
    }
  }

  // Las páginas pueden solaparse; se quita lo repetido.
  const vistos = new Set<string>();
  return out
    .filter((m) => (vistos.has(m.id) ? false : (vistos.add(m.id), true)))
    .sort((a, b) => b.downloads - a.downloads);
}

/** Pide la ficha de un mod de GameBanana para saber qué archivo bajar. */
async function resolveGameBanana(mod: RemoteMod): Promise<RemoteMod> {
  const profile = await fetchJson<GbProfile>(
    `https://gamebanana.com/apiv11/Mod/${mod.id}/ProfilePage`,
  );
  const files = (profile._aFiles ?? []).filter((f) => f._sDownloadUrl);
  if (files.length === 0) {
    throw new Error(`"${mod.name}" no tiene ningún archivo descargable en GameBanana`);
  }

  // El más grande suele ser el mod; los pequeños son parches o extras.
  const best = files.reduce((a, b) => ((b._nFilesize ?? 0) > (a._nFilesize ?? 0) ? b : a));
  return {
    ...mod,
    downloadUrl: best._sDownloadUrl!,
    fileName: best._sFile ?? `${mod.id}.zip`,
    sizeBytes: best._nFilesize ?? null,
    description: profile._sDescription
      ? profile._sDescription.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)
      : mod.description,
    deferred: false,
  };
}

// ── API pública ───────────────────────────────────────────────
/** Los catálogos de un juego. Uno, varios o ninguno. */
export function providersOf(gameId: GameId): ModProvider[] {
  const spec = getDefinition(gameId)?.mods?.provider;
  if (!spec) return [];
  return Array.isArray(spec) ? spec : [spec];
}

export function hasProvider(gameId: GameId): boolean {
  return providersOf(gameId).length > 0;
}

function listOne(provider: ModProvider): Promise<RemoteMod[]> {
  switch (provider.kind) {
    case 'geode': return listGeode();
    case 'thunderstore': return listThunderstore(provider.community);
    case 'gamebanana': return listGameBanana(provider.gameId);
  }
}

/** Etiqueta cada resultado como mod o cheat. Ver classify.ts. */
function clasificar(mods: RemoteMod[]): RemoteMod[] {
  return mods.map((m) => ({ ...m, kind: classify(m) }));
}

/**
 * Lista lo que hay disponible, sumando todos los catálogos del juego.
 *
 * Si uno falla, se sigue con los demás: que GameBanana esté caído no debe
 * dejar sin ver los mods de Thunderstore.
 */
export async function discover(gameId: GameId): Promise<RemoteMod[]> {
  const providers = providersOf(gameId);
  if (providers.length === 0) {
    throw new Error(
      'Este juego no tiene un catálogo de mods configurado. Añade ' +
      '"mods": { "provider": … } en su definición.',
    );
  }

  const started = Date.now();
  const results = await Promise.allSettled(providers.map(listOne));

  const mods: RemoteMod[] = [];
  const fallos: string[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') mods.push(...r.value);
    else fallos.push(`${providers[i]!.kind}: ${String(r.reason).slice(0, 80)}`);
  });

  if (mods.length === 0 && fallos.length > 0) {
    throw new Error(`No se pudo consultar ningún catálogo. ${fallos.join(' · ')}`);
  }
  for (const f of fallos) logger.warn(`${gameId}: catálogo caído — ${f}`);

  const clasificados = clasificar(mods);
  const cheats = clasificados.filter((m) => m.kind === 'cheat').length;
  const resumen = providers.map((p) => p.kind).join(' + ');
  logger.info(
    `${gameId}: ${clasificados.length} disponibles en ${resumen} ` +
    `(${cheats} de tipo cheat) — ${Date.now() - started} ms`,
  );
  return clasificados;
}

/**
 * Completa la información que falta antes de descargar.
 *
 * Los mods marcados como `deferred` no traen URL en el listado; aquí se pide.
 */
export async function resolve(mod: RemoteMod): Promise<RemoteMod> {
  if (!mod.deferred) return mod;
  if (mod.source === 'GameBanana') return resolveGameBanana(mod);
  throw new Error(`No se sabe resolver la descarga de ${mod.source}`);
}

/** Descarga un mod a un archivo temporal y devuelve su ruta. */
export async function download(mod: RemoteMod, destination: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await net.fetch(mod.downloadUrl, {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} al descargar ${mod.name}`);

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) throw new Error(`${mod.name} vino vacío`);

    const { writeFileSync } = await import('node:fs');
    writeFileSync(destination, buffer);
    logger.info(`descargado ${mod.name} (${(buffer.length / 1024).toFixed(0)} KB)`);
  } finally {
    clearTimeout(timer);
  }
}
