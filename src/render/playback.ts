// Live sound for the preview: schedules every audible layer through Web Audio, starting at the
// playhead. (Exporting mixes the same layers offline with core/mix.ts.)
import { panAt, soundSource, volumeAt } from '../core/mix';
import type { Comp, Layer, Project } from '../core/types';
import { getAssetAudio } from './assets';

let ctx: AudioContext | null = null;
let live: { source: AudioBufferSourceNode; nodes: AudioNode[] }[] = [];
let startedAt = 0;

/** Seconds between asking for sound and hearing it: the playhead waits this long so picture and sound stay together. */
export const AUDIO_LEAD = 0.06;
const MAX_DEPTH = 6;
const CURVE_RATE = 60;

function context(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!ctx || ctx.state === 'closed') ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

const isMoving = (p: { keys: unknown[]; wiggle?: unknown } | undefined) => !!p && (p.keys.length > 0 || !!p.wiggle);

function connect(c: AudioContext, l: Layer, buffer: AudioBuffer, when: number, offset: number, dur: number, shift: number, a: number, b: number): void {
  const source = c.createBufferSource();
  source.buffer = buffer;
  const gain = c.createGain();
  const pan = c.createStereoPanner();
  source.connect(gain).connect(pan).connect(c.destination);
  const curve = (get: (t: number) => number): Float32Array => {
    const n = Math.max(2, Math.ceil((b - a) * CURVE_RATE) + 1);
    return Float32Array.from({ length: n }, (_, i) => get(a + shift + ((b - a) * i) / (n - 1)));
  };
  if (isMoving(l.content.volume) && b > a) gain.gain.setValueCurveAtTime(curve((t) => volumeAt(l, t)), when, Math.max(dur, 0.001));
  else gain.gain.value = volumeAt(l, a + shift);
  if (isMoving(l.content.pan) && b > a) pan.pan.setValueCurveAtTime(curve((t) => panAt(l, t)), when, Math.max(dur, 0.001));
  else pan.pan.value = panAt(l, a + shift);
  source.start(when, offset, dur);
  live.push({ source, nodes: [gain, pan] });
}

function schedule(c: AudioContext, project: Project, comp: Comp, shift: number, lo: number, hi: number, from: number, until: number, t0: number, depth: number): void {
  if (depth > MAX_DEPTH) return;
  const solo = comp.layers.some((l) => l.solo && (l.data.type === 'audio' || l.data.type === 'video' || l.data.type === 'precomp'));
  for (const l of comp.layers) {
    if (l.muted || (solo && !l.solo)) continue;
    const winFrom = Math.max(lo, l.inPoint - shift);
    const winTo = Math.min(hi, l.outPoint - shift);
    if (winTo <= winFrom) continue;
    if (l.data.type === 'precomp') {
      const sub = project.comps[l.data.compId];
      if (!sub || sub === comp) continue;
      const nested = shift - l.start;
      schedule(c, project, sub, nested, Math.max(winFrom, -nested), Math.min(winTo, sub.duration - nested), from, until, t0, depth + 1);
      continue;
    }
    const src = soundSource(project, l);
    const buffer = src && getAssetAudio(src.assetId);
    if (!buffer) continue;
    const a = Math.max(winFrom, l.start - shift, from);
    const b = Math.min(winTo, l.start - shift + buffer.duration, until);
    if (b - a < 1e-3) continue;
    connect(c, l, buffer, t0 + (a - from), a + shift - l.start, b - a, shift, a, b);
  }
}

/**
 * Start playing the composition's sound from comp time `from` up to `until`. Returns how long
 * until it is heard (the caller delays its playhead by this much), or 0 if there is nothing to hear.
 */
export function startAudio(project: Project, comp: Comp, from: number, until: number): number {
  stopAudio();
  const c = context();
  if (!c) return 0;
  const t0 = c.currentTime + AUDIO_LEAD;
  startedAt = t0;
  try {
    schedule(c, project, comp, 0, -Infinity, Infinity, from, until, t0, 0);
  } catch {
    stopAudio();
    return 0;
  }
  return live.length ? AUDIO_LEAD : 0;
}

export function stopAudio(): void {
  for (const { source, nodes } of live) {
    try {
      source.stop();
    } catch {
      /* already stopped */
    }
    source.disconnect();
    nodes.forEach((n) => n.disconnect());
  }
  live = [];
}

/** What is scheduled right now — for tests and diagnostics. */
export function audioStatus(): { state: string; sources: number; startedAt: number; now: number } {
  return { state: ctx?.state ?? 'none', sources: live.length, startedAt, now: ctx?.currentTime ?? 0 };
}
