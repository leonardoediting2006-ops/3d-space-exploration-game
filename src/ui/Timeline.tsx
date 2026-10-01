import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { getEffectDef } from '../core/effectDefs';
import { snapToFrame, timecode, parseTimecode } from '../core/time';
import {
  BLEND_MODES,
  LABEL_COLORS,
  MATTE_MODES,
  TRANSFORM_KEYS,
  type BlendMode,
  type Comp,
  type Keyframe,
  type Layer,
  type MatteMode,
  type Prop,
  type PropGroup,
} from '../core/types';
import {
  applyKeyEase,
  deleteKeys,
  moveKeys,
  moveLayerToIndex,
  moveLayersInTime,
  removeEffect,
  selectKeys,
  selectLayers,
  setEffectEnabled,
  setExpanded,
  setLayerField,
  setLoop,
  setParent,
  setTime,
  setWiggle,
  setWorkArea,
  toggleKeyHere,
  toggleLayerSelected,
  timeReverseKeys,
  toggleStopwatch,
  trimLayer,
  updateComp,
} from '../state/actions';
import { appStore, beginGesture, endGesture, timeStore, useActiveComp, useApp, useTime } from '../state/store';
import { EaseEditor } from './EaseEditor';
import { PropEditor, useTimeIf } from './fields';

const LEFT_W = 600;
const RULER_H = 30;
const ROW_LAYER = 28;
const ROW_PROP = 24;

type Row =
  | { kind: 'layer'; id: string; layer: Layer; index: number }
  | { kind: 'group'; id: string; layer: Layer; label: string; depth: number; open: boolean; fxId?: string }
  | { kind: 'prop'; id: string; layer: Layer; group: PropGroup; propKey: string; prop: Prop; depth: number };

const rowHeight = (r: Row) => (r.kind === 'layer' ? ROW_LAYER : ROW_PROP);

function buildRows(comp: Comp, expanded: Record<string, boolean>, showOnly: Record<string, string[] | 'animated'>): Row[] {
  const rows: Row[] = [];
  comp.layers.forEach((layer, index) => {
    rows.push({ kind: 'layer', id: layer.id, layer, index });
    const filter = showOnly[layer.id];
    const all: { group: PropGroup; key: string; prop: Prop; path: string }[] = [];
    for (const k of TRANSFORM_KEYS) all.push({ group: 'transform', key: k, prop: layer.transform[k], path: `transform.${k}` });
    for (const [k, p] of Object.entries(layer.content)) all.push({ group: 'content', key: k, prop: p, path: `content.${k}` });
    for (const fx of layer.effects) for (const [k, p] of Object.entries(fx.props)) all.push({ group: `fx:${fx.id}`, key: k, prop: p, path: `fx.${fx.id}.${k}` });

    if (filter) {
      for (const a of all) {
        const on = filter === 'animated' ? a.prop.keys.length > 0 || !!a.prop.wiggle : filter.includes(a.path);
        if (on) rows.push({ kind: 'prop', id: `${layer.id}:${a.path}`, layer, group: a.group, propKey: a.key, prop: a.prop, depth: 1 });
      }
      return;
    }
    if (!expanded[layer.id]) return;

    const tId = `${layer.id}:transform`;
    const tOpen = expanded[tId] ?? true;
    rows.push({ kind: 'group', id: tId, layer, label: 'Transform', depth: 1, open: tOpen });
    if (tOpen) for (const k of TRANSFORM_KEYS) rows.push({ kind: 'prop', id: `${layer.id}:transform.${k}`, layer, group: 'transform', propKey: k, prop: layer.transform[k], depth: 2 });

    const contentKeys = Object.keys(layer.content);
    if (contentKeys.length) {
      const cId = `${layer.id}:content`;
      const cOpen = expanded[cId] ?? true;
      rows.push({ kind: 'group', id: cId, layer, label: layer.type === 'text' ? 'Text' : layer.type === 'shape' ? 'Contents' : 'Source', depth: 1, open: cOpen });
      if (cOpen) for (const k of contentKeys) rows.push({ kind: 'prop', id: `${layer.id}:content.${k}`, layer, group: 'content', propKey: k, prop: layer.content[k], depth: 2 });
    }
    if (layer.effects.length) {
      const eId = `${layer.id}:effects`;
      const eOpen = expanded[eId] ?? true;
      rows.push({ kind: 'group', id: eId, layer, label: 'Effects', depth: 1, open: eOpen });
      if (eOpen) {
        for (const fx of layer.effects) {
          const fId = `${layer.id}:fx:${fx.id}`;
          const fOpen = expanded[fId] ?? true;
          rows.push({ kind: 'group', id: fId, layer, label: getEffectDef(fx.type)?.name ?? fx.type, depth: 2, open: fOpen, fxId: fx.id });
          if (fOpen) for (const [k, p] of Object.entries(fx.props)) rows.push({ kind: 'prop', id: `${layer.id}:fx.${fx.id}.${k}`, layer, group: `fx:${fx.id}`, propKey: k, prop: p, depth: 3 });
        }
      }
    }
  });
  return rows;
}

/** Times a dragged layer edge or keyframe can stick to. */
function snapTargets(comp: Comp, exclude: Set<string>): number[] {
  const out = [0, comp.duration, comp.workStart, comp.workEnd, timeStore.get().t];
  for (const l of comp.layers) if (!exclude.has(l.id)) out.push(l.inPoint, l.outPoint);
  return out;
}

/** Nudge a drag delta so one of `edges` lands on a target, if any is within ~8 px. */
function snapDelta(dt: number, edges: number[], targets: number[], pps: number): number {
  let best = dt;
  let bestAbs = 8 / pps;
  for (const e of edges) {
    for (const t of targets) {
      const d = t - (e + dt);
      if (Math.abs(d) < bestAbs) {
        bestAbs = Math.abs(d);
        best = dt + d;
      }
    }
  }
  return best;
}

/** Window-level drag so a gesture survives the pointer leaving the element that started it. */
function startDrag(e: RPointerEvent, onMove: (dx: number, ev: PointerEvent) => void, onEnd?: () => void): void {
  const startX = e.clientX;
  beginGesture();
  const move = (ev: PointerEvent) => onMove(ev.clientX - startX, ev);
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    endGesture();
    onEnd?.();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

interface MenuItem {
  label: string;
  onClick: () => void;
}
interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

export function Timeline() {
  const comp = useActiveComp();
  const expanded = useApp((s) => s.expanded);
  const showOnly = useApp((s) => s.showOnly);
  const pps = useApp((s) => s.pps);
  const selection = useApp((s) => s.selection);
  const selKeys = useApp((s) => s.selKeys);
  const playing = useApp((s) => s.playing);
  const snapOn = useApp((s) => s.snap);
  const rows = useMemo(() => buildRows(comp, expanded, showOnly), [comp, expanded, showOnly]);
  const selKeySet = useMemo(() => new Set(selKeys), [selKeys]);
  const selSet = useMemo(() => new Set(selection), [selection]);

  const bodyRef = useRef<HTMLDivElement>(null);
  const leftInner = useRef<HTMLDivElement>(null);
  const rulerInner = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [easing, setEasing] = useState<{ keyId: string; x: number; y: number } | null>(null);

  const width = Math.max(comp.duration * pps + 120, 400);
  const totalH = rows.reduce((n, r) => n + rowHeight(r), 0);

  const onScroll = () => {
    const b = bodyRef.current!;
    if (leftInner.current) leftInner.current.style.transform = `translateY(${-b.scrollTop}px)`;
    if (rulerInner.current) rulerInner.current.style.transform = `translateX(${-b.scrollLeft}px)`;
  };

  // keep the playhead visible during playback
  useEffect(() => {
    if (!playing) return;
    return timeStore.subscribe(() => {
      const b = bodyRef.current;
      if (!b) return;
      const x = timeStore.get().t * appStore.get().pps;
      if (x < b.scrollLeft || x > b.scrollLeft + b.clientWidth - 40) b.scrollLeft = Math.max(0, x - 60);
    });
  }, [playing]);

  const timeFromEvent = (clientX: number): number => {
    const r = rulerInner.current!.getBoundingClientRect();
    return (clientX - r.left) / pps;
  };

  const scrub = (e: RPointerEvent) => {
    e.preventDefault();
    setTime(timeFromEvent(e.clientX));
    const move = (ev: PointerEvent) => setTime(timeFromEvent(ev.clientX));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onWheelBody = (e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const b = bodyRef.current!;
    const rect = b.getBoundingClientRect();
    const tAtCursor = (e.clientX - rect.left + b.scrollLeft) / pps;
    const next = Math.min(800, Math.max(8, pps * Math.exp(-e.deltaY / 300)));
    appStore.set({ pps: next });
    requestAnimationFrame(() => {
      b.scrollLeft = tAtCursor * next - (e.clientX - rect.left);
      onScroll();
    });
  };

  const openMenu = (e: React.MouseEvent, items: MenuItem[]) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  const selectLayer = (layer: Layer, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
    if (e.ctrlKey || e.metaKey) toggleLayerSelected(layer.id);
    else if (e.shiftKey && selection.length) {
      const idxs = [...selection, layer.id].map((id) => comp.layers.findIndex((l) => l.id === id));
      const lo = Math.min(...idxs);
      const hi = Math.max(...idxs);
      selectLayers(comp.layers.slice(lo, hi + 1).map((l) => l.id));
    } else if (!selSet.has(layer.id) || selection.length > 1) selectLayers([layer.id]);
  };

  const keyMenu = (e: React.MouseEvent, k: Keyframe) => {
    const ids = selKeySet.has(k.id) ? selKeys : [k.id];
    if (!selKeySet.has(k.id)) selectKeys([k.id]);
    openMenu(e, [
      { label: 'Easy Ease  (F9)', onClick: () => applyKeyEase(ids, 'both') },
      { label: 'Easy Ease In  (Shift+F9)', onClick: () => applyKeyEase(ids, 'in') },
      { label: 'Easy Ease Out  (Ctrl+Shift+F9)', onClick: () => applyKeyEase(ids, 'out') },
      { label: 'Linear', onClick: () => applyKeyEase(ids, 'linear') },
      { label: 'Hold', onClick: () => applyKeyEase(ids, 'hold') },
      { label: 'Edit Easing Curve…', onClick: () => setEasing({ keyId: k.id, x: e.clientX, y: e.clientY }) },
      { label: 'Time-Reverse Keyframes', onClick: () => timeReverseKeys(ids) },
      { label: 'Delete Keyframe', onClick: () => deleteKeys(ids) },
    ]);
  };

  const propMenu = (e: React.MouseEvent, row: Extract<Row, { kind: 'prop' }>) => {
    const { layer, group, propKey, prop } = row;
    const items: MenuItem[] = [];
    if (prop.kind !== 'color' && !prop.options) {
      items.push(
        prop.wiggle
          ? { label: 'Remove Wiggle', onClick: () => setWiggle(layer.id, group, propKey, null) }
          : { label: 'Add Wiggle', onClick: () => setWiggle(layer.id, group, propKey, { freq: 2, amp: prop.kind === 'vec2' ? 40 : 10, seed: Math.floor(Math.random() * 1000) }) },
      );
      if (prop.wiggle) {
        const w = prop.wiggle;
        items.push({ label: 'Wiggle: More Amplitude', onClick: () => setWiggle(layer.id, group, propKey, { ...w, amp: w.amp * 1.5 }) });
        items.push({ label: 'Wiggle: Less Amplitude', onClick: () => setWiggle(layer.id, group, propKey, { ...w, amp: w.amp / 1.5 }) });
        items.push({ label: 'Wiggle: Faster', onClick: () => setWiggle(layer.id, group, propKey, { ...w, freq: w.freq * 1.5 }) });
        items.push({ label: 'Wiggle: Slower', onClick: () => setWiggle(layer.id, group, propKey, { ...w, freq: w.freq / 1.5 }) });
      }
    }
    if (prop.keys.length > 1) {
      items.push({ label: prop.loop === 'cycle' ? 'Remove Loop' : 'Loop Out: Cycle', onClick: () => setLoop(layer.id, group, propKey, prop.loop === 'cycle' ? null : 'cycle') });
      items.push({ label: prop.loop === 'pingpong' ? 'Remove Loop' : 'Loop Out: Ping-Pong', onClick: () => setLoop(layer.id, group, propKey, prop.loop === 'pingpong' ? null : 'pingpong') });
    }
    if (prop.keys.length) {
      items.push({ label: 'Select All Keyframes', onClick: () => selectKeys(prop.keys.map((k) => k.id)) });
    }
    if (items.length) openMenu(e, items);
  };

  // layer reordering (drag the number column)
  const reorder = (e: RPointerEvent, layer: Layer, from: number) => {
    e.preventDefault();
    const rowsEls = () => Array.from(document.querySelectorAll<HTMLElement>('[data-layer-index]'));
    let target = from;
    const move = (ev: PointerEvent) => {
      const els = rowsEls();
      let best = from;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (ev.clientY >= r.top && ev.clientY < r.bottom) best = Number(el.dataset.layerIndex);
      }
      if (ev.clientY < (els[0]?.getBoundingClientRect().top ?? 0)) best = 0;
      target = best;
      setDropIndex(best);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDropIndex(null);
      if (target !== from) moveLayerToIndex(layer.id, target);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const fitWidth = () => {
    const b = bodyRef.current;
    if (!b) return;
    appStore.set({ pps: Math.max(8, (b.clientWidth - 60) / comp.duration) });
    b.scrollLeft = 0;
    onScroll();
  };

  const gridStyle: CSSProperties = { backgroundSize: `${pps}px 100%` };

  return (
    <div className="timeline" data-testid="timeline" onPointerDown={() => menu && setMenu(null)}>
      <div className="tl-header">
        <TimeDisplay comp={comp} />
        <span className="tl-sep" />
        <button
          className={comp.motionBlur ? 'on' : ''}
          title="Enable motion blur for layers that have it switched on"
          onClick={() => updateComp(comp.id, { motionBlur: !comp.motionBlur })}
          data-testid="comp-motion-blur"
        >
          ◐ Motion Blur
        </button>
        <button className={snapOn ? 'on' : ''} title="Snap layer edges and keyframes to the playhead and other layers (hold Alt to bypass)" onClick={() => appStore.set({ snap: !snapOn })} data-testid="snap-toggle">
          ⌖ Snap
        </button>
        <span className="tl-spacer" />
        <button title="Fit timeline to window" onClick={fitWidth}>⇔</button>
        <input
          className="tl-zoom"
          type="range"
          min={Math.log(8)}
          max={Math.log(800)}
          step={0.01}
          value={Math.log(pps)}
          title="Zoom timeline"
          onChange={(e) => appStore.set({ pps: Math.exp(Number(e.target.value)) })}
        />
      </div>

      <div className="tl-main" style={{ gridTemplateColumns: `${LEFT_W}px 1fr`, gridTemplateRows: `${RULER_H}px 1fr` }}>
        <div className="tl-corner">
          <span style={{ width: 80 }} />
          <span style={{ width: 26 }}>#</span>
          <span style={{ flex: 1 }}>Layer Name</span>
          <span style={{ width: 28 }} title="Motion blur">◐</span>
          <span style={{ width: 98 }}>Mode</span>
          <span style={{ width: 98 }}>Track Matte</span>
          <span style={{ width: 96 }}>Parent</span>
        </div>

        <div className="tl-ruler-clip">
          <div ref={rulerInner} className="tl-ruler" style={{ width }} onPointerDown={scrub}>
            <RulerMarks comp={comp} pps={pps} />
            <WorkArea comp={comp} pps={pps} />
            <PlayheadHandle pps={pps} />
          </div>
        </div>

        <div className="tl-left-clip" onWheel={(e) => bodyRef.current && (bodyRef.current.scrollTop += e.deltaY)}>
          <div ref={leftInner} className="tl-left" style={{ height: totalH }}>
            {rows.map((r) => (
              <div key={r.id} className={`tl-lrow ${r.kind}`} style={{ height: rowHeight(r) }}>
                {r.kind === 'layer' && (
                  <LayerLeft
                    layer={r.layer}
                    index={r.index}
                    comp={comp}
                    selected={selSet.has(r.layer.id)}
                    open={!!expanded[r.layer.id] || !!showOnly[r.layer.id]}
                    dropAbove={dropIndex === r.index}
                    onSelect={(e) => selectLayer(r.layer, e)}
                    onReorder={(e) => reorder(e, r.layer, r.index)}
                  />
                )}
                {r.kind === 'group' && <GroupLeft row={r} />}
                {r.kind === 'prop' && <PropLeft row={r} onMenu={(e) => propMenu(e, r)} />}
              </div>
            ))}
            {rows.length === 0 && <div className="tl-empty">No layers yet. Use the Layer menu or the tools to add some.</div>}
          </div>
        </div>

        <div ref={bodyRef} className="tl-body" onScroll={onScroll} onWheel={onWheelBody} data-testid="tl-body">
          <div className="tl-inner" style={{ width, height: Math.max(totalH, 1) }}>
            <div className="tl-grid" style={gridStyle} />
            <div className="tl-end" style={{ left: comp.duration * pps }} />
            {comp.workEnd > comp.workStart && (comp.workStart > 0 || comp.workEnd < comp.duration) && (
              <>
                <div className="tl-dim" style={{ left: 0, width: comp.workStart * pps }} />
                <div className="tl-dim" style={{ left: comp.workEnd * pps, width: Math.max(0, (comp.duration - comp.workEnd) * pps) }} />
              </>
            )}
            {(() => {
              let y = 0;
              return rows.map((r) => {
                const top = y;
                y += rowHeight(r);
                return (
                  <div key={r.id} className={`tl-rrow ${r.kind} ${r.kind === 'layer' && selSet.has(r.layer.id) ? 'sel' : ''}`} style={{ top, height: rowHeight(r) }}>
                    {r.kind === 'layer' && <LayerBar layer={r.layer} comp={comp} pps={pps} selected={selSet.has(r.layer.id)} onSelect={(e) => selectLayer(r.layer, e)} />}
                    {r.kind === 'prop' &&
                      r.prop.keys.map((k) => (
                        <KeyframeDot key={k.id} k={k} pps={pps} fps={comp.fps} selected={selKeySet.has(k.id)} onContext={keyMenu} onEdit={(ev) => setEasing({ keyId: k.id, x: ev.clientX, y: ev.clientY })} />
                      ))}
                  </div>
                );
              });
            })()}
            <Playhead pps={pps} />
          </div>
        </div>
      </div>

      {easing && <EaseEditor keyId={easing.keyId} x={easing.x} y={easing.y} onClose={() => setEasing(null)} />}

      {menu && (
        <div className="ctx-menu" style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()}>
          {menu.items.map((it) => (
            <button
              key={it.label}
              onClick={() => {
                it.onClick();
                setMenu(null);
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ header pieces */

function TimeDisplay({ comp }: { comp: Comp }) {
  const t = useTime();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  if (editing) {
    return (
      <input
        className="timecode-input"
        autoFocus
        value={text}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            const v = parseTimecode(text, comp.fps);
            if (v !== null) setTime(v);
            setEditing(false);
          }
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }
  return (
    <button
      className="timecode"
      title="Click to type a time (frames, s:f or h:mm:ss:ff)"
      onClick={() => {
        setText(timecode(t, comp.fps));
        setEditing(true);
      }}
      data-testid="timecode"
    >
      <b>{timecode(t, comp.fps)}</b>
      <small>frame {Math.round(t * comp.fps)}</small>
    </button>
  );
}

function RulerMarks({ comp, pps }: { comp: Comp; pps: number }) {
  const marks = useMemo(() => {
    const frame = 1 / comp.fps;
    const candidates = [frame, frame * 2, frame * 5, frame * 10, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    const step = candidates.find((c) => c * pps >= 70) ?? 600;
    const out: { t: number; label: string }[] = [];
    for (let t = 0; t <= comp.duration + 1e-6; t += step) out.push({ t, label: step < 1 ? timecode(t, comp.fps).slice(2) : formatSeconds(t) });
    return out;
  }, [comp.duration, comp.fps, pps]);
  return (
    <>
      {marks.map((m) => (
        <span key={m.t} className="tick" style={{ left: m.t * pps }}>
          <i />
          {m.label}
        </span>
      ))}
    </>
  );
}

function formatSeconds(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return m > 0 ? `${m}:${String(Math.round(s)).padStart(2, '0')}` : `${Number.isInteger(s) ? s : s.toFixed(1)}s`;
}

function WorkArea({ comp, pps }: { comp: Comp; pps: number }) {
  const drag = (e: RPointerEvent, mode: 'start' | 'end' | 'move') => {
    e.stopPropagation();
    e.preventDefault();
    const s0 = comp.workStart;
    const e0 = comp.workEnd;
    startDrag(e, (dx) => {
      const dt = dx / pps;
      if (mode === 'start') setWorkArea(s0 + dt, e0);
      else if (mode === 'end') setWorkArea(s0, e0 + dt);
      else {
        const len = e0 - s0;
        const a = Math.min(Math.max(0, snapToFrame(s0 + dt, comp.fps)), comp.duration - len);
        setWorkArea(a, a + len);
      }
    });
  };
  return (
    <div className="work-area" style={{ left: comp.workStart * pps, width: (comp.workEnd - comp.workStart) * pps }} onPointerDown={(e) => drag(e, 'move')} title="Work area (B / N to set at playhead)">
      <i className="wa-handle l" onPointerDown={(e) => drag(e, 'start')} />
      <i className="wa-handle r" onPointerDown={(e) => drag(e, 'end')} />
    </div>
  );
}

function Playhead({ pps }: { pps: number }) {
  const t = useTime();
  return <div className="playhead" style={{ left: t * pps }} />;
}

function PlayheadHandle({ pps }: { pps: number }) {
  const t = useTime();
  return <div className="playhead-handle" style={{ left: t * pps }} />;
}

/* ------------------------------------------------------------------ left column rows */

interface LayerLeftProps {
  layer: Layer;
  index: number;
  comp: Comp;
  selected: boolean;
  open: boolean;
  dropAbove: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onReorder: (e: RPointerEvent) => void;
}

function LayerLeft({ layer, index, comp, selected, open, dropAbove, onSelect, onReorder }: LayerLeftProps) {
  const [renaming, setRenaming] = useState(false);
  const color = LABEL_COLORS[layer.label % LABEL_COLORS.length];
  const toggleOpen = () => {
    if (appStore.get().showOnly[layer.id]) {
      const so = { ...appStore.get().showOnly };
      delete so[layer.id];
      appStore.set({ showOnly: so });
      setExpanded(layer.id, true);
    } else setExpanded(layer.id, !open);
  };
  const parents = comp.layers.filter((l) => l.id !== layer.id);
  return (
    <div className={`layer-left ${selected ? 'sel' : ''} ${dropAbove ? 'drop' : ''}`} data-layer-index={index} onPointerDown={onSelect} data-testid={`layer-row-${index}`}>
      <button className={`sw eye ${layer.visible ? 'on' : ''}`} title="Video" onClick={() => setLayerField(layer.id, { visible: !layer.visible })}>
        {layer.visible ? '◉' : '○'}
      </button>
      <button className={`sw solo ${layer.solo ? 'on' : ''}`} title="Solo" onClick={() => setLayerField(layer.id, { solo: !layer.solo })}>
        ●
      </button>
      <button className={`sw lock ${layer.locked ? 'on' : ''}`} title="Lock" onClick={() => setLayerField(layer.id, { locked: !layer.locked })}>
        {layer.locked ? '🔒' : '🔓'}
      </button>
      <button className="label-chip" style={{ background: color }} title="Label color" onClick={() => setLayerField(layer.id, { label: (layer.label + 1) % LABEL_COLORS.length })} />
      <span className="idx" title="Drag to reorder" onPointerDown={onReorder}>
        {index + 1}
      </span>
      <button className={`twirl ${open ? 'open' : ''}`} onClick={toggleOpen} title="Show properties (P S R T A U)" data-testid={`twirl-${index}`}>
        ▸
      </button>
      {renaming ? (
        <input
          className="rename"
          autoFocus
          defaultValue={layer.name}
          onFocus={(e) => e.target.select()}
          onBlur={(e) => {
            setRenaming(false);
            if (e.target.value.trim()) setLayerField(layer.id, { name: e.target.value.trim() });
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
          }}
        />
      ) : (
        <span className="lname" onDoubleClick={() => setRenaming(true)} title={`${layer.name} (${layer.type}) — double-click to rename`}>
          <em className={`ltype ${layer.type}`}>{typeGlyph(layer.type)}</em>
          {layer.name}
        </span>
      )}
      <button className={`sw mb ${layer.motionBlur ? 'on' : ''}`} title="Motion blur" onClick={() => setLayerField(layer.id, { motionBlur: !layer.motionBlur })} data-testid={`mb-${index}`}>
        ◐
      </button>
      <select className="mini-select" value={layer.blend} onChange={(e) => setLayerField(layer.id, { blend: e.target.value as BlendMode })}>
        {BLEND_MODES.map((b) => (
          <option key={b.id} value={b.id}>
            {b.label}
          </option>
        ))}
      </select>
      <select className="mini-select" disabled={index === 0} value={layer.matte} title="Uses the layer above as the matte" onChange={(e) => setLayerField(layer.id, { matte: e.target.value as MatteMode })}>
        {MATTE_MODES.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      <select className="mini-select" value={layer.parentId ?? ''} onChange={(e) => setParent(layer.id, e.target.value || null)}>
        <option value="">None</option>
        {parents.map((p) => (
          <option key={p.id} value={p.id}>
            {comp.layers.indexOf(p) + 1}. {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function typeGlyph(t: Layer['type']): string {
  return { solid: '■', shape: '★', text: 'T', image: '▣', precomp: '❏', null: '▢', adjustment: '◍' }[t];
}

function GroupLeft({ row }: { row: Extract<Row, { kind: 'group' }> }) {
  const { layer, fxId } = row;
  const fx = fxId ? layer.effects.find((e) => e.id === fxId) : undefined;
  return (
    <div className="group-left" style={{ paddingLeft: 40 + row.depth * 16 }}>
      <button className={`twirl ${row.open ? 'open' : ''}`} onClick={() => setExpanded(row.id, !row.open)}>
        ▸
      </button>
      {fx && (
        <button className={`sw fxsw ${fx.enabled ? 'on' : ''}`} title="Enable / disable effect" onClick={() => setEffectEnabled(layer.id, fx.id, !fx.enabled)}>
          fx
        </button>
      )}
      <span className="glabel">{row.label}</span>
      {fx && (
        <button className="sw danger" title="Remove effect" onClick={() => removeEffect(layer.id, fx.id)}>
          ✕
        </button>
      )}
    </div>
  );
}

function PropLeft({ row, onMenu }: { row: Extract<Row, { kind: 'prop' }>; onMenu: (e: React.MouseEvent) => void }) {
  const { layer, group, propKey, prop } = row;
  const t = useTimeIf(prop.keys.length > 0);
  const animated = prop.keys.length > 0;
  const eps = 0.5 / (appStore.get().project.comps[appStore.get().activeCompId]?.fps ?? 30);
  const atKey = animated && prop.keys.some((k) => Math.abs(k.t - t) <= eps);
  const jump = (dir: 1 | -1) => {
    const target = dir > 0 ? prop.keys.find((k) => k.t > t + eps) : [...prop.keys].reverse().find((k) => k.t < t - eps);
    if (target) setTime(target.t);
  };
  return (
    <div className="prop-left" style={{ paddingLeft: 24 + row.depth * 14 }} onContextMenu={onMenu} data-testid={`prop-${propKey}`}>
      <span className="kfnav">
        {animated && (
          <>
            <button title="Previous keyframe" onClick={() => jump(-1)}>◂</button>
            <button className={atKey ? 'on' : ''} title="Add / remove keyframe at playhead" onClick={() => toggleKeyHere(layer.id, group, propKey)}>◆</button>
            <button title="Next keyframe" onClick={() => jump(1)}>▸</button>
          </>
        )}
      </span>
      <button className={`stopwatch ${animated ? 'on' : ''}`} title="Toggle animation (stopwatch)" onClick={() => toggleStopwatch(layer.id, group, propKey)} data-testid={`sw-${propKey}`}>
        ⏱
      </button>
      <span className="plabel">
        {prop.label}
        {prop.wiggle && <i className="badge" title="Wiggle">~</i>}
        {prop.loop && <i className="badge" title={`Loop ${prop.loop}`}>∞</i>}
      </span>
      <span className="pvalue">
        <PropEditor layerId={layer.id} group={group} propKey={propKey} prop={prop} />
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ right column pieces */

function LayerBar({ layer, comp, pps, selected, onSelect }: { layer: Layer; comp: Comp; pps: number; selected: boolean; onSelect: (e: React.MouseEvent) => void }) {
  const color = LABEL_COLORS[layer.label % LABEL_COLORS.length];
  const ids = () => (selected ? appStore.get().selection : [layer.id]);
  const snap = (dt: number) => snapToFrame(dt, comp.fps);

  const dragBody = (e: RPointerEvent) => {
    onSelect(e);
    if (layer.locked || e.button !== 0) return;
    e.preventDefault();
    let applied = 0;
    const group = ids();
    const moving = new Set(group);
    const edges = comp.layers.filter((l) => moving.has(l.id)).flatMap((l) => [l.inPoint, l.outPoint]);
    const targets = snapTargets(comp, moving);
    startDrag(e, (dx, ev) => {
      const raw = dx / pps;
      const dt = snap(appStore.get().snap && !ev.altKey ? snapDelta(raw, edges, targets, pps) : raw);
      moveLayersInTime(group, dt - applied);
      applied = dt;
    });
  };
  const dragEdge = (e: RPointerEvent, edge: 'in' | 'out') => {
    e.stopPropagation();
    e.preventDefault();
    if (layer.locked) return;
    const start = edge === 'in' ? layer.inPoint : layer.outPoint;
    const targets = snapTargets(comp, new Set([layer.id]));
    startDrag(e, (dx, ev) => {
      const raw = dx / pps;
      trimLayer(layer.id, edge, start + (appStore.get().snap && !ev.altKey ? snapDelta(raw, [start], targets, pps) : raw));
    });
  };
  const style: CSSProperties = {
    left: layer.inPoint * pps,
    width: Math.max(4, (layer.outPoint - layer.inPoint) * pps),
    background: `${color}cc`,
    borderColor: color,
  };
  return (
    <div className={`layer-bar ${selected ? 'sel' : ''} ${layer.locked ? 'locked' : ''} ${layer.visible ? '' : 'hidden'}`} style={style} onPointerDown={dragBody} data-testid="layer-bar">
      <i className="edge l" onPointerDown={(e) => dragEdge(e, 'in')} />
      <span className="bar-name">{layer.name}</span>
      <i className="edge r" onPointerDown={(e) => dragEdge(e, 'out')} />
    </div>
  );
}

function KeyframeDot({ k, pps, fps, selected, onContext, onEdit }: { k: Keyframe; pps: number; fps: number; selected: boolean; onContext: (e: React.MouseEvent, k: Keyframe) => void; onEdit: (e: React.MouseEvent) => void }) {
  const down = (e: RPointerEvent) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    e.preventDefault();
    if (e.shiftKey) selectKeys([k.id], true);
    else if (!selected) selectKeys([k.id]);
    const ids = e.shiftKey || selected ? appStore.get().selKeys : [k.id];
    let applied = 0;
    const playhead = [timeStore.get().t];
    startDrag(e, (dx, ev) => {
      const raw = dx / pps;
      const dt = snapToFrame(appStore.get().snap && !ev.altKey ? snapDelta(raw, [k.t], playhead, pps) : raw, fps);
      moveKeys(ids.length ? ids : [k.id], dt - applied);
      applied = dt;
    });
  };
  const shape = k.ease === 'hold' ? 'hold' : k.ease === 'linear' ? 'linear' : 'ease';
  return (
    <i
      className={`kf ${shape} ${selected ? 'sel' : ''}`}
      style={{ left: k.t * pps }}
      onPointerDown={down}
      onContextMenu={(e) => onContext(e, k)}
      onDoubleClick={onEdit}
      title={`${timecode(k.t, fps)} — ${k.ease === 'linear' ? 'linear' : k.ease === 'hold' ? 'hold' : 'eased'}`}
      data-testid="keyframe"
    />
  );
}

