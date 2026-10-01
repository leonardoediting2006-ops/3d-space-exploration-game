import { uid } from './ids';
import type { Ease, Keyframe, Prop, PropValue } from './types';

export type Bezier = [number, number, number, number];
export const EASY_EASE: Bezier = [0.33, 0, 0.67, 1];
export const EASE_IN: Bezier = [0.42, 0, 1, 1];
export const EASE_OUT: Bezier = [0, 0, 0.58, 1];

/** Solve a CSS-style cubic bezier (0,0)-(x1,y1)-(x2,y2)-(1,1) for y at the given x. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bx = (t: number) => 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
  const by = (t: number) => 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
  const dbx = (t: number) =>
    3 * (1 - t) * (1 - t) * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (1 - x2);
  let t = x;
  for (let i = 0; i < 8; i++) {
    const err = bx(t) - x;
    if (Math.abs(err) < 1e-6) return by(t);
    const d = dbx(t);
    if (Math.abs(d) < 1e-6) break;
    t -= err / d;
  }
  let lo = 0;
  let hi = 1;
  t = x;
  for (let i = 0; i < 40; i++) {
    const err = bx(t) - x;
    if (Math.abs(err) < 1e-6) break;
    if (err > 0) hi = t;
    else lo = t;
    t = (lo + hi) / 2;
  }
  return by(t);
}

export function easeProgress(ease: Ease, u: number): number {
  if (ease === 'linear') return u;
  if (ease === 'hold') return 0;
  return cubicBezier(ease[0], ease[1], ease[2], ease[3], u);
}

export function lerpValue(a: PropValue, b: PropValue, u: number): PropValue {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * u;
  const aa = a as number[];
  const bb = b as number[];
  return aa.map((v, i) => v + ((bb[i] ?? v) - v) * u);
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth 1-D value noise in 0..1. */
export function noise1(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}

function loopTime(keys: Keyframe[], t: number, mode: 'cycle' | 'pingpong'): number {
  const t0 = keys[0].t;
  const t1 = keys[keys.length - 1].t;
  const d = t1 - t0;
  if (d <= 0 || t <= t1) return t;
  const over = t - t0;
  const k = Math.floor(over / d);
  const r = over - k * d;
  if (mode === 'cycle') return t0 + r;
  return t0 + (k % 2 === 0 ? r : d - r);
}

/** The keyframed (or static) value, ignoring wiggle. */
export function baseValue(prop: Prop, t: number): PropValue {
  const keys = prop.keys;
  if (keys.length === 0) return prop.value;
  if (keys.length === 1) return keys[0].v;
  const tt = prop.loop ? loopTime(keys, t, prop.loop) : t;
  if (tt <= keys[0].t) return keys[0].v;
  const last = keys[keys.length - 1];
  if (tt >= last.t) return last.v;
  // binary search for the segment containing tt
  let lo = 0;
  let hi = keys.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (keys[mid].t <= tt) lo = mid;
    else hi = mid;
  }
  const k0 = keys[lo];
  const k1 = keys[hi];
  if (k0.ease === 'hold') return k0.v;
  const u = (tt - k0.t) / (k1.t - k0.t);
  return lerpValue(k0.v, k1.v, easeProgress(k0.ease, u));
}

/** Full value of a property at comp time t, including wiggle and clamping. */
export function evalProp(prop: Prop, t: number): PropValue {
  let v = baseValue(prop, t);
  if (prop.kind === 'path') return v;
  if (prop.wiggle && prop.wiggle.amp !== 0) {
    const { freq, amp, seed } = prop.wiggle;
    const n = (axis: number) => (noise1(t * freq + seed * 17.3 + axis * 101.7) * 2 - 1) * amp;
    v = typeof v === 'number' ? v + n(0) : v.map((x, i) => x + n(i));
  }
  if (typeof v === 'number') return clampValue(prop, v);
  if (prop.kind === 'color') return v.map((x) => Math.min(255, Math.max(0, x)));
  return v;
}

function clampValue(prop: Prop, v: number): number {
  if (prop.min !== undefined && v < prop.min) return prop.min;
  if (prop.max !== undefined && v > prop.max) return prop.max;
  return v;
}

export const num = (v: PropValue): number => (typeof v === 'number' ? v : v[0]);
export const vec = (v: PropValue): [number, number] =>
  typeof v === 'number' ? [v, v] : [v[0], v[1] ?? v[0]];

/** Evaluate and coerce to a number / vec2 / rgb triple. */
export const evalNum = (p: Prop, t: number): number => num(evalProp(p, t));
export const evalVec = (p: Prop, t: number): [number, number] => vec(evalProp(p, t));
export const evalColor = (p: Prop, t: number): [number, number, number] => {
  const v = evalProp(p, t) as number[];
  return [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0];
};

export const cssColor = (c: number[], alpha = 1): string =>
  `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha})`;

/* ------------------------------------------------------------------ keyframe editing */

export function sortKeys(prop: Prop): void {
  prop.keys.sort((a, b) => a.t - b.t);
}

export function keyNear(prop: Prop, t: number, tol: number): Keyframe | undefined {
  return prop.keys.find((k) => Math.abs(k.t - t) <= tol);
}

/** Add or update a keyframe at time t. */
export function setKeyAt(prop: Prop, t: number, v: PropValue, tol: number, ease: Ease = 'linear'): Keyframe {
  const existing = keyNear(prop, t, tol);
  if (existing) {
    existing.v = Array.isArray(v) ? [...v] : v;
    return existing;
  }
  const k: Keyframe = { id: uid('k'), t, v: Array.isArray(v) ? [...v] : v, ease };
  prop.keys.push(k);
  sortKeys(prop);
  return k;
}

/** Turn the stopwatch on (one keyframe at t holding the current value) or off (static value). */
export function setAnimated(prop: Prop, animated: boolean, t: number): void {
  if (animated) {
    if (prop.keys.length === 0) {
      prop.keys.push({ id: uid('k'), t, v: Array.isArray(prop.value) ? [...prop.value] : prop.value, ease: 'linear' });
    }
  } else {
    if (prop.keys.length > 0) {
      const v = baseValue(prop, t);
      prop.value = Array.isArray(v) ? [...v] : v;
    }
    prop.keys = [];
    delete prop.loop;
  }
}
