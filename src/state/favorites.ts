import { createStore, useStore } from './store';

const KEY = 'keyframe-studio:favorites';

function load(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 500) : [];
  } catch {
    return [];
  }
}

/** Library templates the user starred. Remembered in this browser only. */
export const favStore = createStore<{ ids: string[] }>({ ids: typeof localStorage === 'undefined' ? [] : load() });

export const useFavorites = (): string[] => useStore(favStore, (s) => s.ids);

export function toggleFavorite(id: string): void {
  const ids = favStore.get().ids;
  const next = ids.includes(id) ? ids.filter((x) => x !== id) : [id, ...ids];
  favStore.set({ ids: next });
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: favourites last for the session */
  }
}
