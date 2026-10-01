import { describe, expect, it } from 'vitest';
import { baseValue, cubicBezier, EASY_EASE, evalProp, setAnimated, setKeyAt } from './interp';
import { apply, invert, mul, rotation, scaling, translate } from './math';
import { makeProp, createComp, createShape, createProject } from './factory';
import { parseTimecode, timecode } from './time';
import { createEffect } from './effectDefs';

describe('cubicBezier', () => {
  it('is the identity for a linear curve', () => {
    for (const x of [0, 0.1, 0.5, 0.9, 1]) expect(cubicBezier(1 / 3, 1 / 3, 2 / 3, 2 / 3, x)).toBeCloseTo(x, 4);
  });
  it('easy ease is slow at the ends and fast in the middle', () => {
    expect(cubicBezier(...EASY_EASE, 0.1)).toBeLessThan(0.1);
    expect(cubicBezier(...EASY_EASE, 0.9)).toBeGreaterThan(0.9);
    expect(cubicBezier(...EASY_EASE, 0.5)).toBeCloseTo(0.5, 3);
  });
});

describe('keyframes', () => {
  it('interpolates numbers linearly and clamps outside the range', () => {
    const p = makeProp('number', 'x', 0);
    setKeyAt(p, 1, 0, 1e-4);
    setKeyAt(p, 3, 100, 1e-4);
    expect(baseValue(p, 0)).toBe(0);
    expect(baseValue(p, 2)).toBeCloseTo(50);
    expect(baseValue(p, 9)).toBe(100);
  });
  it('interpolates vectors elementwise', () => {
    const p = makeProp('vec2', 'p', [0, 0]);
    setKeyAt(p, 0, [0, 100], 1e-4);
    setKeyAt(p, 2, [200, 0], 1e-4);
    expect(baseValue(p, 1)).toEqual([100, 50]);
  });
  it('holds until the next keyframe when ease is hold', () => {
    const p = makeProp('number', 'x', 0);
    setKeyAt(p, 0, 10, 1e-4, 'hold');
    setKeyAt(p, 2, 20, 1e-4);
    expect(baseValue(p, 1.99)).toBe(10);
    expect(baseValue(p, 2)).toBe(20);
  });
  it('updates a keyframe in place when one exists near the time', () => {
    const p = makeProp('number', 'x', 0);
    setKeyAt(p, 1, 5, 0.01);
    setKeyAt(p, 1.001, 8, 0.01);
    expect(p.keys).toHaveLength(1);
    expect(p.keys[0].v).toBe(8);
  });
  it('keeps keys sorted', () => {
    const p = makeProp('number', 'x', 0);
    setKeyAt(p, 5, 1, 1e-4);
    setKeyAt(p, 1, 2, 1e-4);
    setKeyAt(p, 3, 3, 1e-4);
    expect(p.keys.map((k) => k.t)).toEqual([1, 3, 5]);
  });
  it('cycles and ping-pongs after the last keyframe', () => {
    const p = makeProp('number', 'x', 0);
    setKeyAt(p, 0, 0, 1e-4);
    setKeyAt(p, 1, 10, 1e-4);
    p.loop = 'cycle';
    expect(baseValue(p, 1.5)).toBeCloseTo(5);
    p.loop = 'pingpong';
    expect(baseValue(p, 1.25)).toBeCloseTo(7.5);
    expect(baseValue(p, 2.25)).toBeCloseTo(2.5);
  });
  it('turning the stopwatch off keeps the value at that moment', () => {
    const p = makeProp('number', 'x', 0);
    setKeyAt(p, 0, 0, 1e-4);
    setKeyAt(p, 2, 100, 1e-4);
    setAnimated(p, false, 1);
    expect(p.keys).toHaveLength(0);
    expect(p.value).toBeCloseTo(50);
  });
  it('wiggle is deterministic, bounded and does not touch the base value', () => {
    const p = makeProp('number', 'x', 50);
    p.wiggle = { freq: 3, amp: 10, seed: 1 };
    const a = evalProp(p, 1.234);
    expect(evalProp(p, 1.234)).toBe(a);
    for (let t = 0; t < 5; t += 0.1) expect(Math.abs((evalProp(p, t) as number) - 50)).toBeLessThanOrEqual(10);
    expect(p.value).toBe(50);
  });
  it('clamps to min/max', () => {
    const p = makeProp('number', 'o', 150, { min: 0, max: 100 });
    expect(evalProp(p, 0)).toBe(100);
  });
});

describe('matrices', () => {
  it('composes transforms in order', () => {
    const m = mul(translate(10, 20), mul(rotation(90), scaling(2, 2)));
    const p = apply(m, [1, 0]);
    expect(p[0]).toBeCloseTo(10);
    expect(p[1]).toBeCloseTo(22);
  });
  it('inverts', () => {
    const m = mul(translate(5, 6), mul(rotation(33), scaling(2, 3)));
    const inv = invert(m)!;
    const p = apply(inv, apply(m, [7, 8]));
    expect(p[0]).toBeCloseTo(7);
    expect(p[1]).toBeCloseTo(8);
  });
});

describe('timecode', () => {
  it('formats and parses frames', () => {
    expect(timecode(1.5, 30)).toBe('0:00:01:15');
    expect(parseTimecode('1:15', 30)).toBeCloseTo(1.5);
    expect(parseTimecode('45', 30)).toBeCloseTo(1.5);
    expect(parseTimecode('abc', 30)).toBeNull();
  });
});

describe('factories', () => {
  it('creates a project with one comp', () => {
    const p = createProject();
    expect(p.compOrder).toHaveLength(1);
    expect(p.comps[p.compOrder[0]].layers).toHaveLength(0);
  });
  it('shape layers carry the props their kind needs', () => {
    const comp = createComp({ name: 'c' });
    const star = createShape({ name: 's', comp, time: 0, shape: 'star', size: [100, 100] });
    expect(star.content.points).toBeDefined();
    expect(star.content.innerRatio).toBeDefined();
    const rect = createShape({ name: 'r', comp, time: 0, shape: 'rect', size: [100, 100] });
    expect(rect.content.roundness).toBeDefined();
    expect(rect.content.points).toBeUndefined();
  });
  it('effects start with defaults and comp-relative values', () => {
    const fx = createEffect('gradientRamp', { width: 640, height: 360 })!;
    expect(fx.props.end.value).toEqual([0, 360]);
    expect(createEffect('nope', { width: 1, height: 1 })).toBeNull();
  });
});

describe('motion paths', () => {
  const twoKeys = (sOut?: [number, number], sIn?: [number, number]) => {
    const p = makeProp('vec2', 'p', [0, 0]);
    const a = setKeyAt(p, 0, [0, 0], 1e-4);
    const b = setKeyAt(p, 1, [300, 0], 1e-4);
    if (sOut) a.sOut = sOut;
    if (sIn) b.sIn = sIn;
    return p;
  };

  it('without tangents the path is a straight line', () => {
    const p = twoKeys();
    expect(baseValue(p, 0.5)).toEqual([150, 0]);
  });

  it('with tangents the path bows away from the straight line', () => {
    const p = twoKeys([0, 100], [0, 100]);
    const mid = baseValue(p, 0.5) as number[];
    expect(mid[0]).toBeCloseTo(150, 0);
    expect(mid[1]).toBeGreaterThan(50);
    expect(baseValue(p, 0)).toEqual([0, 0]);
    expect(baseValue(p, 1)).toEqual([300, 0]);
  });

  it('linear timing means constant speed along the curve (arc-length parametrised)', () => {
    const p = twoKeys([0, 200], [-300, 0]); // an asymmetric curve: naive t-parametrisation would speed up and slow down
    const pts: number[][] = [];
    for (let i = 0; i <= 40; i++) pts.push(baseValue(p, i / 40) as number[]);
    const steps = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
    const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
    for (const s of steps) expect(Math.abs(s - mean) / mean).toBeLessThan(0.08);
  });

  it('editing a tangent in place invalidates the cached curve', () => {
    const p = twoKeys([0, 100], [0, 100]);
    const before = baseValue(p, 0.5) as number[];
    p.keys[0].sOut = [0, 400];
    const after = baseValue(p, 0.5) as number[];
    expect(after[1]).toBeGreaterThan(before[1]);
  });

  it('non-position kinds ignore tangents', () => {
    const p = makeProp('number', 'n', 0);
    setKeyAt(p, 0, 0, 1e-4);
    setKeyAt(p, 1, 10, 1e-4);
    expect(baseValue(p, 0.5)).toBe(5);
  });
});
