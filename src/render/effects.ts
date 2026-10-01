import { cssColor, evalColor, evalNum, evalVec } from '../core/interp';
import { clamp, degToRad } from '../core/math';
import type { Effect } from '../core/types';
import type { Rect } from './geometry';
import { acquire, FILTER_SUPPORTED, release } from './pool';

export interface FxContext {
  /** Render resolution relative to the composition (distances are multiplied by this). */
  scale: number;
  time: number;
  fps: number;
  /** The only pixels that can be non-transparent (layer bounds plus effect padding). */
  rect: Rect;
}

/** How far (in output pixels) the given effects can spread a layer's pixels beyond its bounds. */
export function effectPadding(effects: Effect[], scale: number, time: number): number {
  let pad = 0;
  for (const fx of effects) {
    if (!fx.enabled) continue;
    const n = (k: string) => evalNum(fx.props[k], time);
    switch (fx.type) {
      case 'gaussianBlur':
        pad += n('blurriness') * 0.5 * scale * 3 + 2;
        break;
      case 'directionalBlur':
        pad += (n('length') * scale) / 2 + 2;
        break;
      case 'dropShadow':
        pad += (n('distance') + n('softness') * 1.5) * scale + 2;
        break;
      case 'glow':
        pad += n('radius') * 0.5 * scale * 3 + 2;
        break;
    }
  }
  return Math.ceil(pad);
}

type Canvas = HTMLCanvasElement;

/** Draw src through a CSS filter into a fresh canvas; src is released. */
export function filterPass(src: Canvas, filter: string, r: Rect): Canvas {
  if (!FILTER_SUPPORTED) return src;
  const dst = acquire(src.width, src.height);
  const c = dst.getContext('2d')!;
  c.filter = filter;
  c.drawImage(src, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
  c.filter = 'none';
  release(src);
  return dst;
}

function mapPixels(src: Canvas, r: Rect, fn: (d: Uint8ClampedArray) => void): void {
  const c = src.getContext('2d')!;
  const img = c.getImageData(r.x, r.y, r.w, r.h);
  fn(img.data);
  c.putImageData(img, r.x, r.y);
}

const luma = (r: number, g: number, b: number) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

function directionalBlur(src: Canvas, angleDeg: number, length: number, r: Rect): Canvas {
  const w = r.w;
  const h = r.h;
  const taps = clamp(Math.round(length), 2, 48);
  const ctx = src.getContext('2d')!;
  const data = ctx.getImageData(r.x, r.y, w, h).data;
  const out = ctx.createImageData(w, h);
  const o = out.data;
  const a = degToRad(angleDeg);
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const offsets: number[] = [];
  for (let k = 0; k < taps; k++) offsets.push((k / (taps - 1) - 0.5) * length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let al = 0;
      for (const off of offsets) {
        const sx = Math.round(x + dx * off);
        const sy = Math.round(y + dy * off);
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
        const i = (sy * w + sx) * 4;
        const aa = data[i + 3];
        if (aa === 0) continue;
        const k = aa / 255;
        r += data[i] * k;
        g += data[i + 1] * k;
        b += data[i + 2] * k;
        al += aa;
      }
      const i = (y * w + x) * 4;
      const A = al / taps;
      if (A > 0.5) {
        const k = 255 / A;
        o[i] = Math.min(255, (r / taps) * k);
        o[i + 1] = Math.min(255, (g / taps) * k);
        o[i + 2] = Math.min(255, (b / taps) * k);
        o[i + 3] = Math.min(255, A);
      }
    }
  }
  const dst = acquire(src.width, src.height);
  dst.getContext('2d')!.putImageData(out, r.x, r.y);
  release(src);
  return dst;
}

function mosaic(src: Canvas, blocksX: number, r: Rect): Canvas {
  const bx = clamp(Math.round(blocksX), 2, r.w);
  const by = clamp(Math.round((bx * r.h) / r.w), 1, r.h);
  const small = document.createElement('canvas');
  small.width = bx;
  small.height = by;
  const sc = small.getContext('2d')!;
  sc.imageSmoothingEnabled = true;
  sc.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, bx, by);
  const dst = acquire(src.width, src.height);
  const c = dst.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  c.drawImage(small, 0, 0, bx, by, r.x, r.y, r.w, r.h);
  release(src);
  return dst;
}

function glow(src: Canvas, threshold: number, radius: number, intensity: number, scale: number, r: Rect): Canvas {
  const bright = acquire(src.width, src.height);
  bright.getContext('2d')!.drawImage(src, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
  const thr = threshold / 100;
  mapPixels(bright, r, (d) => {
    for (let i = 0; i < d.length; i += 4) {
      const l = luma(d[i], d[i + 1], d[i + 2]);
      if (l < thr) d[i + 3] = 0;
      else d[i + 3] = d[i + 3] * Math.min(1, (l - thr) / Math.max(1e-3, 1 - thr) + 0.25);
    }
  });
  const blurred = filterPass(bright, `blur(${Math.max(0, radius * scale * 0.5)}px)`, r);
  const c = src.getContext('2d')!;
  c.globalCompositeOperation = 'lighter';
  let remaining = intensity;
  while (remaining > 0) {
    c.globalAlpha = Math.min(1, remaining);
    c.drawImage(blurred, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    remaining -= 1;
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  release(blurred);
  return src;
}


/* ---- transitions, tone curves and generators ---- */

function linearWipe(src: Canvas, completion: number, angleDeg: number, featherPx: number, r: Rect): Canvas {
  const c = clamp(completion / 100, 0, 1);
  if (c <= 0) return src;
  const a = degToRad(angleDeg);
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const corners: [number, number][] = [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x, r.y + r.h],
    [r.x + r.w, r.y + r.h],
  ];
  const proj = corners.map(([x, y]) => x * dx + y * dy);
  const pmin = Math.min(...proj);
  const pmax = Math.max(...proj);
  const f = Math.max(0.01, featherPx);
  const front = pmin + c * (pmax - pmin + f);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const pc = cx * dx + cy * dy;
  const ctx = src.getContext('2d')!;
  const g = ctx.createLinearGradient(cx + dx * (front - f - pc), cy + dy * (front - f - pc), cx + dx * (front - pc), cy + dy * (front - pc));
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.globalCompositeOperation = 'source-over';
  return src;
}

function radialWipe(src: Canvas, completion: number, startDeg: number, center: [number, number], ccw: boolean, featherDeg: number, r: Rect): Canvas {
  const c = clamp(completion / 100, 0, 1);
  if (c <= 0) return src;
  const ctx = src.getContext('2d')!;
  const g = ctx.createConicGradient(degToRad(startDeg) - Math.PI / 2, center[0], center[1]);
  const f = clamp(featherDeg / 360, 0, 1);
  const clear = 'rgba(0,0,0,0)';
  const solid = 'rgba(0,0,0,1)';
  if (!ccw) {
    g.addColorStop(0, clear);
    g.addColorStop(c, clear);
    g.addColorStop(Math.min(1, Math.max(c, c + f)), solid);
    g.addColorStop(1, solid);
  } else {
    const edge = 1 - c;
    g.addColorStop(0, solid);
    g.addColorStop(Math.max(0, edge - f), solid);
    g.addColorStop(edge, clear);
    g.addColorStop(1, clear);
  }
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.globalCompositeOperation = 'source-over';
  return src;
}

function levels(src: Canvas, r: Rect, inB: number, inW: number, gamma: number, outB: number, outW: number): Canvas {
  const lut = new Uint8ClampedArray(256);
  const span = Math.max(1, inW - inB);
  for (let i = 0; i < 256; i++) {
    const n = clamp((i - inB) / span, 0, 1);
    lut[i] = outB + Math.pow(n, 1 / Math.max(0.01, gamma)) * (outW - outB);
  }
  mapPixels(src, r, (d) => {
    for (let i = 0; i < d.length; i += 4) {
      d[i] = lut[d[i]];
      d[i + 1] = lut[d[i + 1]];
      d[i + 2] = lut[d[i + 2]];
    }
  });
  return src;
}

function threshold(src: Canvas, r: Rect, level: number): Canvas {
  mapPixels(src, r, (d) => {
    for (let i = 0; i < d.length; i += 4) {
      const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] >= level ? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
  });
  return src;
}

function posterize(src: Canvas, r: Rect, n: number): Canvas {
  const steps = Math.max(2, Math.round(n)) - 1;
  mapPixels(src, r, (d) => {
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.round((d[i] / 255) * steps) * (255 / steps);
      d[i + 1] = Math.round((d[i + 1] / 255) * steps) * (255 / steps);
      d[i + 2] = Math.round((d[i + 2] / 255) * steps) * (255 / steps);
    }
  });
  return src;
}

function vignette(src: Canvas, r: Rect, amount: number, size: number, feather: number): Canvas {
  const ctx = src.getContext('2d')!;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const R = Math.max(1, (Math.hypot(r.w, r.h) / 2) * (size / 100));
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  const f = clamp(feather / 100, 0.01, 1);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(clamp(1 - f, 0, 0.99), 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${clamp(amount / 100, 0, 1)})`);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.globalCompositeOperation = 'source-over';
  return src;
}

function checkerboard(src: Canvas, r: Rect, size: number, a: number[], b: number[], opacity: number): Canvas {
  const s = Math.max(1, Math.round(size));
  const tile = document.createElement('canvas');
  tile.width = tile.height = s * 2;
  const t = tile.getContext('2d')!;
  t.fillStyle = cssColor(a);
  t.fillRect(0, 0, s * 2, s * 2);
  t.fillStyle = cssColor(b);
  t.fillRect(s, 0, s, s);
  t.fillRect(0, s, s, s);
  const ctx = src.getContext('2d')!;
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = clamp(opacity / 100, 0, 1);
  ctx.translate(r.x, r.y);
  ctx.fillStyle = ctx.createPattern(tile, 'repeat')!;
  ctx.fillRect(0, 0, r.w, r.h);
  ctx.restore();
  return src;
}

function hash3(x: number, y: number, z: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function vnoise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
    l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v),
    w,
  );
}

function fractalNoise(src: Canvas, r: Rect, o: { contrast: number; brightness: number; scale: number; complexity: number; evolution: number }, outScale: number): Canvas {
  // Evaluate on a coarse grid and upscale: fractal noise is smooth, and this keeps 4K frames affordable.
  const ds = Math.max(1, Math.ceil(Math.max(r.w, r.h) / 320));
  const sw = Math.max(1, Math.ceil(r.w / ds));
  const sh = Math.max(1, Math.ceil(r.h / ds));
  const small = document.createElement('canvas');
  small.width = sw;
  small.height = sh;
  const sctx = small.getContext('2d')!;
  const img = sctx.createImageData(sw, sh);
  const px = img.data;
  const z = (o.evolution / 360) * 4;
  const octaves = clamp(Math.round(o.complexity), 1, 8);
  const cell = Math.max(1, o.scale * outScale);
  const gain = (o.contrast / 100) * 2;
  const lift = 0.5 + o.brightness / 100;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      let n = 0;
      let amp = 0.5;
      let freq = 1;
      let norm = 0;
      for (let k = 0; k < octaves; k++) {
        n += amp * vnoise3(((x * ds + r.x) / cell) * freq + k * 17.1, ((y * ds + r.y) / cell) * freq + k * 31.7, z * freq);
        norm += amp;
        amp *= 0.5;
        freq *= 2;
      }
      const g = clamp(((n / norm) - 0.5) * gain + lift, 0, 1) * 255;
      const i = (y * sw + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = g;
      px[i + 3] = 255;
    }
  }
  sctx.putImageData(img, 0, 0);
  const ctx = src.getContext('2d')!;
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(small, 0, 0, sw, sh, r.x, r.y, sw * ds, sh * ds);
  ctx.restore();
  return src;
}

function applyOne(src: Canvas, fx: Effect, ctx: FxContext): Canvas {
  const t = ctx.time;
  const r = ctx.rect;
  const p = fx.props;
  const n = (k: string) => evalNum(p[k], t);
  switch (fx.type) {
    case 'gaussianBlur': {
      const v = n('blurriness');
      return v <= 0 ? src : filterPass(src, `blur(${v * 0.5 * ctx.scale}px)`, r);
    }
    case 'directionalBlur': {
      const len = n('length') * ctx.scale;
      return len < 1 ? src : directionalBlur(src, n('direction'), len, r);
    }
    case 'mosaic':
      return mosaic(src, n('blocks'), r);
    case 'brightnessContrast':
      return filterPass(src, `brightness(${Math.max(0, 1 + n('brightness') / 100)}) contrast(${Math.max(0, 1 + n('contrast') / 100)})`, r);
    case 'hueSaturation':
      return filterPass(
        src,
        `hue-rotate(${n('hue')}deg) saturate(${Math.max(0, 1 + n('saturation') / 100)}) brightness(${Math.max(0, 1 + n('lightness') / 100)})`,
        r,
      );
    case 'blackWhite':
      return filterPass(src, `grayscale(${n('amount')}%)`, r);
    case 'invert':
      return filterPass(src, `invert(${n('amount')}%)`, r);
    case 'tint': {
      const black = evalColor(p.black, t);
      const white = evalColor(p.white, t);
      const amount = n('amount') / 100;
      mapPixels(src, r, (d) => {
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] === 0) continue;
          const l = luma(d[i], d[i + 1], d[i + 2]);
          for (let c = 0; c < 3; c++) {
            const mapped = black[c] + (white[c] - black[c]) * l;
            d[i + c] = d[i + c] + (mapped - d[i + c]) * amount;
          }
        }
      });
      return src;
    }
    case 'dropShadow': {
      const dst = acquire(src.width, src.height);
      const c = dst.getContext('2d')!;
      const a = degToRad(n('direction'));
      const dist = n('distance') * ctx.scale;
      c.shadowColor = cssColor(evalColor(p.color, t), clamp(n('opacity') / 100, 0, 1));
      c.shadowBlur = n('softness') * ctx.scale;
      c.shadowOffsetX = Math.sin(a) * dist;
      c.shadowOffsetY = -Math.cos(a) * dist;
      c.drawImage(src, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
      release(src);
      return dst;
    }
    case 'glow':
      return glow(src, n('threshold'), n('radius'), n('intensity'), ctx.scale, r);
    case 'fill': {
      const c = src.getContext('2d')!;
      c.globalCompositeOperation = 'source-atop';
      c.globalAlpha = clamp(n('opacity') / 100, 0, 1);
      c.fillStyle = cssColor(evalColor(p.color, t));
      c.fillRect(r.x, r.y, r.w, r.h);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
      return src;
    }
    case 'gradientRamp': {
      const c = src.getContext('2d')!;
      const [sx, sy] = evalVec(p.start, t);
      const [ex, ey] = evalVec(p.end, t);
      const s = ctx.scale;
      const g =
        n('shape') < 0.5
          ? c.createLinearGradient(sx * s, sy * s, ex * s, ey * s)
          : c.createRadialGradient(sx * s, sy * s, 0, sx * s, sy * s, Math.max(1, Math.hypot(ex - sx, ey - sy) * s));
      g.addColorStop(0, cssColor(evalColor(p.startColor, t)));
      g.addColorStop(1, cssColor(evalColor(p.endColor, t)));
      c.globalCompositeOperation = 'source-atop';
      c.globalAlpha = 1 - clamp(n('blend') / 100, 0, 1);
      c.fillStyle = g;
      c.fillRect(r.x, r.y, r.w, r.h);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
      return src;
    }
    case 'noise': {
      const amount = (n('amount') / 100) * 255;
      let seed = (Math.round(t * ctx.fps) * 2654435761) >>> 0 || 1;
      mapPixels(src, r, (d) => {
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] === 0) continue;
          seed ^= seed << 13;
          seed >>>= 0;
          seed ^= seed >>> 17;
          seed ^= seed << 5;
          seed >>>= 0;
          const r = ((seed & 0xffff) / 0xffff - 0.5) * 2 * amount;
          d[i] += r;
          d[i + 1] += r;
          d[i + 2] += r;
        }
      });
      return src;
    }
    case 'linearWipe':
      return linearWipe(src, n('completion'), n('angle'), n('feather') * ctx.scale, r);
    case 'radialWipe': {
      const [cx, cy] = evalVec(p.center, t);
      return radialWipe(src, n('completion'), n('start'), [cx * ctx.scale, cy * ctx.scale], n('direction') >= 0.5, n('feather'), r);
    }
    case 'levels':
      return levels(src, r, n('inBlack'), n('inWhite'), n('gamma'), n('outBlack'), n('outWhite'));
    case 'threshold':
      return threshold(src, r, n('level'));
    case 'posterize':
      return posterize(src, r, n('levels'));
    case 'vignette':
      return vignette(src, r, n('amount'), n('size'), n('feather'));
    case 'checkerboard':
      return checkerboard(src, r, n('size') * ctx.scale, evalColor(p.colorA, t), evalColor(p.colorB, t), n('opacity'));
    case 'fractalNoise':
      return fractalNoise(
        src,
        r,
        { contrast: n('contrast'), brightness: n('brightness'), scale: n('scale'), complexity: n('complexity'), evolution: n('evolution') },
        ctx.scale,
      );
    default:
      return src;
  }
}

/** Run an effect stack over a layer surface. Consumes `src` and returns the finished surface. */
export function applyEffects(src: Canvas, effects: Effect[], ctx: FxContext): Canvas {
  let cur = src;
  for (const fx of effects) {
    if (fx.enabled) cur = applyOne(cur, fx, ctx);
  }
  return cur;
}
