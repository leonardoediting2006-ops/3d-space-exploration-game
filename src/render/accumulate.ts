import type { Rect } from './geometry';

/**
 * Averages canvases exactly, in premultiplied float space. Canvas 8-bit compositing cannot
 * average N frames without visible rounding drift, so motion blur sums on the CPU instead.
 * Only the given rectangle is read and written, so small layers stay cheap.
 */
export class Accumulator {
  private sum: Float32Array;
  private n = 0;

  constructor(private r: Rect) {
    this.sum = new Float32Array(r.w * r.h * 4);
  }

  add(src: HTMLCanvasElement): void {
    const { x, y, w, h } = this.r;
    const d = src.getContext('2d')!.getImageData(x, y, w, h).data;
    const s = this.sum;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (a === 0) continue;
      const k = a / 255;
      s[i] += d[i] * k;
      s[i + 1] += d[i + 1] * k;
      s[i + 2] += d[i + 2] * k;
      s[i + 3] += a;
    }
    this.n++;
  }

  writeTo(dst: HTMLCanvasElement): void {
    const { x, y, w, h } = this.r;
    const ctx = dst.getContext('2d')!;
    const out = ctx.createImageData(w, h);
    const o = out.data;
    const s = this.sum;
    const inv = 1 / Math.max(1, this.n);
    for (let i = 0; i < s.length; i += 4) {
      const a = s[i + 3] * inv;
      if (a <= 0.5) continue;
      const k = 255 / a;
      o[i] = Math.min(255, s[i] * inv * k);
      o[i + 1] = Math.min(255, s[i + 1] * inv * k);
      o[i + 2] = Math.min(255, s[i + 2] * inv * k);
      o[i + 3] = Math.min(255, a);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(x, y, w, h);
    ctx.putImageData(out, x, y);
  }
}
