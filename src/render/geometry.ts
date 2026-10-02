import { evalNum, evalProp, evalVec } from '../core/interp';
import { pathBounds, pathToPath2D, pointCount } from '../core/path';
import { apply, invert, mul, rotation, scaling, translate, type Mat } from '../core/math';
import { planeHomography, projectLayerPoint, sceneAt, unprojectToLayer, worldModel } from '../core/scene3d';
import type { Comp, Layer, Project, Vec2 } from '../core/types';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The layer's own transform (not including parents). */
export function localMatrix(layer: Layer, t: number): Mat {
  const anchor = evalVec(layer.transform.anchor, t);
  const pos = evalVec(layer.transform.position, t);
  const sc = evalVec(layer.transform.scale, t);
  const rot = evalNum(layer.transform.rotation, t);
  return mul(translate(pos[0], pos[1]), mul(rotation(rot), mul(scaling(sc[0] / 100, sc[1] / 100), translate(-anchor[0], -anchor[1]))));
}

export function worldMatrix(layer: Layer, t: number, byId: Map<string, Layer>, depth = 0): Mat {
  const local = localMatrix(layer, t);
  if (!layer.parentId || depth > 32) return local;
  const parent = byId.get(layer.parentId);
  if (!parent) return local;
  return mul(worldMatrix(parent, t, byId, depth + 1), local);
}

export const layerMap = (comp: Comp): Map<string, Layer> => new Map(comp.layers.map((l) => [l.id, l]));

let measureCtx: CanvasRenderingContext2D | null = null;
export function getMeasureCtx(): CanvasRenderingContext2D {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')!;
  return measureCtx;
}

export function textFont(layer: Layer, t: number): string {
  const d = layer.data;
  if (d.type !== 'text') return '';
  const size = Math.max(1, evalNum(layer.content.fontSize, t));
  return `${d.italic ? 'italic ' : ''}${d.bold ? 'bold ' : ''}${size}px ${d.font}`;
}

export function textBounds(layer: Layer, t: number): Rect {
  const d = layer.data;
  if (d.type !== 'text') return { x: 0, y: 0, w: 0, h: 0 };
  const ctx = getMeasureCtx();
  ctx.font = textFont(layer, t);
  const size = Math.max(1, evalNum(layer.content.fontSize, t));
  const lines = d.text.split('\n');
  const tracking = evalNum(layer.content.tracking, t);
  let w = 1;
  for (const line of lines) w = Math.max(w, ctx.measureText(line).width + tracking * line.length);
  const lh = size * 1.2;
  const x = d.align === 'left' ? 0 : d.align === 'center' ? -w / 2 : -w;
  return { x, y: -size * 0.85, w, h: size * 1.1 + (lines.length - 1) * lh };
}

/** Bounds of the layer's content in its own (pre-transform) space, or null if it has none. */
export function localBounds(project: Project, layer: Layer, t: number): Rect | null {
  const d = layer.data;
  switch (d.type) {
    case 'solid':
    case 'adjustment':
    case 'null':
      return { x: 0, y: 0, w: d.width, h: d.height };
    case 'shape': {
      if (d.shape === 'path') {
        const b = pathBounds(evalProp(layer.content.path, t) as number[], d.closed);
        return b ?? { x: -50, y: -50, w: 100, h: 100 };
      }
      const s = evalVec(layer.content.size, t);
      return { x: -s[0] / 2, y: -s[1] / 2, w: s[0], h: s[1] };
    }
    case 'text':
      return textBounds(layer, t);
    case 'image':
    case 'video': {
      const a = project.assets[d.assetId];
      return a ? { x: 0, y: 0, w: a.width, h: a.height } : { x: 0, y: 0, w: 200, h: 200 };
    }
    case 'audio':
    case 'camera':
    case 'light':
      return null;
    case 'precomp': {
      const c = project.comps[d.compId];
      return c ? { x: 0, y: 0, w: c.width, h: c.height } : null;
    }
  }
}

export function rectCorners(r: Rect): Vec2[] {
  return [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x + r.w, r.y + r.h],
    [r.x, r.y + r.h],
  ];
}

/** Is the layer placed in 3D space (so its outline is a projection, not a 2D transform)? */
export const isThreeD = (l: Layer): boolean => !!l.threeD && l.type !== 'camera' && l.type !== 'light' && l.type !== 'audio';

/** Layer coordinates → screen for a 3D layer at time t, seen through the composition's camera. */
export function layerProjection(comp: Comp, layer: Layer, t: number): ((p: Vec2) => Vec2 | null) {
  const H = planeHomography(sceneAt(comp, t).view, worldModel(layer, t, layerMap(comp)));
  return (p) => projectLayerPoint(H, p[0], p[1]);
}

/** Layer outline in composition space. */
export function layerPolygon(project: Project, comp: Comp, layer: Layer, t: number): Vec2[] | null {
  const b = localBounds(project, layer, t);
  if (!b) return null;
  if (isThreeD(layer)) {
    const proj = layerProjection(comp, layer, t);
    const pts = rectCorners(b).map(proj);
    return pts.every((p): p is Vec2 => !!p) ? pts : null;
  }
  const m = worldMatrix(layer, t, layerMap(comp));
  return rectCorners(b).map((p) => apply(m, p));
}

export function inverseWorld(layer: Layer, t: number, byId: Map<string, Layer>): Mat | null {
  return invert(worldMatrix(layer, t, byId));
}

/** Parent's world matrix (identity if none) — used to convert viewer drags into local space. */
export function parentWorld(layer: Layer, t: number, byId: Map<string, Layer>): Mat {
  if (!layer.parentId) return [1, 0, 0, 1, 0, 0];
  const p = byId.get(layer.parentId);
  return p ? worldMatrix(p, t, byId) : [1, 0, 0, 1, 0, 0];
}


/** Is comp-space point p inside the layer's visible shape? Ellipses are tested exactly. */
export function hitTestLayer(project: Project, layer: Layer, t: number, byId: Map<string, Layer>, p: Vec2, comp?: Comp): boolean {
  const b = localBounds(project, layer, t);
  if (!b) return false;
  let x: number;
  let y: number;
  if (comp && isThreeD(layer)) {
    // a 3D layer: find where on its plane the pointer lands
    const hit = unprojectToLayer(planeHomography(sceneAt(comp, t).view, worldModel(layer, t, byId)), p[0], p[1]);
    if (!hit) return false;
    [x, y] = hit;
  } else {
    const inv = invert(worldMatrix(layer, t, byId));
    if (!inv) return false;
    [x, y] = apply(inv, p);
  }
  if (x < b.x || y < b.y || x > b.x + b.w || y > b.y + b.h) return false;
  if (layer.data.type === 'shape' && layer.data.shape === 'path') {
    const v = evalProp(layer.content.path, t) as number[];
    if (pointCount(v) < 2) return false;
    const ctx = getMeasureCtx();
    const path = pathToPath2D(v, layer.data.closed);
    if (layer.data.fill && layer.data.closed && ctx.isPointInPath(path, x, y)) return true;
    ctx.lineWidth = Math.max(evalNum(layer.content.strokeWidth, t), 12);
    return ctx.isPointInStroke(path, x, y);
  }
  if (layer.data.type === 'shape' && layer.data.shape === 'ellipse') {
    const rx = b.w / 2 || 1e-6;
    const ry = b.h / 2 || 1e-6;
    const dx = (x - (b.x + rx)) / rx;
    const dy = (y - (b.y + ry)) / ry;
    return dx * dx + dy * dy <= 1;
  }
  return true;
}

/** Extra local-space margin around a layer's bounds for strokes and glyph overshoot. */
export function contentPad(layer: Layer, t: number): number {
  const d = layer.data;
  if (d.type === 'shape' && d.stroke) return evalNum(layer.content.strokeWidth, t) * 2.5;
  if (d.type === 'text') {
    const size = evalNum(layer.content.fontSize, t);
    let pad = size * 0.15 + (d.stroke ? evalNum(layer.content.strokeWidth, t) : 0);
    // animators can fling characters well outside the text's own box
    for (const a of layer.animators) {
      const [px, py] = evalVec(a.props.position, t);
      const [sx, sy] = evalVec(a.props.scale, t);
      pad += Math.hypot(px, py) + size * Math.max(0, Math.max(sx, sy) / 100 - 1) + size * 0.7 + Math.abs(evalNum(a.props.tracking, t)) * 4;
    }
    return pad;
  }
  return 0;
}
