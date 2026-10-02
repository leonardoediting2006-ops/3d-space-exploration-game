// Footage bytes live outside the (undoable, cloned) project document: they are large,
// immutable, and only referenced by id. This module owns them and decodes them to images.

import { peaksOf, type AudioClip } from '../core/mix';

const dataUrls = new Map<string, string>();
const images = new Map<string, HTMLImageElement>();
const audios = new Map<string, AudioBuffer>();
const peaks = new Map<string, Float32Array>();
const listeners = new Set<() => void>();

/** The sample rate every sound is decoded to, so mixing and playback never have to resample twice. */
export const MIX_RATE = 48000;

/** Decode an audio (or video-with-sound) file to PCM at MIX_RATE. Throws if the browser cannot read it. */
export async function decodeAudio(bytes: ArrayBuffer): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, 1, MIX_RATE);
  return ctx.decodeAudioData(bytes.slice(0));
}

/** Keep a decoded sound for an asset, together with its data URL (what gets saved in project files). */
export function setAudioAsset(id: string, dataUrl: string, buffer: AudioBuffer): void {
  dataUrls.set(id, dataUrl);
  audios.set(id, buffer);
  peaks.delete(id);
  listeners.forEach((fn) => fn());
}

/** Bytes of a data URL (fetch handles the base64 for us). */
export async function bytesOfDataUrl(url: string): Promise<ArrayBuffer> {
  return (await fetch(url)).arrayBuffer();
}

export function setAssetData(id: string, dataUrl: string): Promise<void> {
  dataUrls.set(id, dataUrl);
  const mime = /^data:([^;,]+)/i.exec(dataUrl)?.[1]?.toLowerCase() ?? '';
  if (mime.startsWith('audio/')) {
    return bytesOfDataUrl(dataUrl)
      .then(decodeAudio)
      .then((buf) => setAudioAsset(id, dataUrl, buf))
      .catch(() => undefined);
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      images.set(id, img);
      listeners.forEach((fn) => fn());
      resolve();
    };
    img.onerror = () => resolve();
    img.src = dataUrl;
  });
}

export const getAssetImage = (id: string): HTMLImageElement | undefined => images.get(id);
export const getAssetAudio = (id: string): AudioBuffer | undefined => audios.get(id);
export const getAssetData = (id: string): string | undefined => dataUrls.get(id);
export const allAssetData = (): Record<string, string> => Object.fromEntries(dataUrls);

/** A decoded sound as plain arrays (views, not copies) for the mixer. */
export function getAssetClip(id: string): AudioClip | undefined {
  const b = audios.get(id);
  if (!b) return undefined;
  return { sampleRate: b.sampleRate, channels: Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i)) };
}

/** Loudness envelope (200 values a second) for drawing waveforms. Computed once per sound. */
export function getAssetPeaks(id: string): Float32Array | undefined {
  const hit = peaks.get(id);
  if (hit) return hit;
  const clip = getAssetClip(id);
  if (!clip) return undefined;
  const p = peaksOf(clip, PEAKS_PER_SECOND);
  peaks.set(id, p);
  return p;
}
export const PEAKS_PER_SECOND = 200;

export function clearAssets(): void {
  dataUrls.clear();
  images.clear();
  audios.clear();
  peaks.clear();
}

/** Subscribe to "an image finished decoding" so the viewer can redraw. */
export function onAssetsChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function imageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Could not decode image'));
    img.src = dataUrl;
  });
}
