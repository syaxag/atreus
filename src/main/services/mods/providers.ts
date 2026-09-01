import { net } from 'electron';
import type { GameId, RemoteMod } from '@shared/types';
import { log } from '../../logger';
import { getDefinition } from '../catalog/definitions';

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

export interface ThunderstoreProvider {
  kind: 'thunderstore';
  /** Identificador de la comunidad, p. ej. "balatro" o "peak". */
  community: string;
}

export interface GeodeProvider {
  kind: 'geode';
}

export type ModProvider = ThunderstoreProvider | GeodeProvider;

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
      });
    }
    if (body.payload.data.length < 100) break;
  }
  return out.sort((a, b) => b.downloads - a.downloads);
}

// ── API pública ───────────────────────────────────────────────
export function providerOf(gameId: GameId): ModProvider | null {
  return getDefinition(gameId)?.mods?.provider ?? null;
}

export function hasProvider(gameId: GameId): boolean {
  return providerOf(gameId) !== null;
}

/** Lista lo que hay disponible para un juego. Lanza si no hay proveedor. */
export async function discover(gameId: GameId): Promise<RemoteMod[]> {
  const provider = providerOf(gameId);
  if (!provider) {
    throw new Error(
      'Este juego no tiene un catálogo de mods configurado. Añade ' +
      '"mods": { "provider": … } en su definición.',
    );
  }

  const started = Date.now();
  const mods = provider.kind === 'geode'
    ? await listGeode()
    : await listThunderstore(provider.community);

  logger.info(
    `${gameId}: ${mods.length} mods disponibles en ${provider.kind} ` +
    `(${Date.now() - started} ms)`,
  );
  return mods;
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
