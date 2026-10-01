import type { AnimInstance, Layer } from '../core/types';
import { setUserItems } from '../templates';
import { captureAnimation, captureLook, presetItem, sanitizePreset, type UserPreset } from '../templates/userPresets';
import { appStore, createStore, toast, useStore } from './store';

const KEY = 'keyframe-studio:presets';
const MAX_PRESETS = 100;

function load(): UserPreset[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, MAX_PRESETS).map(sanitizePreset).filter((p): p is UserPreset => !!p);
  } catch {
    return [];
  }
}

/** The user's saved animations and looks. Kept in this browser (localStorage), like favourites. */
export const presetStore = createStore<{ presets: UserPreset[] }>({ presets: typeof localStorage === 'undefined' ? [] : load() });
setUserItems(presetStore.get().presets.map(presetItem));

export const useUserPresets = (): UserPreset[] => useStore(presetStore, (s) => s.presets);

function commitPresets(presets: UserPreset[]): void {
  presetStore.set({ presets });
  setUserItems(presets.map(presetItem));
  try {
    localStorage.setItem(KEY, JSON.stringify(presets));
  } catch {
    toast('Your presets could not be stored in this browser, so they will be lost when you close the page.');
  }
}

function add(preset: UserPreset | null, what: string): boolean {
  if (!preset) {
    toast(`There is nothing to save: ${what}`);
    return false;
  }
  const next = [preset, ...presetStore.get().presets].slice(0, MAX_PRESETS);
  commitPresets(next);
  toast(`Saved “${preset.name}” to My presets`, { label: 'Show', run: () => appStore.set({ rightTab: 'library', libTab: 'mine', libQuery: '' }) });
  return true;
}

/** Save an applied animation, with the tuning it has now, as a preset. */
export function saveAnimationPreset(layer: Layer, inst: AnimInstance, name: string): boolean {
  return add(captureAnimation(layer, inst, name), 'this animation has no keyframes or effects.');
}

/** Save the layer's whole effect stack as a look. */
export function saveLookPreset(layer: Layer, name: string): boolean {
  return add(captureLook(layer, name), 'the layer has no effects.');
}

export function deletePreset(id: string): void {
  commitPresets(presetStore.get().presets.filter((p) => p.id !== id));
}

export function renamePreset(id: string, name: string): void {
  const n = name.trim().slice(0, 60);
  if (!n) return;
  commitPresets(presetStore.get().presets.map((p) => (p.id === id ? { ...p, name: n } : p)));
}
