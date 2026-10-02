// Video footage. Each video asset is a muted <video> element that is only ever used as a frame
// source: while the composition plays the element plays along and the renderer draws its current
// picture; while the playhead is parked or scrubbing (and always when exporting) a frame is
// requested by seeking, copied into a small cache, and drawn from there. The renderer itself stays
// synchronous: callers prepare the frames they need first (see prepareFrame).
import type { Comp, Layer, Project } from '../core/types';

interface Cached {
  canvas: HTMLCanvasElement;
  time: number;
}

interface Source {
  id: string;
  url: string;
  el: HTMLVideoElement;
  width: number;
  height: number;
  duration: number;
  frames: Map<number, Cached>;
  /** Cache keys, oldest first. */
  order: number[];
  playing: boolean;
  /** Seeks to one element must not overlap, so they queue here. */
  chain: Promise<void>;
  thumb: string | null;
}

const sources = new Map<string, Source>();
const listeners = new Set<() => void>();
const MAX_CACHED = 8;
/** Seek a hair past the frame's timestamp so rounding in the file's clock never lands on the frame before. */
const SEEK_BIAS = 0.0015;
const SEEK_TIMEOUT = 6000;

const key = (t: number): number => Math.round(t * 1000);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Be told when a requested frame has arrived, so the viewer can redraw. */
export function onVideoFrames(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const notify = () => listeners.forEach((fn) => fn());

export interface VideoInfo {
  width: number;
  height: number;
  duration: number;
}

/** Prepare a video file for use as footage. Rejects if this browser cannot play it. */
export function loadVideo(id: string, blob: Blob): Promise<VideoInfo> {
  disposeVideo(id);
  const url = URL.createObjectURL(blob);
  const el = document.createElement('video');
  el.muted = true;
  el.playsInline = true;
  el.preload = 'auto';
  return new Promise((resolve, reject) => {
    const fail = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This browser cannot play that video. WebM (VP8/VP9) works everywhere; MP4 (H.264) works in Chrome, Edge and Safari.'));
    };
    el.onerror = fail;
    el.onloadeddata = async () => {
      el.onloadeddata = null;
      el.onerror = null;
      let duration = el.duration;
      if (!Number.isFinite(duration)) duration = await probeDuration(el);
      if (!(el.videoWidth > 0 && el.videoHeight > 0 && duration > 0)) return fail();
      const src: Source = { id, url, el, width: el.videoWidth, height: el.videoHeight, duration, frames: new Map(), order: [], playing: false, chain: Promise.resolve(), thumb: null };
      sources.set(id, src);
      resolve({ width: src.width, height: src.height, duration });
      void makeThumb(src);
    };
    el.src = url;
  });
}

/** Files recorded live (MediaRecorder) often report an infinite duration until the end is reached. */
function probeDuration(el: HTMLVideoElement): Promise<number> {
  return new Promise((resolve) => {
    const done = () => {
      el.removeEventListener('durationchange', check);
      const d = Number.isFinite(el.duration) ? el.duration : 0;
      el.currentTime = 0;
      resolve(d);
    };
    const check = () => {
      if (Number.isFinite(el.duration)) done();
    };
    el.addEventListener('durationchange', check);
    setTimeout(done, 4000);
    el.currentTime = 1e7;
  });
}

async function makeThumb(src: Source): Promise<void> {
  try {
    await seekFrame(src.id, Math.min(src.duration * 0.1, 1));
    const c = document.createElement('canvas');
    c.width = 80;
    c.height = Math.max(1, Math.round((80 * src.height) / src.width));
    c.getContext('2d')!.drawImage(src.el, 0, 0, c.width, c.height);
    src.thumb = c.toDataURL('image/jpeg', 0.7);
    notify();
  } catch {
    /* no thumbnail */
  }
}

export const getVideoThumb = (id: string): string | null => sources.get(id)?.thumb ?? null;
export const hasVideo = (id: string): boolean => sources.has(id);
export const getVideoInfo = (id: string): VideoInfo | undefined => {
  const s = sources.get(id);
  return s && { width: s.width, height: s.height, duration: s.duration };
};

export function disposeVideo(id: string): void {
  const s = sources.get(id);
  if (!s) return;
  s.el.pause();
  s.el.removeAttribute('src');
  s.el.load();
  URL.revokeObjectURL(s.url);
  sources.delete(id);
}

export function disposeAllVideos(): void {
  for (const id of [...sources.keys()]) disposeVideo(id);
}

/* ------------------------------------------------------------------ frames */

/** The picture to draw for `id` at `srcTime` seconds into the file: the live element while playing, else the nearest cached frame. */
export function getVideoFrame(id: string, srcTime: number): CanvasImageSource | null {
  const s = sources.get(id);
  if (!s) return null;
  if (s.playing && s.el.readyState >= 2) return s.el;
  const hit = s.frames.get(key(srcTime));
  if (hit) return hit.canvas;
  let best: Cached | null = null;
  for (const c of s.frames.values()) if (!best || Math.abs(c.time - srcTime) < Math.abs(best.time - srcTime)) best = c;
  return best ? best.canvas : null;
}

/** Is the exact frame for this time available right now? */
export function haveVideoFrame(id: string, srcTime: number): boolean {
  const s = sources.get(id);
  return !!s && ((s.playing && s.el.readyState >= 2) || s.frames.has(key(srcTime)));
}

/** Seek to a frame and copy it into the cache. */
export function seekFrame(id: string, srcTime: number): Promise<void> {
  const s = sources.get(id);
  if (!s) return Promise.resolve();
  s.chain = s.chain.then(
    () =>
      new Promise<void>((resolve) => {
        const k = key(srcTime);
        if (s.frames.has(k)) return resolve();
        const target = clamp(srcTime + SEEK_BIAS, 0, Math.max(0, s.duration - 0.001));
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          s.el.removeEventListener('seeked', finish);
          snapshot(s, k, srcTime);
          resolve();
        };
        const timer = window.setTimeout(finish, SEEK_TIMEOUT);
        if (Math.abs(s.el.currentTime - target) < 1e-4 && s.el.readyState >= 2) return finish();
        s.el.addEventListener('seeked', finish);
        s.el.currentTime = target;
      }),
  );
  return s.chain;
}

function snapshot(s: Source, k: number, time: number): void {
  let slot: Cached;
  if (s.order.length >= MAX_CACHED) {
    const oldest = s.order.shift()!;
    slot = s.frames.get(oldest)!;
    s.frames.delete(oldest);
  } else {
    slot = { canvas: document.createElement('canvas'), time };
  }
  if (slot.canvas.width !== s.width) slot.canvas.width = s.width;
  if (slot.canvas.height !== s.height) slot.canvas.height = s.height;
  slot.canvas.getContext('2d')!.drawImage(s.el, 0, 0, s.width, s.height);
  slot.time = time;
  s.frames.set(k, slot);
  s.order.push(k);
}

/* ------------------------------------------------------------------ which frames a composition needs */

export interface FrameNeed {
  assetId: string;
  /** Seconds into the file. */
  srcTime: number;
}

const inRange = (l: Layer, t: number) => t >= l.inPoint - 1e-9 && t < l.outPoint - 1e-9;

/** Every video frame visible in `comp` at time t, following precomps. */
export function framesNeeded(project: Project, comp: Comp, t: number, stack: string[] = []): FrameNeed[] {
  const out: FrameNeed[] = [];
  const solo = comp.layers.some((l) => l.solo && l.type !== 'audio');
  for (const l of comp.layers) {
    if (!l.visible || (solo && !l.solo) || !inRange(l, t)) continue;
    if (l.data.type === 'video') out.push({ assetId: l.data.assetId, srcTime: t - l.start });
    else if (l.data.type === 'precomp') {
      const sub = project.comps[l.data.compId];
      const subTime = t - l.start;
      if (sub && !stack.includes(sub.id) && sub.id !== comp.id && subTime >= 0 && subTime < sub.duration) out.push(...framesNeeded(project, sub, subTime, [...stack, comp.id]));
    }
  }
  return out;
}

/** Frames that are not ready yet (so a redraw now would show a stale picture). */
export function missingFrames(project: Project, comp: Comp, t: number): FrameNeed[] {
  return framesNeeded(project, comp, t).filter((n) => sources.has(n.assetId) && !haveVideoFrame(n.assetId, n.srcTime));
}

/** Make every video frame the composition shows at time t ready, so a synchronous render is exact. */
export async function prepareFrame(project: Project, comp: Comp, t: number): Promise<number> {
  const need = missingFrames(project, comp, t);
  if (!need.length) return 0;
  await Promise.all(need.map((n) => seekFrame(n.assetId, n.srcTime)));
  notify();
  return need.length;
}

/* ------------------------------------------------------------------ playing along */

/**
 * Keep the video elements of the layers on screen playing in step with the playhead (and pause the
 * rest). Cheap enough to call every frame. If one file is shown twice at different times, only the
 * first layer's moment plays live.
 */
export function syncVideoPlayback(project: Project, comp: Comp, t: number, restart = false): void {
  const want = new Map<string, number>();
  for (const n of framesNeeded(project, comp, t)) if (!want.has(n.assetId)) want.set(n.assetId, n.srcTime);
  for (const [id, s] of sources) {
    const at = want.get(id);
    if (at === undefined) {
      if (s.playing) {
        s.el.pause();
        s.playing = false;
      }
      continue;
    }
    const target = clamp(at, 0, Math.max(0, s.duration - 0.001));
    if (restart || !s.playing || Math.abs(s.el.currentTime - target) > 0.25) s.el.currentTime = target;
    if (!s.playing || s.el.paused) {
      s.playing = true;
      void s.el.play().catch(() => {
        s.playing = false;
      });
    }
  }
}

export function stopVideoPlayback(): void {
  let changed = false;
  for (const s of sources.values()) {
    if (s.playing) {
      s.el.pause();
      s.playing = false;
      changed = true;
    }
  }
  if (changed) notify();
}
