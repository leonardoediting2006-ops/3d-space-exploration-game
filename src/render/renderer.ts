import { cssColor, evalNum, evalProp } from '../core/interp';
import { apply, clamp, mul, scaling, translate, type Mat } from '../core/math';
import { pathToPath2D, pointCount } from '../core/path';
import { BLEND_MODES, type Comp, type Effect, type Layer, type MatteMode, type Project } from '../core/types';
import { Accumulator } from './accumulate';
import { depthOf, planeHomography, sceneAt, worldModel, type Mat3, type Scene3D } from '../core/scene3d';
import { point4 } from '../core/math3';
import { applyEffects, effectPadding, filterPass } from './effects';
import { contentPad, layerMap, localBounds, rectCorners, worldMatrix, type Rect } from './geometry';
import { isSingleDraw, paintContent } from './painters';
import { drawPlane, drawPlaneAffine, type PlaneDraw } from './plane3d';
import { acquire, release, resetCtx } from './pool';

export interface RenderOptions {
  /** Output pixels per composition pixel (1 = full resolution). */
  scale: number;
  /** Leave the background transparent (used for precomps and PNG export with alpha). */
  transparent?: boolean;
  /** Motion blur sub-frame samples; <= 1 disables motion blur. */
  mbSamples?: number;
  /** Precomp ancestry, to stop a comp from containing itself. */
  stack?: string[];
}

interface Frame {
  project: Project;
  comp: Comp;
  time: number;
  w: number;
  h: number;
  s: number;
  opts: RenderOptions;
  byId: Map<string, Layer>;
  anySolo: boolean;
  /** The camera and lights at this frame's time. */
  scene: Scene3D;
  /** Set while a 3D layer's plane is rendered flat: it is drawn at the origin of its own pixel grid. */
  plane?: { layerId: string; ox: number; oy: number };
}

const blendOp = (id: Layer['blend']): GlobalCompositeOperation =>
  BLEND_MODES.find((b) => b.id === id)?.op ?? 'source-over';

const inRange = (l: Layer, t: number): boolean => t >= l.inPoint - 1e-9 && t < l.outPoint - 1e-9;

const isActive = (f: Frame, l: Layer): boolean => l.visible && (!f.anySolo || l.solo) && inRange(l, f.time);

function layerMatrix(f: Frame, l: Layer, t: number): Mat {
  if (f.plane && f.plane.layerId === l.id) return mul(scaling(f.s, f.s), translate(-f.plane.ox, -f.plane.oy));
  return mul(scaling(f.s, f.s), worldMatrix(l, t, f.byId));
}

/** Layers that are placed in 3D space (the rest, including cameras and lights, take no part in the picture). */
const is3D = (l: Layer): boolean => !!l.threeD && l.type !== 'null' && l.type !== 'adjustment' && l.type !== 'camera' && l.type !== 'light' && l.type !== 'audio';

function setM(ctx: CanvasRenderingContext2D, m: Mat): void {
  ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
}

const sampleTimes = (f: Frame, l: Layer): number[] => {
  const n = f.opts.mbSamples ?? 0;
  if (!(f.comp.motionBlur && l.motionBlur && n > 1)) return [f.time];
  const exposure = f.comp.shutterAngle / 360 / f.comp.fps;
  const times: number[] = [];
  for (let i = 0; i < n; i++) times.push(f.time + ((i + 0.5) / n - 0.5) * exposure);
  return times;
};

/**
 * The pixels a layer can touch: its transformed bounds (over every motion-blur sample), grown by
 * stroke and effect padding, clamped to the canvas. Null means it is entirely off-screen.
 */
function layerRect(f: Frame, l: Layer, effects: Effect[], times: number[]): Rect | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const t of times) {
    const b = localBounds(f.project, l, t);
    if (!b) return null;
    const pad = contentPad(l, t);
    const m = layerMatrix(f, l, t);
    for (const c of rectCorners({ x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 })) {
      const [px, py] = apply(m, c);
      x0 = Math.min(x0, px);
      y0 = Math.min(y0, py);
      x1 = Math.max(x1, px);
      y1 = Math.max(y1, py);
    }
  }
  if (!Number.isFinite(x0 + y0 + x1 + y1)) return null;
  const fx = effectPadding(effects, f.s, f.time) + 1;
  const x = Math.max(0, Math.floor(x0 - fx));
  const y = Math.max(0, Math.floor(y0 - fx));
  const r = Math.min(f.w, Math.ceil(x1 + fx));
  const b = Math.min(f.h, Math.ceil(y1 + fx));
  return r > x && b > y ? { x, y, w: r - x, h: b - y } : null;
}

/** Draw one layer's own content at time t into ctx (which is already cleared/composited by the caller). */
function paintLayer(f: Frame, ctx: CanvasRenderingContext2D, l: Layer, t: number): void {
  ctx.save();
  setM(ctx, layerMatrix(f, l, t));
  const d = l.data;
  if (d.type === 'precomp') {
    const sub = f.project.comps[d.compId];
    const stack = f.opts.stack ?? [];
    const subTime = t - l.start;
    if (sub && !stack.includes(sub.id) && f.comp.id !== sub.id && subTime >= 0 && subTime < sub.duration) {
      const w = Math.max(1, Math.round(sub.width * f.s));
      const h = Math.max(1, Math.round(sub.height * f.s));
      const c = acquire(w, h);
      renderComp(c, f.project, sub, subTime, { ...f.opts, scale: f.s, transparent: true, stack: [...stack, f.comp.id] });
      ctx.drawImage(c, 0, 0, sub.width, sub.height);
      release(c);
    }
  } else {
    paintContent(ctx, f.project, l, t);
  }
  ctx.restore();
}

/** A fingerprint of everything that can change a layer's appearance between sub-frame samples. */
function sampleKey(f: Frame, l: Layer, t: number): string {
  const m = worldMatrix(l, t, f.byId);
  const animated = [...Object.values(l.content), ...l.animators.flatMap((a) => Object.values(a.props)), ...l.masks.flatMap((m) => Object.values(m.props))];
  const vals = animated.map((p) => (p.keys.length || p.wiggle ? JSON.stringify(evalProp(p, t)) : 0));
  return m.map((x) => x.toFixed(4)).join(',') + '|' + vals.join(',');
}

function renderMotionBlurred(f: Frame, l: Layer, surf: HTMLCanvasElement, rect: Rect, times: number[]): void {
  const first = sampleKey(f, l, times[0]);
  const moving = l.type === 'precomp' || times.some((t) => sampleKey(f, l, t) !== first);
  const sctx = surf.getContext('2d')!;
  if (!moving) {
    paintLayer(f, sctx, l, f.time);
    return;
  }
  const acc = new Accumulator(rect);
  const tmp = acquire(surf.width, surf.height);
  const tctx = tmp.getContext('2d')!;
  for (const t of times) {
    resetCtx(tctx);
    tctx.clearRect(rect.x, rect.y, rect.w, rect.h);
    paintLayer(f, tctx, l, t);
    acc.add(tmp);
  }
  release(tmp);
  acc.writeTo(surf);
}


const activeMasks = (l: Layer) => l.masks.filter((m) => m.mode !== 'none');

/**
 * Cut the layer's pixels by its masks, in stack order: the first mask seeds the matte, later ones
 * add to it, subtract from it or intersect with it. Runs before effects, like in AE.
 */
function applyMasks(f: Frame, surf: HTMLCanvasElement, l: Layer, rect: Rect): void {
  const masks = activeMasks(l);
  if (!masks.length) return;
  const t = f.time;
  const m = layerMatrix(f, l, t);
  const acc = acquire(f.w, f.h);
  const actx = acc.getContext('2d')!;
  const blit = (ctx: CanvasRenderingContext2D, src: HTMLCanvasElement) => ctx.drawImage(src, rect.x, rect.y, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h);

  masks.forEach((mask, i) => {
    const v = evalProp(mask.props.path, t) as number[];
    let shape = acquire(f.w, f.h);
    const sctx = shape.getContext('2d')!;
    if (pointCount(v) >= 2) {
      sctx.save();
      setM(sctx, m);
      const path = pathToPath2D(v, true);
      sctx.fillStyle = '#fff';
      sctx.fill(path);
      const expansion = evalNum(mask.props.expansion, t);
      if (expansion !== 0) {
        sctx.globalCompositeOperation = expansion > 0 ? 'source-over' : 'destination-out';
        sctx.strokeStyle = '#fff';
        sctx.lineJoin = 'round';
        sctx.lineWidth = Math.abs(expansion) * 2;
        sctx.stroke(path);
      }
      sctx.restore();
    }
    const feather = evalNum(mask.props.feather, t) * f.s;
    if (feather > 0.05) {
      const grow = Math.ceil(feather * 1.5) + 2;
      const er: Rect = {
        x: Math.max(0, rect.x - grow),
        y: Math.max(0, rect.y - grow),
        w: 0,
        h: 0,
      };
      er.w = Math.min(f.w, rect.x + rect.w + grow) - er.x;
      er.h = Math.min(f.h, rect.y + rect.h + grow) - er.y;
      shape = filterPass(shape, `blur(${feather * 0.5}px)`, er);
    }
    if (mask.inverted) {
      const inv = acquire(f.w, f.h);
      const ictx = inv.getContext('2d')!;
      ictx.fillStyle = '#fff';
      ictx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ictx.globalCompositeOperation = 'destination-out';
      blit(ictx, shape);
      release(shape);
      shape = inv;
    }
    const opacity = clamp(evalNum(mask.props.opacity, t) / 100, 0, 1);
    actx.save();
    actx.globalAlpha = opacity;
    if (i === 0) {
      if (mask.mode === 'subtract') {
        actx.globalAlpha = 1;
        actx.fillStyle = '#fff';
        actx.fillRect(rect.x, rect.y, rect.w, rect.h);
        actx.globalAlpha = opacity;
        actx.globalCompositeOperation = 'destination-out';
      }
    } else if (mask.mode === 'subtract') actx.globalCompositeOperation = 'destination-out';
    else if (mask.mode === 'intersect') actx.globalCompositeOperation = 'destination-in';
    blit(actx, shape);
    actx.restore();
    release(shape);
  });

  const sctx = surf.getContext('2d')!;
  sctx.globalCompositeOperation = 'destination-in';
  blit(sctx, acc);
  sctx.globalCompositeOperation = 'source-over';
  release(acc);
}

/** Layer content + its effect stack on a transparent, comp-sized surface (no opacity/blend yet). */
function renderLayerSurface(f: Frame, l: Layer, effects: Effect[], rect: Rect, times: number[]): HTMLCanvasElement {
  let surf = acquire(f.w, f.h);
  if (times.length > 1) renderMotionBlurred(f, l, surf, rect, times);
  else paintLayer(f, surf.getContext('2d')!, l, f.time);
  applyMasks(f, surf, l, rect);
  if (effects.length) surf = applyEffects(surf, effects, { scale: f.s, time: f.time, fps: f.comp.fps, rect });
  return surf;
}

function applyMatte(surf: HTMLCanvasElement, matte: HTMLCanvasElement, mode: MatteMode, r: Rect): void {
  const sctx = surf.getContext('2d')!;
  if (mode === 'luma' || mode === 'lumaInv') {
    const mctx = matte.getContext('2d')!;
    const img = mctx.getImageData(r.x, r.y, r.w, r.h);
    const d = img.data;
    const inv = mode === 'lumaInv';
    for (let i = 0; i < d.length; i += 4) {
      const l = ((0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255) * (d[i + 3] / 255);
      d[i] = d[i + 1] = d[i + 2] = 0;
      d[i + 3] = (inv ? 1 - l : l) * 255;
    }
    mctx.putImageData(img, r.x, r.y);
    sctx.globalCompositeOperation = 'destination-in';
  } else {
    sctx.globalCompositeOperation = mode === 'alphaInv' ? 'destination-out' : 'destination-in';
  }
  sctx.drawImage(matte, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
  sctx.globalCompositeOperation = 'source-over';
}

function drawAdjustment(f: Frame, ctx: CanvasRenderingContext2D, l: Layer, effects: Effect[]): void {
  if (!effects.length) return;
  const opacity = evalNum(l.transform.opacity, f.time) / 100;
  if (opacity <= 0) return;
  const rect = layerRect(f, l, [], [f.time]);
  if (!rect) return;
  const mask = renderLayerSurface(f, l, [], rect, [f.time]);
  let below = acquire(f.w, f.h);
  below.getContext('2d')!.drawImage(ctx.canvas, rect.x, rect.y, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h);
  below = applyEffects(below, effects, { scale: f.s, time: f.time, fps: f.comp.fps, rect });
  const bctx = below.getContext('2d')!;
  bctx.globalCompositeOperation = 'destination-in';
  bctx.drawImage(mask, rect.x, rect.y, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h);
  bctx.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = opacity;
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(mask, rect.x, rect.y, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h);
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(below, rect.x, rect.y, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
  release(mask);
  release(below);
}

/**
 * A 3D layer's picture at time t, projected onto a comp-sized surface: the layer is rendered flat
 * into its own plane (masks and effects as usual), then drawn through the projection of that plane.
 */
function renderPlane(f: Frame, l: Layer, effects: Effect[], t: number): HTMLCanvasElement | null {
  const b = localBounds(f.project, l, t);
  if (!b) return null;
  const scene = t === f.time ? f.scene : sceneAt(f.comp, t);
  const model = worldModel(l, t, f.byId);
  const pad = contentPad(l, t) + 2 + effectPadding(effects, f.s, t) / f.s;
  const rect = { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
  // very large planes are drawn at a lower resolution and stretched, to keep memory in check
  let ps = f.s;
  const biggest = Math.max(rect.w, rect.h) * ps;
  if (biggest > 4096) ps *= 4096 / biggest;
  const pw = Math.max(1, Math.ceil(rect.w * ps));
  const ph = Math.max(1, Math.ceil(rect.h * ps));
  const fp: Frame = { ...f, w: pw, h: ph, s: ps, time: t, plane: { layerId: l.id, ox: rect.x, oy: rect.y } };
  const texture = renderLayerSurface(fp, l, effects, { x: 0, y: 0, w: pw, h: ph }, [t]);
  const H: Mat3 = planeHomography(scene.view, model);
  // layer units → output pixels: scale x' and y' (not w')
  const out: Mat3 = [H[0] * f.s, H[1] * f.s, H[2] * f.s, H[3] * f.s, H[4] * f.s, H[5] * f.s, H[6], H[7], H[8]];
  const draw: PlaneDraw = { width: f.w, height: f.h, texture, rect, H: out, model, lights: scene.lights, ps };
  const surf = acquire(f.w, f.h);
  const gl = drawPlane(draw);
  if (gl) surf.getContext('2d')!.drawImage(gl, 0, 0);
  else drawPlaneAffine(surf.getContext('2d')!, draw);
  release(texture);
  return surf;
}

/** The projected picture of a 3D layer, blurred across the shutter when motion blur is on. */
function render3DSurface(f: Frame, l: Layer, effects: Effect[], times: number[]): HTMLCanvasElement | null {
  if (times.length === 1) return renderPlane(f, l, effects, times[0]);
  const acc = new Accumulator({ x: 0, y: 0, w: f.w, h: f.h });
  for (const t of times) {
    const s = renderPlane(f, l, effects, t);
    if (!s) continue;
    acc.add(s);
    release(s);
  }
  const out = acquire(f.w, f.h);
  acc.writeTo(out);
  return out;
}

function drawLayer(f: Frame, ctx: CanvasRenderingContext2D, layers: Layer[], i: number, consumed: Set<string>): void {
  const l = layers[i];
  if (!isActive(f, l) || consumed.has(l.id) || l.type === 'null') return;
  const effects = l.effects.filter((e) => e.enabled);
  if (l.type === 'adjustment') {
    drawAdjustment(f, ctx, l, effects);
    return;
  }
  const opacity = evalNum(l.transform.opacity, f.time) / 100;
  if (opacity <= 0) return;
  const times = sampleTimes(f, l);
  const three = is3D(l);
  const rect = three ? { x: 0, y: 0, w: f.w, h: f.h } : layerRect(f, l, effects, times);
  if (!rect) return; // entirely off-screen
  const matteLayer = l.matte !== 'none' && i > 0 ? layers[i - 1] : null;
  const simple = !three && effects.length === 0 && !matteLayer && times.length === 1 && activeMasks(l).length === 0 && (opacity >= 0.999 || isSingleDraw(l));

  if (simple) {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.globalCompositeOperation = blendOp(l.blend);
    paintLayer(f, ctx, l, f.time);
    ctx.restore();
    return;
  }

  const surf = three ? render3DSurface(f, l, effects, times) : renderLayerSurface(f, l, effects, rect, times);
  if (!surf) return;
  if (matteLayer && matteLayer.type !== 'null' && matteLayer.type !== 'adjustment') {
    // A matte outside its own time range is an empty matte: the layer it mattes disappears.
    const mEffects = matteLayer.effects.filter((e) => e.enabled);
    const mTimes = sampleTimes(f, matteLayer);
    let matte: HTMLCanvasElement;
    if (!inRange(matteLayer, f.time)) matte = acquire(f.w, f.h);
    else if (is3D(matteLayer)) matte = render3DSurface(f, matteLayer, mEffects, mTimes) ?? acquire(f.w, f.h);
    else {
      const mRect = layerRect(f, matteLayer, mEffects, mTimes);
      matte = mRect ? renderLayerSurface(f, matteLayer, mEffects, mRect, mTimes) : acquire(f.w, f.h);
    }
    const mo = evalNum(matteLayer.transform.opacity, f.time) / 100;
    if (mo < 1) {
      const mctx = matte.getContext('2d')!;
      mctx.globalCompositeOperation = 'destination-in';
      mctx.fillStyle = `rgba(0,0,0,${Math.max(0, mo)})`;
      mctx.fillRect(0, 0, matte.width, matte.height);
      mctx.globalCompositeOperation = 'source-over';
    }
    applyMatte(surf, matte, l.matte, rect);
    release(matte);
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = opacity;
  ctx.globalCompositeOperation = blendOp(l.blend);
  ctx.drawImage(surf, rect.x, rect.y, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
  release(surf);
}

/**
 * Stack order is back to front, except that neighbouring 3D layers are sorted by how far they are
 * from the camera (farthest first), so a layer pushed back in Z goes behind its neighbours. 2D layers,
 * and layers tied together by a track matte, stay where they are and separate the groups.
 */
function drawOrder(f: Frame, layers: Layer[], consumed: Set<string>): number[] {
  const order: number[] = [];
  for (let i = layers.length - 1; i >= 0; i--) order.push(i);
  const sortable = (i: number) => {
    const l = layers[i];
    return is3D(l) && isActive(f, l) && l.matte === 'none' && !consumed.has(l.id);
  };
  const depth = (i: number): number => {
    const l = layers[i];
    const b = localBounds(f.project, l, f.time);
    const c = point4(worldModel(l, f.time, f.byId), b ? [b.x + b.w / 2, b.y + b.h / 2, 0] : [0, 0, 0]);
    return depthOf(f.scene.view, c);
  };
  let k = 0;
  while (k < order.length) {
    if (!sortable(order[k])) {
      k++;
      continue;
    }
    let end = k;
    while (end < order.length && sortable(order[end])) end++;
    if (end - k > 1) {
      const run = order.slice(k, end).map((i) => ({ i, d: depth(i) }));
      run.sort((a, b) => b.d - a.d || b.i - a.i); // farthest first; equal depth keeps the stack order
      run.forEach((r, n) => (order[k + n] = r.i));
    }
    k = end;
  }
  return order;
}

/** Render a composition at a given time into a canvas (resized to the composition × scale). */
export function renderComp(
  canvas: HTMLCanvasElement,
  project: Project,
  comp: Comp,
  time: number,
  opts: RenderOptions,
): void {
  const w = Math.max(1, Math.round(comp.width * opts.scale));
  const h = Math.max(1, Math.round(comp.height * opts.scale));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  resetCtx(ctx);
  ctx.clearRect(0, 0, w, h);
  if (!opts.transparent) {
    ctx.fillStyle = cssColor(comp.bg);
    ctx.fillRect(0, 0, w, h);
  }
  const layers = comp.layers;
  const f: Frame = {
    project,
    comp,
    time,
    w,
    h,
    s: opts.scale,
    opts,
    byId: layerMap(comp),
    anySolo: layers.some((l) => l.solo && l.type !== 'audio'),
    scene: sceneAt(comp, time),
  };
  const consumed = new Set<string>();
  layers.forEach((l, i) => {
    if (i > 0 && l.matte !== 'none') consumed.add(layers[i - 1].id);
  });
  for (const i of drawOrder(f, layers, consumed)) drawLayer(f, ctx, layers, i, consumed);
}
