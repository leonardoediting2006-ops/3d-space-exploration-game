import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { baseValue } from '../core/interp';
import { fromStops, gradientCss, rgbCss, sampleGradient, toStops, type Stop } from '../core/gradient';
import type { Prop, PropGroup } from '../core/types';
import { setPropValue } from '../state/actions';
import { beginGesture, endGesture } from '../state/store';
import { GRADIENT_PRESETS, presetGradient } from '../templates/gradients';
import { hexToRgb, NumberField, rgbToHex, useTimeIf } from './fields';

interface Props {
  layerId: string;
  group: PropGroup;
  propKey: string;
  prop: Prop;
}

/** Inline gradient swatch; click it to edit the stops. */
export function GradientBar({ layerId, group, propKey, prop }: Props) {
  const t = useTimeIf(prop.keys.length > 0);
  const v = baseValue(prop, t) as number[];
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  return (
    <>
      <button
        className="grad-bar"
        style={{ background: gradientCss(v, 90) }}
        title="Click to edit the gradient"
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget.getBoundingClientRect())}
        data-testid="gradient-bar"
      />
      {anchor && <GradientPopover anchor={anchor} value={v} animated={prop.keys.length > 1} onClose={() => setAnchor(null)} onChange={(nv) => setPropValue(layerId, group, propKey, nv)} />}
    </>
  );
}

const W = 260;

function GradientPopover({ anchor, value, animated, onChange, onClose }: { anchor: DOMRect; value: number[]; animated: boolean; onChange: (v: number[]) => void; onClose: () => void }) {
  const stops = toStops(value);
  const [sel, setSel] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  const selIdx = Math.min(sel, stops.length - 1);
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - W - 40));
  const top = Math.min(anchor.bottom + 6, window.innerHeight - 280);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const write = (next: Stop[]) => onChange(fromStops([...next].sort((a, b) => a.pos - b.pos)));

  const posFromEvent = (clientX: number) => {
    const r = barRef.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };

  /** Drag a stop (by index at the time of the press); the selection follows it if it passes a neighbour. */
  const dragStop = (index: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSel(index);
    beginGesture();
    let cur = index;
    const move = (ev: PointerEvent) => {
      const pos = Math.round(posFromEvent(ev.clientX) * 1000) / 1000;
      const list = toStops(latest.current);
      list[cur] = { ...list[cur], pos };
      const moved = list[cur];
      list.sort((a, b) => a.pos - b.pos);
      cur = list.indexOf(moved);
      setSel(cur);
      onChange(fromStops(list));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      endGesture();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const latest = useRef(value);
  latest.current = value;

  const addStop = (e: React.PointerEvent) => {
    if (animated) return;
    const pos = posFromEvent(e.clientX);
    const next = [...stops, { pos, color: sampleGradient(value, pos) }].sort((a, b) => a.pos - b.pos);
    const idx = next.findIndex((s) => s.pos === pos);
    write(next);
    setSel(idx);
    dragStop(idx)(e);
  };

  const s = stops[selIdx];
  return createPortal(
    <div className="grad-pop" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()} data-testid="gradient-popover">
      <header>
        <b>Gradient</b>
        <button className="mini" onClick={onClose}>✕</button>
      </header>
      <div className="gp-bar" ref={barRef} style={{ background: gradientCss(value, 90) }} onPointerDown={addStop} title={animated ? 'Remove the animation to add stops' : 'Click to add a stop'} />
      <div className="gp-handles" style={{ width: W }}>
        {stops.map((st, i) => (
          <div
            key={i}
            className={`gp-handle ${i === selIdx ? 'sel' : ''}`}
            style={{ left: `${st.pos * 100}%`, background: rgbCss(st.color) }}
            onPointerDown={dragStop(i)}
            onDoubleClick={() => !animated && stops.length > 2 && write(stops.filter((_, j) => j !== i))}
            data-testid="gradient-stop"
          />
        ))}
      </div>
      {s && (
        <div className="gp-row">
          <input type="color" value={rgbToHex(s.color)} onChange={(e) => write(stops.map((x, i) => (i === selIdx ? { ...x, color: hexToRgb(e.target.value) } : x)))} data-testid="gradient-stop-color" />
          <span className="gp-label">Position</span>
          <NumberField value={s.pos * 100} min={0} max={100} step={0.5} decimals={1} unit="%" onChange={(pv) => write(stops.map((x, i) => (i === selIdx ? { ...x, pos: pv / 100 } : x)))} />
          <button className="mini danger" disabled={animated || stops.length <= 2} title="Delete this stop" onClick={() => write(stops.filter((_, i) => i !== selIdx))}>
            Delete
          </button>
        </div>
      )}
      <div className="gp-row">
        <button className="mini" onClick={() => write(stops.map((x) => ({ ...x, pos: 1 - x.pos })))}>Reverse</button>
        <button className="mini" onClick={() => write(stops.map((x, i) => ({ ...x, pos: stops.length === 1 ? 0 : i / (stops.length - 1) })))}>Even spacing</button>
        <select
          className="mini-select"
          value=""
          onChange={(e) => {
            const p = GRADIENT_PRESETS.find((g) => g.id === e.target.value);
            if (p && !animated) onChange(presetGradient(p));
          }}
        >
          <option value="">Preset…</option>
          {GRADIENT_PRESETS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>
      {animated && <div className="note">This gradient is keyframed, so its stop count is fixed. Colours and positions can still be edited.</div>}
    </div>,
    document.body,
  );
}
