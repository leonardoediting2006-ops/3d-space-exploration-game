// A tiny canvas pool: layers, mattes and effects all need full-size scratch surfaces every
// frame, and allocating canvases at 60 fps is slow and churns the GC.

const free = new Map<string, HTMLCanvasElement[]>();
const MAX_PER_SIZE = 8;

export function resetCtx(ctx: CanvasRenderingContext2D): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
}

/** A transparent canvas of exactly w × h pixels. Hand it back with release(). */
export function acquire(w: number, h: number): HTMLCanvasElement {
  const key = `${w}x${h}`;
  const list = free.get(key);
  let c = list?.pop();
  if (!c) {
    c = document.createElement('canvas');
    c.width = w;
    c.height = h;
  }
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  resetCtx(ctx);
  ctx.clearRect(0, 0, w, h);
  return c;
}

export function release(c: HTMLCanvasElement): void {
  const key = `${c.width}x${c.height}`;
  let list = free.get(key);
  if (!list) free.set(key, (list = []));
  if (list.length < MAX_PER_SIZE) list.push(c);
}

export const FILTER_SUPPORTED =
  typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;
