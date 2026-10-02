import { evalColor, evalNum, evalVec, NAMED_EASE_FNS } from './interp';
import { lerp } from './math';
import type { RGB, TextAnimator, Vec2 } from './types';

/** An animator's properties evaluated at one moment. */
export interface AnimValues {
  start: number;
  end: number;
  offset: number;
  smooth: number;
  units: number;
  shape: number;
  /** Easing curve applied to the ramp shapes (see RAMP_EASES). */
  ease: number;
  random: boolean;
  seed: number;
  position: Vec2;
  scale: Vec2;
  rotation: number;
  opacity: number;
  tracking: number;
  colorMix: number;
  color: RGB;
}

export function evalAnimator(a: TextAnimator, t: number): AnimValues {
  const p = a.props;
  return {
    start: evalNum(p.start, t),
    end: evalNum(p.end, t),
    offset: evalNum(p.offset, t),
    smooth: evalNum(p.smooth, t),
    units: Math.round(evalNum(p.units, t)),
    shape: Math.round(evalNum(p.shape, t)),
    ease: p.ease ? Math.round(evalNum(p.ease, t)) : 0,
    random: evalNum(p.random, t) >= 0.5,
    seed: Math.round(evalNum(p.seed, t)),
    position: evalVec(p.position, t),
    scale: evalVec(p.scale, t),
    rotation: evalNum(p.rotation, t),
    opacity: evalNum(p.opacity, t),
    tracking: evalNum(p.tracking, t),
    colorMix: evalNum(p.colorMix, t),
    color: evalColor(p.color, t),
  };
}

/** Progress curves for the ramp shapes: 0 = linear, then out / in / in-out, back overshoot, elastic, bounce. */
export const RAMP_EASES: ((p: number) => number)[] = [
  (p) => p,
  (p) => 1 - (1 - p) ** 3,
  (p) => p ** 3,
  (p) => p * p * (3 - 2 * p),
  (p) => 1 + 2.70158 * (p - 1) ** 3 + 1.70158 * (p - 1) ** 2,
  NAMED_EASE_FNS.elasticOut,
  NAMED_EASE_FNS.bounceOut,
];

/** What the animators do to one character. */
export interface CharStyle {
  dx: number;
  dy: number;
  sx: number;
  sy: number;
  rot: number;
  alpha: number;
  tracking: number;
  /** Colours to blend over the base fill, in order. */
  mix: { color: RGB; amount: number }[];
}

export const neutralStyle = (): CharStyle => ({ dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, alpha: 1, tracking: 0, mix: [] });

/**
 * Which selector unit (character, word or line) each character of `text` belongs to.
 * Characters count across the whole text; a space joins the word before it; newlines are not units.
 */
export function unitIndices(text: string, units: number): { of: number[]; count: number } {
  const of: number[] = new Array(text.length).fill(0);
  let count = 0;
  if (units === 2) {
    let line = 0;
    for (let i = 0; i < text.length; i++) {
      of[i] = line;
      if (text[i] === '\n') line++;
    }
    return { of, count: line + 1 };
  }
  if (units === 1) {
    let word = -1;
    let inWord = false;
    for (let i = 0; i < text.length; i++) {
      const ws = /\s/.test(text[i]);
      if (!ws && !inWord) {
        word++;
        inWord = true;
      } else if (ws) inWord = false;
      of[i] = Math.max(0, word);
    }
    return { of, count: Math.max(1, word + 1) };
  }
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      of[i] = Math.max(0, count - 1);
      continue;
    }
    of[i] = count++;
  }
  return { of, count: Math.max(1, count) };
}

const permCache = new Map<string, number[]>();
/** A deterministic shuffle of 0..n-1 (so "randomize order" is stable from frame to frame). */
export function permutation(n: number, seed: number): number[] {
  const key = `${n}:${seed}`;
  const hit = permCache.get(key);
  if (hit) return hit;
  const out = Array.from({ length: n }, (_, i) => i);
  let s = (seed * 2654435761 + 12345) >>> 0 || 1;
  const rnd = () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (permCache.size > 200) permCache.clear();
  permCache.set(key, out);
  return out;
}

/** How much of unit i (of n) the range selector covers, 0..1. */
export function coverage(i: number, n: number, v: AnimValues): number {
  const lo = i / n;
  const hi = (i + 1) / n;
  const mid = (i + 0.5) / n;
  const a = (v.start + v.offset) / 100;
  const b = (v.end + v.offset) / 100;
  const s = Math.min(a, b);
  const e = Math.max(a, b);
  if (v.shape === 0) {
    const binary = mid >= s && mid <= e ? 1 : 0;
    const overlap = Math.max(0, Math.min(e, hi) - Math.max(s, lo)) / (hi - lo);
    return lerp(binary, overlap, Math.min(1, Math.max(0, v.smooth / 100)));
  }
  if (mid < s || mid > e || e - s < 1e-9) return 0;
  const r = (mid - s) / (e - s);
  // A letter passing through a ramp moves with progress p = 1 - r; the chosen curve shapes that motion.
  const ease = RAMP_EASES[Math.min(RAMP_EASES.length - 1, Math.max(0, v.ease))];
  switch (v.shape) {
    case 1:
      return 1 - ease(1 - r);
    case 2:
      return ease(1 - r);
    case 3:
      return 1 - Math.abs(2 * r - 1);
    case 4:
      return Math.sin(Math.PI * r);
    default: {
      const tri = 1 - Math.abs(2 * r - 1);
      return tri * tri * (3 - 2 * tri);
    }
  }
}

/** One style per character of `text` (newline characters included, so indices line up with the string). */
export function computeCharStyles(text: string, animators: AnimValues[]): CharStyle[] {
  const styles = Array.from({ length: text.length }, neutralStyle);
  for (const v of animators) {
    const { of, count } = unitIndices(text, v.units);
    const perm = v.random ? permutation(count, v.seed) : null;
    for (let i = 0; i < text.length; i++) {
      const u = of[i];
      const c = coverage(perm ? perm[Math.min(count - 1, u)] : u, count, v);
      if (c === 0) continue;
      const st = styles[i];
      st.dx += c * v.position[0];
      st.dy += c * v.position[1];
      st.rot += c * v.rotation;
      st.sx *= lerp(1, v.scale[0] / 100, c);
      st.sy *= lerp(1, v.scale[1] / 100, c);
      st.alpha *= lerp(1, v.opacity / 100, c);
      st.tracking += c * v.tracking;
      if (v.colorMix > 0) st.mix.push({ color: v.color, amount: Math.min(1, (c * v.colorMix) / 100) });
    }
  }
  return styles;
}

/** Blend a base colour with a character's colour-mix list. */
export function mixColor(base: number[], mix: CharStyle['mix']): [number, number, number] {
  let r = base[0];
  let g = base[1];
  let b = base[2];
  for (const m of mix) {
    r = lerp(r, m.color[0], m.amount);
    g = lerp(g, m.color[1], m.amount);
    b = lerp(b, m.color[2], m.amount);
  }
  return [r, g, b];
}
