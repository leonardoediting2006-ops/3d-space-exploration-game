import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { baseValue } from '../core/interp';
import { apply, applyVec, clamp, invert, radToDeg, type Mat } from '../core/math';
import type { Comp, Layer, Project, Vec2 } from '../core/types';
import { renderComp } from '../render/renderer';
import {
  hitTestLayer,
  layerMap,
  localBounds,
  parentWorld,
  worldMatrix,
  type Rect,
} from '../render/geometry';
import {
  addShape,
  addText,
  deleteLayers,
  selectLayers,
  setManyProps,
  toggleLayerSelected,
  updateLayerData,
  type PropUpdate,
} from '../state/actions';
import { activeComp, appStore, beginGesture, endGesture, timeStore, useActiveComp, useApp } from '../state/store';
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

type Drag =
  | { kind: 'pan'; x: number; y: number; px: number; py: number }
  | { kind: 'zoom' }
  | { kind: 'move'; start: Vec2; items: { id: string; pos: Vec2; inv: Mat | null }[]; moved: boolean; shiftLayer: string | null }
  | { kind: 'scale'; id: string; handle: number; start: Vec2; anchor: Vec2; scale: Vec2; W: Mat }
  | { kind: 'rotate'; id: string; anchor: Vec2; rot: number; last: number; total: number }
  | { kind: 'create'; start: Vec2; cur: Vec2 };

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
    const ovKey = [...renderKey, s.selection, zoom, vp.w, vp.h, s.tool, s.safeMargins, dragTick.current];
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
    if (tool === 'text') {
      const id = addText('Text', p);
      appStore.set({ tool: 'select' });
      // Open the editor after this event: the browser's own mousedown focus change would
      // otherwise blur the new textarea immediately and close it.
      setTimeout(() => setEditing({ layerId: id, value: 'Text', isNew: true }), 0);
      return;
    }

    // select tool
    const c = activeComp(s);
    const t = timeStore.get().t;
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
    if (d.kind === 'create') {
      const r = createRect(d.start, d.cur, e.shiftKey, e.altKey);
      const tiny = r.w * zoom < 6 && r.h * zoom < 6;
      const size: Vec2 = tiny ? [240, 240] : [Math.max(2, r.w), Math.max(2, r.h)];
      const center: Vec2 = tiny ? d.start : [r.x + r.w / 2, r.y + r.h / 2];
      addShape(appStore.get().shapeTool, size, center);
      appStore.set({ tool: 'select' });
      dragTick.current++;
      schedule();
      return;
    }
    if (d.kind === 'move' || d.kind === 'scale' || d.kind === 'rotate') endGesture();
    force((n) => n + 1);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (tool !== 'select') return;
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

  const cursor = tool === 'hand' ? 'grab' : tool === 'zoom' ? 'zoom-in' : tool === 'shape' ? 'crosshair' : tool === 'text' ? 'text' : '';

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

