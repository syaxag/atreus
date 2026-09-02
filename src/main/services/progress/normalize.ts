import type { CompletionItem, CompletionProgress, GameId } from '@shared/types';

/**
 * Forma canónica del progreso local. Es puro: `index.ts` pone el disco y
 * este archivo decide qué es válido, para que se pueda probar sin Electron.
 */

export const DEFAULT_ITEMS: CompletionItem[] = [
  { id: 'main-story', label: 'Completar la historia principal', kind: 'mission', done: false },
  { id: 'collectibles', label: 'Revisar coleccionables y mapa', kind: 'collectible', done: false },
  { id: 'achievements', label: 'Completar los logros restantes', kind: 'achievement', done: false },
];

export const MAX_NOTES = 10_000;
export const MAX_ITEMS = 500;
export const MAX_LABEL = 200;

const KINDS = new Set(['achievement', 'collectible', 'mission', 'boss', 'note']);

export function fresh(gameId: GameId): CompletionProgress {
  return { gameId, updatedAt: Date.now(), items: structuredClone(DEFAULT_ITEMS), notes: '' };
}

export function isItem(value: unknown): value is CompletionItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<CompletionItem>;
  return typeof item.id === 'string' && item.id.length > 0 &&
    typeof item.label === 'string' && item.label.trim().length > 0 &&
    typeof item.done === 'boolean' && KINDS.has(item.kind ?? '');
}

/**
 * Acepta cualquier cosa (un fichero antiguo, un JSON editado a mano, lo que
 * mande el renderer) y devuelve un progreso válido. Los objetivos de serie
 * siempre están, en su orden; los del usuario van después sin duplicados.
 */
export function normalize(gameId: GameId, value: unknown): CompletionProgress {
  const base = fresh(gameId);
  if (!value || typeof value !== 'object') return base;
  const stored = value as Partial<CompletionProgress>;

  const storedItems = (Array.isArray(stored.items) ? stored.items : [])
    .filter(isItem)
    .map((item) => ({ ...item, label: item.label.trim().slice(0, MAX_LABEL) }));
  const byId = new Map<string, CompletionItem>();
  for (const item of storedItems) if (!byId.has(item.id)) byId.set(item.id, item);

  const defaults = DEFAULT_ITEMS.map((item) => ({ ...item, done: byId.get(item.id)?.done ?? false }));
  const custom = [...byId.values()]
    .filter((item) => !DEFAULT_ITEMS.some((baseItem) => baseItem.id === item.id))
    .slice(0, MAX_ITEMS);

  return {
    gameId,
    updatedAt: typeof stored.updatedAt === 'number' && stored.updatedAt > 0 ? stored.updatedAt : base.updatedAt,
    items: [...defaults, ...custom],
    notes: typeof stored.notes === 'string' ? stored.notes.slice(0, MAX_NOTES) : '',
  };
}
