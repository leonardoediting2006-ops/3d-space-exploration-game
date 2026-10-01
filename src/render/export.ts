import { ArrayBufferTarget as Mp4Target, Muxer as Mp4Muxer } from 'mp4-muxer';
import { ArrayBufferTarget as WebmTarget, Muxer as WebmMuxer } from 'webm-muxer';
import type { Comp, Project } from '../core/types';
import { renderComp } from './renderer';
import { makeZip } from './zip';

export interface ExportRange {
  start: number;
  end: number;
}

export interface ExportOptions {
  scale: number;
  range: ExportRange;
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

  const webm = format === 'webm' ? new WebmMuxer({ target: new WebmTarget(), video: { codec: 'V_VP9', width: w, height: h, frameRate: comp.fps } }) : null;
  const mp4 = format === 'mp4' ? new Mp4Muxer({ target: new Mp4Target(), video: { codec: 'avc', width: w, height: h }, fastStart: 'in-memory' }) : null;

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

  const n = frameCount(o.range, comp.fps);
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
      while (encoder.encodeQueueSize > 8) await yieldToUI();
      o.onProgress?.((i + 1) / n);
      if (i % 2 === 0) await yieldToUI();
    }
    await encoder.flush();
    if (failure) throw failure;
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
  if (webm) {
    webm.finalize();
    return new Blob([webm.target.buffer], { type: 'video/webm' });
  }
  mp4!.finalize();
  return new Blob([mp4!.target.buffer], { type: 'video/mp4' });
}
