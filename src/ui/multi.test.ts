import { describe, expect, it } from 'vitest';
import { createEffect } from '../core/effectDefs';
import { createComp, createShape, createText } from '../core/factory';
import type { AnimInstance, Layer } from '../core/types';
import { applyEdit, commonContentKeys, commonOf, matchingEffect, matchingInstance, mixedParts, sharedEffects, sharedInstances } from './multi';

const comp = createComp({ name: 'T', width: 1920, height: 1080, fps: 30, duration: 10 });
const shape = (name: string) => createShape({ name, comp, time: 0, shape: 'rect', size: [100, 100], position: [100, 100] });
const inst = (id: string, template: string, slot: AnimInstance['slot'] = 'in'): AnimInstance => ({ id, template, name: template, kind: 'motion', slot, strength: 1 });
const fx = (layer: Layer, type: string) => {
  const e = createEffect(type, comp)!;
  layer.effects.push(e);
  return e;
};

describe('mixed values', () => {
  it('reports which components disagree', () => {
    expect(mixedParts([5, 5, 5])).toEqual([false]);
    expect(mixedParts([5, 5.0000001])).toEqual([false]);
    expect(mixedParts([5, 6])).toEqual([true]);
    expect(mixedParts([[1, 2], [1, 3]])).toEqual([false, true]);
    expect(mixedParts([[1, 2, 3], [1, 2, 3]])).toEqual([false, false, false]);
  });

  it('commonOf returns the shared value or flags a mix', () => {
    const a = shape('a');
    const b = shape('b');
    expect(commonOf([a, b], (l) => l.blend)).toEqual({ value: 'normal', mixed: false });
    b.blend = 'multiply';
    expect(commonOf([a, b], (l) => l.blend)).toEqual({ value: 'normal', mixed: true });
  });
});

describe('applying one edit to several layers', () => {
  it('sets every layer to a typed number', () => {
    expect(applyEdit(10, 50, 70, { how: 'set', comp: 0 })).toBe(70);
    expect(applyEdit(10, 10, 70)).toBe(70);
  });

  it('moves every layer by the same amount when scrubbing', () => {
    expect(applyEdit(10, 50, 60, { how: 'delta', comp: 0 })).toBe(20);
    expect(applyEdit(300, 50, 40, { how: 'delta', comp: 0 })).toBe(290);
  });

  it('respects limits', () => {
    expect(applyEdit(95, 50, 60, { how: 'delta', comp: 0 }, { min: 0, max: 100 })).toBe(100);
    expect(applyEdit(5, 50, 40, { how: 'delta', comp: 0 }, { min: 0, max: 100 })).toBe(0);
    expect(applyEdit(5, 50, 400, { how: 'set', comp: 0 }, { min: 0, max: 100 })).toBe(100);
  });

  it('changes only the component that was edited', () => {
    // typing X = 500 leaves each layer's own Y alone
    expect(applyEdit([100, 7], [100, 20], [500, 20], { how: 'set', comp: 0 })).toEqual([500, 7]);
    expect(applyEdit([100, 7], [100, 20], [100, 90], { how: 'set', comp: 1 })).toEqual([100, 90]);
    // scrubbing X by +30 moves each layer's X by 30
    expect(applyEdit([40, 7], [100, 20], [130, 20], { how: 'delta', comp: 0 })).toEqual([70, 7]);
  });

  it('a linked pair (both components) shifts both', () => {
    expect(applyEdit([40, 80], [100, 100], [110, 110], { how: 'delta', comp: 'both' })).toEqual([50, 90]);
    expect(applyEdit([40, 80], [100, 100], [150, 150], { how: 'set', comp: 'both' })).toEqual([150, 150]);
  });

  it('colours are set whole', () => {
    expect(applyEdit([1, 2, 3], [9, 9, 9], [10, 20, 30], { how: 'set', comp: 'both' })).toEqual([10, 20, 30]);
  });

  it('never aliases the new value', () => {
    const next = [1, 2];
    const out = applyEdit([5, 6], [5, 6], next, { how: 'set', comp: 'both' }) as number[];
    out[0] = 99;
    expect(next[0]).toBe(1);
  });
});

describe('what several layers share', () => {
  it('lists effects that every layer has, matched by type and position', () => {
    const a = shape('a');
    const b = shape('b');
    const c = shape('c');
    const blurA = fx(a, 'gaussianBlur');
    const glowA = fx(a, 'glow');
    const blurB = fx(b, 'gaussianBlur');
    const glow1B = fx(b, 'glow');
    fx(b, 'glow'); // a second glow only B has
    fx(c, 'glow');
    expect(sharedEffects([a, b]).map((s) => s.items.map((i) => i.fx.id))).toEqual([
      [blurA.id, blurB.id],
      [glowA.id, glow1B.id],
    ]);
    // C has no blur, so only the glow is common to all three
    expect(sharedEffects([a, b, c]).map((s) => s.items[0].fx.type)).toEqual(['glow']);
    expect(matchingEffect(a, glowA, b)).toBe(glow1B);
    expect(matchingEffect(a, blurA, c)).toBeUndefined();
    // a single layer shares everything with itself
    expect(sharedEffects([a]).map((s) => s.items[0].fx.id)).toEqual([blurA.id, glowA.id]);
  });

  it('lists animations by library template and slot', () => {
    const a = shape('a');
    const b = shape('b');
    a.anims = [inst('a1', 'motion.slideInLeft'), inst('a2', 'motion.pulse', 'loop')];
    b.anims = [inst('b1', 'motion.slideInLeft'), inst('b2', 'motion.pulse', 'emph')];
    const shared = sharedInstances([a, b]);
    expect(shared).toHaveLength(1);
    expect(shared[0].items.map((i) => i.inst.id)).toEqual(['a1', 'b1']);
    expect(matchingInstance(a, a.anims[1], b)).toBeUndefined();
  });

  it('finds content properties every layer has, with the same kind', () => {
    const a = shape('a');
    const b = shape('b');
    const t = createText({ name: 't', comp, time: 0, text: 'hi', position: [0, 0] });
    expect(commonContentKeys([a, b])).toEqual(Object.keys(a.content));
    const common = commonContentKeys([a, t]);
    expect(common).toContain('fillColor');
    expect(common).not.toContain('size');
    expect(common).not.toContain('fontSize');
  });
});
