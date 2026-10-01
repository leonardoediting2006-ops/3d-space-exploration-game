/** Snap a time in seconds to the nearest frame. */
export function snapToFrame(t: number, fps: number): number {
  return Math.round(t * fps) / fps;
}

export function toFrame(t: number, fps: number): number {
  return Math.round(t * fps);
}

/** Frame-accurate timecode, e.g. 0:00:01:12 (h:mm:ss:ff). */
export function timecode(t: number, fps: number): string {
  const total = Math.max(0, Math.round(t * fps));
  const f = total % Math.round(fps);
  const secs = Math.floor(total / Math.round(fps));
  const s = secs % 60;
  const m = Math.floor(secs / 60) % 60;
  const h = Math.floor(secs / 3600);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${h}:${pad(m)}:${pad(s)}:${pad(f)}`;
}

/** Parse "12" (frames), "1:12" (s:f) or "0:00:01:12" into seconds. Returns null if invalid. */
export function parseTimecode(text: string, fps: number): number | null {
  const parts = text.trim().split(':').map((p) => Number(p));
  if (parts.length === 0 || parts.some((p) => !Number.isFinite(p))) return null;
  const r = Math.round(fps);
  let frames = 0;
  if (parts.length === 1) frames = parts[0];
  else if (parts.length === 2) frames = parts[0] * r + parts[1];
  else if (parts.length === 3) frames = parts[0] * 60 * r + parts[1] * r + parts[2];
  else frames = parts[0] * 3600 * r + parts[1] * 60 * r + parts[2] * r + parts[3];
  return frames / fps;
}
