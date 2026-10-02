import { useRef, useState } from 'react';
import { baseValue } from '../core/interp';
import type { Keyframe, Prop } from '../core/types';
import { setKeyTime, setKeyValue, setTime } from '../state/actions';
import { beginGesture, endGesture } from '../state/store';
import { useTimeIf } from './fields';

const W = 296;
const H = 104;
const PAD_X = 10;
const PAD_Y = 12;
const SAMPLES = 72;

interface Domain {
  t0: number;
  t1: number;
  lo: number;
  hi: number;
}

const comps = (v: number | number[]): number[] => (typeof v === 'number' ? [v] : v);

function domainOf(prop: Prop): Domain {
  const keys = prop.keys;
  const first = keys[0].t;
  const last = keys[keys.length - 1].t;
  const span = Math.max(last - first, 0.1);
  const t0 = first - span * 0.06;
  const t1 = last + span * 0.06;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i <= SAMPLES; i++) {
    for (const x of comps(baseValue(prop, first + ((last - first) * i) / SAMPLES))) {
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
    }
  }
  for (const k of keys) for (const x of comps(k.v)) {
    lo = Math.min(lo, x);
    hi = Math.max(hi, x);
  }
  if (hi - lo < 1e-6) {
    lo -= 1;
    hi += 1;
  }
  const m = (hi - lo) * 0.14;
  return { t0, t1, lo: lo - m, hi: hi + m };
}

/**
 * The value of a property over time, drawn as a curve. Drag a keyframe sideways to retime it, and
 * (for single-value properties) up or down to change its value. Click the graph to move the playhead.
 */
export function PropGraph({ prop, duration }: { prop: Prop; duration: number }) {
  const svg = useRef<SVGSVGElement>(null);
  const [frozen, setFrozen] = useState<Domain | null>(null);
  const t = useTimeIf(true);
  const d = frozen ?? domainOf(prop);
  const n = comps(prop.keys[0].v).length;
  const x = (time: number) => PAD_X + ((time - d.t0) / (d.t1 - d.t0)) * (W - 2 * PAD_X);
  const y = (v: number) => PAD_Y + ((d.hi - v) / (d.hi - d.lo)) * (H - 2 * PAD_Y);
  const timeAt = (clientX: number) => {
    const r = svg.current!.getBoundingClientRect();
    return d.t0 + ((((clientX - r.left) / r.width) * W - PAD_X) / (W - 2 * PAD_X)) * (d.t1 - d.t0);
  };
  const paths = Array.from({ length: n }, (_, c) => {
    let s = '';
    for (let i = 0; i <= SAMPLES; i++) {
      const tt = prop.keys[0].t + ((prop.keys[prop.keys.length - 1].t - prop.keys[0].t) * i) / SAMPLES;
      s += `${i === 0 ? 'M' : 'L'}${x(tt).toFixed(1)},${y(comps(baseValue(prop, tt))[c]).toFixed(1)} `;
    }
    return s;
  });

  const dragKey = (k: Keyframe) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFrozen(domainOf(prop));
    beginGesture();
    const frozenDomain = domainOf(prop);
    const move = (ev: PointerEvent) => {
      const dom = frozenDomain;
      const r = svg.current!.getBoundingClientRect();
      const tt = dom.t0 + ((((ev.clientX - r.left) / r.width) * W - PAD_X) / (W - 2 * PAD_X)) * (dom.t1 - dom.t0);
      setKeyTime(k.id, Math.min(duration, Math.max(0, tt)));
      if (n === 1) {
        const v = dom.hi - ((((ev.clientY - r.top) / r.height) * H - PAD_Y) / (H - 2 * PAD_Y)) * (dom.hi - dom.lo);
        const step = prop.step ?? 0.01;
        let nv = Math.round(v / (ev.shiftKey ? step * 10 : step / 4)) * (ev.shiftKey ? step * 10 : step / 4);
        if (prop.min !== undefined) nv = Math.max(prop.min, nv);
        if (prop.max !== undefined) nv = Math.min(prop.max, nv);
        setKeyValue(k.id, nv);
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      endGesture();
      setFrozen(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const scrub = (e: React.PointerEvent) => {
    e.preventDefault();
    setTime(timeAt(e.clientX));
    const move = (ev: PointerEvent) => setTime(timeAt(ev.clientX));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const colors = ['var(--accent)', 'var(--slot-loop)'];
  return (
    <svg ref={svg} className="prop-graph" viewBox={`0 0 ${W} ${H}`} onPointerDown={scrub} data-testid="prop-graph">
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={PAD_X} x2={W - PAD_X} y1={PAD_Y + f * (H - 2 * PAD_Y)} y2={PAD_Y + f * (H - 2 * PAD_Y)} className="pg-grid" />
      ))}
      {t >= d.t0 && t <= d.t1 && <line x1={x(t)} x2={x(t)} y1={4} y2={H - 4} className="pg-playhead" />}
      {paths.map((p, c) => (
        <path key={c} d={p} className="pg-curve" style={{ stroke: colors[c] }} />
      ))}
      {prop.keys.map((k) =>
        comps(k.v).map((v, c) => (
          <circle
            key={`${k.id}:${c}`}
            cx={x(k.t)}
            cy={y(v)}
            r={c === 0 ? 4.5 : 3.5}
            className="pg-key"
            style={{ stroke: colors[c] }}
            onPointerDown={dragKey(k)}
            data-testid="graph-key"
          >
            <title>
              {k.t.toFixed(2)}s → {comps(k.v).map((q) => Math.round(q * 100) / 100).join(', ')}
            </title>
          </circle>
        )),
      )}
    </svg>
  );
}
