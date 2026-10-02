import { describe, expect, it } from 'vitest';
import { createAudioLayer, createComp, createPrecompLayer, createProject, createVideoLayer } from './factory';
import { compHasSound, limit, mixComp, panAt, peakOf, peaksOf, soundSource, volumeAt, type AudioClip } from './mix';
import type { Comp, Layer, Project } from './types';

const SR = 1000; // a tiny sample rate keeps the arrays small and the arithmetic exact

const constant = (value: number, seconds: number, channels = 1, rate = SR): AudioClip => ({
  sampleRate: rate,
  channels: Array.from({ length: channels }, () => new Float32Array(Math.round(seconds * rate)).fill(value)),
});
const ramp = (seconds: number): AudioClip => ({ sampleRate: SR, channels: [Float32Array.from({ length: seconds * SR }, (_, i) => i / SR)] });

function setup(clips: Record<string, AudioClip>) {
  const project = createProject();
  const comp = createComp({ name: 'T', width: 100, height: 100, fps: 25, duration: 10 });
  project.comps = { [comp.id]: comp };
  project.compOrder = [comp.id];
  for (const [id, c] of Object.entries(clips)) project.assets[id] = { id, name: id, kind: 'audio', width: 0, height: 0, duration: c.channels[0].length / c.sampleRate };
  const add = (assetId: string, time: number, seconds = clips[assetId].channels[0].length / clips[assetId].sampleRate) => {
    const l = createAudioLayer({ name: assetId, comp, time, assetId, duration: seconds });
    comp.layers.unshift(l);
    return l;
  };
  const mix = (start = 0, end = 4, c: Comp = comp, p: Project = project) => mixComp(p, c, { start, end, sampleRate: SR, clip: (id) => clips[id] });
  return { project, comp, add, mix, clips };
}

const slice = (a: Float32Array, from: number, to: number) => Array.from(a.slice(from, to));
const close = (a: number, b: number, tol = 1e-5) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe('mixing', () => {
  it('places a clip where its layer starts and for as long as it is', () => {
    const { add, mix } = setup({ a: constant(0.5, 1) });
    add('a', 1);
    const [l, r] = mix();
    expect(l).toHaveLength(4000);
    expect(slice(l, 990, 1000).every((v) => v === 0)).toBe(true);
    close(l[1000], 0.5);
    close(l[1999], 0.5);
    expect(l[2001]).toBe(0);
    // mono: centred, same on both sides
    expect(Array.from(l)).toEqual(Array.from(r));
  });

  it('a mono clip is centred at unity gain', () => {
    const { add, mix } = setup({ a: constant(0.25, 1) });
    add('a', 0);
    const [l, r] = mix();
    close(l[10], 0.25);
    close(r[10], 0.25);
  });

  it('keeps stereo channels apart', () => {
    const stereo: AudioClip = { sampleRate: SR, channels: [new Float32Array(1000).fill(0.2), new Float32Array(1000).fill(-0.4)] };
    const { add, mix } = setup({ s: stereo });
    add('s', 0);
    const [l, r] = mix();
    close(l[5], 0.2);
    close(r[5], -0.4);
  });

  it('trims to the layer\'s in and out points without moving the sound', () => {
    const { add, mix } = setup({ a: ramp(4) });
    const l = add('a', 0);
    l.inPoint = 1;
    l.outPoint = 3;
    const [left] = mix();
    expect(left[999]).toBe(0);
    close(left[1000], 1); // the ramp is value = seconds, so sample 1000 reads source time 1.0
    close(left[2500], 2.5);
    expect(left[3000]).toBe(0);
  });

  it('a layer moved in time moves its sound with it', () => {
    const { add, mix } = setup({ a: ramp(2) });
    const l = add('a', 0);
    l.start = 1.5;
    l.inPoint = 1.5;
    l.outPoint = 3.5;
    const [left] = mix();
    close(left[1500], 0);
    close(left[2000], 0.5);
  });

  it('sums overlapping layers', () => {
    const { add, mix } = setup({ a: constant(0.3, 2), b: constant(0.2, 2) });
    add('a', 0);
    add('b', 1);
    const [l] = mix();
    close(l[500], 0.3);
    close(l[1500], 0.5);
    close(l[2500], 0.2); // a has ended, b plays until 3 s
    close(l[3500], 0);
  });

  it('only mixes the requested window and lines it up', () => {
    const { add, mix } = setup({ a: ramp(4) });
    add('a', 0);
    const [l] = mix(1, 2);
    expect(l).toHaveLength(1000);
    close(l[0], 1);
    close(l[500], 1.5);
  });

  it('applies volume, including keyframed fades', () => {
    const { add, mix } = setup({ a: constant(1, 4) });
    const layer = add('a', 0);
    layer.content.volume.value = 50;
    close(mix()[0][100], 0.5);
    layer.content.volume.keys = [
      { id: 'k1', t: 1, v: 100, ease: 'linear' },
      { id: 'k2', t: 3, v: 0, ease: 'linear' },
    ];
    const [l] = mix();
    close(l[500], 1);
    close(l[2000], 0.5, 0.01);
    close(l[3500], 0);
    expect(volumeAt(layer, 2)).toBeCloseTo(0.5);
  });

  it('pans a mono clip with equal power, and a stereo clip as a balance', () => {
    const { add, mix, clips } = setup({ m: constant(1, 1) });
    const m = add('m', 0);
    m.content.pan.value = 100;
    let [l, r] = mix();
    close(l[10], 0);
    close(r[10], Math.SQRT2);
    m.content.pan.value = -100;
    [l, r] = mix();
    close(l[10], Math.SQRT2);
    close(r[10], 0, 1e-6);
    expect(panAt(m, 0)).toBe(-1);

    clips.s = { sampleRate: SR, channels: [new Float32Array(1000).fill(1), new Float32Array(1000).fill(1)] };
    const { add: add2, mix: mix2 } = setup({ s: clips.s });
    const s = add2('s', 0);
    s.content.pan.value = 50;
    [l, r] = mix2();
    close(l[10], 0.5);
    close(r[10], 1);
  });

  it('mutes and solos', () => {
    const { add, mix } = setup({ a: constant(0.1, 2), b: constant(0.2, 2) });
    const a = add('a', 0);
    const b = add('b', 0);
    close(mix()[0][10], 0.3);
    a.muted = true;
    close(mix()[0][10], 0.2);
    a.muted = false;
    b.solo = true;
    close(mix()[0][10], 0.2);
    expect(soundSource({ assets: {} } as unknown as Project, a)).toEqual({ assetId: 'a' });
    a.muted = true;
    expect(soundSource({ assets: {} } as unknown as Project, a)).toBeNull();
  });

  it('resamples a clip recorded at another rate', () => {
    const { add, mix } = setup({ a: constant(0.5, 1, 1, 500) });
    add('a', 0);
    const [l] = mix();
    close(l[10], 0.5);
    close(l[990], 0.5, 0.01);
    expect(l[1100]).toBe(0);
  });

  it('plays a video layer\'s sound only when the file has some', () => {
    const { project, comp, mix } = setup({ v: constant(0.4, 2) });
    project.assets.v = { id: 'v', name: 'v', kind: 'video', width: 10, height: 10, duration: 2, hasAudio: true };
    const layer = createVideoLayer({ name: 'vid', comp, time: 0, assetId: 'v', width: 10, height: 10, duration: 2, hasAudio: true });
    comp.layers.unshift(layer);
    close(mix()[0][10], 0.4);
    expect(layer.content.volume).toBeDefined();
    project.assets.v.hasAudio = false;
    expect(mix()[0][10]).toBe(0);
    const silent = createVideoLayer({ name: 'x', comp, time: 0, assetId: 'v', width: 10, height: 10, duration: 2, hasAudio: false });
    expect(silent.content.volume).toBeUndefined();
  });

  it('mixes the sound of nested compositions, in the precomp\'s own time', () => {
    const project = createProject();
    const inner = createComp({ name: 'In', width: 100, height: 100, fps: 25, duration: 3 });
    const outer = createComp({ name: 'Out', width: 100, height: 100, fps: 25, duration: 10 });
    project.comps = { [inner.id]: inner, [outer.id]: outer };
    project.compOrder = [outer.id, inner.id];
    const clip = constant(0.6, 1);
    project.assets.a = { id: 'a', name: 'a', kind: 'audio', width: 0, height: 0, duration: 1 };
    inner.layers.push(createAudioLayer({ name: 'a', comp: inner, time: 1, assetId: 'a', duration: 1 })); // sounds 1–2 s inside
    const pre = createPrecompLayer({ name: 'P', comp: outer, time: 0, compId: inner.id, sub: inner });
    pre.start = 4; // the inner comp's time 0 sits at 4 s in the outer comp
    pre.inPoint = 4;
    pre.outPoint = 6.5;
    outer.layers.push(pre);
    const [l] = mixComp(project, outer, { start: 0, end: 8, sampleRate: SR, clip: () => clip });
    expect(l[4999]).toBe(0);
    close(l[5000], 0.6);
    close(l[5999], 0.6);
    expect(l[6001]).toBe(0);
    expect(compHasSound(project, outer)).toBe(true);
    pre.muted = true;
    expect(compHasSound(project, outer)).toBe(false);
  });

  it('survives a composition that contains itself', () => {
    const project = createProject();
    const c = createComp({ name: 'C', width: 10, height: 10, fps: 25, duration: 5 });
    project.comps = { [c.id]: c };
    project.compOrder = [c.id];
    const pre = createPrecompLayer({ name: 'self', comp: c, time: 0, compId: c.id, sub: c });
    c.layers.push(pre);
    expect(mixComp(project, c, { start: 0, end: 1, sampleRate: SR, clip: () => undefined })[0]).toHaveLength(1000);
    expect(compHasSound(project, c)).toBe(false);
  });

  it('limits and measures', () => {
    const mix = [Float32Array.from([2, -3, 0.5]), Float32Array.from([0, 0, -0.25])];
    expect(peakOf(mix)).toBe(3);
    limit(mix);
    expect(Array.from(mix[0])).toEqual([1, -1, 0.5]);
    expect(peakOf([new Float32Array(10)])).toBe(0);
  });

  it('summarises a clip for drawing a waveform', () => {
    const clip: AudioClip = { sampleRate: 1000, channels: [Float32Array.from({ length: 1000 }, (_, i) => (i === 123 ? -0.9 : 0.1)), Float32Array.from({ length: 1000 }, (_, i) => (i === 700 ? 0.8 : 0))] };
    const peaks = peaksOf(clip, 100); // 10 samples per bucket
    expect(peaks).toHaveLength(100);
    expect(peaks[12]).toBeCloseTo(0.9);
    expect(peaks[70]).toBeCloseTo(0.8);
    expect(peaks[0]).toBeCloseTo(0.1);
  });
});

describe('layer helpers', () => {
  it('audio layers get volume and pan, an in/out of the clip length, and no visual bounds', () => {
    const comp = createComp({ name: 'T', width: 100, height: 100, fps: 25, duration: 10 });
    const l: Layer = createAudioLayer({ name: 'A', comp, time: 2, assetId: 'x', duration: 3 });
    expect(Object.keys(l.content)).toEqual(['volume', 'pan']);
    expect([l.start, l.inPoint, l.outPoint]).toEqual([2, 2, 5]);
    const long = createAudioLayer({ name: 'A', comp, time: 8, assetId: 'x', duration: 30 });
    expect(long.outPoint).toBe(10);
  });
});
