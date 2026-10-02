import type { AnimInstance, Layer } from '../core/types';
import { downloadBlob } from '../render/export';
import { setUserItems } from '../templates';
import { importPresets, MAX_PRESETS, parsePresetFile, serializePresets, type PresetBundle } from '../templates/presetFile';
import { captureAnimation, captureLook, presetItem, sanitizePreset, type UserPreset } from '../templates/userPresets';
import { appStore, createStore, toast, useStore } from './store';

const KEY = 'keyframe-studio:presets';
const DELETED_KEY = 'keyframe-studio:presets-deleted';

function load(): UserPreset[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, MAX_PRESETS).map(sanitizePreset).filter((p): p is UserPreset => !!p);
  } catch {
    return [];
  }
}

function loadDeleted(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(DELETED_KEY) ?? '{}');
    const out: Record<string, number> = {};
    if (raw && typeof raw === 'object') {
      for (const [id, at] of Object.entries(raw).slice(0, 500)) if (id.startsWith('user.') && typeof at === 'number' && Number.isFinite(at)) out[id] = at;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * The user's saved animations and looks. Kept in this browser (localStorage), like favourites, and
 * optionally mirrored to a file they choose (presetSync.ts) so they follow them between machines.
 * `deleted` remembers removals so that a synced deletion is not undone by an older copy.
 */
export const presetStore = createStore<PresetBundle>({
  presets: typeof localStorage === 'undefined' ? [] : load(),
  deleted: typeof localStorage === 'undefined' ? {} : loadDeleted(),
});
setUserItems(presetStore.get().presets.map(presetItem));

export const useUserPresets = (): UserPreset[] => useStore(presetStore, (s) => s.presets);

function commitBundle(next: PresetBundle): void {
  presetStore.set({ presets: next.presets, deleted: next.deleted });
  setUserItems(next.presets.map(presetItem));
  try {
    localStorage.setItem(KEY, JSON.stringify(next.presets));
    localStorage.setItem(DELETED_KEY, JSON.stringify(next.deleted));
  } catch {
    toast('Your presets could not be stored in this browser, so they will be lost when you close the page.');
  }
}

/** Replace the library with a merged copy (from a synced file). Does not touch timestamps. */
export function applyPresetBundle(bundle: PresetBundle): void {
  commitBundle(bundle);
}

function add(preset: UserPreset | null, what: string): boolean {
  if (!preset) {
    toast(`There is nothing to save: ${what}`);
    return false;
  }
  const { presets, deleted } = presetStore.get();
  commitBundle({ presets: [{ ...preset, updatedAt: Date.now() }, ...presets].slice(0, MAX_PRESETS), deleted });
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
  const { presets, deleted } = presetStore.get();
  commitBundle({ presets: presets.filter((p) => p.id !== id), deleted: { ...deleted, [id]: Date.now() } });
}

export function renamePreset(id: string, name: string): void {
  const n = name.trim().slice(0, 60);
  if (!n) return;
  const { presets, deleted } = presetStore.get();
  commitBundle({ presets: presets.map((p) => (p.id === id ? { ...p, name: n, updatedAt: Date.now() } : p)), deleted });
}

/* ------------------------------------------------------------------ files */

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Download presets as a .kfspresets file: all of them, or just the ones listed. */
export function exportPresets(ids?: string[]): boolean {
  const all = presetStore.get().presets;
  const list = ids ? all.filter((p) => ids.includes(p.id)) : all;
  if (!list.length) {
    toast('You have no presets to export yet. Save an animation or look first.');
    return false;
  }
  const slug = list.length === 1 ? list[0].name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : '';
  const file = `${slug || 'my-presets'}.kfspresets`;
  downloadBlob(new Blob([serializePresets(list)], { type: 'application/json' }), file);
  toast(`Exported ${plural(list.length, 'preset')} to ${file}`);
  return true;
}

/** Add the presets in a .kfspresets file to the library. Nothing you already have is replaced. */
export function importPresetsText(text: string): boolean {
  const parsed = parsePresetFile(text);
  if (!parsed.ok) {
    toast(parsed.error);
    return false;
  }
  const { presets, deleted } = presetStore.get();
  const res = importPresets(presets, parsed.bundle.presets);
  if (res.added.length) {
    const rest = { ...deleted };
    for (const p of res.added) delete rest[p.id]; // an explicit import beats an old deletion
    commitBundle({ presets: res.presets, deleted: rest });
  }
  const notes = [
    res.duplicates ? `${plural(res.duplicates, 'preset')} already in your library` : '',
    res.overflow ? `${plural(res.overflow, 'preset')} left out because the library holds ${MAX_PRESETS}` : '',
    parsed.skipped ? `${plural(parsed.skipped, 'unreadable preset')} skipped` : '',
  ].filter(Boolean);
  const head = res.added.length ? `Imported ${plural(res.added.length, 'preset')}` : 'Nothing new to import';
  toast(notes.length ? `${head} (${notes.join('; ')})` : head, res.added.length ? { label: 'Show', run: () => appStore.set({ rightTab: 'library', libTab: 'mine', libQuery: '' }) } : undefined);
  return res.added.length > 0;
}

/** Ask for a text file and hand back its contents (null if cancelled). Must be called from a click or key press. */
export function pickTextFile(accept: string): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      if (f.size > 12_000_000) {
        toast('That file is too large.');
        return resolve(null);
      }
      resolve({ name: f.name, text: await f.text() });
    };
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

export async function importPresetsFromFile(): Promise<void> {
  const f = await pickTextFile('.kfspresets,.json,application/json');
  if (f) importPresetsText(f.text);
}
