import { cssColor, evalColor, evalNum, evalProp, evalVec } from '../core/interp';
import { pathLength, pathToPath2D, pointCount } from '../core/path';
import { computeCharStyles, evalAnimator, mixColor } from '../core/textAnim';
import { TAU } from '../core/math';
import type { Layer, Project } from '../core/types';
import { getAssetImage } from './assets';
import { textFont } from './geometry';

/* Painters draw a layer's own content in its local space. The caller has already set the
 * context transform (scale · world matrix), so nothing here knows about the camera. */

interface ShapeGeometry {
  path: Path2D;
  length: number;
}

function ellipseLength(a: number, b: number): number {
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
}

function polyPath(pts: [number, number][]): ShapeGeometry {
  const path = new Path2D();
  let length = 0;
  pts.forEach(([x, y], i) => {
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
    const [nx, ny] = pts[(i + 1) % pts.length];
    length += Math.hypot(nx - x, ny - y);
  });
  path.closePath();
  return { path, length };
}

export function shapeGeometry(layer: Layer, t: number): ShapeGeometry | null {
  const d = layer.data;
  if (d.type !== 'shape') return null;
  if (d.shape === 'path') {
    const v = evalProp(layer.content.path, t) as number[];
    if (pointCount(v) < 2) return null;
    return { path: pathToPath2D(v, d.closed), length: pathLength(v, d.closed) };
  }
  const [w, h] = evalVec(layer.content.size, t);
  const hw = Math.max(0, w) / 2;
  const hh = Math.max(0, h) / 2;
  if (hw === 0 && hh === 0) return null;
  switch (d.shape) {
    case 'rect': {
      const r = Math.min(Math.max(0, evalNum(layer.content.roundness, t)), hw, hh);
      const path = new Path2D();
      path.moveTo(0, -hh);
      if (r <= 0) {
        path.lineTo(hw, -hh);
        path.lineTo(hw, hh);
        path.lineTo(-hw, hh);
        path.lineTo(-hw, -hh);
      } else {
        path.arcTo(hw, -hh, hw, hh, r);
        path.arcTo(hw, hh, -hw, hh, r);
        path.arcTo(-hw, hh, -hw, -hh, r);
        path.arcTo(-hw, -hh, hw, -hh, r);
      }
      path.closePath();
      return { path, length: 2 * (2 * hw + 2 * hh - 4 * r) + TAU * r };
    }
    case 'ellipse': {
      const path = new Path2D();
      path.ellipse(0, 0, hw, hh, 0, -Math.PI / 2, (3 * Math.PI) / 2);
      path.closePath();
      return { path, length: ellipseLength(hw, hh) };
    }
    case 'polygon': {
      const n = Math.max(3, Math.round(evalNum(layer.content.points, t)));
      const pts: [number, number][] = [];
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i * TAU) / n;
        pts.push([Math.cos(a) * hw, Math.sin(a) * hh]);
      }
      return polyPath(pts);
    }
    case 'star': {
      const n = Math.max(3, Math.round(evalNum(layer.content.points, t)));
      const inner = Math.max(0.01, evalNum(layer.content.innerRatio, t) / 100);
      const pts: [number, number][] = [];
      for (let i = 0; i < n * 2; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / n;
        const k = i % 2 === 0 ? 1 : inner;
        pts.push([Math.cos(a) * hw * k, Math.sin(a) * hh * k]);
      }
      return polyPath(pts);
    }
    default:
      return null;
  }
}

function paintShape(ctx: CanvasRenderingContext2D, layer: Layer, t: number): void {
  const d = layer.data;
  if (d.type !== 'shape') return;
  const geo = shapeGeometry(layer, t);
  if (!geo) return;
  if (d.fill) {
    ctx.fillStyle = cssColor(evalColor(layer.content.fillColor, t));
    ctx.fill(geo.path);
  }
  const sw = evalNum(layer.content.strokeWidth, t);
  if (d.stroke && sw > 0) {
    const a = evalNum(layer.content.trimStart, t) / 100;
    const b = evalNum(layer.content.trimEnd, t) / 100;
    const off = evalNum(layer.content.trimOffset, t) / 360;
    const lo = Math.min(a, b);
    const len = Math.max(a, b) - lo;
    if (len <= 1e-6) return;
    ctx.lineWidth = sw;
    ctx.lineCap = d.lineCap;
    ctx.lineJoin = d.lineJoin;
    ctx.strokeStyle = cssColor(evalColor(layer.content.strokeColor, t));
    if (len < 0.9999 || lo !== 0 || off !== 0) {
      const L = Math.max(geo.length, 1e-3);
      const start = (((lo + off) % 1) + 1) % 1;
      ctx.setLineDash([Math.min(len, 0.9999) * L, Math.max((1 - len) * L, 1e-4)]);
      ctx.lineDashOffset = -start * L;
    }
    ctx.stroke(geo.path);
    ctx.setLineDash([]);
  }
}

/** Text with animators: laid out character by character so each can be moved, scaled, faded and tinted. */
function paintTextAnimated(ctx: CanvasRenderingContext2D, layer: Layer, t: number): void {
  const d = layer.data;
  if (d.type !== 'text') return;
  const size = Math.max(1, evalNum(layer.content.fontSize, t));
  ctx.font = textFont(layer, t);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
  const baseTracking = evalNum(layer.content.tracking, t);
  const fill = evalColor(layer.content.fillColor, t);
  const stroke = evalColor(layer.content.strokeColor, t);
  const sw = evalNum(layer.content.strokeWidth, t);
  const styles = computeCharStyles(d.text, layer.animators.map((a) => evalAnimator(a, t)));
  const lh = size * 1.2;
  let ci = 0;
  d.text.split('\n').forEach((line, li) => {
    const xs: number[] = [];
    const ws: number[] = [];
    let x = 0;
    for (let k = 0; k < line.length; k++) {
      const w = ctx.measureText(line.slice(0, k + 1)).width - ctx.measureText(line.slice(0, k)).width;
      xs.push(x);
      ws.push(w);
      x += w + baseTracking + styles[ci + k].tracking;
    }
    const startX = d.align === 'left' ? 0 : d.align === 'center' ? -x / 2 : -x;
    const baseline = li * lh;
    const pivotY = baseline - size * 0.32;
    for (let k = 0; k < line.length; k++) {
      const st = styles[ci + k];
      const ch = line[k];
      if (/\s/.test(ch) || st.alpha <= 0.001) continue;
      ctx.save();
      ctx.translate(startX + xs[k] + ws[k] / 2 + st.dx, pivotY + st.dy);
      if (st.rot) ctx.rotate((st.rot * Math.PI) / 180);
      ctx.scale(st.sx, st.sy);
      ctx.globalAlpha *= Math.min(1, st.alpha);
      if (d.stroke && sw > 0) {
        ctx.lineWidth = sw;
        ctx.strokeStyle = cssColor(stroke);
        ctx.strokeText(ch, -ws[k] / 2, baseline - pivotY);
      }
      if (d.fill !== false) {
        ctx.fillStyle = cssColor(mixColor(fill, st.mix));
        ctx.fillText(ch, -ws[k] / 2, baseline - pivotY);
      }
      ctx.restore();
    }
    ci += line.length + 1;
  });
}

function paintText(ctx: CanvasRenderingContext2D, layer: Layer, t: number): void {
  const d = layer.data;
  if (d.type !== 'text') return;
  if (layer.animators.length) return paintTextAnimated(ctx, layer, t);
  const size = Math.max(1, evalNum(layer.content.fontSize, t));
  ctx.font = textFont(layer, t);
  ctx.textAlign = d.align;
  ctx.textBaseline = 'alphabetic';
  const tracking = evalNum(layer.content.tracking, t);
  if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${tracking}px`;
  const fill = cssColor(evalColor(layer.content.fillColor, t));
  const sw = evalNum(layer.content.strokeWidth, t);
  const lh = size * 1.2;
  ctx.lineJoin = 'round';
  d.text.split('\n').forEach((line, i) => {
    if (d.stroke && sw > 0) {
      ctx.lineWidth = sw;
      ctx.strokeStyle = cssColor(evalColor(layer.content.strokeColor, t));
      ctx.strokeText(line, 0, i * lh);
    }
    if (d.fill !== false) {
      ctx.fillStyle = fill;
      ctx.fillText(line, 0, i * lh);
    }
  });
}

/** Draw a non-precomp layer. Precomps are rendered recursively by the renderer. */
export function paintContent(ctx: CanvasRenderingContext2D, project: Project, layer: Layer, t: number): void {
  const d = layer.data;
  switch (d.type) {
    case 'solid':
      ctx.fillStyle = cssColor(evalColor(layer.content.color, t));
      ctx.fillRect(0, 0, d.width, d.height);
      break;
    case 'adjustment':
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, d.width, d.height);
      break;
    case 'shape':
      paintShape(ctx, layer, t);
      break;
    case 'text':
      paintText(ctx, layer, t);
      break;
    case 'image': {
      const a = project.assets[d.assetId];
      const img = getAssetImage(d.assetId);
      if (a && img) ctx.drawImage(img, 0, 0, a.width, a.height);
      else {
        ctx.fillStyle = 'rgba(120,120,130,0.5)';
        ctx.fillRect(0, 0, a?.width ?? 200, a?.height ?? 200);
      }
      break;
    }
    default:
      break;
  }
}

/** True when the layer is drawn with one fill/stroke so opacity needs no group compositing. */
export function isSingleDraw(layer: Layer): boolean {
  const d = layer.data;
  if (d.type === 'shape') return d.fill !== d.stroke;
  if (d.type === 'text') return !d.stroke;
  return true;
}
