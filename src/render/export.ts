import { ArrayBufferTarget as Mp4Target, Muxer as Mp4Muxer } from 'mp4-muxer';
import { ArrayBufferTarget as WebmTarget, Muxer as WebmMuxer } from 'webm-muxer';
import { compHasSound, limit, mixComp, peakOf } from '../core/mix';
import type { Comp, Project } from '../core/types';
import { getAssetClip, MIX_RATE } from './assets';
import { renderComp } from './renderer';
import { makeZip } from './zip';

export interface ExportRange {
  start: number;
  end: number;
}

export interface ExportOptions {
  scale: number;
  range: ExportRange;
  /** Mix the composition's sound into video files (default on, when there is any). */
  audio?: boolean;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** Motion-blur sub-samples used for final output (preview uses far fewer). */
const EXPORT_MB_SAMPLES = 16;

const frameCount = (r: ExportRange, fps: number) => Math.max(1, Math.round((r.end - r.start) * fps));
const yieldToUI = () => new Promise<void>((res) => setTimeout(res, 0));

function canvasToBlob(c: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), type));
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function exportPng(project: Project, comp: Comp, time: number, scale = 1, transparent = false): Promise<Blob> {
  const c = document.createElement('canvas');
  renderComp(c, project, comp, time, { scale, transparent, mbSamples: EXPORT_MB_SAMPLES });
  return canvasToBlob(c);
}

export async function exportPngSequence(project: Project, comp: Comp, o: ExportOptions): Promise<Blob> {
  const n = frameCount(o.range, comp.fps);
  const c = document.createElement('canvas');
  const entries = [];
  const digits = Math.max(4, String(n).length);
  for (let i = 0; i < n; i++) {
    if (o.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
    renderComp(c, project, comp, o.range.start + i / comp.fps, { scale: o.scale, mbSamples: EXPORT_MB_SAMPLES });
    const blob = await canvasToBlob(c);
    entries.push({ name: `${comp.name}_${String(i).padStart(digits, '0')}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
    o.onProgress?.((i + 1) / n);
    await yieldToUI();
  }
  return makeZip(entries);
}

export type VideoFormat = 'webm' | 'mp4';

function codecFor(format: VideoFormat, w: number, h: number): string {
  if (format === 'webm') return 'vp09.00.51.08';
  return w * h > 1920 * 1088 ? 'avc1.640033' : w * h > 1280 * 720 ? 'avc1.640028' : 'avc1.64001f';
}

export async function videoSupport(comp: Comp, scale = 1): Promise<Record<VideoFormat, boolean>> {
  const out: Record<VideoFormat, boolean> = { webm: false, mp4: false };
  if (typeof VideoEncoder === 'undefined') return out;
  const w = Math.floor((comp.width * scale) / 2) * 2;
  const h = Math.floor((comp.height * scale) / 2) * 2;
  for (const f of ['webm', 'mp4'] as VideoFormat[]) {
    try {
      const r = await VideoEncoder.isConfigSupported({ codec: codecFor(f, w, h), width: w, height: h, bitrate: 5_000_000, framerate: comp.fps });
      out[f] = !!r.supported;
    } catch {
      out[f] = false;
    }
  }
  return out;
}

const AUDIO_BITRATE = 160_000;
const AUDIO_CHUNK = 4800; // 100 ms at 48 kHz

/** The audio codec this browser can encode for the container: AAC for MP4 where it can, Opus otherwise. */
async function pickAudioCodec(format: VideoFormat): Promise<{ codec: string; mux: 'opus' | 'aac' } | null> {
  if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') return null;
  const tries: { codec: string; mux: 'opus' | 'aac' }[] = format === 'mp4' ? [{ codec: 'mp4a.40.2', mux: 'aac' }, { codec: 'opus', mux: 'opus' }] : [{ codec: 'opus', mux: 'opus' }];
  for (const t of tries) {
    try {
      const r = await AudioEncoder.isConfigSupported({ codec: t.codec, sampleRate: MIX_RATE, numberOfChannels: 2, bitrate: AUDIO_BITRATE });
      if (r.supported) return t;
    } catch {
      /* try the next one */
    }
  }
  return null;
}

/** Can sound be encoded into this kind of file here? (The export dialog warns when it cannot.) */
export async function audioSupport(format: VideoFormat): Promise<boolean> {
  return (await pickAudioCodec(format)) !== null;
}

/** Frame-accurate offline render → WebCodecs → muxed file. Never drops or duplicates frames. */
export async function exportVideo(
  project: Project,
  comp: Comp,
  format: VideoFormat,
  bitrate: number,
  o: ExportOptions,
): Promise<Blob> {
  if (typeof VideoEncoder === 'undefined') throw new Error('This browser has no WebCodecs support. Export a PNG sequence instead.');
  const w = Math.max(2, Math.floor((comp.width * o.scale) / 2) * 2);
  const h = Math.max(2, Math.floor((comp.height * o.scale) / 2) * 2);
  const codec = codecFor(format, w, h);
  const cfg = { codec, width: w, height: h, bitrate, framerate: comp.fps };
  const support = await VideoEncoder.isConfigSupported(cfg);
  if (!support.supported) throw new Error(`This browser cannot encode ${format.toUpperCase()} at ${w}×${h}.`);

  const n = frameCount(o.range, comp.fps);

  // sound: mix the whole range up front, then feed it to the encoder alongside the frames
  let mix: [Float32Array, Float32Array] | null = null;
  let audioCodec: Awaited<ReturnType<typeof pickAudioCodec>> = null;
  if ((o.audio ?? true) && compHasSound(project, comp)) {
    audioCodec = await pickAudioCodec(format);
    if (audioCodec) {
      mix = mixComp(project, comp, { start: o.range.start, end: o.range.start + n / comp.fps, sampleRate: MIX_RATE, clip: getAssetClip });
      limit(mix);
      if (peakOf(mix) < 1e-6) mix = null;
    }
  }

  const webm =
    format === 'webm'
      ? new WebmMuxer({ target: new WebmTarget(), video: { codec: 'V_VP9', width: w, height: h, frameRate: comp.fps }, ...(mix ? { audio: { codec: 'A_OPUS', numberOfChannels: 2, sampleRate: MIX_RATE } } : {}) })
      : null;
  const mp4 =
    format === 'mp4'
      ? new Mp4Muxer({ target: new Mp4Target(), video: { codec: 'avc', width: w, height: h }, ...(mix && audioCodec ? { audio: { codec: audioCodec.mux, numberOfChannels: 2, sampleRate: MIX_RATE } } : {}), fastStart: 'in-memory' })
      : null;

  let failure: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      if (webm) webm.addVideoChunk(chunk, meta);
      else mp4!.addVideoChunk(chunk, meta);
    },
    error: (e) => {
      failure = e;
    },
  });
  encoder.configure(cfg);

  let audioEncoder: AudioEncoder | null = null;
  if (mix && audioCodec) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        if (webm) webm.addAudioChunk(chunk, meta);
        else mp4!.addAudioChunk(chunk, meta);
      },
      error: (e) => {
        failure = e;
      },
    });
    audioEncoder.configure({ codec: audioCodec.codec, sampleRate: MIX_RATE, numberOfChannels: 2, bitrate: AUDIO_BITRATE });
  }
  let audioFed = 0;
  /** Hand the encoder sound up to `seconds` into the file. */
  const feedAudio = (seconds: number) => {
    if (!mix || !audioEncoder) return;
    const total = mix[0].length;
    const upto = Math.min(total, Math.round(seconds * MIX_RATE));
    while (audioFed < upto) {
      const len = Math.min(AUDIO_CHUNK, total - audioFed);
      const data = new Float32Array(len * 2);
      data.set(mix[0].subarray(audioFed, audioFed + len), 0);
      data.set(mix[1].subarray(audioFed, audioFed + len), len);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: MIX_RATE, numberOfFrames: len, numberOfChannels: 2, timestamp: Math.round((audioFed / MIX_RATE) * 1_000_000), data });
      audioEncoder.encode(ad);
      ad.close();
      audioFed += len;
    }
  };

  const canvas = document.createElement('canvas');
  const fit = document.createElement('canvas');
  fit.width = w;
  fit.height = h;
  const us = 1_000_000 / comp.fps;
  try {
    for (let i = 0; i < n; i++) {
      if (o.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
      if (failure) throw failure;
      renderComp(canvas, project, comp, o.range.start + i / comp.fps, { scale: o.scale, mbSamples: EXPORT_MB_SAMPLES });
      let source: HTMLCanvasElement = canvas;
      if (canvas.width !== w || canvas.height !== h) {
        fit.getContext('2d')!.drawImage(canvas, 0, 0, w, h);
        source = fit;
      }
      const frame = new VideoFrame(source, { timestamp: Math.round(i * us), duration: Math.round(us) });
      encoder.encode(frame, { keyFrame: i % 60 === 0 });
      frame.close();
      feedAudio((i + 1) / comp.fps + 0.5);
      while (encoder.encodeQueueSize > 8) await yieldToUI();
      o.onProgress?.((i + 1) / n);
      if (i % 2 === 0) await yieldToUI();
    }
    feedAudio(Infinity);
    await encoder.flush();
    if (audioEncoder) await audioEncoder.flush();
    if (failure) throw failure;
  } finally {
    if (encoder.state !== 'closed') encoder.close();
    if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close();
  }
  if (webm) {
    webm.finalize();
    return new Blob([webm.target.buffer], { type: 'video/webm' });
  }
  mp4!.finalize();
  return new Blob([mp4!.target.buffer], { type: 'video/mp4' });
}
