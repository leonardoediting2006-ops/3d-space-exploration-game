import type { Vec2 } from './types';

/**
 * Bezier paths are stored as a flat number array so they can be keyframed and interpolated
 * element-wise like any other property: six numbers per vertex —
 * x, y, then the in-tangent and out-tangent as offsets from the vertex.
 */
export const STRIDE = 6;

export interface PathPt {
  x: number;
  y: number;
  ix: number;
  iy: number;
  ox: number;
  oy: number;
}

export const pointCount = (v: number[]): number => Math.floor(v.length / STRIDE);

export function toPoints(v: number[]): PathPt[] {
  const out: PathPt[] = [];
  for (let i = 0; i + STRIDE <= v.length; i += STRIDE) {
    out.push({ x: v[i], y: v[i + 1], ix: v[i + 2], iy: v[i + 3], ox: v[i + 4], oy: v[i + 5] });
  }
  return out;
}

export function fromPoints(pts: PathPt[]): number[] {
  const out: number[] = [];
  for (const p of pts) out.push(p.x, p.y, p.ix, p.iy, p.ox, p.oy);
  return out;
}

export const corner = (x: number, y: number): PathPt => ({ x, y, ix: 0, iy: 0, ox: 0, oy: 0 });

export function rectPath(x: number, y: number, w: number, h: number): number[] {
  return fromPoints([corner(x, y), corner(x + w, y), corner(x + w, y + h), corner(x, y + h)]);
}

const KAPPA = 0.5522847498;

export function ellipsePath(cx: number, cy: number, rx: number, ry: number): number[] {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return fromPoints([
    { x: cx, y: cy - ry, ix: -kx, iy: 0, ox: kx, oy: 0 },
    { x: cx + rx, y: cy, ix: 0, iy: -ky, ox: 0, oy: ky },
    { x: cx, y: cy + ry, ix: kx, iy: 0, ox: -kx, oy: 0 },
    { x: cx - rx, y: cy, ix: 0, iy: ky, ox: 0, oy: -ky },
  ]);
}

/** The cubic bezier control points of segment i (vertex i to vertex i+1, wrapping if closed). */
function segment(pts: PathPt[], i: number): [Vec2, Vec2, Vec2, Vec2] {
  const a = pts[i];
  const b = pts[(i + 1) % pts.length];
  return [
    [a.x, a.y],
    [a.x + a.ox, a.y + a.oy],
    [b.x + b.ix, b.y + b.iy],
    [b.x, b.y],
  ];
}

export const segmentCount = (n: number, closed: boolean): number => (n < 2 ? 0 : closed ? n : n - 1);

export function pathToPath2D(v: number[], closed: boolean): Path2D {
  const pts = toPoints(v);
  const p = new Path2D();
  if (!pts.length) return p;
  p.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < segmentCount(pts.length, closed); i++) {
    const [, c1, c2, e] = segment(pts, i);
    p.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], e[0], e[1]);
  }
  if (closed) p.closePath();
  return p;
}

export function bezierAt(s: [Vec2, Vec2, Vec2, Vec2], u: number): Vec2 {
  const m = 1 - u;
  const a = m * m * m;
  const b = 3 * m * m * u;
  const c = 3 * m * u * u;
  const d = u * u * u;
  return [a * s[0][0] + b * s[1][0] + c * s[2][0] + d * s[3][0], a * s[0][1] + b * s[1][1] + c * s[2][1] + d * s[3][1]];
}

/** Approximate length by flattening each segment. */
export function pathLength(v: number[], closed: boolean): number {
  const pts = toPoints(v);
  let len = 0;
  for (let i = 0; i < segmentCount(pts.length, closed); i++) {
    const s = segment(pts, i);
    let prev = s[0];
    for (let k = 1; k <= 16; k++) {
      const q = bezierAt(s, k / 16);
      len += Math.hypot(q[0] - prev[0], q[1] - prev[1]);
      prev = q;
    }
  }
  return len;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Tight-ish bounds from sampling the curve (control points alone overestimate). */
export function pathBounds(v: number[], closed: boolean): Box | null {
  const pts = toPoints(v);
  if (!pts.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (p: Vec2) => {
    x0 = Math.min(x0, p[0]);
    y0 = Math.min(y0, p[1]);
    x1 = Math.max(x1, p[0]);
    y1 = Math.max(y1, p[1]);
  };
  for (const p of pts) add([p.x, p.y]);
  for (let i = 0; i < segmentCount(pts.length, closed); i++) {
    const s = segment(pts, i);
    for (let k = 1; k < 16; k++) add(bezierAt(s, k / 16));
  }
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

/** Split segment i at parameter u (de Casteljau), inserting a vertex that preserves the curve. */
export function insertVertex(v: number[], i: number, u: number, closed: boolean): number[] {
  const pts = toPoints(v);
  if (i < 0 || i >= segmentCount(pts.length, closed)) return v;
  const [p0, p1, p2, p3] = segment(pts, i);
  const lerp = (a: Vec2, b: Vec2): Vec2 => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  const p01 = lerp(p0, p1);
  const p12 = lerp(p1, p2);
  const p23 = lerp(p2, p3);
  const p012 = lerp(p01, p12);
  const p123 = lerp(p12, p23);
  const mid = lerp(p012, p123);
  const a = pts[i];
  const j = (i + 1) % pts.length;
  const b = pts[j];
  a.ox = p01[0] - a.x;
  a.oy = p01[1] - a.y;
  b.ix = p23[0] - b.x;
  b.iy = p23[1] - b.y;
  const fresh: PathPt = { x: mid[0], y: mid[1], ix: p012[0] - mid[0], iy: p012[1] - mid[1], ox: p123[0] - mid[0], oy: p123[1] - mid[1] };
  pts.splice(i + 1, 0, fresh);
  return fromPoints(pts);
}

export function removeVertex(v: number[], index: number): number[] {
  const pts = toPoints(v);
  if (pts.length <= 2 || index < 0 || index >= pts.length) return v;
  pts.splice(index, 1);
  return fromPoints(pts);
}

/** Catmull-Rom style smooth tangents for vertex i from its neighbours. */
export function smoothVertex(pts: PathPt[], i: number, closed: boolean): PathPt {
  const n = pts.length;
  const prev = pts[i - 1] ?? (closed ? pts[n - 1] : undefined);
  const next = pts[i + 1] ?? (closed ? pts[0] : undefined);
  const p = pts[i];
  if (!prev && !next) return { ...p, ix: 0, iy: 0, ox: 0, oy: 0 };
  const a = prev ?? p;
  const b = next ?? p;
  const tx = (b.x - a.x) / 6;
  const ty = (b.y - a.y) / 6;
  return { ...p, ix: prev ? -tx : 0, iy: prev ? -ty : 0, ox: next ? tx : 0, oy: next ? ty : 0 };
}

export const isSmooth = (p: PathPt): boolean => {
  const li = Math.hypot(p.ix, p.iy);
  const lo = Math.hypot(p.ox, p.oy);
  if (li < 1e-6 && lo < 1e-6) return false;
  const cross = p.ix * p.oy - p.iy * p.ox;
  const dot = p.ix * p.ox + p.iy * p.oy;
  return Math.abs(cross) <= 1e-3 * Math.max(1, li * lo) && dot < 0;
};

/** Closest point on the path to p: which segment, at what parameter, and how far. */
export function nearestOnPath(v: number[], closed: boolean, p: Vec2): { seg: number; u: number; dist: number; at: Vec2 } | null {
  const pts = toPoints(v);
  let best: { seg: number; u: number; dist: number; at: Vec2 } | null = null;
  for (let i = 0; i < segmentCount(pts.length, closed); i++) {
    const s = segment(pts, i);
    for (let k = 0; k <= 32; k++) {
      const q = bezierAt(s, k / 32);
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (!best || d < best.dist) best = { seg: i, u: k / 32, dist: d, at: q };
    }
  }
  return best;
}

/** Centre of a path's bounds. */
export function pathCenter(v: number[], closed: boolean): Vec2 {
  const b = pathBounds(v, closed);
  return b ? [b.x + b.w / 2, b.y + b.h / 2] : [0, 0];
}

export function translatePath(v: number[], dx: number, dy: number): number[] {
  const out = v.slice();
  for (let i = 0; i + STRIDE <= out.length; i += STRIDE) {
    out[i] += dx;
    out[i + 1] += dy;
  }
  return out;
}
