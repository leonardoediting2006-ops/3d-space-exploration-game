// Small 3D vector and matrix helpers for 3D layers. Composition space is x to the right, y down and
// z into the screen (so a layer at Z = 0 is where it is in 2D and Z > 0 is farther away). Matrices
// are row-major 4×4 and applied to column vectors.
import type { Mat } from './math';

export type Vec3 = [number, number, number];
export type Mat4 = number[];

export const IDENT4: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function mul4(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) out[r * 4 + c] += a[r * 4 + k] * b[k * 4 + c];
  return out;
}

export const translate4 = (x: number, y: number, z: number): Mat4 => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1];
export const scale4 = (x: number, y: number, z: number): Mat4 => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Positive angles tilt the top of a layer away from the viewer. */
export function rotX4(deg: number): Mat4 {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
}

/** Positive angles turn the right edge of a layer away from the viewer. */
export function rotY4(deg: number): Mat4 {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}

/** Positive angles turn the layer clockwise on screen, like the 2D rotation. */
export function rotZ4(deg: number): Mat4 {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** A 2D affine matrix as a 4×4 that leaves z alone. */
export function embed2D(m: Mat): Mat4 {
  return [m[0], m[2], 0, m[4], m[1], m[3], 0, m[5], 0, 0, 1, 0, 0, 0, 0, 1];
}

export function point4(m: Mat4, p: Vec3): Vec3 {
  return [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7], m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11]];
}

export function dir4(m: Mat4, v: Vec3): Vec3 {
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[4] * v[0] + m[5] * v[1] + m[6] * v[2], m[8] * v[0] + m[9] * v[1] + m[10] * v[2]];
}

export const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale3 = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len3 = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export function norm3(a: Vec3, fallback: Vec3 = [0, 0, 1]): Vec3 {
  const l = len3(a);
  return l < 1e-12 ? fallback : [a[0] / l, a[1] / l, a[2] / l];
}
