// Mixing a composition's sound down to two channels: audio layers, the sound of video layers, and
// the sound of nested compositions, each placed in time, trimmed to its in and out points, and
// scaled by its animated volume and pan. Pure (no Web Audio), so it is unit-tested and is what
// the exporter encodes; live playback schedules the same layers through Web Audio instead.
import { evalNum } from './interp';
import { clamp } from './math';
import type { Comp, Layer, Project } from './types';

/** Decoded PCM: one array per channel. */
export interface AudioClip {
  sampleRate: number;
  channels: Float32Array[];
}

export interface MixOptions {
  /** Composition time of the first output sample, and where the mix stops. */
  start: number;
  end: number;
  sampleRate: number;
  clip: (assetId: string) => AudioClip | undefined;
}

const BLOCK = 128;
const MAX_DEPTH = 6;
const MAX_GAIN = 4;

/** The footage a layer plays sound from, if it has any and is not muted. */
export function soundSource(project: Project, l: Layer): { assetId: string } | null {
  if (l.muted) return null;
  if (l.data.type === 'audio') return { assetId: l.data.assetId };
  if (l.data.type === 'video' && project.assets[l.data.assetId]?.hasAudio) return { assetId: l.data.assetId };
  return null;
}

const makesSound = (l: Layer): boolean => l.data.type === 'audio' || l.data.type === 'video' || l.data.type === 'precomp';

/** Does this animated property need evaluating over time, or is it a constant? */
const isMoving = (p: { keys: unknown[]; wiggle?: unknown } | undefined): boolean => !!p && (p.keys.length > 0 || !!p.wiggle);

/** Volume as a linear gain at comp time t (100 % = 1). */
export function volumeAt(l: Layer, t: number): number {
  const p = l.content.volume;
  return p ? clamp(evalNum(p, t) / 100, 0, MAX_GAIN) : 1;
}

/** Pan at comp time t, from -1 (left) to 1 (right). */
export function panAt(l: Layer, t: number): number {
  const p = l.content.pan;
  return p ? clamp(evalNum(p, t) / 100, -1, 1) : 0;
}

/** Does anything in this composition (or the comps nested in it) make sound? */
export function compHasSound(project: Project, comp: Comp, depth = 0): boolean {
  if (depth > MAX_DEPTH) return false;
  return comp.layers.some((l) => {
    if (soundSource(project, l)) return true;
    if (l.data.type === 'precomp' && !l.muted) {
      const sub = project.comps[l.data.compId];
      return !!sub && sub !== comp && compHasSound(project, sub, depth + 1);
    }
    return false;
  });
}

/** Render the sound of `comp` between o.start and o.end as [left, right] at o.sampleRate. */
export function mixComp(project: Project, comp: Comp, o: MixOptions): [Float32Array, Float32Array] {
  const n = Math.max(0, Math.round((o.end - o.start) * o.sampleRate));
  const out: [Float32Array, Float32Array] = [new Float32Array(n), new Float32Array(n)];
  mixInto(out, project, comp, 0, -Infinity, Infinity, o, 0);
  return out;
}

/**
 * `shift` turns output time into this composition's own time (own = out + shift); `lo`/`hi` are the
 * output-time limits set by the precomp layers above, so a nested clip stops when its precomp does.
 */
function mixInto(out: [Float32Array, Float32Array], project: Project, comp: Comp, shift: number, lo: number, hi: number, o: MixOptions, depth: number): void {
  if (depth > MAX_DEPTH) return;
  const solo = comp.layers.some((l) => l.solo && makesSound(l));
  for (const l of comp.layers) {
    if (l.muted || (solo && !l.solo)) continue;
    const from = Math.max(lo, l.inPoint - shift);
    const to = Math.min(hi, l.outPoint - shift);
    if (to <= from) continue;
    if (l.data.type === 'precomp') {
      const sub = project.comps[l.data.compId];
      if (!sub || sub === comp) continue;
      const nested = shift - l.start;
      mixInto(out, project, sub, nested, Math.max(from, -nested), Math.min(to, sub.duration - nested), o, depth + 1);
      continue;
    }
    const src = soundSource(project, l);
    const clip = src && o.clip(src.assetId);
    if (!clip || !clip.channels.length) continue;
    mixLayer(out, l, clip, shift, from, to, o);
  }
}

function mixLayer(out: [Float32Array, Float32Array], l: Layer, clip: AudioClip, shift: number, from: number, to: number, o: MixOptions): void {
  const sr = o.sampleRate;
  const clipLen = clip.channels[0].length;
  const clipDur = clipLen / clip.sampleRate;
  // the clip only exists from its start for its own length
  const a = Math.max(from, l.start - shift, o.start);
  const b = Math.min(to, l.start - shift + clipDur, o.end);
  const i0 = Math.max(0, Math.ceil((a - o.start) * sr - 1e-9));
  const i1 = Math.min(out[0].length, Math.floor((b - o.start) * sr + 1e-9));
  if (i1 <= i0) return;

  const left = clip.channels[0];
  const right = clip.channels[1] ?? null;
  const mono = !right;
  const ratio = clip.sampleRate;
  const moving = isMoving(l.content.volume) || isMoving(l.content.pan);
  const read = (ch: Float32Array, pos: number): number => {
    const i = Math.floor(pos);
    if (i < 0 || i >= ch.length) return 0;
    const f = pos - i;
    const x = ch[i];
    return f > 0 && i + 1 < ch.length ? x + (ch[i + 1] - x) * f : x;
  };
  const at = (j: number) => o.start + j / sr + shift; // this layer's comp time at output sample j
  const gainPan = (t: number): [number, number] => (moving ? [volumeAt(l, t), panAt(l, t)] : [volumeAt(l, 0), panAt(l, 0)]);

  let [g0, p0] = gainPan(at(i0));
  for (let j = i0; j < i1; j += BLOCK) {
    const jEnd = Math.min(i1, j + BLOCK);
    const [g1, p1] = moving ? gainPan(at(jEnd)) : [g0, p0];
    const span = jEnd - j;
    for (let k = j; k < jEnd; k++) {
      const u = (k - j) / span;
      const g = g0 + (g1 - g0) * u;
      const p = p0 + (p1 - p0) * u;
      const pos = (at(k) - l.start) * ratio;
      const x = read(left, pos);
      if (mono) {
        // equal power: centre is unity, hard left/right gain 1.41
        const theta = ((p + 1) * Math.PI) / 4;
        out[0][k] += x * g * Math.cos(theta) * Math.SQRT2;
        out[1][k] += x * g * Math.sin(theta) * Math.SQRT2;
      } else {
        const y = read(right, pos);
        out[0][k] += x * g * (p > 0 ? 1 - p : 1);
        out[1][k] += y * g * (p < 0 ? 1 + p : 1);
      }
    }
    g0 = g1;
    p0 = p1;
  }
}

/** The loudest sample, for deciding whether a mix is silent. */
export function peakOf(mix: Float32Array[]): number {
  let peak = 0;
  for (const ch of mix) for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
  return peak;
}

/** Hard-limit a mix to ±1 in place so a loud sum never wraps or distorts harshly in the encoder. */
export function limit(mix: Float32Array[]): void {
  for (const ch of mix) for (let i = 0; i < ch.length; i++) ch[i] = clamp(ch[i], -1, 1);
}

/** Loudness envelope for drawing a waveform: the peak of each `bucket` samples, across channels. */
export function peaksOf(clip: AudioClip, perSecond = 200): Float32Array {
  const len = clip.channels[0]?.length ?? 0;
  const per = Math.max(1, Math.round(clip.sampleRate / perSecond));
  const n = Math.ceil(len / per);
  const out = new Float32Array(n);
  for (const ch of clip.channels) {
    for (let b = 0; b < n; b++) {
      let m = out[b];
      const end = Math.min(len, (b + 1) * per);
      for (let i = b * per; i < end; i++) {
        const v = Math.abs(ch[i]);
        if (v > m) m = v;
      }
      out[b] = m;
    }
  }
  return out;
}
