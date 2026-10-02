import { useEffect, useRef } from 'react';
import { getAssetPeaks, PEAKS_PER_SECOND } from '../render/assets';
import { useApp } from '../state/store';

/** The loudness of a stretch of a sound, drawn as a mirrored waveform. `from`/`to` are seconds into the sound. */
export function Waveform({ assetId, from, to, width, height, color = 'rgba(255,255,255,0.42)', className }: { assetId: string; from: number; to: number; width: number; height: number; color?: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const version = useApp((s) => s.assetVersion);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const peaks = getAssetPeaks(assetId);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.min(8192, Math.round(width * dpr)));
    const h = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    if (!peaks || to <= from) return;
    ctx.fillStyle = color;
    const mid = h / 2;
    for (let x = 0; x < w; x++) {
      const b0 = Math.max(0, Math.floor((from + ((to - from) * x) / w) * PEAKS_PER_SECOND));
      const b1 = Math.min(peaks.length, Math.max(b0 + 1, Math.ceil((from + ((to - from) * (x + 1)) / w) * PEAKS_PER_SECOND)));
      let m = 0;
      for (let b = b0; b < b1; b++) if (peaks[b] > m) m = peaks[b];
      const amp = Math.max(m > 0 ? 1 : 0.5, Math.sqrt(m) * mid * 0.95);
      ctx.fillRect(x, mid - amp, 1, amp * 2);
    }
  }, [assetId, from, to, width, height, color, version]);

  return <canvas ref={ref} className={`waveform ${className ?? ''}`} style={{ width, height }} data-testid="waveform" />;
}
