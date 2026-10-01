import { describe, expect, it } from 'vitest';
import { bezierAt, corner, ellipsePath, fromPoints, insertVertex, isSmooth, nearestOnPath, pathBounds, pathLength, pointCount, rectPath, removeVertex, smoothVertex, toPoints } from './path';

describe('path math', () => {
  it('round-trips points through the flat array', () => {
    const pts = [corner(1, 2), { x: 3, y: 4, ix: -1, iy: 0, ox: 1, oy: 0 }];
    expect(toPoints(fromPoints(pts))).toEqual(pts);
    expect(pointCount(fromPoints(pts))).toBe(2);
  });

  it('measures a rectangle perimeter', () => {
    expect(pathLength(rectPath(0, 0, 100, 50), true)).toBeCloseTo(300, 3);
    expect(pathLength(rectPath(0, 0, 100, 50), false)).toBeCloseTo(250, 3);
  });

  it('an ellipse path is close to the true circumference', () => {
    expect(pathLength(ellipsePath(0, 0, 100, 100), true)).toBeCloseTo(2 * Math.PI * 100, 0);
  });

  it('bounds follow the curve, not the control points', () => {
    const b = pathBounds(ellipsePath(50, 50, 40, 20), true)!;
    expect(b.x).toBeCloseTo(10, 1);
    expect(b.y).toBeCloseTo(30, 1);
    expect(b.w).toBeCloseTo(80, 1);
    expect(b.h).toBeCloseTo(40, 1);
  });

  it('inserting a vertex keeps the curve identical', () => {
    const v = ellipsePath(0, 0, 100, 60);
    const before = pathLength(v, true);
    const next = insertVertex(v, 1, 0.37, true);
    expect(pointCount(next)).toBe(5);
    expect(pathLength(next, true)).toBeCloseTo(before, 1);
    // the new vertex lies on the original curve
    const pts = toPoints(v);
    const seg: [[number, number], [number, number], [number, number], [number, number]] = [
      [pts[1].x, pts[1].y],
      [pts[1].x + pts[1].ox, pts[1].y + pts[1].oy],
      [pts[2].x + pts[2].ix, pts[2].y + pts[2].iy],
      [pts[2].x, pts[2].y],
    ];
    const expected = bezierAt(seg, 0.37);
    const added = toPoints(next)[2];
    expect(added.x).toBeCloseTo(expected[0], 6);
    expect(added.y).toBeCloseTo(expected[1], 6);
  });

  it('removing a vertex never leaves fewer than two', () => {
    const v = rectPath(0, 0, 10, 10);
    expect(pointCount(removeVertex(v, 0))).toBe(3);
    let tiny = removeVertex(removeVertex(v, 0), 0);
    expect(pointCount(tiny)).toBe(2);
    tiny = removeVertex(tiny, 0);
    expect(pointCount(tiny)).toBe(2);
  });

  it('smooth vertices have collinear opposite tangents; corners do not', () => {
    const pts = toPoints(rectPath(0, 0, 100, 100));
    const s = smoothVertex(pts, 1, true);
    expect(isSmooth(s)).toBe(true);
    expect(isSmooth(pts[1])).toBe(false);
  });

  it('finds the nearest point on a path', () => {
    const hit = nearestOnPath(rectPath(0, 0, 100, 100), true, [50, -8])!;
    expect(hit.seg).toBe(0);
    expect(hit.dist).toBeCloseTo(8, 3);
    expect(hit.at[0]).toBeCloseTo(50, 0);
  });
});
