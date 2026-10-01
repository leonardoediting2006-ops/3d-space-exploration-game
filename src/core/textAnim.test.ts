import { describe, expect, it } from 'vitest';
import { createAnimator } from './factory';
import { setKeyAt } from './interp';
import { computeCharStyles, coverage, evalAnimator, mixColor, permutation, unitIndices, type AnimValues } from './textAnim';

const vals = (over: Partial<AnimValues> = {}): AnimValues => ({
  start: 0, end: 100, offset: 0, smooth: 100, units: 0, shape: 0, random: false, seed: 1,
  position: [0, 0], scale: [100, 100], rotation: 0, opacity: 100, tracking: 0, colorMix: 0, color: [255, 0, 0], ...over,
});

describe('text animator units', () => {
  it('counts characters across lines, ignoring newlines as units', () => {
    const { of, count } = unitIndices('ab\ncd', 0);
    expect(count).toBe(4);
    expect([of[0], of[1], of[3], of[4]]).toEqual([0, 1, 2, 3]);
  });
  it('groups characters into words, with spaces joining the previous word', () => {
    const { of, count } = unitIndices('hi there you', 1);
    expect(count).toBe(3);
    expect(of.slice(0, 2)).toEqual([0, 0]);
    expect(of.slice(3, 8)).toEqual([1, 1, 1, 1, 1]);
    expect(of[9]).toBe(2);
  });
  it('groups characters into lines', () => {
    const { of, count } = unitIndices('a\nbb\nc', 2);
    expect(count).toBe(3);
    expect([of[0], of[2], of[3], of[5]]).toEqual([0, 1, 1, 2]);
  });
});

describe('range selector coverage', () => {
  it('a full range covers everything and an empty one covers nothing', () => {
    for (let i = 0; i < 5; i++) expect(coverage(i, 5, vals())).toBeCloseTo(1);
    for (let i = 0; i < 5; i++) expect(coverage(i, 5, vals({ start: 0, end: 0 }))).toBe(0);
  });
  it('square edges are soft with 100% smoothness and crisp with 0%', () => {
    // range 0..50% of 4 units: unit 2 spans 50-75% → no overlap; unit 1 (25-50) fully in
    const soft = vals({ start: 0, end: 30 });
    expect(coverage(1, 4, soft)).toBeCloseTo(0.2, 5); // 25..30 of 25..50
    expect(coverage(1, 4, vals({ start: 0, end: 30, smooth: 0 }))).toBe(0); // centre (37.5%) is outside
    expect(coverage(0, 4, vals({ start: 0, end: 30, smooth: 0 }))).toBe(1);
  });
  it('offset slides the range', () => {
    expect(coverage(0, 4, vals({ start: 0, end: 25, offset: 50 }))).toBe(0);
    expect(coverage(2, 4, vals({ start: 0, end: 25, offset: 50 }))).toBeCloseTo(1);
  });
  it('ramp, triangle and round shapes peak where expected', () => {
    const n = 11;
    const ramp = Array.from({ length: n }, (_, i) => coverage(i, n, vals({ shape: 1 })));
    for (let i = 1; i < n; i++) expect(ramp[i]).toBeGreaterThan(ramp[i - 1]);
    const tri = Array.from({ length: n }, (_, i) => coverage(i, n, vals({ shape: 3 })));
    expect(tri.indexOf(Math.max(...tri))).toBe(5);
    const round = Array.from({ length: n }, (_, i) => coverage(i, n, vals({ shape: 4 })));
    expect(round[5]).toBeGreaterThan(0.99);
    expect(coverage(0, n, vals({ shape: 2 }))).toBeGreaterThan(coverage(10, n, vals({ shape: 2 })));
  });
});

describe('character styles', () => {
  it('applies position and opacity only to covered characters', () => {
    const styles = computeCharStyles('abcd', [vals({ start: 0, end: 50, smooth: 0, position: [0, -30], opacity: 0 })]);
    expect(styles[0].dy).toBe(-30);
    expect(styles[0].alpha).toBe(0);
    expect(styles[3].dy).toBe(0);
    expect(styles[3].alpha).toBe(1);
  });
  it('multiple animators stack: offsets add, scales and opacities multiply', () => {
    const s = computeCharStyles('a', [vals({ position: [10, 0], scale: [50, 50], opacity: 50 }), vals({ position: [5, 0], scale: [50, 50], opacity: 50 })])[0];
    expect(s.dx).toBe(15);
    expect(s.sx).toBeCloseTo(0.25);
    expect(s.alpha).toBeCloseTo(0.25);
  });
  it('colour mixing blends toward the animator colour', () => {
    const s = computeCharStyles('a', [vals({ colorMix: 50, color: [255, 0, 0] })])[0];
    expect(mixColor([0, 0, 0], s.mix)).toEqual([127.5, 0, 0]);
  });
  it('randomised order is a stable permutation', () => {
    const p = permutation(20, 7);
    expect([...p].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(permutation(20, 7)).toBe(p);
    expect(permutation(20, 8)).not.toEqual(p);
    const styles = computeCharStyles('abcdefghij', [vals({ random: true, seed: 3, start: 0, end: 50, smooth: 0, opacity: 0 })]);
    expect(styles.filter((s) => s.alpha === 0)).toHaveLength(5);
  });
});

describe('animator properties', () => {
  it('evaluate keyframes over time', () => {
    const a = createAnimator('A', 'opacity');
    setKeyAt(a.props.start, 0, 0, 1e-3);
    setKeyAt(a.props.start, 2, 100, 1e-3);
    expect(evalAnimator(a, 1).start).toBeCloseTo(50);
    expect(evalAnimator(a, 1).opacity).toBe(0);
  });
  it('presets pre-set the property they drive', () => {
    expect(createAnimator('p', 'position').props.position.value).toEqual([0, -60]);
    expect(createAnimator('s', 'scale').props.scale.value).toEqual([0, 0]);
    expect(createAnimator('c', 'color').props.colorMix.value).toBe(100);
  });
});
