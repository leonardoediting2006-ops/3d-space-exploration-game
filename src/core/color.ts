import type { Project, Prop, RGB } from './types';

/** Hue 0..360, saturation and value 0..1. */
export interface HSV {
  h: number;
  s: number;
  v: number;
}

export function rgbToHsv([r, g, b]: number[]): HSV {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToRgb({ h, s, v }: HSV): RGB {
  const c = v * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = v - c;
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
}

export const rgbToHex = (c: number[]): string =>
  '#' + [0, 1, 2].map((i) => Math.round(Math.min(255, Math.max(0, c[i] ?? 0))).toString(16).padStart(2, '0')).join('');

/** Parse #rgb, #rrggbb (the # is optional). Returns null for anything else. */
export function parseHex(text: string): RGB | null {
  const h = text.trim().replace(/^#/, '');
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h)) return null;
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The colours a project already uses, most used first — handy as a one-click palette. */
export function projectColors(project: Project, limit = 14): RGB[] {
  const counts = new Map<string, number>();
  const bump = (c: ArrayLike<number>) => {
    const hex = rgbToHex([c[0], c[1], c[2]]);
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  };
  const props = (rec: Record<string, Prop>) => {
    for (const p of Object.values(rec)) {
      if (p.kind === 'color') {
        bump(p.value as number[]);
        for (const k of p.keys) bump(k.v as number[]);
      } else if (p.kind === 'gradient') {
        const v = p.value as number[];
        for (let i = 0; i + 3 < v.length; i += 4) bump([v[i + 1], v[i + 2], v[i + 3]]);
      }
    }
  };
  for (const comp of Object.values(project.comps)) {
    bump(comp.bg);
    for (const l of comp.layers) {
      props(l.content);
      for (const fx of l.effects) props(fx.props);
      for (const a of l.animators) props(a.props);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([hex]) => parseHex(hex)!);
}
