// Moving presets between browsers and machines: a small JSON file format, a merge that keeps the
// newest copy of each preset (and remembers deletions), and a duplicate-aware import. Pure, so it is
// unit-tested without a browser; src/state/presets.ts and presetSync.ts do the I/O.
import { uid } from '../core/ids';
import { sanitizePreset, type UserPreset } from './userPresets';

export const PRESET_FILE_FORMAT = 'keyframe-studio-presets';
export const PRESET_FILE_VERSION = 1;
export const MAX_PRESETS = 100;
const MAX_FILE_CHARS = 8_000_000;
const MAX_TOMBSTONES = 500;

export interface PresetBundle {
  presets: UserPreset[];
  /** Presets that were deleted, by id → when. Lets a deletion on one machine reach the others. */
  deleted: Record<string, number>;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const stamp = (p: UserPreset) => p.updatedAt ?? 0;

export function serializePresets(presets: UserPreset[], deleted: Record<string, number> = {}): string {
  const tombs = Object.keys(deleted).length ? { deleted } : {};
  return JSON.stringify({ format: PRESET_FILE_FORMAT, version: PRESET_FILE_VERSION, presets, ...tombs }, null, 1);
}

export type PresetParse = { ok: true; bundle: PresetBundle; skipped: number } | { ok: false; error: string };

/** Read a presets file. Everything in it is untrusted: each preset is rebuilt from scratch and anything malformed is dropped. */
export function parsePresetFile(text: string): PresetParse {
  if (text.length > MAX_FILE_CHARS) return { ok: false, error: 'That file is too large to be a presets file.' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That is not a valid presets file (it is not JSON).' };
  }
  if (!isObj(raw) || raw.format !== PRESET_FILE_FORMAT || !Array.isArray(raw.presets)) return { ok: false, error: 'That file is not a Keyframe Studio presets file.' };
  if (typeof raw.version === 'number' && raw.version > PRESET_FILE_VERSION) return { ok: false, error: 'That presets file was made by a newer version of Keyframe Studio.' };
  const presets: UserPreset[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const r of raw.presets.slice(0, MAX_PRESETS * 3)) {
    const p = sanitizePreset(r);
    if (!p || seen.has(p.id)) {
      skipped++;
      continue;
    }
    seen.add(p.id);
    presets.push(p);
  }
  const deleted: Record<string, number> = {};
  if (isObj(raw.deleted)) {
    for (const [id, at] of Object.entries(raw.deleted).slice(0, MAX_TOMBSTONES)) {
      if (id.startsWith('user.') && id.length <= 60 && typeof at === 'number' && Number.isFinite(at) && at > 0 && at < 4e12) deleted[id] = Math.floor(at);
    }
  }
  return { ok: true, bundle: { presets, deleted }, skipped };
}

/** What a preset *is*, ignoring its id, name and timestamp — two presets with the same signature do the same thing. */
export function presetSignature(p: UserPreset): string {
  return JSON.stringify({ kind: p.kind, slot: p.slot, props: p.props, effects: p.effects, animators: p.animators }, (k, v) => (k === 'id' ? undefined : v));
}

const sameBundle = (a: PresetBundle, b: PresetBundle) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Merge two copies of the library (this browser's and a synced file's). Per preset the newer
 * `updatedAt` wins; a deletion wins over an older copy but not over a newer one. Newest first.
 */
export function mergeBundles(local: PresetBundle, remote: PresetBundle): PresetBundle {
  const byId = new Map<string, UserPreset>();
  for (const p of [...local.presets, ...remote.presets]) {
    const cur = byId.get(p.id);
    if (!cur || stamp(p) > stamp(cur)) byId.set(p.id, p);
  }
  const deleted: Record<string, number> = { ...remote.deleted };
  for (const [id, at] of Object.entries(local.deleted)) deleted[id] = Math.max(at, deleted[id] ?? 0);
  for (const [id, at] of Object.entries(deleted)) {
    const p = byId.get(id);
    if (!p) continue;
    if (at >= stamp(p)) byId.delete(id);
    else delete deleted[id]; // re-created after the deletion
  }
  const presets = [...byId.values()].sort((a, b) => stamp(b) - stamp(a)).slice(0, MAX_PRESETS);
  const kept = Object.entries(deleted).sort((a, b) => b[1] - a[1]).slice(0, MAX_TOMBSTONES);
  return { presets, deleted: Object.fromEntries(kept) };
}

export const bundlesDiffer = (a: PresetBundle, b: PresetBundle) => !sameBundle(a, b);

export interface ImportResult {
  presets: UserPreset[];
  added: UserPreset[];
  /** Already in the library (same content) and so left alone. */
  duplicates: number;
  /** Not added because the library is full. */
  overflow: number;
}

/**
 * Add presets from a file the user chose. Nothing already in the library is replaced: presets that do the same
 * thing as one you have are skipped, and one that only shares an id gets a fresh id. Newest first.
 */
export function importPresets(existing: UserPreset[], incoming: UserPreset[], now = Date.now()): ImportResult {
  const sigs = new Set(existing.map(presetSignature));
  const ids = new Set(existing.map((p) => p.id));
  const added: UserPreset[] = [];
  let duplicates = 0;
  let overflow = 0;
  for (const p of incoming) {
    const sig = presetSignature(p);
    if (sigs.has(sig)) {
      duplicates++;
      continue;
    }
    if (existing.length + added.length >= MAX_PRESETS) {
      overflow++;
      continue;
    }
    sigs.add(sig);
    let id = p.id;
    if (ids.has(id)) id = `user.${uid('p').slice(2)}`;
    ids.add(id);
    added.push({ ...p, id, updatedAt: now });
  }
  return { presets: [...added, ...existing], added, duplicates, overflow };
}
