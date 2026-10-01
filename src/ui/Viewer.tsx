import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { baseValue, evalProp } from '../core/interp';
import { apply, applyVec, clamp, invert, radToDeg, type Mat } from '../core/math';
import { corner, ellipsePath, fromPoints, isSmooth, nearestOnPath, rectPath, smoothVertex, toPoints, type PathPt } from '../core/path';
import type { Comp, Keyframe, Layer, Project, PropGroup, Vec2 } from '../core/types';
import { renderComp } from '../render/renderer';
import {
  hitTestLayer,
  layerMap,
  localBounds,
  localMatrix,
  parentWorld,
  worldMatrix,
  type Rect,
} from '../render/geometry';
import {
  addFootageLayer,
  addMask,
  addPathShape,
  addShape,
  addText,
  importFiles,
  insertPathVertex,
  deleteLayers,
  selectKeys,
  selectLayers,
  setAnchorKeepingPlace,
  setKeyframeSpatial,
  setManyProps,
  toggleLayerSelected,
  updateLayerData,
  type PropUpdate,
} from '../state/actions';
import { activeComp, appStore, beginGesture, endGesture, timeStore, useActiveComp, useApp } from '../state/store';
import { Icon } from './Icon';
import { editTarget, type PathTarget } from './pathEdit';
import { ViewerBar } from './ViewerBar';

let spaceHeld = false;
export const setSpaceHeld = (v: boolean): void => {
  spaceHeld = v;
};

const HANDLE_R = 7;
const ROT_OFFSET = 30;
const SCALE_CURSORS = ['nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize'];

interface Gizmo {
  poly: Vec2[];
  handles: Vec2[]; // TL, T, TR, R, BR, B, BL, L (comp space)
  rot: Vec2;
  anchor: Vec2;
  localHandles: Vec2[];
}

function computeGizmo(project: Project, comp: Comp, layer: Layer, t: number, zoom: number): Gizmo | null {
  const b = localBounds(project, layer, t);
  if (!b) return null;
  const byId = layerMap(comp);
  const W = worldMatrix(layer, t, byId);
  const lh: Vec2[] = [
    [b.x, b.y],
    [b.x + b.w / 2, b.y],
    [b.x + b.w, b.y],
    [b.x + b.w, b.y + b.h / 2],
    [b.x + b.w, b.y + b.h],
    [b.x + b.w / 2, b.y + b.h],
    [b.x, b.y + b.h],
    [b.x, b.y + b.h / 2],
  ];
  const handles = lh.map((p) => apply(W, p));
  const poly = [handles[0], handles[2], handles[4], handles[6]];
  const cx = (handles[0][0] + handles[4][0]) / 2;
  const cy = (handles[0][1] + handles[4][1]) / 2;
  const top = handles[1];
  let nx = top[0] - cx;
  let ny = top[1] - cy;
  const len = Math.hypot(nx, ny) || 1;
  nx /= len;
  ny /= len;
  const off = ROT_OFFSET / zoom;
  const anchor = apply(W, baseValue(layer.transform.anchor, t) as Vec2);
  return { poly, handles, rot: [top[0] + nx * off, top[1] + ny * off], anchor, localHandles: lh };
}

interface PathGizmo {
  pts: PathPt[];
  W: Mat;
  closed: boolean;
  /** Vertex and tangent-handle positions in composition space. */
  world: { v: Vec2; i: Vec2; o: Vec2 }[];
}

function pathGizmo(target: PathTarget, comp: Comp, t: number): PathGizmo | null {
  const pts = toPoints(evalProp(target.prop, t) as number[]);
  if (!pts.length) return null;
  const W = worldMatrix(target.layer, t, layerMap(comp));
  return {
    pts,
    W,
    closed: target.closed,
    world: pts.map((p) => ({ v: apply(W, [p.x, p.y]), i: apply(W, [p.x + p.ix, p.y + p.iy]), o: apply(W, [p.x + p.ox, p.y + p.oy]) })),
  };
}

const hasLen = (x: number, y: number) => Math.hypot(x, y) > 1e-6;

function pathHit(gz: PathGizmo, selVertex: number | null, p: Vec2, r: number): { part: 'v' | 'in' | 'out'; index: number } | null {
  const near = (a: Vec2) => Math.hypot(a[0] - p[0], a[1] - p[1]) <= r;
  if (selVertex !== null && gz.pts[selVertex]) {
    const pt = gz.pts[selVertex];
    const w = gz.world[selVertex];
    if (hasLen(pt.ox, pt.oy) && near(w.o)) return { part: 'out', index: selVertex };
    if (hasLen(pt.ix, pt.iy) && near(w.i)) return { part: 'in', index: selVertex };
  }
  for (let i = 0; i < gz.world.length; i++) if (near(gz.world[i].v)) return { part: 'v', index: i };
  return null;
}

/** Build the bezier outline of a path (already in composition space) on a canvas, scaled by zoom. */
function traceCurve(g: CanvasRenderingContext2D, world: { v: Vec2; i: Vec2; o: Vec2 }[], closed: boolean, zoom: number): void {
  g.beginPath();
  world.forEach((w, k) => {
    if (k === 0) g.moveTo(w.v[0] * zoom, w.v[1] * zoom);
    if (k < world.length - 1 || closed) {
      const n = world[(k + 1) % world.length];
      g.bezierCurveTo(w.o[0] * zoom, w.o[1] * zoom, n.i[0] * zoom, n.i[1] * zoom, n.v[0] * zoom, n.v[1] * zoom);
    }
  });
  if (closed) g.closePath();
}

/** Convert a path from composition space into a layer's own space (for masks drawn in the viewer). */
function pathToLocal(comp: Comp, layer: Layer, t: number, v: number[]): number[] | null {
  const inv = invert(worldMatrix(layer, t, layerMap(comp)));
  if (!inv) return null;
  return fromPoints(
    toPoints(v).map((p) => {
      const [x, y] = apply(inv, [p.x, p.y]);
      const i = applyVec(inv, [p.ix, p.iy]);
      const o = applyVec(inv, [p.ox, p.oy]);
      return { x, y, ix: i[0], iy: i[1], ox: o[0], oy: o[1] };
    }),
  );
}

interface MotionPoint {
  key: Keyframe;
  v: Vec2;
  i: Vec2 | null;
  o: Vec2 | null;
}

/** The layer's Position motion path in composition space (it lives in the parent's space). */
function motionGizmo(comp: Comp, layer: Layer, t: number): { P: Mat; pts: MotionPoint[] } | null {
  const keys = layer.transform.position.keys;
  if (keys.length < 2) return null;
  const P = parentWorld(layer, t, layerMap(comp));
  const pts = keys.map((key) => {
    const v = key.v as number[];
    const map = (dx: number, dy: number): Vec2 => apply(P, [v[0] + dx, v[1] + dy]);
    return {
      key,
      v: map(0, 0),
      i: key.sIn && (key.sIn[0] !== 0 || key.sIn[1] !== 0) ? map(key.sIn[0], key.sIn[1]) : null,
      o: key.sOut && (key.sOut[0] !== 0 || key.sOut[1] !== 0) ? map(key.sOut[0], key.sOut[1]) : null,
    };
  });
  return { P, pts };
}

function motionHit(g: { pts: MotionPoint[] }, selKeys: string[], p: Vec2, r: number): { part: 'key' | 'in' | 'out'; key: Keyframe } | null {
  const near = (a: Vec2) => Math.hypot(a[0] - p[0], a[1] - p[1]) <= r;
  for (const m of g.pts) {
    if (!selKeys.includes(m.key.id)) continue;
    if (m.o && near(m.o)) return { part: 'out', key: m.key };
    if (m.i && near(m.i)) return { part: 'in', key: m.key };
  }
  for (const m of g.pts) if (near(m.v)) return { part: 'key', key: m.key };
  return null;
}

let penActive = false;
/** True while a pen path is being drawn, so global shortcuts leave Enter / Esc / Backspace alone. */
export const isPenActive = (): boolean => penActive;

type Drag =
  | { kind: 'pan'; x: number; y: number; px: number; py: number }
  | { kind: 'zoom' }
  | { kind: 'move'; start: Vec2; items: { id: string; pos: Vec2; inv: Mat | null }[]; moved: boolean; shiftLayer: string | null }
  | { kind: 'scale'; id: string; handle: number; start: Vec2; anchor: Vec2; scale: Vec2; W: Mat }
  | { kind: 'rotate'; id: string; anchor: Vec2; rot: number; last: number; total: number }
  | { kind: 'create'; start: Vec2; cur: Vec2 }
  | { kind: 'anchor'; id: string; a0: Vec2; pos0: Vec2; W0: Mat; lin: Mat }
  | { kind: 'pen' }
  | { kind: 'mkey'; keyId: string; inv: Mat; grab: Vec2; v0: Vec2; pull: boolean }
  | { kind: 'mhandle'; keyId: string; which: 'in' | 'out'; inv: Mat; v0: Vec2; mirror: boolean }
  | { kind: 'vertex'; layerId: string; group: PropGroup; key: string; index: number; part: 'v' | 'in' | 'out'; v0: number[]; inv: Mat; grab: Vec2; smooth: boolean };

interface EditingText {
  layerId: string;
  value: string;
  isNew: boolean;
}

export function Viewer() {
  const comp = useActiveComp();
  const project = useApp((s) => s.project);
  const zoomSetting = useApp((s) => s.zoom);
  const panX = useApp((s) => s.panX);
  const panY = useApp((s) => s.panY);
  const quality = useApp((s) => s.quality);
  const checker = useApp((s) => s.checkerboard);
  const tool = useApp((s) => s.tool);
  const assetVersion = useApp((s) => s.assetVersion);

  const viewportRef = useRef<HTMLDivElement>(null);
  const compCanvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const [vp, setVp] = useState({ w: 800, h: 500 });
  const [editing, setEditing] = useState<EditingText | null>(null);
  const drag = useRef<Drag | null>(null);
  const [, force] = useState(0);
  const pen = useRef<{ pts: PathPt[]; cursor: Vec2 | null; dragging: boolean }>({ pts: [], cursor: null, dragging: false });

  const resetPen = () => {
    pen.current = { pts: [], cursor: null, dragging: false };
    penActive = false;
    dragTick.current++;
    schedule();
  };

  const finishPen = (closed: boolean, keepTool = false) => {
    const pts = pen.current.pts;
    resetPen();
    if (pts.length < 2) return;
    const s = appStore.get();
    const c = activeComp(s);
    const t = timeStore.get().t;
    const layer = s.selection.length === 1 ? c.layers.find((l) => l.id === s.selection[0]) : undefined;
    if (s.toolMakesMask && layer && layer.type !== 'null') {
      const local = pathToLocal(c, layer, t, fromPoints(pts));
      if (local) addMask(layer.id, local);
    } else addPathShape(fromPoints(pts), closed);
    if (!keepTool) appStore.set({ tool: 'select' });
  };

  useLayoutEffect(() => {
    const el = viewportRef.current!;
    const ro = new ResizeObserver(() => setVp({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setVp({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fitZoom = Math.max(0.02, Math.min((vp.w - 40) / comp.width, (vp.h - 40) / comp.height));
  const zoom = zoomSetting === 'fit' ? fitZoom : zoomSetting;
  const cw = comp.width * zoom;
  const ch = comp.height * zoom;
  const originX = (vp.w - cw) / 2 + (zoomSetting === 'fit' ? 0 : panX);
  const originY = (vp.h - ch) / 2 + (zoomSetting === 'fit' ? 0 : panY);
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  const scaleFor = () => {
    if (quality === 'auto') return clamp(Math.round(zoom * dpr * 20) / 20, 0.1, 1);
    return quality;
  };

  /* ---- drawing: comp pixels + gizmo overlay, coalesced to one per animation frame ---- */
  const lastKey = useRef<unknown[]>([]);
  const lastOverlayKey = useRef<unknown[]>([]);
  const rafRef = useRef(0);

  const draw = () => {
    rafRef.current = 0;
    const s = appStore.get();
    const c = activeComp(s);
    const t = timeStore.get().t;
    const canvas = compCanvas.current;
    const ov = overlay.current;
    if (!canvas || !ov) return;
    const sc = scaleFor();
    const renderKey = [s.project, s.activeCompId, t, sc, s.assetVersion, s.checkerboard];
    if (renderKey.some((v, i) => v !== lastKey.current[i])) {
      lastKey.current = renderKey;
      renderComp(canvas, s.project, c, t, { scale: sc, transparent: s.checkerboard, mbSamples: 6 });
    }
    const ovKey = [...renderKey, s.selection, zoom, vp.w, vp.h, s.tool, s.safeMargins, dragTick.current, s.activeMask, s.selVertex, s.selKeys];
    if (ovKey.some((v, i) => v !== lastOverlayKey.current[i])) {
      lastOverlayKey.current = ovKey;
      drawOverlay(ov, s.project, c, t, s.selection, s.safeMargins);
    }
  };
  const dragTick = useRef(0);

  const schedule = () => {
    if (!rafRef.current) rafRef.current = requestAnimationFrame(draw);
  };

  const drawOverlay = (ov: HTMLCanvasElement, p: Project, c: Comp, t: number, sel: string[], showSafe: boolean) => {
    const w = Math.round(cw * dpr);
    const h = Math.round(ch * dpr);
    if (ov.width !== w) ov.width = w;
    if (ov.height !== h) ov.height = h;
    const g = ov.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cw, ch);
    if (showSafe) {
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.setLineDash([4, 4]);
      for (const f of [0.9, 0.8]) g.strokeRect((cw * (1 - f)) / 2, (ch * (1 - f)) / 2, cw * f, ch * f);
      g.beginPath();
      g.moveTo(cw / 2, 0);
      g.lineTo(cw / 2, ch);
      g.moveTo(0, ch / 2);
      g.lineTo(cw, ch / 2);
      g.stroke();
      g.setLineDash([]);
    }
    const layers = c.layers.filter((l) => sel.includes(l.id));
    for (const l of layers) {
      const gz = computeGizmo(p, c, l, t, zoom);
      if (!gz) continue;
      const active = t >= l.inPoint && t < l.outPoint;
      g.strokeStyle = active ? '#4aa3ff' : 'rgba(74,163,255,0.4)';
      g.lineWidth = 1.5;
      g.beginPath();
      gz.poly.forEach((pt, i) => (i === 0 ? g.moveTo(pt[0] * zoom, pt[1] * zoom) : g.lineTo(pt[0] * zoom, pt[1] * zoom)));
      g.closePath();
      g.stroke();
      // anchor point
      const ax = gz.anchor[0] * zoom;
      const ay = gz.anchor[1] * zoom;
      g.strokeStyle = '#fff';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(ax, ay, 5, 0, Math.PI * 2);
      g.moveTo(ax - 9, ay);
      g.lineTo(ax + 9, ay);
      g.moveTo(ax, ay - 9);
      g.lineTo(ax, ay + 9);
      g.stroke();
      if (sel.length === 1 && l.type !== 'adjustment') {
        g.strokeStyle = '#4aa3ff';
        g.beginPath();
        g.moveTo(gz.handles[1][0] * zoom, gz.handles[1][1] * zoom);
        g.lineTo(gz.rot[0] * zoom, gz.rot[1] * zoom);
        g.stroke();
        g.fillStyle = '#fff';
        g.strokeStyle = '#2a7fd4';
        for (const hp of [...gz.handles, gz.rot]) {
          g.beginPath();
          g.rect(hp[0] * zoom - 4, hp[1] * zoom - 4, 8, 8);
          g.fill();
          g.stroke();
        }
      }
    }
    // masks of the selected layer, and the vertices of whichever path is being edited
    const st = appStore.get();
    if (sel.length === 1) {
      const L = c.layers.find((l) => l.id === sel[0]);
      for (const m of L?.masks ?? []) {
        if (m.mode === 'none') continue;
        const mg = pathGizmo({ layer: L!, group: `mask:${m.id}`, key: 'path', prop: m.props.path, closed: true, maskId: m.id }, c, t);
        if (!mg) continue;
        traceCurve(g, mg.world, true, zoom);
        g.strokeStyle = m.id === st.activeMask || (!st.activeMask && m === L!.masks[L!.masks.length - 1]) ? '#ffd24a' : 'rgba(255,210,74,0.55)';
        g.lineWidth = 1.5;
        g.stroke();
      }
    }
    const tgt = editTarget(c, sel, st.activeMask);
    const pgz = tgt && pathGizmo(tgt, c, t);
    if (tgt && pgz) {
      if (!tgt.maskId) {
        traceCurve(g, pgz.world, pgz.closed, zoom);
        g.strokeStyle = '#ffd24a';
        g.lineWidth = 1.5;
        g.stroke();
      }
      pgz.world.forEach((w, i) => {
        const isSel = st.selVertex === i;
        const pt = pgz.pts[i];
        if (isSel) {
          g.strokeStyle = 'rgba(255,255,255,0.7)';
          g.lineWidth = 1;
          g.beginPath();
          if (hasLen(pt.ix, pt.iy)) {
            g.moveTo(w.v[0] * zoom, w.v[1] * zoom);
            g.lineTo(w.i[0] * zoom, w.i[1] * zoom);
          }
          if (hasLen(pt.ox, pt.oy)) {
            g.moveTo(w.v[0] * zoom, w.v[1] * zoom);
            g.lineTo(w.o[0] * zoom, w.o[1] * zoom);
          }
          g.stroke();
          g.fillStyle = '#ffd24a';
          for (const h of [hasLen(pt.ix, pt.iy) ? w.i : null, hasLen(pt.ox, pt.oy) ? w.o : null]) {
            if (!h) continue;
            g.beginPath();
            g.arc(h[0] * zoom, h[1] * zoom, 4, 0, Math.PI * 2);
            g.fill();
          }
        }
        g.fillStyle = isSel ? '#ffd24a' : '#fff';
        g.strokeStyle = '#1b1c1f';
        g.lineWidth = 1.5;
        g.beginPath();
        g.rect(w.v[0] * zoom - 4, w.v[1] * zoom - 4, 8, 8);
        g.fill();
        g.stroke();
      });
    }
    if (sel.length === 1 && tool === 'select') {
      const L = c.layers.find((l) => l.id === sel[0]);
      const mg = L && motionGizmo(c, L, t);
      if (mg) {
        g.strokeStyle = 'rgba(255,255,255,0.75)';
        g.lineWidth = 1.25;
        g.setLineDash([4, 4]);
        g.beginPath();
        mg.pts.forEach((m, k) => {
          if (k === 0) return g.moveTo(m.v[0] * zoom, m.v[1] * zoom);
          const prev = mg.pts[k - 1];
          if (prev.o || m.i) {
            const c1 = prev.o ?? prev.v;
            const c2 = m.i ?? m.v;
            g.bezierCurveTo(c1[0] * zoom, c1[1] * zoom, c2[0] * zoom, c2[1] * zoom, m.v[0] * zoom, m.v[1] * zoom);
          } else g.lineTo(m.v[0] * zoom, m.v[1] * zoom);
        });
        g.stroke();
        g.setLineDash([]);
        for (const m of mg.pts) {
          const isSel = st.selKeys.includes(m.key.id);
          if (isSel) {
            g.strokeStyle = 'rgba(255,255,255,0.7)';
            g.lineWidth = 1;
            g.beginPath();
            for (const h of [m.i, m.o]) {
              if (!h) continue;
              g.moveTo(m.v[0] * zoom, m.v[1] * zoom);
              g.lineTo(h[0] * zoom, h[1] * zoom);
            }
            g.stroke();
            g.fillStyle = '#ffd24a';
            for (const h of [m.i, m.o]) {
              if (!h) continue;
              g.beginPath();
              g.arc(h[0] * zoom, h[1] * zoom, 4, 0, Math.PI * 2);
              g.fill();
            }
          }
          g.fillStyle = isSel ? '#ffd24a' : '#fff';
          g.strokeStyle = '#1b1c1f';
          g.lineWidth = 1.5;
          g.beginPath();
          g.rect(m.v[0] * zoom - 4, m.v[1] * zoom - 4, 8, 8);
          g.fill();
          g.stroke();
        }
      }
    }
    const pp = pen.current;
    if (tool === 'pen' && pp.pts.length) {
      const world = pp.pts.map((p) => ({ v: [p.x, p.y] as Vec2, i: [p.x + p.ix, p.y + p.iy] as Vec2, o: [p.x + p.ox, p.y + p.oy] as Vec2 }));
      if (pp.cursor && !pp.dragging) {
        const last = pp.pts[pp.pts.length - 1];
        world[world.length - 1] = { ...world[world.length - 1], o: [last.x + last.ox, last.y + last.oy] };
        world.push({ v: pp.cursor, i: pp.cursor, o: pp.cursor });
      }
      traceCurve(g, world, false, zoom);
      g.strokeStyle = '#4aa3ff';
      g.lineWidth = 1.5;
      g.stroke();
      pp.pts.forEach((p, i) => {
        g.fillStyle = i === 0 ? '#ffd24a' : '#fff';
        g.beginPath();
        g.rect(p.x * zoom - 4, p.y * zoom - 4, 8, 8);
        g.fill();
        g.stroke();
      });
    }
    const d = drag.current;
    if (d?.kind === 'create') {
      const r = createRect(d.start, d.cur, shiftHeld.current, altHeld.current);
      g.strokeStyle = '#4aa3ff';
      g.setLineDash([5, 4]);
      g.strokeRect(r.x * zoom, r.y * zoom, r.w * zoom, r.h * zoom);
      g.setLineDash([]);
    }
  };

  const shiftHeld = useRef(false);
  const altHeld = useRef(false);

  useEffect(() => {
    schedule();
    const u1 = appStore.subscribe(schedule);
    const u2 = timeStore.subscribe(schedule);
    return () => {
      u1();
      u2();
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  });

  useEffect(() => {
    lastKey.current = [];
    lastOverlayKey.current = [];
    schedule();
  }, [comp.id, vp.w, vp.h, zoom, quality, assetVersion]);

  // leaving the pen tool keeps whatever path was drawn so far; Enter / Esc / Backspace drive drawing
  useEffect(() => {
    if (tool !== 'pen') {
      if (pen.current.pts.length) finishPen(false, true);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (!pen.current.pts.length) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        finishPen(false);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        resetPen();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        pen.current.pts.pop();
        if (!pen.current.pts.length) penActive = false;
        dragTick.current++;
        schedule();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  /* ---- coordinates ---- */
  const toComp = (e: { clientX: number; clientY: number }): Vec2 => {
    const r = viewportRef.current!.getBoundingClientRect();
    return [(e.clientX - r.left - originX) / zoom, (e.clientY - r.top - originY) / zoom];
  };

  const setView = (z: number, px: number, py: number) => appStore.set({ zoom: z, panX: px, panY: py });

  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    const r = viewportRef.current!.getBoundingClientRect();
    const cx = clientX - r.left;
    const cy = clientY - r.top;
    const pt: Vec2 = [(cx - originX) / zoom, (cy - originY) / zoom];
    const z = clamp(zoom * factor, 0.05, 16);
    const ox = cx - pt[0] * z;
    const oy = cy - pt[1] * z;
    setView(z, ox - (vp.w - comp.width * z) / 2, oy - (vp.h - comp.height * z) / 2);
  };

  const onWheel = (e: React.WheelEvent) => zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY / 400));

  /* ---- hit testing ---- */
  const pickLayer = (p: Vec2): string | null => {
    const s = appStore.get();
    const c = activeComp(s);
    const t = timeStore.get().t;
    const byId = layerMap(c);
    const consumed = new Set<string>();
    c.layers.forEach((l, i) => {
      if (i > 0 && l.matte !== 'none') consumed.add(c.layers[i - 1].id);
    });
    for (const l of c.layers) {
      if (!l.visible || l.locked || consumed.has(l.id) || l.type === 'adjustment') continue;
      if (t < l.inPoint || t >= l.outPoint) continue;
      if (hitTestLayer(s.project, l, t, byId, p)) return l.id;
    }
    return null;
  };

  const gizmoHit = (p: Vec2): { kind: 'rotate' } | { kind: 'scale'; handle: number } | null => {
    const s = appStore.get();
    if (s.selection.length !== 1) return null;
    const c = activeComp(s);
    const l = c.layers.find((x) => x.id === s.selection[0]);
    if (!l || l.locked || l.type === 'adjustment') return null;
    const gz = computeGizmo(s.project, c, l, timeStore.get().t, zoom);
    if (!gz) return null;
    const r = HANDLE_R / zoom;
    if (Math.hypot(p[0] - gz.rot[0], p[1] - gz.rot[1]) <= r) return { kind: 'rotate' };
    for (let i = 0; i < 8; i++) if (Math.hypot(p[0] - gz.handles[i][0], p[1] - gz.handles[i][1]) <= r) return { kind: 'scale', handle: i };
    return null;
  };

  /* ---- pointer interaction ---- */
  const onPointerDown = (e: RPointerEvent) => {
    if (editing) return;
    const el = viewportRef.current!;
    const s = appStore.get();
    shiftHeld.current = e.shiftKey;
    altHeld.current = e.altKey;
    if (e.button === 1 || tool === 'hand' || spaceHeld) {
      el.setPointerCapture(e.pointerId);
      drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, px: zoomSetting === 'fit' ? 0 : panX, py: zoomSetting === 'fit' ? 0 : panY };
      if (zoomSetting === 'fit') setView(zoom, 0, 0);
      return;
    }
    if (e.button !== 0) return;
    const p = toComp(e);
    if (tool === 'zoom') {
      zoomAt(e.clientX, e.clientY, e.altKey ? 1 / 1.5 : 1.5);
      return;
    }
    if (tool === 'shape') {
      el.setPointerCapture(e.pointerId);
      drag.current = { kind: 'create', start: p, cur: p };
      return;
    }
    if (tool === 'pen') {
      const pts = pen.current.pts;
      if (pts.length >= 2 && Math.hypot(p[0] - pts[0].x, p[1] - pts[0].y) <= 9 / zoom) {
        finishPen(true);
        return;
      }
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(p[0] - last.x, p[1] - last.y) > 1.5 / zoom) pts.push(corner(p[0], p[1]));
      pen.current.dragging = true;
      penActive = true;
      el.setPointerCapture(e.pointerId);
      drag.current = { kind: 'pen' };
      dragTick.current++;
      schedule();
      return;
    }
    if (tool === 'text') {
      const id = addText('Text', p);
      appStore.set({ tool: 'select' });
      // Open the editor after this event: the browser's own mousedown focus change would
      // otherwise blur the new textarea immediately and close it.
      setTimeout(() => setEditing({ layerId: id, value: 'Text', isNew: true }), 0);
      return;
    }

    const c = activeComp(s);
    const t = timeStore.get().t;

    if (tool === 'anchor') {
      let id = s.selection[0];
      if (!id) {
        const hit = pickLayer(p);
        if (!hit) return;
        selectLayers([hit]);
        id = hit;
      }
      const l = c.layers.find((x) => x.id === id);
      if (!l || l.locked) return;
      el.setPointerCapture(e.pointerId);
      beginGesture();
      drag.current = {
        kind: 'anchor',
        id,
        a0: baseValue(l.transform.anchor, t) as Vec2,
        pos0: baseValue(l.transform.position, t) as Vec2,
        W0: worldMatrix(l, t, layerMap(c)),
        lin: localMatrix(l, t),
      };
      return;
    }

    // select tool: motion-path keyframes first, then path vertices, then the layer's transform handles
    const selLayer = s.selection.length === 1 ? c.layers.find((l) => l.id === s.selection[0]) : undefined;
    const mg = selLayer && !selLayer.locked ? motionGizmo(c, selLayer, t) : null;
    const mh = mg ? motionHit(mg, s.selKeys, p, 8 / zoom) : null;
    if (mg && mh) {
      const inv = invert(mg.P);
      if (inv) {
        const v0 = mh.key.v as Vec2;
        selectKeys([mh.key.id]);
        el.setPointerCapture(e.pointerId);
        beginGesture();
        if (mh.part === 'key') {
          const q = apply(inv, p);
          drag.current = { kind: 'mkey', keyId: mh.key.id, inv, grab: [v0[0] - q[0], v0[1] - q[1]], v0: [v0[0], v0[1]], pull: e.altKey };
        } else {
          drag.current = { kind: 'mhandle', keyId: mh.key.id, which: mh.part, inv, v0: [v0[0], v0[1]], mirror: !e.altKey };
        }
        return;
      }
    }
    const pt = editTarget(c, s.selection, s.activeMask);
    const pg = pt && pathGizmo(pt, c, t);
    const ph = pt && pg ? pathHit(pg, s.selVertex, p, 8 / zoom) : null;
    if (pt && pg && ph) {
      appStore.set({ selVertex: ph.index });
      if (e.altKey && ph.part === 'v') {
        // Alt-click toggles between a smooth and a corner vertex
        const pts = toPoints(evalProp(pt.prop, t) as number[]);
        pts[ph.index] = isSmooth(pts[ph.index]) ? corner(pts[ph.index].x, pts[ph.index].y) : smoothVertex(pts, ph.index, pt.closed);
        setManyProps([{ layerId: pt.layer.id, group: pt.group, key: pt.key, value: fromPoints(pts) }], t);
        return;
      }
      const inv = invert(pg.W);
      if (!inv) return;
      const q = apply(inv, p);
      const v0 = (evalProp(pt.prop, t) as number[]).slice();
      el.setPointerCapture(e.pointerId);
      beginGesture();
      drag.current = {
        kind: 'vertex',
        layerId: pt.layer.id,
        group: pt.group,
        key: pt.key,
        index: ph.index,
        part: ph.part,
        v0,
        inv,
        grab: [pg.pts[ph.index].x - q[0], pg.pts[ph.index].y - q[1]],
        smooth: isSmooth(pg.pts[ph.index]),
      };
      return;
    }

    const gh = gizmoHit(p);
    if (gh) {
      const l = c.layers.find((x) => x.id === s.selection[0])!;
      const byId = layerMap(c);
      const W = worldMatrix(l, t, byId);
      const anchor = apply(W, baseValue(l.transform.anchor, t) as Vec2);
      el.setPointerCapture(e.pointerId);
      beginGesture();
      if (gh.kind === 'rotate') {
        const a = Math.atan2(p[1] - anchor[1], p[0] - anchor[0]);
        drag.current = { kind: 'rotate', id: l.id, anchor, rot: baseValue(l.transform.rotation, t) as number, last: a, total: 0 };
      } else {
        drag.current = {
          kind: 'scale',
          id: l.id,
          handle: gh.handle,
          start: p,
          anchor,
          scale: baseValue(l.transform.scale, t) as Vec2,
          W,
        };
      }
      return;
    }

    const hit = pickLayer(p);
    if (!hit) {
      if (!e.shiftKey) selectLayers([]);
      return;
    }
    if (e.shiftKey) toggleLayerSelected(hit);
    else if (!s.selection.includes(hit)) selectLayers([hit]);
    const sel = appStore.get().selection;
    const byId = layerMap(c);
    const items = c.layers
      .filter((l) => sel.includes(l.id) && !l.locked)
      .map((l) => ({
        id: l.id,
        pos: baseValue(l.transform.position, t) as Vec2,
        inv: invert(parentWorld(l, t, byId)),
      }));
    el.setPointerCapture(e.pointerId);
    beginGesture();
    drag.current = { kind: 'move', start: p, items, moved: false, shiftLayer: null };
  };

  const onPointerMove = (e: RPointerEvent) => {
    shiftHeld.current = e.shiftKey;
    altHeld.current = e.altKey;
    const d = drag.current;
    const t = timeStore.get().t;
    if (tool === 'pen' && pen.current.pts.length && d?.kind !== 'pen') {
      pen.current.cursor = toComp(e);
      dragTick.current++;
      schedule();
    }
    if (!d) {
      // hover feedback
      if (tool === 'select' && viewportRef.current) {
        const gh = gizmoHit(toComp(e));
        viewportRef.current.style.cursor = gh ? (gh.kind === 'rotate' ? 'crosshair' : SCALE_CURSORS[gh.handle]) : '';
      }
      return;
    }
    if (d.kind === 'pan') {
      setView(zoom, d.px + (e.clientX - d.x), d.py + (e.clientY - d.y));
      return;
    }
    const p = toComp(e);
    if (d.kind === 'pen') {
      const pts = pen.current.pts;
      const last = pts[pts.length - 1];
      if (last && pen.current.dragging) {
        // dragging while placing a vertex pulls out symmetric smooth tangents
        last.ox = p[0] - last.x;
        last.oy = p[1] - last.y;
        last.ix = -last.ox;
        last.iy = -last.oy;
      }
      pen.current.cursor = p;
      dragTick.current++;
      schedule();
      return;
    }
    if (d.kind === 'mkey') {
      const q = apply(d.inv, p);
      if (d.pull) {
        const out: Vec2 = [q[0] - d.v0[0], q[1] - d.v0[1]];
        setKeyframeSpatial(d.keyId, { sOut: out, sIn: [-out[0], -out[1]] });
      } else {
        setKeyframeSpatial(d.keyId, { v: [Math.round((q[0] + d.grab[0]) * 100) / 100, Math.round((q[1] + d.grab[1]) * 100) / 100] });
      }
      return;
    }
    if (d.kind === 'mhandle') {
      const q = apply(d.inv, p);
      const off: Vec2 = [q[0] - d.v0[0], q[1] - d.v0[1]];
      const opp: Vec2 = [-off[0], -off[1]];
      if (d.which === 'out') setKeyframeSpatial(d.keyId, d.mirror ? { sOut: off, sIn: opp } : { sOut: off });
      else setKeyframeSpatial(d.keyId, d.mirror ? { sIn: off, sOut: opp } : { sIn: off });
      return;
    }
    if (d.kind === 'vertex') {
      const q = apply(d.inv, p);
      const pts = toPoints(d.v0);
      const pt = pts[d.index];
      if (d.part === 'v') {
        pt.x = q[0] + d.grab[0];
        pt.y = q[1] + d.grab[1];
      } else {
        const dx = q[0] - pt.x;
        const dy = q[1] - pt.y;
        const mirror = d.smooth && !e.altKey;
        if (d.part === 'out') {
          const lenI = Math.hypot(pt.ix, pt.iy);
          pt.ox = dx;
          pt.oy = dy;
          if (mirror) {
            const lo = Math.hypot(dx, dy) || 1;
            pt.ix = (-dx / lo) * lenI;
            pt.iy = (-dy / lo) * lenI;
          }
        } else {
          const lenO = Math.hypot(pt.ox, pt.oy);
          pt.ix = dx;
          pt.iy = dy;
          if (mirror) {
            const li = Math.hypot(dx, dy) || 1;
            pt.ox = (-dx / li) * lenO;
            pt.oy = (-dy / li) * lenO;
          }
        }
      }
      setManyProps([{ layerId: d.layerId, group: d.group, key: d.key, value: fromPoints(pts) }], t);
      return;
    }
    if (d.kind === 'create') {
      d.cur = p;
      dragTick.current++;
      schedule();
      return;
    }
    if (d.kind === 'move') {
      let dx = p[0] - d.start[0];
      let dy = p[1] - d.start[1];
      if (!d.moved && Math.hypot(dx, dy) * zoom < 3) return;
      d.moved = true;
      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      const updates: PropUpdate[] = d.items.map((it) => {
        const v = it.inv ? applyVec(it.inv, [dx, dy]) : [dx, dy];
        return { layerId: it.id, group: 'transform', key: 'position', value: [it.pos[0] + v[0], it.pos[1] + v[1]] };
      });
      setManyProps(updates, t);
      return;
    }
    if (d.kind === 'anchor') {
      const inv = invert(d.W0);
      if (!inv) return;
      const a1 = apply(inv, p);
      const dp = applyVec(d.lin, [a1[0] - d.a0[0], a1[1] - d.a0[1]]);
      const r = (v: number) => Math.round(v * 100) / 100;
      setAnchorKeepingPlace(d.id, [r(a1[0]), r(a1[1])], [r(d.pos0[0] + dp[0]), r(d.pos0[1] + dp[1])]);
      return;
    }
    if (d.kind === 'rotate') {
      const a = Math.atan2(p[1] - d.anchor[1], p[0] - d.anchor[0]);
      let delta = a - d.last;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      d.total += delta;
      d.last = a;
      let rot = d.rot + radToDeg(d.total);
      if (e.shiftKey) rot = Math.round(rot / 15) * 15;
      setManyProps([{ layerId: d.id, group: 'transform', key: 'rotation', value: Math.round(rot * 100) / 100 }], t);
      return;
    }
    if (d.kind === 'scale') {
      const w0: Vec2 = [d.start[0] - d.anchor[0], d.start[1] - d.anchor[1]];
      const w1: Vec2 = [p[0] - d.anchor[0], p[1] - d.anchor[1]];
      const ex = normalize(applyVec(d.W, [1, 0]));
      const ey = normalize(applyVec(d.W, [0, 1]));
      const ratio = (axis: Vec2) => {
        const a = dot(w0, axis);
        return Math.abs(a) < 1e-3 ? 1 : dot(w1, axis) / a;
      };
      const corner = [0, 2, 4, 6].includes(d.handle);
      let fx = 1;
      let fy = 1;
      if (corner && e.shiftKey) {
        const f = dot(w1, w0) / Math.max(1e-6, dot(w0, w0));
        fx = fy = f;
      } else {
        if (d.handle !== 1 && d.handle !== 5) fx = ratio(ex);
        if (d.handle !== 3 && d.handle !== 7) fy = ratio(ey);
      }
      const ns: Vec2 = [Math.round(d.scale[0] * fx * 100) / 100, Math.round(d.scale[1] * fy * 100) / 100];
      setManyProps([{ layerId: d.id, group: 'transform', key: 'scale', value: ns }], t);
    }
  };

  const onPointerUp = (e: RPointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    viewportRef.current?.releasePointerCapture?.(e.pointerId);
    if (d.kind === 'pen') {
      pen.current.dragging = false;
      dragTick.current++;
      schedule();
      return;
    }
    if (d.kind === 'create') {
      const r = createRect(d.start, d.cur, e.shiftKey, e.altKey);
      const tiny = r.w * zoom < 6 && r.h * zoom < 6;
      const size: Vec2 = tiny ? [240, 240] : [Math.max(2, r.w), Math.max(2, r.h)];
      const center: Vec2 = tiny ? d.start : [r.x + r.w / 2, r.y + r.h / 2];
      const st = appStore.get();
      const c = activeComp(st);
      const layer = st.selection.length === 1 ? c.layers.find((l) => l.id === st.selection[0]) : undefined;
      if (st.toolMakesMask && layer && layer.type !== 'null') {
        const x = center[0] - size[0] / 2;
        const y = center[1] - size[1] / 2;
        const compPath = st.shapeTool === 'ellipse' ? ellipsePath(center[0], center[1], size[0] / 2, size[1] / 2) : rectPath(x, y, size[0], size[1]);
        const local = pathToLocal(c, layer, timeStore.get().t, compPath);
        if (local) addMask(layer.id, local);
      } else addShape(st.shapeTool, size, center);
      appStore.set({ tool: 'select' });
      dragTick.current++;
      schedule();
      return;
    }
    if (d.kind === 'move' || d.kind === 'scale' || d.kind === 'rotate' || d.kind === 'anchor' || d.kind === 'vertex' || d.kind === 'mkey' || d.kind === 'mhandle') endGesture();
    force((n) => n + 1);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (tool === 'pen') {
      if (pen.current.pts.length >= 2) finishPen(false);
      return;
    }
    if (tool !== 'select') return;
    // double-click on a path segment inserts a vertex there
    {
      const s = appStore.get();
      const c = activeComp(s);
      const t = timeStore.get().t;
      const pt = editTarget(c, s.selection, s.activeMask);
      const pg = pt && pathGizmo(pt, c, t);
      if (pt && pg && !pathHit(pg, s.selVertex, toComp(e), 8 / zoom)) {
        const flat = fromPoints(pg.world.map((w) => ({ x: w.v[0], y: w.v[1], ix: w.i[0] - w.v[0], iy: w.i[1] - w.v[1], ox: w.o[0] - w.v[0], oy: w.o[1] - w.v[1] })));
        const near = nearestOnPath(flat, pg.closed, toComp(e));
        if (near && near.dist <= 10 / zoom) {
          insertPathVertex(pt.layer.id, pt.group, pt.key, near.seg, near.u, pt.closed);
          return;
        }
      }
    }
    const id = pickLayer(toComp(e));
    if (!id) return;
    const l = activeComp().layers.find((x) => x.id === id);
    if (l?.data.type === 'text') {
      selectLayers([id]);
      setEditing({ layerId: id, value: l.data.text, isNew: false });
    }
  };

  const commitText = (value: string) => {
    if (!editing) return;
    const { layerId, isNew } = editing;
    setEditing(null);
    if (value.trim() === '' && isNew) deleteLayers([layerId]);
    else if (value.trim() !== '') updateLayerData(layerId, { text: value });
  };

  let editStyle: React.CSSProperties | null = null;
  if (editing) {
    const l = comp.layers.find((x) => x.id === editing.layerId);
    const t = timeStore.get().t;
    const gz = l ? computeGizmo(project, comp, l, t, zoom) : null;
    if (l && gz && l.data.type === 'text') {
      const size = (baseValue(l.content.fontSize, t) as number) * zoom;
      editStyle = {
        left: originX + gz.poly[0][0] * zoom - 4,
        top: originY + gz.poly[0][1] * zoom - 4,
        fontSize: Math.max(10, size),
        fontFamily: l.data.font,
        fontWeight: l.data.bold ? 700 : 400,
        minWidth: 80,
      };
    }
  }

  const cursor = tool === 'hand' ? 'grab' : tool === 'zoom' ? 'zoom-in' : tool === 'shape' || tool === 'anchor' || tool === 'pen' ? 'crosshair' : tool === 'text' ? 'text' : '';

  return (
    <div className="viewer">
      <div
        ref={viewportRef}
        className="viewport"
        style={{ cursor }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
        data-testid="viewport"
      >
        <div className={`stage ${checker ? 'checker' : ''}`} style={{ left: originX, top: originY, width: cw, height: ch }}>
          <canvas ref={compCanvas} className="comp-canvas" style={{ width: cw, height: ch }} data-testid="comp-canvas" />
          <canvas ref={overlay} className="overlay-canvas" style={{ width: cw, height: ch }} />
        </div>
        {editing && editStyle && (
          <textarea
            className="text-editor"
            style={editStyle}
            autoFocus
            defaultValue={editing.value}
            onFocus={(e) => e.target.select()}
            onBlur={(e) => commitText(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur();
            }}
            onPointerDown={(e) => e.stopPropagation()}
          />
        )}
        {comp.layers.length === 0 && !editing && <EmptyState />}
        <div className="viewport-hud">
          {Math.round(zoom * 100)}% · {comp.width}×{comp.height}
        </div>
      </div>
      <ViewerBar fitZoom={fitZoom} />
    </div>
  );
}

function createRect(a: Vec2, b: Vec2, square: boolean, fromCenter: boolean): Rect {
  let w = b[0] - a[0];
  let h = b[1] - a[1];
  if (square) {
    const m = Math.max(Math.abs(w), Math.abs(h));
    w = Math.sign(w || 1) * m;
    h = Math.sign(h || 1) * m;
  }
  if (fromCenter) return { x: a[0] - Math.abs(w), y: a[1] - Math.abs(h), w: Math.abs(w) * 2, h: Math.abs(h) * 2 };
  return { x: Math.min(a[0], a[0] + w), y: Math.min(a[1], a[1] + h), w: Math.abs(w), h: Math.abs(h) };
}

const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];
const normalize = (v: Vec2): Vec2 => {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
};



/** Shown over an empty composition: the quickest ways to start. */
function EmptyState() {
  const fileRef = useRef<HTMLInputElement>(null);
  const comp = activeComp();
  const c: Vec2 = [comp.width / 2, comp.height / 2];
  return (
    <div className="viewer-empty" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} data-testid="viewer-empty">
      <div className="empty-card">
        <h2>Start something</h2>
        <p>Add a layer, then give it motion from the Library. Everything stays editable.</p>
        <div className="empty-actions">
          <button onClick={() => addText('Your title', c)} data-testid="empty-text">
            <Icon name="text" size={16} /> Text
          </button>
          <button onClick={() => addShape('rect', [420, 300], c)}>
            <Icon name="shape" size={16} /> Shape
          </button>
          <button onClick={() => fileRef.current?.click()}>
            <Icon name="image" size={16} /> Image
          </button>
          <button onClick={() => appStore.set({ rightTab: 'library' })}>
            <Icon name="sparkle" size={16} /> Library
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={async (e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            const ids = await importFiles(files);
            for (const id of ids.reverse()) addFootageLayer(id);
          }}
        />
      </div>
    </div>
  );
}
