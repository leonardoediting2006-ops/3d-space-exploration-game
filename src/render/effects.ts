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
function filterPass(src: Canvas, filter: string, r: Rect): Canvas {
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
