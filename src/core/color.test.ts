import { describe, expect, it } from 'vitest';
import { createDemoProject } from './demo';
import { hsvToRgb, parseHex, projectColors, rgbToHex, rgbToHsv } from './color';

describe('colour conversion', () => {
  it('round-trips through HSV', () => {
    for (const c of [[0, 0, 0], [255, 255, 255], [255, 0, 0], [12, 200, 98], [250, 128, 7], [3, 4, 5], [90, 90, 91]] as const) {
      const back = hsvToRgb(rgbToHsv([...c]));
      c.forEach((v, i) => expect(Math.abs(back[i] - v)).toBeLessThanOrEqual(1));
    }
  });

  it('knows the primaries', () => {
    expect(rgbToHsv([255, 0, 0])).toEqual({ h: 0, s: 1, v: 1 });
    expect(rgbToHsv([0, 255, 0]).h).toBeCloseTo(120);
    expect(rgbToHsv([0, 0, 255]).h).toBeCloseTo(240);
    expect(hsvToRgb({ h: 360, s: 1, v: 1 })).toEqual([255, 0, 0]);
    expect(hsvToRgb({ h: 60, s: 1, v: 0.5 })).toEqual([128, 128, 0]);
  });

  it('formats and parses hex', () => {
    expect(rgbToHex([255, 128, 0])).toBe('#ff8000');
    expect(rgbToHex([300, -5, 12.4])).toBe('#ff000c');
    expect(parseHex('#ff8000')).toEqual([255, 128, 0]);
    expect(parseHex('F80')).toEqual([255, 136, 0]);
    expect(parseHex(' #0a0b0c ')).toEqual([10, 11, 12]);
    expect(parseHex('#12')).toBeNull();
    expect(parseHex('zzzzzz')).toBeNull();
    expect(parseHex('#ff80000')).toBeNull();
  });
});

describe('document colours', () => {
  it('lists the colours a project uses, without duplicates', () => {
    const colors = projectColors(createDemoProject(), 30);
    expect(colors.length).toBeGreaterThan(4);
    const hexes = colors.map(rgbToHex);
    expect(new Set(hexes).size).toBe(hexes.length);
    expect(projectColors(createDemoProject(), 3)).toHaveLength(3);
  });
});
