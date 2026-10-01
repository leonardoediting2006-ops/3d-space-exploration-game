import { describe, expect, it } from 'vitest';
import { fromStops, gradientCss, makeGradient, sampleGradient, stopCount, toStops, wrapT } from './gradient';

describe('gradients', () => {
  const g = makeGradient(['#000000', '#ff0000', '#ffffff']);

  it('builds evenly spaced stops and round-trips', () => {
    expect(stopCount(g)).toBe(3);
    expect(toStops(g).map((s) => s.pos)).toEqual([0, 0.5, 1]);
    expect(fromStops(toStops(g))).toEqual(g);
  });

  it('samples with linear blending and clamps at the ends', () => {
    expect(sampleGradient(g, 0)).toEqual([0, 0, 0]);
    expect(sampleGradient(g, 0.25)).toEqual([127.5, 0, 0]);
    expect(sampleGradient(g, 0.5)).toEqual([255, 0, 0]);
    expect(sampleGradient(g, 0.75)).toEqual([255, 127.5, 127.5]);
    expect(sampleGradient(g, -3)).toEqual([0, 0, 0]);
    expect(sampleGradient(g, 9)).toEqual([255, 255, 255]);
  });

  it('sorts stops given out of order', () => {
    const v = fromStops([
      { pos: 1, color: [0, 0, 255] },
      { pos: 0, color: [255, 0, 0] },
    ]);
    expect(sampleGradient(v, 0.5)).toEqual([127.5, 0, 127.5]);
  });

  it('wraps positions for clamp / repeat / mirror', () => {
    expect(wrapT(1.4, 'clamp')).toBe(1);
    expect(wrapT(1.25, 'repeat')).toBeCloseTo(0.25);
    expect(wrapT(-0.25, 'repeat')).toBeCloseTo(0.75);
    expect(wrapT(1.25, 'mirror')).toBeCloseTo(0.75);
    expect(wrapT(2.25, 'mirror')).toBeCloseTo(0.25);
  });

  it('produces a CSS gradient string', () => {
    expect(gradientCss(makeGradient(['#ff0000', '#0000ff']), 90)).toBe('linear-gradient(90deg, rgb(255,0,0) 0.0%, rgb(0,0,255) 100.0%)');
  });

  it('accepts 3-digit hex', () => {
    expect(sampleGradient(makeGradient(['#f00', '#00f']), 0)).toEqual([255, 0, 0]);
  });
});
