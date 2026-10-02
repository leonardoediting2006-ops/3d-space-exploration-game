import { clamp } from './math';

/**
 * Gradients are stored as a flat number array — four numbers per stop: position (0..1), r, g, b —
 * so they interpolate between keyframes element-wise like any other property.
 */
export const G_STRIDE = 4;

export interface Stop {
  pos: number;
  color: [number, number, number];
}

export const stopCount = (v: number[]): number => Math.floor(v.length / G_STRIDE);

/** Stops sorted by position. */
export function toStops(v: number[]): Stop[] {
  const out: Stop[] = [];
  for (let i = 0; i + G_STRIDE <= v.length; i += G_STRIDE) out.push({ pos: v[i], color: [v[i + 1], v[i + 2], v[i + 3]] });
  return out.sort((a, b) => a.pos - b.pos);
}

export function fromStops(stops: Stop[]): number[] {
  const out: number[] = [];
  for (const s of stops) out.push(s.pos, s.color[0], s.color[1], s.color[2]);
  return out;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Build a gradient from CSS-style hex colours, evenly spaced unless positions are given. */
export function makeGradient(colors: string[], positions?: number[]): number[] {
  const n = colors.length;
  return fromStops(colors.map((c, i) => ({ pos: positions?.[i] ?? (n === 1 ? 0 : i / (n - 1)), color: hexToRgb(c) })));
}

/** The colour at position t (clamped to the first/last stop outside 0..1). */
export function sampleGradient(v: number[], t: number): [number, number, number] {
  const stops = toStops(v);
  if (!stops.length) return [0, 0, 0];
  if (t <= stops[0].pos) return stops[0].color;
  const last = stops[stops.length - 1];
  if (t >= last.pos) return last.color;
  let i = 1;
  while (i < stops.length && stops[i].pos < t) i++;
  const a = stops[i - 1];
  const b = stops[i];
  const u = b.pos === a.pos ? 0 : (t - a.pos) / (b.pos - a.pos);
  return [a.color[0] + (b.color[0] - a.color[0]) * u, a.color[1] + (b.color[1] - a.color[1]) * u, a.color[2] + (b.color[2] - a.color[2]) * u];
}

/** How a position beyond 0..1 is mapped back onto the gradient. */
export type GradientMode = 'clamp' | 'repeat' | 'mirror';

export function wrapT(t: number, mode: GradientMode): number {
  if (mode === 'clamp') return clamp(t, 0, 1);
  if (mode === 'repeat') return t - Math.floor(t);
  const m = ((t % 2) + 2) % 2;
  return m > 1 ? 2 - m : m;
}

export const rgbCss = (c: ArrayLike<number>): string => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;

/** A CSS linear-gradient() string for previews and the editor bar. */
export function gradientCss(v: number[], angleDeg = 90): string {
  const stops = toStops(v);
  if (!stops.length) return 'transparent';
  return `linear-gradient(${angleDeg}deg, ${stops.map((s) => `${rgbCss(s.color)} ${(s.pos * 100).toFixed(1)}%`).join(', ')})`;
}
