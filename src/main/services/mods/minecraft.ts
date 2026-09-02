import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface MinecraftRuntime {
  root: string;
  gameVersion: string;
  loader: 'fabric' | 'forge' | 'neoforge';
}

const LOADERS = ['fabric', 'neoforge', 'forge'] as const;

/** Detecta la versión y el cargador de los perfiles instalados, sin lanzar Minecraft. */
export function detectMinecraftRuntime(appData = process.env.APPDATA): MinecraftRuntime | null {
  if (!appData) return null;
  const root = join(appData, '.minecraft');
  const versions = join(root, 'versions');
  if (!existsSync(versions)) return null;
  let profiles: string[];
  try { profiles = readdirSync(versions, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name); }
  catch { return null; }

  const candidates = profiles.flatMap((profile) => {
    const lower = profile.toLowerCase();
    const loader = LOADERS.find((candidate) => lower.includes(candidate));
    const gameVersion = /(?:^|[-_])((?:1\.\d+(?:\.\d+)?))(?:$|[-_])/.exec(profile)?.[1];
    return loader && gameVersion ? [{ loader, gameVersion }] : [];
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.gameVersion.localeCompare(a.gameVersion, undefined, { numeric: true }));
  return { root, ...candidates[0]! };
}
