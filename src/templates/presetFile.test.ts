import { describe, expect, it } from 'vitest';
import { createComp, createProject, createShape, createText } from '../core/factory';
import { applyTemplateToLayer } from '../state/templateActions';
import { LIBRARY } from './index';
import { bundlesDiffer, importPresets, MAX_PRESETS, mergeBundles, parsePresetFile, presetSignature, serializePresets, type PresetBundle } from './presetFile';
import { captureAnimation, captureLook, type UserPreset } from './userPresets';
import type { LayerTemplate } from './types';

// templateActions pulls in the store, which only needs a frame scheduler to import
globalThis.requestAnimationFrame ??= (() => 0) as typeof requestAnimationFrame;
globalThis.cancelAnimationFrame ??= (() => undefined) as typeof cancelAnimationFrame;

const tpl = (id: string): LayerTemplate => {
  for (const c of ['motion', 'textAnim', 'effect'] as const) {
    const hit = LIBRARY[c].find((i) => i.id === id);
    if (hit && 'template' in hit) return hit.template;
  }
  throw new Error(`no template ${id}`);
};

/** A few real presets, captured the way the app does it. */
function makePresets(): UserPreset[] {
  const project = createProject();
  const comp = createComp({ name: 'T', width: 1920, height: 1080, fps: 30, duration: 10 });
  project.comps = { [comp.id]: comp };
  project.compOrder = [comp.id];
  const shape = createShape({ name: 'A', comp, time: 0, shape: 'rect', size: [300, 300], position: [960, 540] });
  const text = createText({ name: 'T', comp, time: 0, text: 'Hello World', position: [960, 540] });
  comp.layers = [shape, text];
  const ctx = { project, comp, t: 1, fps: 30 };
  applyTemplateToLayer(shape, tpl('motion.slideInLeft'), ctx);
  applyTemplateToLayer(text, tpl('textanim.softReveal'), ctx);
  applyTemplateToLayer(shape, tpl('look.pulseGlow'), ctx);
  const out = [captureAnimation(shape, shape.anims[0], 'Slide')!, captureAnimation(text, text.anims[0], 'Letters')!, captureLook(shape, 'Glow look')!];
  return out.map((p, i) => ({ ...p, updatedAt: 1000 + i }));
}

const bundle = (presets: UserPreset[], deleted: Record<string, number> = {}): PresetBundle => ({ presets, deleted });

describe('presets file', () => {
  it('round-trips real presets', () => {
    const presets = makePresets();
    expect(presets).toHaveLength(3);
    const parsed = parsePresetFile(serializePresets(presets));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.skipped).toBe(0);
    expect(parsed.bundle.presets.map((p) => p.name)).toEqual(['Slide', 'Letters', 'Glow look']);
    parsed.bundle.presets.forEach((p, i) => {
      expect(presetSignature(p)).toBe(presetSignature(presets[i]));
      expect(p.updatedAt).toBe(presets[i].updatedAt);
    });
  });

  it('carries deletions', () => {
    const parsed = parsePresetFile(serializePresets([], { 'user.abc': 5000 }));
    expect(parsed.ok && parsed.bundle.deleted).toEqual({ 'user.abc': 5000 });
  });

  it('rejects things that are not presets files', () => {
    for (const bad of ['', 'not json', '[]', '{}', JSON.stringify({ format: 'something-else', presets: [] }), JSON.stringify({ format: 'keyframe-studio-presets' }), JSON.stringify({ format: 'keyframe-studio-presets', version: 99, presets: [] })]) {
      expect(parsePresetFile(bad).ok).toBe(false);
    }
    expect(parsePresetFile('x'.repeat(8_100_000)).ok).toBe(false);
  });

  it('drops malformed or hostile presets and keeps the good ones', () => {
    const good = makePresets()[0];
    const text = JSON.stringify({
      format: 'keyframe-studio-presets',
      version: 1,
      presets: [good, 'junk', null, { id: 'evil', name: 'x' }, { ...good, id: 'user.dup1' }, { id: 'user.nan', name: 'n', kind: 'motion', props: [{ target: { group: 'transform', key: 'position' }, keys: [{ t: 0, v: [1e999, 2], ease: 'linear' }] }] }, good],
      deleted: { 'user.ok': 10, 'notuser': 5, 'user.bad': 'x', 'user.neg': -3 },
    });
    const parsed = parsePresetFile(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // the first, the duplicate-content one with its own id; the repeated id and the broken ones are skipped
    expect(parsed.bundle.presets.map((p) => p.id)).toEqual([good.id, 'user.dup1']);
    expect(parsed.skipped).toBe(5);
    expect(parsed.bundle.deleted).toEqual({ 'user.ok': 10 });
  });

  it('ignores a wild updatedAt', () => {
    const good = makePresets()[0];
    const parsed = parsePresetFile(JSON.stringify({ format: 'keyframe-studio-presets', version: 1, presets: [{ ...good, updatedAt: 1e300 }, { ...good, id: 'user.b', updatedAt: -4 }] }));
    expect(parsed.ok && parsed.bundle.presets.map((p) => p.updatedAt)).toEqual([undefined, undefined]);
  });
});

describe('merging libraries', () => {
  const [a, b, c] = makePresets();

  it('unions both sides, newest first', () => {
    const merged = mergeBundles(bundle([a]), bundle([c, b]));
    expect(merged.presets.map((p) => p.name)).toEqual(['Glow look', 'Letters', 'Slide']);
  });

  it('keeps the newer copy of the same preset, whichever side has it', () => {
    const renamedLater = { ...a, name: 'Slide v2', updatedAt: 9000 };
    expect(mergeBundles(bundle([a]), bundle([renamedLater])).presets[0].name).toBe('Slide v2');
    expect(mergeBundles(bundle([renamedLater]), bundle([a])).presets[0].name).toBe('Slide v2');
  });

  it('a deletion removes an older copy on the other side', () => {
    const merged = mergeBundles(bundle([a, b]), bundle([], { [a.id]: 5000 }));
    expect(merged.presets.map((p) => p.id)).toEqual([b.id]);
    expect(merged.deleted[a.id]).toBe(5000);
    // …and the other direction
    const merged2 = mergeBundles(bundle([], { [a.id]: 5000 }), bundle([a, b]));
    expect(merged2.presets.map((p) => p.id)).toEqual([b.id]);
  });

  it('but not a copy that was edited after the deletion', () => {
    const later = { ...a, updatedAt: 8000 };
    const merged = mergeBundles(bundle([later]), bundle([], { [a.id]: 5000 }));
    expect(merged.presets.map((p) => p.id)).toEqual([a.id]);
    expect(merged.deleted[a.id]).toBeUndefined();
  });

  it('is commutative and idempotent', () => {
    const left = bundle([a, b], { 'user.x': 100 });
    const right = bundle([b, { ...c, updatedAt: 3 }], { 'user.y': 200, [a.id]: 1500 });
    const m1 = mergeBundles(left, right);
    const m2 = mergeBundles(right, left);
    expect(JSON.stringify(m1)).toBe(JSON.stringify(m2));
    expect(bundlesDiffer(mergeBundles(m1, left), m1)).toBe(false);
    expect(bundlesDiffer(mergeBundles(m1, m1), m1)).toBe(false);
  });

  it('never grows past the library limit', () => {
    const many = Array.from({ length: MAX_PRESETS + 30 }, (_, i) => ({ ...a, id: `user.m${i}`, updatedAt: 10 + i }));
    const merged = mergeBundles(bundle(many.slice(0, 60)), bundle(many.slice(60)));
    expect(merged.presets).toHaveLength(MAX_PRESETS);
    expect(merged.presets[0].id).toBe(`user.m${MAX_PRESETS + 29}`);
  });
});

describe('importing a file', () => {
  const [a, b, c] = makePresets();

  it('adds what is new, in front, without touching what is there', () => {
    const res = importPresets([a], [b, c], 7777);
    expect(res.added.map((p) => p.name)).toEqual(['Letters', 'Glow look']);
    expect(res.presets.map((p) => p.name)).toEqual(['Letters', 'Glow look', 'Slide']);
    expect(res.added.every((p) => p.updatedAt === 7777)).toBe(true);
    expect(res.duplicates).toBe(0);
  });

  it('skips presets that do the same as one you have, even under another name or id', () => {
    const res = importPresets([a], [{ ...a }, { ...a, id: 'user.other', name: 'Renamed copy' }, b]);
    expect(res.duplicates).toBe(2);
    expect(res.added.map((p) => p.name)).toEqual(['Letters']);
  });

  it('gives a different preset that reuses an id a fresh id', () => {
    const changed = { ...b, id: a.id };
    const res = importPresets([a], [changed]);
    expect(res.added).toHaveLength(1);
    expect(res.added[0].id).not.toBe(a.id);
    expect(res.presets.map((p) => p.id)).toContain(a.id);
    expect(new Set(res.presets.map((p) => p.id)).size).toBe(2);
  });

  it('stops at the library limit and says how many it left out', () => {
    const full = Array.from({ length: MAX_PRESETS - 1 }, (_, i) => ({ ...a, id: `user.f${i}`, props: [], effects: [], animators: [], name: `F${i}`, kind: 'motion' as const, slot: null, length: i }));
    const res = importPresets(full, [b, c]);
    expect(res.presets).toHaveLength(MAX_PRESETS);
    expect(res.overflow).toBe(1);
  });
});
