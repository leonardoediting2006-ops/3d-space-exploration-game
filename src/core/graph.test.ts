import { describe, expect, it } from 'vitest';
import { baseValue } from './interp';
import { dominantComponent, easeFromValueHandle, easeHandles, easeSlope, fitRange, inSpeed, isGraphable, niceTicks, outSpeed, segmentAt, speedAt, timeStep, valueHandles, withInSpeed, withOutSpeed } from './graph';
import type { Ease, Keyframe, Prop } from './types';

let n = 0;
const key = (t: number, v: number | number[], ease: Ease = 'linear', extra: Partial<Keyframe> = {}): Keyframe => ({ id: `k${n++}`, t, v, ease, ...extra });
const numProp = (keys: Keyframe[]): Prop => ({ kind: 'number', label: 'N', value: 0, keys }) as Prop;
const vecProp = (keys: Keyframe[]): Prop => ({ kind: 'vec2', label: 'V', value: [0, 0], keys }) as Prop;

describe('easing slope', () => {
  it('is 1 for linear and 0 for hold', () => {
    expect(easeSlope('linear', 0.3)).toBe(1);
    expect(easeSlope('hold', 0.3)).toBe(0);
  });

  it('matches a numeric derivative of the progress curve', () => {
    for (const e of [[0.42, 0, 0.58, 1], [0.17, 0.67, 0.83, 0.67], [0.68, -0.55, 0.27, 1.55], [0.33, 0, 0.67, 1]] as Ease[]) {
      for (const u of [0.1, 0.35, 0.5, 0.8]) {
        const h = 2e-3;
        const num = (progress(e, u + h) - progress(e, u - h)) / (2 * h);
        expect(easeSlope(e, u)).toBeCloseTo(num, 2);
      }
    }
  });

  it('works for named curves too', () => {
    expect(easeSlope('bounceOut', 0.05)).toBeGreaterThan(0);
    expect(Math.abs(easeSlope('steps4', 0.12))).toBeLessThan(1e-6);
  });
});

function progress(e: Ease, u: number): number {
  // the same curve, through the public value path: a 0→1 number property
  const p = numProp([key(0, 0, e), key(1, 1)]);
  return baseValue(p, u) as number;
}

describe('speed', () => {
  it('is constant for a linear segment: change over time', () => {
    const p = numProp([key(0, 0), key(2, 100)]);
    expect(speedAt(p, 0.5)).toBeCloseTo(50, 6);
    expect(speedAt(p, 1.9)).toBeCloseTo(50, 6);
    expect(speedAt(p, 5)).toBe(0);
    expect(speedAt(p, -1)).toBe(0);
  });

  it('is signed for numbers', () => {
    expect(speedAt(numProp([key(0, 100), key(1, 0)]), 0.5)).toBeCloseTo(-100, 6);
  });

  it('follows the path for positions, including curved ones', () => {
    const straight = vecProp([key(0, [0, 0]), key(2, [300, 400])]);
    expect(speedAt(straight, 1)).toBeCloseTo(250, 6); // 500 px over 2 s
    const curved = vecProp([key(0, [0, 0], 'linear', { sOut: [0, 200] }), key(2, [300, 0], 'linear', { sIn: [0, 200] })]);
    // the arc is longer than the 300 px chord, so the same time means a faster pass
    expect(speedAt(curved, 1)).toBeGreaterThan(150);
  });

  it('integrates back to the change in value', () => {
    const e: Ease = [0.42, 0, 0.58, 1];
    const p = numProp([key(0, 10, e), key(2, 90)]);
    let area = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) area += (speedAt(p, ((i + 0.5) / N) * 2) * 2) / N;
    expect(area).toBeCloseTo(80, 1);
  });

  it('a hold segment has no speed', () => {
    expect(speedAt(numProp([key(0, 0, 'hold'), key(1, 50)]), 0.5)).toBe(0);
  });

  it('finds segments', () => {
    const ks = [key(0, 0), key(1, 1), key(3, 2)];
    expect([-1, 0, 0.5, 1, 2, 3, 4].map((t) => segmentAt(ks, t))).toEqual([-1, 0, 0, 1, 1, 1, -1]);
  });
});

describe('speed handles', () => {
  it('read the speed and influence off an ease, and write them back', () => {
    const p = numProp([key(0, 0, [0.3, 0.3, 0.7, 0.7]), key(2, 100)]);
    const out = outSpeed(p, 0)!;
    const into = inSpeed(p, 0)!;
    expect(out.influence).toBeCloseTo(0.3);
    expect(out.speed).toBeCloseTo(50, 5);
    expect(into.influence).toBeCloseTo(0.3);
    expect(into.speed).toBeCloseTo(50, 5);

    // a leaving speed of 0 with 40 % influence is an ease-out start
    const flat = withOutSpeed(p, 0, { influence: 0.4, speed: 0 })!;
    expect(flat[0]).toBeCloseTo(0.4);
    expect(flat[1]).toBeCloseTo(0);
    expect(flat[2]).toBeCloseTo(0.7);
    p.keys[0].ease = flat;
    expect(outSpeed(p, 0)!.speed).toBeCloseTo(0, 6);
    expect(Math.abs(speedAt(p, 0.001))).toBeLessThan(0.5);

    const soft = withInSpeed(p, 0, { influence: 0.5, speed: 0 })!;
    expect(soft[2]).toBeCloseTo(0.5);
    expect(soft[3]).toBeCloseTo(1);
    p.keys[0].ease = soft;
    expect(inSpeed(p, 0)!.speed).toBeCloseTo(0, 6);
  });

  it('round-trip a speed through the ease', () => {
    const p = numProp([key(0, 20, [0.25, 0.1, 0.75, 0.9]), key(1.5, 140)]);
    for (const speed of [-40, 0, 30, 200]) {
      const e = withOutSpeed(p, 0, { influence: 0.35, speed })!;
      p.keys[0].ease = e;
      const back = outSpeed(p, 0)!;
      expect(back.speed).toBeCloseTo(speed, 4);
      expect(back.influence).toBeCloseTo(0.35, 6);
    }
  });

  it('do nothing for hold and named curves, and keep y when nothing moves', () => {
    expect(outSpeed(numProp([key(0, 0, 'hold'), key(1, 5)]), 0)).toBeNull();
    expect(withOutSpeed(numProp([key(0, 0, 'bounceOut'), key(1, 5)]), 0, { influence: 0.5, speed: 3 })).toBeNull();
    const still = numProp([key(0, 7, [0.2, 0.3, 0.8, 0.9]), key(1, 7)]);
    expect(withOutSpeed(still, 0, { influence: 0.5, speed: 99 })).toEqual([0.5, 0.3, 0.8, 0.9]);
  });

  it('linear is a bezier too, so its handles can be dragged', () => {
    expect(easeHandles('linear')).toEqual([1 / 3, 1 / 3, 2 / 3, 2 / 3]);
    const p = numProp([key(0, 0), key(3, 90)]);
    expect(outSpeed(p, 0)!.speed).toBeCloseTo(30, 6);
  });
});

describe('value handles', () => {
  it('sit at the ease points scaled into the segment', () => {
    const k0 = key(1, 10, [0.25, 0.5, 0.75, 1]);
    const k1 = key(3, 50);
    const h = valueHandles(k0, k1, 0)!;
    expect(h.out).toEqual([1.5, 30]);
    expect(h.in[0]).toBeCloseTo(2.5);
    expect(h.in[1]).toBeCloseTo(50);
    expect(valueHandles(key(0, 0, 'hold'), key(1, 1), 0)).toBeNull();
  });

  it('turn a drag into an ease, clamped in time and able to overshoot in value', () => {
    const k0 = key(0, 0, 'linear');
    const k1 = key(2, 100);
    expect(easeFromValueHandle(k0, k1, 0, 'out', 0.5, 25)).toEqual([0.25, 0.25, 2 / 3, 2 / 3]);
    expect(easeFromValueHandle(k0, k1, 0, 'in', 1.5, 150)).toEqual([1 / 3, 1 / 3, 0.75, 1.5]);
    expect(easeFromValueHandle(k0, k1, 0, 'out', -5, 25)![0]).toBe(0);
    expect(easeFromValueHandle(k0, k1, 0, 'out', 99, 25)![0]).toBe(1);
    expect(easeFromValueHandle(k0, k1, 0, 'out', 1, 1e6)![1]).toBe(4);
  });

  it('keeps y when the component does not move', () => {
    const k0 = key(0, [5, 0], [0.2, 0.3, 0.8, 0.9]);
    const k1 = key(1, [5, 40]);
    expect(easeFromValueHandle(k0, k1, 0, 'out', 0.5, 99)).toEqual([0.5, 0.3, 0.8, 0.9]);
    expect(dominantComponent(k0, k1)).toBe(1);
    expect(dominantComponent(key(0, [0, 0]), key(1, [9, 2]))).toBe(0);
    expect(dominantComponent(key(0, 1), key(1, 2))).toBe(0);
  });
});

describe('ranges and ticks', () => {
  it('fits a range with padding, and never a zero-height one', () => {
    const r = fitRange([10, 20, 30]);
    expect(r.lo).toBeLessThan(10);
    expect(r.hi).toBeGreaterThan(30);
    const flat = fitRange([5, 5]);
    expect(flat.hi - flat.lo).toBeGreaterThan(1);
    expect(fitRange([])).toEqual({ lo: -1, hi: 1 });
  });

  it('a robust fit ignores a spike', () => {
    const v = Array.from({ length: 100 }, (_, i) => i / 10);
    v[50] = 1e6;
    expect(fitRange(v, 0.1, true).hi).toBeLessThan(15);
    expect(fitRange(v, 0.1, false).hi).toBeGreaterThan(1e5);
  });

  it('picks tidy ticks', () => {
    expect(niceTicks(0, 100, 5)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(niceTicks(-1, 1, 4)).toEqual([-1, -0.5, 0, 0.5, 1]);
    expect(niceTicks(3, 3)).toEqual([3]);
    expect(niceTicks(0, 1, 5).every((v) => v >= 0 && v <= 1)).toBe(true);
  });

  it('chooses a time step that keeps labels apart', () => {
    expect(timeStep(100)).toBe(1);
    expect(timeStep(1000)).toBe(0.1);
    expect(timeStep(10)).toBe(10);
  });

  it('knows which properties it can draw', () => {
    expect(isGraphable(numProp([key(0, 1)]))).toBe(true);
    expect(isGraphable(numProp([]))).toBe(false);
    expect(isGraphable({ kind: 'color', label: 'c', value: [0, 0, 0], keys: [key(0, [1, 2, 3])] } as Prop)).toBe(false);
  });
});
