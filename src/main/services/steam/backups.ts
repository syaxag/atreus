import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SteamSnapshot } from '@shared/types';
import { paths } from '../../paths';

const KEEP_PER_GAME = 12;

function directory(appId: string): string {
  return join(paths.backups, appId);
}

function fileName(snapshot: SteamSnapshot): string {
  return `${snapshot.createdAt}-${snapshot.id}.json`;
}

/** Persiste con rename para no dejar una copia a medio escribir tras un corte. */
export function saveSnapshot(snapshot: SteamSnapshot): void {
  const dir = directory(snapshot.appId);
  mkdirSync(dir, { recursive: true });
  const target = join(dir, fileName(snapshot));
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, JSON.stringify(snapshot, null, 2), 'utf8');
  renameSync(tmp, target);

  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort().reverse();
  for (const stale of files.slice(KEEP_PER_GAME)) unlinkSync(join(dir, stale));
}

export function listSnapshots(appId: string): SteamSnapshot[] {
  const dir = directory(appId);
  if (!existsSync(dir)) return [];
  const snapshots: SteamSnapshot[] = [];
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    try {
      const data = JSON.parse(readFileSync(join(dir, name), 'utf8')) as SteamSnapshot;
      if (data.appId === appId && data.id && Array.isArray(data.achievements) && Array.isArray(data.stats)) {
        snapshots.push(data);
      }
    } catch {
      // Una copia corrupta no bloquea las demás ni una restauración válida.
    }
  }
  return snapshots.sort((a, b) => b.createdAt - a.createdAt);
}

export function getSnapshot(appId: string, id: string): SteamSnapshot | null {
  return listSnapshots(appId).find((snapshot) => snapshot.id === id) ?? null;
}
