// Keeping presets in step with a file the user chooses. Put that file in a folder that Dropbox,
// OneDrive, iCloud, Google Drive or Syncthing already syncs and the presets follow you between
// machines — no server involved. Uses the File System Access API (Chromium browsers); everywhere
// else, Export / Import still works.
import { bundlesDiffer, mergeBundles, parsePresetFile, serializePresets, type PresetBundle } from '../templates/presetFile';
import { applyPresetBundle, presetStore } from './presets';
import { createStore, toast, useStore } from './store';

export interface SyncState {
  state: 'off' | 'ok' | 'busy' | 'needs-permission' | 'error';
  name: string;
  /** When the last successful sync finished. */
  at: number;
  message: string;
}

export const syncStore = createStore<SyncState>({ state: 'off', name: '', at: 0, message: '' });
export const useSyncState = (): SyncState => useStore(syncStore, (s) => s);

interface Handle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  queryPermission?(d: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(d: { mode: 'readwrite' }): Promise<PermissionState>;
}

export const syncSupported = (): boolean => typeof window !== 'undefined' && 'showSaveFilePicker' in window;

/* The chosen file's handle lives in IndexedDB so the link survives a reload. */
const DB = 'keyframe-studio';
const STORE = 'handles';
const HANDLE_KEY = 'presets-file';

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idb<T>(run: (s: IDBObjectStore) => IDBRequest<T>, mode: IDBTransactionMode): Promise<T> {
  const d = await db();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(d.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    d.close();
  }
}

let handle: Handle | null = null;
let queue: Promise<void> = Promise.resolve();
let timer = 0;
let lastRun = 0;

const set = (patch: Partial<SyncState>) => syncStore.set(patch);

/** Read the file, merge it with this browser's presets, and write the result back if the file was behind. */
async function runSync(): Promise<void> {
  if (!handle) return;
  const h = handle;
  const perm = (await h.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
  if (perm !== 'granted') {
    set({ state: 'needs-permission', name: h.name, message: 'Allow access to keep presets in sync.' });
    return;
  }
  set({ state: 'busy', name: h.name });
  try {
    const text = await (await h.getFile()).text();
    let remote: PresetBundle = { presets: [], deleted: {} };
    if (text.trim()) {
      const parsed = parsePresetFile(text);
      if (!parsed.ok) {
        set({ state: 'error', message: `“${h.name}” is not a presets file, so it was left untouched.` });
        return;
      }
      remote = parsed.bundle;
    }
    const local = presetStore.get();
    const merged = mergeBundles(local, remote);
    if (bundlesDiffer(merged, local)) applyPresetBundle(merged);
    if (bundlesDiffer(merged, remote)) {
      const w = await h.createWritable();
      await w.write(serializePresets(merged.presets, merged.deleted));
      await w.close();
    }
    lastRun = Date.now();
    set({ state: 'ok', name: h.name, at: lastRun, message: '' });
  } catch (e) {
    set({ state: 'error', message: e instanceof Error ? e.message : 'Could not reach the file.' });
  }
}

/** Run a sync once the current one (if any) has finished. */
export function syncNow(): Promise<void> {
  queue = queue.then(runSync, runSync);
  return queue;
}

/** Link a file: its presets are merged with yours right away, and kept in step from then on. */
export async function linkPresetFile(h: Handle): Promise<void> {
  handle = h;
  try {
    await idb((s) => s.put(h, HANDLE_KEY), 'readwrite');
  } catch {
    /* the link just will not survive a reload */
  }
  await syncNow();
}

/** Show the browser's file picker (pick an existing file or name a new one) and link it. */
export async function chooseSyncFile(): Promise<void> {
  const w = window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<Handle> };
  if (!w.showSaveFilePicker) {
    toast('Syncing to a file needs a Chromium-based browser (Chrome, Edge, Brave…). Export and Import work everywhere.');
    return;
  }
  try {
    const h = await w.showSaveFilePicker({ suggestedName: 'my-presets.kfspresets', types: [{ description: 'Keyframe Studio presets', accept: { 'application/json': ['.kfspresets', '.json'] } }] });
    await linkPresetFile(h);
    if (syncStore.get().state === 'ok') toast(`Presets will now stay in sync with ${h.name}. Keep it in a cloud-synced folder to share them between machines.`);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return;
    toast('Could not link that file.');
  }
}

/** After a reload the browser wants a click before it re-grants access to the file. */
export async function reconnectSync(): Promise<void> {
  if (!handle) return;
  try {
    await handle.requestPermission?.({ mode: 'readwrite' });
  } catch {
    /* denied */
  }
  await syncNow();
}

export async function unlinkSync(): Promise<void> {
  handle = null;
  try {
    await idb((s) => s.delete(HANDLE_KEY), 'readwrite');
  } catch {
    /* nothing stored */
  }
  set({ state: 'off', name: '', message: '' });
}

/** Called at start-up: pick the link back up and pull in anything that changed while the app was closed. */
export async function restoreSync(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const h = await idb<Handle | undefined>((s) => s.get(HANDLE_KEY) as IDBRequest<Handle | undefined>, 'readonly');
    if (!h) return;
    handle = h;
    set({ name: h.name });
    await syncNow();
  } catch {
    /* no stored link */
  }
}

/** Debounced: write local changes out soon after they happen. */
function scheduleSync(): void {
  if (!handle) return;
  clearTimeout(timer);
  timer = window.setTimeout(() => void syncNow(), 700);
}

if (typeof window !== 'undefined') {
  let seen = presetStore.get();
  presetStore.subscribe(() => {
    const now = presetStore.get();
    if (now !== seen) {
      seen = now;
      scheduleSync();
    }
  });
  // pull in changes made elsewhere when the user comes back to this tab
  const refresh = () => {
    if (handle && document.visibilityState === 'visible' && Date.now() - lastRun > 2000) void syncNow();
  };
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', refresh);
}
