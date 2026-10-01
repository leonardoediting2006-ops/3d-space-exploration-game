import { beforeEach, describe, expect, it, vi } from 'vitest';

// a tiny in-memory localStorage, since the tests run in Node
function stubStorage(initial: Record<string, string> = {}): Map<string, string> {
  const data = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  });
  return data;
}

beforeEach(() => {
  vi.resetModules();
});

describe('favourites', () => {
  it('toggles, remembers and restores', async () => {
    const data = stubStorage();
    const { favStore, toggleFavorite } = await import('./favorites');
    expect(favStore.get().ids).toEqual([]);
    toggleFavorite('style.neonCyan');
    toggleFavorite('motion.popIn');
    expect(favStore.get().ids).toEqual(['motion.popIn', 'style.neonCyan']);
    expect(JSON.parse(data.get('keyframe-studio:favorites')!)).toEqual(['motion.popIn', 'style.neonCyan']);
    toggleFavorite('motion.popIn');
    expect(favStore.get().ids).toEqual(['style.neonCyan']);

    vi.resetModules();
    stubStorage({ 'keyframe-studio:favorites': JSON.stringify(['gradient.sunset', 7, null]) });
    const again = await import('./favorites');
    expect(again.favStore.get().ids).toEqual(['gradient.sunset']);
  });

  it('survives corrupt or unavailable storage', async () => {
    stubStorage({ 'keyframe-studio:favorites': '{not json' });
    const { favStore, toggleFavorite } = await import('./favorites');
    expect(favStore.get().ids).toEqual([]);
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    });
    expect(() => toggleFavorite('x')).not.toThrow();
    expect(favStore.get().ids).toEqual(['x']);
  });
});
