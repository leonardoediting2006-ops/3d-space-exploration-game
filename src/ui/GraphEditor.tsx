import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactElement } from 'react';
import { getEffectDef } from '../core/effectDefs';
import {
  dominantComponent,
  easeFromValueHandle,
  fitRange,
  inSpeed,
  isGraphable,
  niceTicks,
  outSpeed,
  speedAt,
  timeStep,
  valueHandles,
  withInSpeed,
  withOutSpeed,
  type Range,
} from '../core/graph';
import { baseValue } from '../core/interp';
import { layerPropEntries } from '../core/props';
import { snapToFrame } from '../core/time';
import type { Comp, Ease, Keyframe, Layer, Prop, PropGroup } from '../core/types';
import { applyKeyEase, moveKeys, selectKeys, setKeyEases, setKeyValue, setTime, toggleKeyHereMany } from '../state/actions';
import { appStore, beginGesture, endGesture, timeStore, useApp, useTime } from '../state/store';
import { Icon } from './Icon';

const GUTTER = 54;
const RULER = 26;
const PAD_R = 12;
const PAD_B = 10;
const CHANNEL_COLORS = ['#7f9eff', '#f4c552', '#5ecb8c', '#ef7d6e', '#a78bff', '#4fd1d9', '#ff9f5a', '#d97bd0'];

interface Channel {
  id: string;
  layer: Layer;
  group: PropGroup;
  key: string;
  prop: Prop;
  /** "Layer › Property". */
  label: string;
  color: string;
  comps: number;
}

interface View {
  t0: number;
  t1: number;
  lo: number;
  hi: number;
}

const compsOf = (v: number | number[]): number[] => (typeof v === 'number' ? [v] : v);
const fmt = (v: number): string => {
  const s = Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
};
const decimalsFor = (step: number) => (step >= 1 ? 0 : step >= 0.1 ? 1 : 2);

function groupLabel(layer: Layer, group: PropGroup): string {
  if (group.startsWith('fx:')) {
    const fx = layer.effects.find((e) => `fx:${e.id}` === group);
    return fx ? (getEffectDef(fx.type)?.name ?? fx.type) : 'Effect';
  }
  if (group.startsWith('mask:')) return layer.masks.find((m) => `mask:${m.id}` === group)?.name ?? 'Mask';
  if (group.startsWith('anim:')) return layer.animators.find((a) => `anim:${a.id}` === group)?.name ?? 'Animator';
  return '';
}

/** Which properties the graph shows: the animated ones of the selected layers (or every layer). */
function buildChannels(comp: Comp, selection: string[], scope: 'selected' | 'all'): Channel[] {
  const pick = scope === 'selected' && selection.length ? comp.layers.filter((l) => selection.includes(l.id)) : comp.layers;
  const out: Channel[] = [];
  for (const layer of pick) {
    for (const e of layerPropEntries(layer)) {
      if (!isGraphable(e.prop)) continue;
      const g = groupLabel(layer, e.group);
      out.push({
        id: `${layer.id}|${e.group}|${e.key}`,
        layer,
        group: e.group,
        key: e.key,
        prop: e.prop,
        label: `${layer.name} › ${g ? `${g} · ` : ''}${e.prop.label}`,
        color: CHANNEL_COLORS[out.length % CHANNEL_COLORS.length],
        comps: compsOf(e.prop.keys[0].v).length,
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ the editor */

/**
 * A full-size graph of every animated property of the selected layers. The value graph plots each
 * property over time; the speed graph plots how fast it is changing. Drag keyframes in time (and
 * value), and drag the bezier handles to shape the easing — as values, or as speed and influence.
 */
export function GraphEditor({ comp }: { comp: Comp }) {
  const selection = useApp((s) => s.selection);
  const selKeys = useApp((s) => s.selKeys);
  const mode = useApp((s) => s.graphMode);
  const normalize = useApp((s) => s.graphNormalize);
  const scope = useApp((s) => s.graphScope);
  const link = useApp((s) => s.graphLink);
  const snapOn = useApp((s) => s.snap);
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 900, h: 300 });
  const [manual, setManual] = useState<View | null>(null);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [active, setActive] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  /** Scales frozen while something is dragged, so the picture does not shift under the pointer. */
  const [frozen, setFrozen] = useState<{ ranges: Record<string, Range>; shared: Range } | null>(null);

  const channels = useMemo(() => buildChannels(comp, selection, scope), [comp, selection, scope]);
  const visible = useMemo(() => channels.filter((c) => !hidden[c.id]), [channels, hidden]);
  const selSet = useMemo(() => new Set(selKeys), [selKeys]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: Math.max(300, el.clientWidth), h: Math.max(140, el.clientHeight) }));
    ro.observe(el);
    setSize({ w: Math.max(300, el.clientWidth), h: Math.max(140, el.clientHeight) });
    return () => ro.disconnect();
  }, []);

  const plot = { x: GUTTER, y: RULER, w: Math.max(100, size.w - GUTTER - PAD_R), h: Math.max(60, size.h - RULER - PAD_B) };

  /* ---- scales: computed from the keyframes unless the user has zoomed or panned */
  const scales = useMemo(() => {
    const ranges: Record<string, Range> = {};
    const all: number[] = [];
    let tMin = Infinity;
    let tMax = -Infinity;
    for (const ch of visible) {
      const keys = ch.prop.keys;
      tMin = Math.min(tMin, keys[0].t);
      tMax = Math.max(tMax, keys[keys.length - 1].t);
      const vals: number[] = [];
      const N = 120;
      for (let i = 0; i <= N; i++) {
        const t = keys[0].t + ((keys[keys.length - 1].t - keys[0].t) * i) / N;
        if (mode === 'speed') vals.push(speedAt(ch.prop, t));
        else vals.push(...compsOf(baseValue(ch.prop, t)));
      }
      for (const k of keys) if (mode === 'value') vals.push(...compsOf(k.v));
      if (mode === 'speed') vals.push(0);
      ranges[ch.id] = fitRange(vals, mode === 'speed' ? 0.18 : 0.14, mode === 'speed');
      all.push(...vals);
    }
    const shared = fitRange(all, mode === 'speed' ? 0.18 : 0.14, mode === 'speed');
    const span = Number.isFinite(tMin) ? Math.max(tMax - tMin, 0.2) : comp.duration;
    const pad = Math.max(span * 0.08, 0.15);
    const auto: View = Number.isFinite(tMin) ? { t0: Math.max(-0.2, tMin - pad), t1: tMax + pad, lo: shared.lo, hi: shared.hi } : { t0: 0, t1: comp.duration, lo: -1, hi: 1 };
    return { ranges, shared, auto };
  }, [visible, mode, comp.duration]);

  const view: View = manual ?? scales.auto;
  const rangeOf = (ch: Channel): Range => {
    if (normalize) return frozen?.ranges[ch.id] ?? scales.ranges[ch.id] ?? scales.shared;
    return frozen?.shared ?? { lo: view.lo, hi: view.hi };
  };
  const tx = (t: number) => plot.x + ((t - view.t0) / (view.t1 - view.t0)) * plot.w;
  const tAt = (px: number) => view.t0 + ((px - plot.x) / plot.w) * (view.t1 - view.t0);
  const vy = (r: Range, v: number) => plot.y + ((r.hi - v) / (r.hi - r.lo)) * plot.h;
  const vAt = (r: Range, py: number) => r.hi - ((py - plot.y) / plot.h) * (r.hi - r.lo);

  const freeze = () => setFrozen({ ranges: { ...scales.ranges }, shared: { lo: view.lo, hi: view.hi } });

  /* ---- zoom & pan */
  const svg = useRef<SVGSVGElement>(null);
  const local = (e: { clientX: number; clientY: number }) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const viewRef = useRef(view);
  viewRef.current = view;
  const geo = useRef({ plot, normalize });
  geo.current = { plot, normalize };

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      const { plot: p, normalize: norm } = geo.current;
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const next = { ...v };
      if (e.shiftKey && !norm) {
        const f = Math.exp(e.deltaY * 0.0015);
        const c = v.hi - ((my - p.y) / p.h) * (v.hi - v.lo);
        next.lo = c - (c - v.lo) * f;
        next.hi = c + (v.hi - c) * f;
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const dt = (e.deltaX / p.w) * (v.t1 - v.t0);
        next.t0 += dt;
        next.t1 += dt;
      } else {
        const f = Math.exp(e.deltaY * 0.0015);
        const c = v.t0 + ((mx - p.x) / p.w) * (v.t1 - v.t0);
        next.t0 = c - (c - v.t0) * f;
        next.t1 = c + (v.t1 - c) * f;
        if (next.t1 - next.t0 < 0.05) return;
      }
      setManual(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const startPan = (e: RPointerEvent) => {
    const start = { x: e.clientX, y: e.clientY, v: { ...view } };
    const move = (ev: PointerEvent) => {
      const dt = ((ev.clientX - start.x) / plot.w) * (start.v.t1 - start.v.t0);
      const dv = ((ev.clientY - start.y) / plot.h) * (start.v.hi - start.v.lo);
      setManual({ t0: start.v.t0 - dt, t1: start.v.t1 - dt, lo: normalize ? start.v.lo : start.v.lo + dv, hi: normalize ? start.v.hi : start.v.hi + dv });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const fit = (what: 'all' | 'selected') => {
    if (what === 'all' || !selKeys.length) return setManual(null);
    const ks = visible.flatMap((c) => c.prop.keys.filter((k) => selSet.has(k.id)));
    if (!ks.length) return setManual(null);
    const t0 = Math.min(...ks.map((k) => k.t));
    const t1 = Math.max(...ks.map((k) => k.t));
    const pad = Math.max((t1 - t0) * 0.25, 0.3);
    setManual({ ...scales.auto, t0: t0 - pad, t1: t1 + pad });
  };

  /* ---- keyframe geometry in the current mode */
  const keySpeed = (prop: Prop, i: number): number => {
    const o = outSpeed(prop, i);
    if (o) return o.speed;
    const inn = i > 0 ? inSpeed(prop, i - 1) : null;
    return inn ? inn.speed : 0;
  };

  /* ---- dragging keyframes */
  const dragKey = (e: RPointerEvent, ch: Channel, k: Keyframe, c: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setActive(ch.id);
    const wasSelected = selSet.has(k.id);
    if (e.shiftKey) selectKeys([k.id], true);
    else if (!wasSelected) selectKeys([k.id]);
    const ids = appStore.get().selKeys.includes(k.id) ? appStore.get().selKeys : [k.id];
    const r = rangeOf(ch);
    const start = local(e);
    const t0 = k.t;
    const v0 = compsOf(k.v);
    let applied = 0;
    let moved = false;
    freeze();
    beginGesture();
    const move = (ev: PointerEvent) => {
      const p = local(ev);
      if (!moved && Math.hypot(p.x - start.x, p.y - start.y) < 3) return;
      moved = true;
      let axis: 'x' | 'y' | null = null;
      if (ev.shiftKey) axis = Math.abs(p.x - start.x) >= Math.abs(p.y - start.y) ? 'x' : 'y';
      if (axis !== 'y') {
        let target = tAt(plot.x + (p.x - start.x) + ((t0 - view.t0) / (view.t1 - view.t0)) * plot.w);
        if (snapOn && !ev.altKey) target = snapToFrame(target, comp.fps);
        const dt = target - t0;
        if (Math.abs(dt - applied) > 1e-9) {
          moveKeys(ids, dt - applied);
          applied = dt;
        }
      }
      if (mode === 'value' && axis !== 'x') {
        const dv = vAt(r, p.y) - vAt(r, start.y);
        const nv = [...v0];
        nv[c] = v0[c] + dv;
        if (ch.prop.min !== undefined) nv[c] = Math.max(ch.prop.min, nv[c]);
        if (ch.prop.max !== undefined) nv[c] = Math.min(ch.prop.max, nv[c]);
        setKeyValue(k.id, typeof k.v === 'number' ? nv[0] : nv);
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      endGesture();
      setFrozen(null);
      if (!moved && !e.shiftKey && ids.length > 1) selectKeys([k.id]);
      else if (!moved && e.shiftKey && wasSelected) selectKeys(appStore.get().selKeys.filter((id) => id !== k.id));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /* ---- dragging bezier handles */
  const dragHandle = (e: RPointerEvent, ch: Channel, i: number, which: 'out' | 'in', c: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setActive(ch.id);
    const prop = ch.prop;
    const segment = which === 'out' ? i : i - 1;
    const r = rangeOf(ch);
    freeze();
    beginGesture();
    const move = (ev: PointerEvent) => {
      const p = local(ev);
      const t = tAt(p.x);
      const live = comp.layers.find((l) => l.id === ch.layer.id);
      const cur = live && layerPropEntries(live).find((x) => x.group === ch.group && x.key === ch.key)?.prop;
      if (!cur || !cur.keys[segment] || !cur.keys[segment + 1]) return;
      const k0 = cur.keys[segment];
      const k1 = cur.keys[segment + 1];
      const updates: { id: string; ease: Ease }[] = [];
      if (mode === 'value') {
        const ease = easeFromValueHandle(k0, k1, c, which, t, vAt(r, p.y));
        if (ease) updates.push({ id: k0.id, ease });
      } else {
        const dur = k1.t - k0.t;
        const influence = which === 'out' ? (t - k0.t) / dur : (k1.t - t) / dur;
        const speed = vAt(r, p.y);
        const ease = which === 'out' ? withOutSpeed(cur, segment, { influence, speed }) : withInSpeed(cur, segment, { influence, speed });
        if (ease) updates.push({ id: k0.id, ease });
        if (link) {
          // keep the speed continuous through the keyframe: set the other side to the same speed
          const other = which === 'out' ? segment - 1 : segment + 1;
          const o = which === 'out' ? inSpeed(cur, other) : outSpeed(cur, other);
          if (o && cur.keys[other] && cur.keys[other + 1]) {
            const e2 = which === 'out' ? withInSpeed(cur, other, { influence: o.influence, speed }) : withOutSpeed(cur, other, { influence: o.influence, speed });
            if (e2) updates.push({ id: cur.keys[other].id, ease: e2 });
          }
        }
      }
      setKeyEases(updates);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      endGesture();
      setFrozen(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    void prop;
  };

  /* ---- background: marquee select, or pan with Alt / middle button */
  const backgroundDown = (e: RPointerEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      return startPan(e);
    }
    if (e.button !== 0) return;
    const s = local(e);
    const additive = e.shiftKey;
    let dragged = false;
    const move = (ev: PointerEvent) => {
      const p = local(ev);
      if (!dragged && Math.hypot(p.x - s.x, p.y - s.y) < 4) return;
      dragged = true;
      setMarquee({ x0: s.x, y0: s.y, x1: p.x, y1: p.y });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setMarquee(null);
      if (!dragged) {
        if (!additive) selectKeys([]);
        return;
      }
      const p = local(ev);
      const [xa, xb] = [Math.min(s.x, p.x), Math.max(s.x, p.x)];
      const [ya, yb] = [Math.min(s.y, p.y), Math.max(s.y, p.y)];
      const hit: string[] = [];
      for (const ch of visible) {
        const r = rangeOf(ch);
        ch.prop.keys.forEach((k, i) => {
          const x = tx(k.t);
          if (x < xa || x > xb) return;
          const ys = mode === 'speed' ? [vy(r, keySpeed(ch.prop, i))] : compsOf(k.v).map((v) => vy(r, v));
          if (ys.some((y) => y >= ya && y <= yb)) hit.push(k.id);
        });
      }
      selectKeys(hit, additive);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const scrub = (e: RPointerEvent) => {
    e.preventDefault();
    const at = (ev: { clientX: number; clientY: number }) => setTime(Math.min(comp.duration, Math.max(0, snapToFrame(tAt(local(ev).x), comp.fps))));
    at(e);
    const move = (ev: PointerEvent) => at(ev);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /* ---- drawing */
  const samples = Math.min(500, Math.max(120, Math.round(plot.w / 2)));
  const curves = useMemo(() => {
    return visible.map((ch) => {
      const r = normalize ? (frozen?.ranges[ch.id] ?? scales.ranges[ch.id]) : (frozen?.shared ?? { lo: view.lo, hi: view.hi });
      const nComp = mode === 'speed' ? 1 : ch.comps;
      const paths: string[] = [];
      for (let c = 0; c < nComp; c++) {
        let d = '';
        for (let i = 0; i <= samples; i++) {
          const t = view.t0 + ((view.t1 - view.t0) * i) / samples;
          const v = mode === 'speed' ? speedAt(ch.prop, t) : compsOf(baseValue(ch.prop, t))[c];
          const x = plot.x + ((t - view.t0) / (view.t1 - view.t0)) * plot.w;
          const y = plot.y + ((r.hi - v) / (r.hi - r.lo)) * plot.h;
          d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
        }
        paths.push(d);
      }
      return { ch, paths };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mode, normalize, scales, frozen, view.t0, view.t1, view.lo, view.hi, plot.x, plot.y, plot.w, plot.h, samples]);

  const activeCh = visible.find((c) => c.id === active) ?? visible[0] ?? null;
  const axisRange = activeCh ? rangeOf(activeCh) : { lo: view.lo, hi: view.hi };
  const yTicks = niceTicks(axisRange.lo, axisRange.hi, Math.max(3, Math.round(plot.h / 38)));
  const tStep = timeStep(plot.w / (view.t1 - view.t0));
  const xTicks: number[] = [];
  for (let t = Math.ceil(view.t0 / tStep) * tStep; t <= view.t1; t += tStep) xTicks.push(Math.round(t / tStep) * tStep);

  /* ---- selected key readout and handles */
  const selectedKeys: { ch: Channel; k: Keyframe; i: number }[] = [];
  for (const ch of visible) ch.prop.keys.forEach((k, i) => selSet.has(k.id) && selectedKeys.push({ ch, k, i }));
  const first = selectedKeys[0];
  const readout = first
    ? (() => {
        const o = outSpeed(first.ch.prop, first.i);
        const n = first.i > 0 ? inSpeed(first.ch.prop, first.i - 1) : null;
        const value = compsOf(first.k.v).map(fmt).join(', ');
        const sp = [n ? `in ${fmt(n.speed)}/s · ${Math.round(n.influence * 100)}%` : '', o ? `out ${fmt(o.speed)}/s · ${Math.round(o.influence * 100)}%` : ''].filter(Boolean).join('   ');
        return `${first.ch.label}  ·  ${first.k.t.toFixed(2)} s  ·  ${value}${sp ? `   |   ${sp}` : ''}${selectedKeys.length > 1 ? `   (+${selectedKeys.length - 1} more)` : ''}`;
      })()
    : '';

  const addKey = useCallback(() => {
    const t = timeStore.get().t;
    const targets = visible.filter((c) => !c.prop.keys.some((k) => Math.abs(k.t - t) <= 0.5 / comp.fps)).map((c) => ({ layerId: c.layer.id, group: c.group, key: c.key }));
    if (targets.length) toggleKeyHereMany(targets);
  }, [visible, comp.fps]);

  const set = (patch: Partial<ReturnType<typeof appStore.get>>) => appStore.set(patch);
  const noneSelected = selKeys.length === 0;
  const expandedH = appStore.get().tlHeight;

  return (
    <div className="graph" data-testid="graph-editor">
      <div className="graph-bar">
        <div className="seg" data-testid="graph-mode">
          <button className={mode === 'value' ? 'on' : ''} onClick={() => (set({ graphMode: 'value' }), setManual(null))} data-testid="graph-mode-value" title="Plot each property's value over time">
            Value
          </button>
          <button className={mode === 'speed' ? 'on' : ''} onClick={() => (set({ graphMode: 'speed' }), setManual(null))} data-testid="graph-mode-speed" title="Plot how fast each property changes. Drag the handles to set speed and influence.">
            Speed
          </button>
        </div>
        <span className="tl-sep" />
        <button className="chip" disabled={noneSelected} onClick={() => applyKeyEase(selKeys, 'linear')} data-testid="graph-linear" title="Straight lines between the selected keyframes">
          Linear
        </button>
        <button className="chip" disabled={noneSelected} onClick={() => applyKeyEase(selKeys, 'both')} data-testid="graph-easy" title="Easy ease (F9)">
          Easy ease
        </button>
        <button className="chip" disabled={noneSelected} onClick={() => applyKeyEase(selKeys, 'hold')} data-testid="graph-hold" title="Hold: jump to the next value">
          Hold
        </button>
        <button className="chip" disabled={!visible.length} onClick={addKey} data-testid="graph-add-key" title="Add a keyframe at the playhead on every shown property">
          <Icon name="plus" size={11} /> Key
        </button>
        <span className="tl-spacer" />
        {mode === 'speed' && (
          <button className={`tl-toggle ${link ? 'on' : ''}`} onClick={() => set({ graphLink: !link })} data-testid="graph-link" title="Keep the speed the same on both sides of a keyframe when dragging a speed handle">
            <Icon name="link" size={13} /> Link speeds
          </button>
        )}
        <button className={`tl-toggle ${normalize ? 'on' : ''}`} onClick={() => (set({ graphNormalize: !normalize }), setManual(null))} data-testid="graph-normalize" title="Stretch every curve to the full height, so properties with different units are comparable">
          <Icon name="fit" size={13} /> Fill height
        </button>
        <select className="mini-select" value={scope} onChange={(e) => (set({ graphScope: e.target.value as 'selected' | 'all' }), setManual(null))} data-testid="graph-scope" title="Which layers to show">
          <option value="selected">Selected layers</option>
          <option value="all">All layers</option>
        </select>
        <button className="icon-btn" title="Fit everything (double-click the graph)" onClick={() => fit('all')} data-testid="graph-fit">
          <Icon name="fit" size={14} />
        </button>
        <button className="icon-btn" title="Fit the selected keyframes" disabled={noneSelected} onClick={() => fit('selected')} data-testid="graph-fit-selected">
          <Icon name="select" size={13} />
        </button>
        <button
          className="icon-btn"
          title="Make the timeline panel taller or shorter"
          onClick={() => set({ tlHeight: expandedH > window.innerHeight * 0.55 ? Math.round(Math.min(330, Math.max(210, window.innerHeight * 0.34))) : Math.round(window.innerHeight * 0.7) })}
          data-testid="graph-tall"
        >
          <Icon name="chevronDown" size={14} style={{ transform: expandedH > window.innerHeight * 0.55 ? 'rotate(180deg)' : undefined }} />
        </button>
      </div>

      <div className="graph-body">
        <div className="graph-channels" data-testid="graph-channels">
          {channels.length === 0 && <div className="empty-hint">Nothing animated here yet. Turn on a property's stopwatch, or switch to All layers.</div>}
          {channels.map((ch, i) => {
            const newLayer = i === 0 || channels[i - 1].layer.id !== ch.layer.id;
            return (
              <div key={ch.id}>
                {newLayer && <div className="gc-layer">{ch.layer.name}</div>}
                <div className={`gc-row ${activeCh?.id === ch.id ? 'active' : ''} ${hidden[ch.id] ? 'off' : ''}`} onClick={() => setActive(ch.id)} data-testid="graph-channel" title={ch.label}>
                  <button
                    className="gc-eye"
                    style={{ background: hidden[ch.id] ? 'transparent' : ch.color, borderColor: ch.color }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setHidden({ ...hidden, [ch.id]: !hidden[ch.id] });
                    }}
                    title={hidden[ch.id] ? 'Show this curve' : 'Hide this curve'}
                    data-testid="graph-channel-toggle"
                  />
                  <span className="gc-name">{ch.label.slice(ch.label.indexOf('›') + 2)}</span>
                  {ch.comps > 1 && mode === 'value' && <span className="gc-comps">x · y</span>}
                </div>
              </div>
            );
          })}
        </div>

        <div className="graph-plot" ref={wrap}>
          <svg ref={svg} className="graph-svg" width={size.w} height={size.h} onDoubleClick={() => fit('all')} data-testid="graph-svg" data-mode={mode}>
            <defs>
              <clipPath id="graph-clip">
                <rect x={plot.x} y={plot.y} width={plot.w} height={plot.h} />
              </clipPath>
            </defs>
            <rect x={plot.x} y={plot.y} width={plot.w} height={plot.h} className="g-bg" onPointerDown={backgroundDown} data-testid="graph-bg" />
            <g clipPath="url(#graph-clip)" pointerEvents="none">
              {xTicks.map((t) => (
                <line key={`x${t}`} x1={tx(t)} x2={tx(t)} y1={plot.y} y2={plot.y + plot.h} className="g-grid" />
              ))}
              {yTicks.map((v) => (
                <line key={`y${v}`} x1={plot.x} x2={plot.x + plot.w} y1={vy(axisRange, v)} y2={vy(axisRange, v)} className={`g-grid ${v === 0 ? 'zero' : ''}`} />
              ))}
              {comp.workEnd > comp.workStart && (comp.workStart > 0 || comp.workEnd < comp.duration) && (
                <>
                  <rect x={plot.x} y={plot.y} width={Math.max(0, tx(comp.workStart) - plot.x)} height={plot.h} className="g-dim" />
                  <rect x={tx(comp.workEnd)} y={plot.y} width={Math.max(0, plot.x + plot.w - tx(comp.workEnd))} height={plot.h} className="g-dim" />
                </>
              )}
            </g>

            <g clipPath="url(#graph-clip)">
              {curves.map(({ ch, paths }) => (
                <g key={ch.id} className={`g-channel ${activeCh?.id === ch.id ? 'active' : ''}`} style={{ color: ch.color }} pointerEvents="none">
                  {paths.map((d, c) => (
                    <path key={c} d={d} className={`g-curve ${c > 0 ? 'second' : ''}`} data-testid="graph-curve" data-channel={ch.key} />
                  ))}
                </g>
              ))}
            </g>

            {/* handles of the selected keyframes, then the keyframes themselves */}
            <g clipPath="url(#graph-clip)">
              {selectedKeys.map(({ ch, k, i }) => {
                const r = rangeOf(ch);
                const keys = ch.prop.keys;
                const parts: ReactElement[] = [];
                const draw = (which: 'out' | 'in', segment: number) => {
                  const k0 = keys[segment];
                  const k1 = keys[segment + 1];
                  if (!k0 || !k1) return;
                  let px: number;
                  let py: number;
                  const c = dominantComponent(k0, k1);
                  if (mode === 'value') {
                    const h = valueHandles(k0, k1, c);
                    if (!h) return;
                    const [ht, hv] = which === 'out' ? h.out : h.in;
                    px = tx(ht);
                    py = vy(r, hv);
                  } else {
                    const h = which === 'out' ? outSpeed(ch.prop, segment) : inSpeed(ch.prop, segment);
                    if (!h) return;
                    const dur = k1.t - k0.t;
                    px = tx(which === 'out' ? k0.t + h.influence * dur : k1.t - h.influence * dur);
                    py = vy(r, h.speed);
                  }
                  const ax = tx(k.t);
                  const ay = mode === 'value' ? vy(r, compsOf(k.v)[c]) : vy(r, keySpeed(ch.prop, i));
                  parts.push(
                    <g key={`${k.id}-${which}`} style={{ color: ch.color }}>
                      <line x1={ax} y1={ay} x2={px} y2={py} className="g-handle-line" />
                      <circle cx={px} cy={py} r={5} className="g-handle" onPointerDown={(e) => dragHandle(e, ch, i, which, c)} data-testid={`graph-handle-${which}`} />
                    </g>,
                  );
                };
                if (i < keys.length - 1) draw('out', i);
                if (i > 0) draw('in', i - 1);
                return <g key={k.id}>{parts}</g>;
              })}
              {visible.map((ch) => {
                const r = rangeOf(ch);
                return (
                  <g key={ch.id} style={{ color: ch.color }} className={activeCh?.id === ch.id ? 'g-keys active' : 'g-keys'}>
                    {ch.prop.keys.map((k, i) => {
                      const sel = selSet.has(k.id);
                      if (mode === 'speed') {
                        const x = tx(k.t);
                        const y = vy(r, keySpeed(ch.prop, i));
                        return (
                          <path
                            key={k.id}
                            d={`M${x},${y - 6} L${x + 6},${y} L${x},${y + 6} L${x - 6},${y} Z`}
                            className={`g-key ${sel ? 'sel' : ''}`}
                            onPointerDown={(e) => dragKey(e, ch, k, 0)}
                            data-testid="graph-key"
                            data-id={k.id}
                          />
                        );
                      }
                      return compsOf(k.v).map((v, c) => (
                        <circle
                          key={`${k.id}:${c}`}
                          cx={tx(k.t)}
                          cy={vy(r, v)}
                          r={c === 0 ? 5 : 4}
                          className={`g-key ${sel ? 'sel' : ''} ${c > 0 ? 'second' : ''}`}
                          onPointerDown={(e) => dragKey(e, ch, k, c)}
                          data-testid="graph-key"
                          data-id={k.id}
                          data-comp={c}
                        />
                      ));
                    })}
                  </g>
                );
              })}
            </g>

            {marquee && <rect x={Math.min(marquee.x0, marquee.x1)} y={Math.min(marquee.y0, marquee.y1)} width={Math.abs(marquee.x1 - marquee.x0)} height={Math.abs(marquee.y1 - marquee.y0)} className="g-marquee" pointerEvents="none" />}

            {/* axes */}
            <rect x={0} y={0} width={size.w} height={RULER} className="g-ruler" onPointerDown={scrub} data-testid="graph-ruler" />
            {xTicks.map((t) => (
              <g key={`xl${t}`} pointerEvents="none">
                <line x1={tx(t)} x2={tx(t)} y1={RULER - 6} y2={RULER} className="g-tick" />
                <text x={tx(t) + 3} y={RULER - 9} className="g-label">
                  {t.toFixed(decimalsFor(tStep))}s
                </text>
              </g>
            ))}
            {yTicks.map((v) => {
              const y = vy(axisRange, v);
              if (y < plot.y + 4 || y > plot.y + plot.h - 2) return null;
              return (
                <text key={`yl${v}`} x={GUTTER - 6} y={y + 3} textAnchor="end" className="g-label" pointerEvents="none">
                  {fmt(v)}
                </text>
              );
            })}
            {mode === 'speed' && (
              <text x={6} y={RULER + 12} className="g-unit" pointerEvents="none">
                /s
              </text>
            )}
            <GraphPlayhead tx={tx} plot={plot} view={view} />
          </svg>
          {visible.length === 0 && channels.length > 0 && <div className="graph-empty">All curves are hidden. Click a colour dot in the list to show one.</div>}
          {channels.length === 0 && <div className="graph-empty">Animate a property to see its curve here.</div>}
          <div className="graph-readout" data-testid="graph-readout">
            {readout || (visible.length ? 'Click a keyframe to select it and show its handles. Drag to move it; Shift+drag locks the direction. Scroll to zoom, Alt+drag to pan.' : '')}
          </div>
        </div>
      </div>
    </div>
  );
}

function GraphPlayhead({ tx, plot, view }: { tx: (t: number) => number; plot: { x: number; y: number; w: number; h: number }; view: View }) {
  const t = useTime();
  if (t < view.t0 || t > view.t1) return null;
  const x = tx(t);
  return (
    <g pointerEvents="none">
      <line x1={x} x2={x} y1={0} y2={plot.y + plot.h} className="g-playhead" />
      <path d={`M${x - 6},0 L${x + 6},0 L${x},9 Z`} className="g-playhead-cap" />
    </g>
  );
}
