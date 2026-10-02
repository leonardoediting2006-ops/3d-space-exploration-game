// The maths behind the Graph Editor: speed along a keyframed property, the bezier handles of a
// segment's easing expressed as values or as speeds, and tidy axis ticks. Pure, so it is unit-tested.
import { easeProgress, segmentExtent } from './interp';
import type { Ease, Keyframe, Prop } from './types';

export type Bez4 = [number, number, number, number];

/** The bezier form of an ease, or null for hold and the named (bounce, elastic…) curves. */
export function easeHandles(ease: Ease): Bez4 | null {
  if (ease === 'linear') return [1 / 3, 1 / 3, 2 / 3, 2 / 3];
  if (ease === 'hold' || typeof ease === 'string') return null;
  return [ease[0], ease[1], ease[2], ease[3]];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Speeds are clipped for display so a vertical edge (a step) does not wreck the scale. */
const SLOPE_LIMIT = 60;

/** The curve parameter whose x is `u` (the bezier has x(0)=0, x(1)=1). */
function paramAt(x1: number, x2: number, u: number): number {
  let s = u;
  const bx = (t: number) => 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
  const dbx = (t: number) => 3 * (1 - t) * (1 - t) * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (1 - x2);
  for (let i = 0; i < 10; i++) {
    const err = bx(s) - u;
    if (Math.abs(err) < 1e-9) return s;
    const d = dbx(s);
    if (Math.abs(d) < 1e-9) break;
    s -= err / d;
  }
  let lo = 0;
  let hi = 1;
  s = clamp(u, 0, 1);
  for (let i = 0; i < 50; i++) {
    const err = bx(s) - u;
    if (Math.abs(err) < 1e-9) break;
    if (err > 0) hi = s;
    else lo = s;
    s = (lo + hi) / 2;
  }
  return s;
}

/** d(progress)/d(time fraction) of an easing at u in 0..1 — 1 for linear, 0 across a hold. */
export function easeSlope(ease: Ease, u: number): number {
  if (ease === 'hold') return 0;
  if (ease === 'linear') return 1;
  if (typeof ease === 'string') {
    const h = 1e-3;
    const a = clamp(u - h, 0, 1);
    const b = clamp(u + h, 0, 1);
    return clamp((easeProgress(ease, b) - easeProgress(ease, a)) / (b - a || 1), -SLOPE_LIMIT, SLOPE_LIMIT);
  }
  const [x1, y1, x2, y2] = ease;
  const uu = clamp(u, 1e-4, 1 - 1e-4);
  const s = paramAt(x1, x2, uu);
  const dx = 3 * (1 - s) * (1 - s) * x1 + 6 * (1 - s) * s * (x2 - x1) + 3 * s * s * (1 - x2);
  const dy = 3 * (1 - s) * (1 - s) * y1 + 6 * (1 - s) * s * (y2 - y1) + 3 * s * s * (1 - y2);
  if (Math.abs(dx) < 1e-6) return dy >= 0 ? SLOPE_LIMIT : -SLOPE_LIMIT;
  return clamp(dy / dx, -SLOPE_LIMIT, SLOPE_LIMIT);
}

/** Can the graph show and edit this property as a curve? */
export const isGraphable = (p: Prop): boolean => (p.kind === 'number' || p.kind === 'vec2') && p.keys.length > 0 && !p.options;

/** The index of the segment that contains time t, or -1 outside the keyframes. */
export function segmentAt(keys: Keyframe[], t: number): number {
  if (keys.length < 2 || t < keys[0].t || t > keys[keys.length - 1].t) return -1;
  let lo = 0;
  let hi = keys.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (keys[mid].t <= t) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Speed of the property at time t, in value units per second (signed for a number, along the path for a position). */
export function speedAt(prop: Prop, t: number): number {
  const i = segmentAt(prop.keys, t);
  if (i < 0) return 0;
  const k0 = prop.keys[i];
  const k1 = prop.keys[i + 1];
  const dur = k1.t - k0.t;
  if (dur <= 0 || k0.ease === 'hold') return 0;
  return (segmentExtent(k0, k1, prop.kind) / dur) * easeSlope(k0.ease, (t - k0.t) / dur);
}

/* ------------------------------------------------------------------ speed handles */

/** A speed handle: how far along the segment it reaches (0..1) and the speed it holds. */
export interface SpeedHandle {
  influence: number;
  speed: number;
}

/** Speed leaving keyframe i: x1 is the influence and the speed is the slope y1/x1 scaled by extent/duration. */
export function outSpeed(prop: Prop, i: number): SpeedHandle | null {
  const k0 = prop.keys[i];
  const k1 = prop.keys[i + 1];
  const b = k0 && k1 && easeHandles(k0.ease);
  if (!b) return null;
  const dur = k1.t - k0.t;
  const slope = b[0] > 1e-4 ? b[1] / b[0] : easeSlope(k0.ease, 1e-3);
  return { influence: b[0], speed: dur > 0 ? (segmentExtent(k0, k1, prop.kind) / dur) * slope : 0 };
}

/** Speed arriving at keyframe i+1 (the end of segment i). */
export function inSpeed(prop: Prop, i: number): SpeedHandle | null {
  const k0 = prop.keys[i];
  const k1 = prop.keys[i + 1];
  const b = k0 && k1 && easeHandles(k0.ease);
  if (!b) return null;
  const dur = k1.t - k0.t;
  const slope = 1 - b[2] > 1e-4 ? (1 - b[3]) / (1 - b[2]) : easeSlope(k0.ease, 1 - 1e-3);
  return { influence: 1 - b[2], speed: dur > 0 ? (segmentExtent(k0, k1, prop.kind) / dur) * slope : 0 };
}

const MIN_INFLUENCE = 0.001;

/** The segment's ease after moving its leaving handle to this influence and speed. */
export function withOutSpeed(prop: Prop, i: number, h: SpeedHandle): Bez4 | null {
  const k0 = prop.keys[i];
  const k1 = prop.keys[i + 1];
  const b = k0 && k1 && easeHandles(k0.ease);
  if (!b) return null;
  const dur = k1.t - k0.t;
  const extent = segmentExtent(k0, k1, prop.kind);
  const x1 = clamp(h.influence, MIN_INFLUENCE, 1);
  if (Math.abs(extent) < 1e-9 || dur <= 0) return [x1, b[1], b[2], b[3]];
  return [x1, clamp((h.speed * dur * x1) / extent, -3, 4), b[2], b[3]];
}

/** The segment's ease after moving its arriving handle to this influence and speed. */
export function withInSpeed(prop: Prop, i: number, h: SpeedHandle): Bez4 | null {
  const k0 = prop.keys[i];
  const k1 = prop.keys[i + 1];
  const b = k0 && k1 && easeHandles(k0.ease);
  if (!b) return null;
  const dur = k1.t - k0.t;
  const extent = segmentExtent(k0, k1, prop.kind);
  const infl = clamp(h.influence, MIN_INFLUENCE, 1);
  const x2 = 1 - infl;
  if (Math.abs(extent) < 1e-9 || dur <= 0) return [b[0], b[1], x2, b[3]];
  return [b[0], b[1], x2, clamp(1 - (h.speed * dur * infl) / extent, -3, 4)];
}

/* ------------------------------------------------------------------ value handles */

/** Where the leaving and arriving bezier handles sit in time and (for one component) value. */
export function valueHandles(k0: Keyframe, k1: Keyframe, c: number): { out: [number, number]; in: [number, number] } | null {
  const b = easeHandles(k0.ease);
  if (!b) return null;
  const dt = k1.t - k0.t;
  const a = comp(k0.v, c);
  const z = comp(k1.v, c);
  return { out: [k0.t + b[0] * dt, a + b[1] * (z - a)], in: [k0.t + b[2] * dt, a + b[3] * (z - a)] };
}

const comp = (v: number | number[], c: number): number => (typeof v === 'number' ? v : (v[c] ?? v[0]));

/** The ease after dragging a handle to time t and value v (of component c). `which` is the end the handle belongs to. */
export function easeFromValueHandle(k0: Keyframe, k1: Keyframe, c: number, which: 'out' | 'in', t: number, v: number): Bez4 | null {
  const b = easeHandles(k0.ease);
  if (!b) return null;
  const dt = k1.t - k0.t;
  const a = comp(k0.v, c);
  const span = comp(k1.v, c) - a;
  const x = dt > 0 ? clamp((t - k0.t) / dt, 0, 1) : which === 'out' ? b[0] : b[2];
  const y = Math.abs(span) > 1e-9 ? clamp((v - a) / span, -3, 4) : which === 'out' ? b[1] : b[3];
  return which === 'out' ? [x, y, b[2], b[3]] : [b[0], b[1], x, y];
}

/** The component of a segment that moves the most — the one whose handles are worth showing. */
export function dominantComponent(k0: Keyframe, k1: Keyframe): number {
  if (typeof k0.v === 'number' || typeof k1.v === 'number') return 0;
  const a = k0.v as number[];
  const b = k1.v as number[];
  return Math.abs((b[1] ?? 0) - (a[1] ?? 0)) > Math.abs(b[0] - a[0]) ? 1 : 0;
}

/* ------------------------------------------------------------------ ranges and ticks */

export interface Range {
  lo: number;
  hi: number;
}

/** A padded range covering the numbers. With `robust`, a few wild values (a step's spike) are ignored. */
export function fitRange(values: number[], margin = 0.12, robust = false): Range {
  const xs = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return { lo: -1, hi: 1 };
  let lo = xs[0];
  let hi = xs[xs.length - 1];
  if (robust && xs.length > 40) {
    lo = xs[Math.floor(xs.length * 0.02)];
    hi = xs[Math.ceil(xs.length * 0.98) - 1];
  }
  if (hi - lo < 1e-6) {
    const pad = Math.max(Math.abs(lo) * 0.1, 1);
    return { lo: lo - pad, hi: hi + pad };
  }
  const m = (hi - lo) * margin;
  return { lo: lo - m, hi: hi + m };
}

/** "Nice" tick values (1, 2, 5 × 10ⁿ) covering lo..hi, about `target` of them. */
export function niceTicks(lo: number, hi: number, target = 6): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / Math.max(1, target);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  const step = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * pow;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : Math.round(v / step) * step);
  return out;
}

/** Tick spacing for the time axis, in seconds, for a given scale. */
export function timeStep(pixelsPerSecond: number, minGap = 70): number {
  const steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  return steps.find((s) => s * pixelsPerSecond >= minGap) ?? 600;
}
