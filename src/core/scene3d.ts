// What a composition looks like in 3D: where each 3D layer sits (its model matrix), the camera that
// views them (or a flat orthographic view when there is none), the lights that shade them, and the
// projection of a layer's plane onto the screen. Pure maths shared by the renderer, the viewer's
// hit-testing and the tests.
import { evalColor, evalNum, evalVec } from './interp';
import { dir4, add3, cross3, dot3, embed2D, len3, mul4, norm3, point4, rotX4, rotY4, rotZ4, scale3, scale4, sub3, translate4, type Mat4, type Vec3 } from './math3';
import { clamp, degToRad, mul, rotation, scaling, translate } from './math';
import { LIGHT_KINDS, type Comp, type Layer, type LightType } from './types';

const inRange = (l: Layer, t: number): boolean => t >= l.inPoint - 1e-9 && t < l.outPoint - 1e-9;

/** The layer's own placement in space, not counting parents. 2D layers sit at Z = 0 and do not tilt. */
export function localModel(layer: Layer, t: number): Mat4 {
  const a = evalVec(layer.transform.anchor, t);
  const p = evalVec(layer.transform.position, t);
  const s = evalVec(layer.transform.scale, t);
  const rz = evalNum(layer.transform.rotation, t);
  if (!layer.threeD) {
    return embed2D(mul(translate(p[0], p[1]), mul(rotation(rz), mul(scaling(s[0] / 100, s[1] / 100), translate(-a[0], -a[1])))));
  }
  const z = evalNum(layer.transform.positionZ, t);
  const rx = evalNum(layer.transform.rotationX, t);
  const ry = evalNum(layer.transform.rotationY, t);
  // scale, then rotate about X, then Y, then Z, then move
  return mul4(translate4(p[0], p[1], z), mul4(rotZ4(rz), mul4(rotY4(ry), mul4(rotX4(rx), mul4(scale4(s[0] / 100, s[1] / 100, 1), translate4(-a[0], -a[1], 0))))));
}

export function worldModel(layer: Layer, t: number, byId: Map<string, Layer>, depth = 0): Mat4 {
  const local = localModel(layer, t);
  if (!layer.parentId || depth > 32) return local;
  const parent = byId.get(layer.parentId);
  return parent ? mul4(worldModel(parent, t, byId, depth + 1), local) : local;
}

/* ------------------------------------------------------------------ the view */

/** How world points become screen points. */
export interface View {
  /** A camera layer is looking (perspective); without one 3D layers are drawn flat, only ordered and tilted. */
  perspective: boolean;
  eye: Vec3;
  /** The camera's right, down and forward directions, as unit vectors in world space. */
  right: Vec3;
  down: Vec3;
  fwd: Vec3;
  /** Distance from the eye to the picture plane, in pixels (the camera's Zoom). */
  zoom: number;
  /** Where the view axis meets the screen: the middle of the composition. */
  cx: number;
  cy: number;
}

export function orthoView(width: number, height: number): View {
  return { perspective: false, eye: [width / 2, height / 2, -1], right: [1, 0, 0], down: [0, 1, 0], fwd: [0, 0, 1], zoom: 1, cx: width / 2, cy: height / 2 };
}

export function lookView(width: number, height: number, eye: Vec3, target: Vec3, zoom: number, rollDeg = 0): View {
  const fwd = norm3(sub3(target, eye));
  let right = cross3([0, 1, 0], fwd);
  if (len3(right) < 1e-6) right = [1, 0, 0]; // looking straight along the vertical
  right = norm3(right);
  let down = cross3(fwd, right);
  if (rollDeg) {
    const c = Math.cos(degToRad(rollDeg));
    const s = Math.sin(degToRad(rollDeg));
    const r = add3(scale3(right, c), scale3(down, s));
    down = sub3(scale3(down, c), scale3(right, s));
    right = r;
  }
  return { perspective: true, eye, right, down, fwd, zoom: Math.max(1, zoom), cx: width / 2, cy: height / 2 };
}

/** World point → view space (X right, Y down, Z away from the camera). */
export function toView(v: View, p: Vec3): Vec3 {
  if (!v.perspective) return p;
  const d = sub3(p, v.eye);
  return [dot3(v.right, d), dot3(v.down, d), dot3(v.fwd, d)];
}

/** How far a world point is from the camera, for ordering layers (bigger is farther). */
export const depthOf = (v: View, p: Vec3): number => (v.perspective ? toView(v, p)[2] : p[2]);

/** A 3×3 matrix, row-major, acting on homogeneous 2D points. */
export type Mat3 = number[];

/**
 * The projection of a layer's plane: maps layer coordinates (u, v, 1) to homogeneous screen
 * coordinates (x', y', w'); the screen point is (x'/w', y'/w'). Exact for perspective.
 */
export function planeHomography(v: View, model: Mat4): Mat3 {
  const p0 = point4(model, [0, 0, 0]);
  const pu = point4(model, [1, 0, 0]);
  const pv = point4(model, [0, 1, 0]);
  if (!v.perspective) return [pu[0] - p0[0], pv[0] - p0[0], p0[0], pu[1] - p0[1], pv[1] - p0[1], p0[1], 0, 0, 1];
  const v0 = toView(v, p0);
  const vu = sub3(toView(v, pu), v0);
  const vv = sub3(toView(v, pv), v0);
  const f = v.zoom;
  return [v.cx * vu[2] + f * vu[0], v.cx * vv[2] + f * vv[0], v.cx * v0[2] + f * v0[0], v.cy * vu[2] + f * vu[1], v.cy * vv[2] + f * vv[1], v.cy * v0[2] + f * v0[1], vu[2], vv[2], v0[2]];
}

/** Layer point → homogeneous screen point. */
export const applyH = (h: Mat3, u: number, w: number): [number, number, number] => [h[0] * u + h[1] * w + h[2], h[3] * u + h[4] * w + h[5], h[6] * u + h[7] * w + h[8]];

const NEAR = 1e-3;

/** Layer point → screen point, or null if it is behind the camera. */
export function projectLayerPoint(h: Mat3, u: number, w: number): [number, number] | null {
  const [x, y, ww] = applyH(h, u, w);
  return ww > NEAR ? [x / ww, y / ww] : null;
}

/** Screen point → layer point on a plane, or null if the plane is edge-on or the point is behind the camera. */
export function unprojectToLayer(h: Mat3, x: number, y: number): [number, number] | null {
  // solve h · (u, v, 1) ∝ (x, y, 1): two linear equations in u and v
  const a = h[0] - x * h[6];
  const b = h[1] - x * h[7];
  const c = x * h[8] - h[2];
  const d = h[3] - y * h[6];
  const e = h[4] - y * h[7];
  const f = y * h[8] - h[5];
  const det = a * e - b * d;
  if (Math.abs(det) < 1e-12) return null;
  const u = (c * e - b * f) / det;
  const w = (a * f - c * d) / det;
  return applyH(h, u, w)[2] > NEAR ? [u, w] : null;
}

/** The point on the plane Z = z that appears at a screen position, in world coordinates. */
export function screenToWorldAtZ(v: View, x: number, y: number, z: number): Vec3 | null {
  if (!v.perspective) return [x, y, z];
  const dir = add3(add3(scale3(v.right, (x - v.cx) / v.zoom), scale3(v.down, (y - v.cy) / v.zoom)), v.fwd);
  if (Math.abs(dir[2]) < 1e-9) return null;
  const s = (z - v.eye[2]) / dir[2];
  return s > 0 ? add3(v.eye, scale3(dir, s)) : null;
}

/** A layer plane's unit normal in world space. */
export function planeNormal(model: Mat4): Vec3 {
  return norm3(cross3(dir4(model, [1, 0, 0]), dir4(model, [0, 1, 0])), [0, 0, 1]);
}

/* ------------------------------------------------------------------ lights */

export interface Light {
  kind: LightType;
  /** Colour × intensity, 0..1 for a full-strength white light (may exceed 1). */
  color: Vec3;
  pos: Vec3;
  /** The way a parallel or spot light points. */
  dir: Vec3;
  cosOuter: number;
  cosInner: number;
}

export interface Scene3D {
  view: View;
  /** Null when the composition has no lights: 3D layers are then shown unshaded. */
  lights: Light[] | null;
}

/** The first camera (topmost) and every light that are on at time t, with their animated values. */
export function sceneAt(comp: Comp, t: number): Scene3D {
  const byId = new Map(comp.layers.map((l) => [l.id, l]));
  let view = orthoView(comp.width, comp.height);
  const cam = comp.layers.find((l) => l.type === 'camera' && l.visible && inRange(l, t));
  if (cam) {
    const eye = point4(worldModel(cam, t, byId), [0, 0, 0]);
    const poi = evalVec(cam.content.poi, t);
    view = lookView(comp.width, comp.height, eye, [poi[0], poi[1], evalNum(cam.content.poiZ, t)], evalNum(cam.content.zoom, t), evalNum(cam.transform.rotation, t));
  }
  const lights: Light[] = [];
  for (const l of comp.layers) {
    if (l.type !== 'light' || !l.visible || !inRange(l, t)) continue;
    const kind = LIGHT_KINDS[clamp(Math.round(evalNum(l.content.lightType, t)), 0, LIGHT_KINDS.length - 1)];
    const k = Math.max(0, evalNum(l.content.intensity, t)) / 100;
    const c = evalColor(l.content.color, t);
    const pos = point4(worldModel(l, t, byId), [0, 0, 0]);
    const poi = evalVec(l.content.poi, t);
    const outer = degToRad(clamp(evalNum(l.content.cone, t), 1, 179) / 2);
    const feather = clamp(evalNum(l.content.feather, t) / 100, 0, 1);
    lights.push({
      kind,
      color: [(c[0] / 255) * k, (c[1] / 255) * k, (c[2] / 255) * k],
      pos,
      dir: norm3(sub3([poi[0], poi[1], evalNum(l.content.poiZ, t)], pos)),
      cosOuter: Math.cos(outer),
      cosInner: Math.cos(outer * (1 - feather)),
    });
  }
  return { view, lights: lights.length ? lights : null };
}

const smoothstep = (a: number, b: number, x: number): number => {
  if (a === b) return x >= a ? 1 : 0;
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * The colour multiplier lights give a point on a plane (reference implementation; the GPU shader
 * does the same sums). Layers are lit on both faces. Ambient light adds evenly; the others scale
 * with how squarely the surface faces them; spot lights also fade towards the edge of their cone.
 */
export function shade(lights: Light[], p: Vec3, n: Vec3): Vec3 {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const L of lights) {
    let k = 1;
    if (L.kind !== 'ambient') {
      const toLight = L.kind === 'parallel' ? scale3(L.dir, -1) : norm3(sub3(L.pos, p));
      k = Math.abs(dot3(n, toLight));
      if (L.kind === 'spot') k *= smoothstep(L.cosOuter, L.cosInner, dot3(scale3(toLight, -1), L.dir));
    }
    r += L.color[0] * k;
    g += L.color[1] * k;
    b += L.color[2] * k;
  }
  return [Math.min(1, r), Math.min(1, g), Math.min(1, b)];
}
