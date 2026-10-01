import { evalNum, evalVec } from '../core/interp';
import { apply, invert, mul, rotation, scaling, translate, type Mat } from '../core/math';
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
      const s = evalVec(layer.content.size, t);
      return { x: -s[0] / 2, y: -s[1] / 2, w: s[0], h: s[1] };
    }
    case 'text':
      return textBounds(layer, t);
    case 'image': {
      const a = project.assets[d.assetId];
      return a ? { x: 0, y: 0, w: a.width, h: a.height } : { x: 0, y: 0, w: 200, h: 200 };
    }
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

/** Layer outline in composition space. */
export function layerPolygon(project: Project, comp: Comp, layer: Layer, t: number): Vec2[] | null {
  const b = localBounds(project, layer, t);
  if (!b) return null;
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
export function hitTestLayer(project: Project, layer: Layer, t: number, byId: Map<string, Layer>, p: Vec2): boolean {
  const b = localBounds(project, layer, t);
  if (!b) return false;
  const inv = invert(worldMatrix(layer, t, byId));
  if (!inv) return false;
  const [x, y] = apply(inv, p);
  if (x < b.x || y < b.y || x > b.x + b.w || y > b.y + b.h) return false;
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
    return size * 0.15 + (d.stroke ? evalNum(layer.content.strokeWidth, t) : 0);
  }
  return 0;
}
