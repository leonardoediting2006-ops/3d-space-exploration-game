import { useRef } from 'react';
import { easeProgress, type Bezier } from '../core/interp';
import { findKey } from '../core/props';
import { EASING_PRESETS } from '../templates/easing';
import { applyKeyEase, setKeyBezier, setKeysEase } from '../state/actions';
import { beginGesture, endGesture, useActiveComp } from '../state/store';
import { EaseThumb } from './EaseThumb';

const SIZE = 200;
const PAD = 14;
const Y_MIN = -0.5;
const Y_MAX = 1.5;

const toPx = (x: number, y: number): [number, number] => [PAD + x * (SIZE - 2 * PAD), PAD + ((Y_MAX - y) / (Y_MAX - Y_MIN)) * (SIZE - 2 * PAD)];

/**
 * Edits the cubic-bezier easing of the segment that leaves a keyframe — the same curve model
 * AE's influence handles describe: x is time progress, y is value progress (it may overshoot).
 */
export function EaseEditor({ keyId, x, y, onClose }: { keyId: string; x: number; y: number; onClose: () => void }) {
  const comp = useActiveComp();
  const svg = useRef<SVGSVGElement>(null);
  const found = findKey(comp.layers, keyId);
  if (!found) return null;
  const { prop, index } = found;
  const key = prop.keys[index];
  const next = prop.keys[index + 1];
  const left = Math.max(8, Math.min(x, window.innerWidth - SIZE - 40));
  const top = Math.max(8, Math.min(y, window.innerHeight - SIZE - 150));

  const gallery = (
    <div className="ee-gallery" data-testid="ease-gallery">
      {EASING_PRESETS.map((p) => (
        <button key={p.id} className="ee-item" title={p.name} onClick={() => setKeysEase([keyId], p.ease)} data-testid={`ease-${p.id}`}>
          <EaseThumb ease={p.ease} size={38} active={JSON.stringify(p.ease) === JSON.stringify(key.ease)} />
        </button>
      ))}
    </div>
  );

  if (!next || key.ease === 'hold') {
    return (
      <div className="ease-editor" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
        <header>
          <b>Easing</b>
          <button className="mini" onClick={onClose}>✕</button>
        </header>
        <p className="note">{!next ? 'The last keyframe has no outgoing segment to ease.' : 'This keyframe holds its value. Pick a curve to ease it.'}</p>
        {next && gallery}
      </div>
    );
  }

  if (typeof key.ease === 'string' && key.ease !== 'linear') {
    // a named procedural curve: show it, but it has no bezier handles to drag
    const n = 48;
    let d = '';
    for (let i = 0; i <= n; i++) {
      const [px, py] = toPx(i / n, easeProgress(key.ease, i / n));
      d += `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)} `;
    }
    return (
      <div className="ease-editor" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()} data-testid="ease-editor">
        <header>
          <b>Easing · {prop.label}</b>
          <button className="mini" onClick={onClose}>✕</button>
        </header>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <rect x={PAD} y={toPx(0, 1)[1]} width={SIZE - 2 * PAD} height={toPx(0, 0)[1] - toPx(0, 1)[1]} className="ee-box" />
          <path d={d} className="ee-curve" />
        </svg>
        <div className="ee-values">{key.ease} (procedural curve)</div>
        <button className="mini" onClick={() => applyKeyEase([keyId], 'both')}>Convert to editable bezier</button>
        {gallery}
      </div>
    );
  }

  const b: Bezier = key.ease === 'linear' ? [1 / 3, 1 / 3, 2 / 3, 2 / 3] : [key.ease[0], key.ease[1], key.ease[2], key.ease[3]];
  const [p0x, p0y] = toPx(0, 0);
  const [p3x, p3y] = toPx(1, 1);
  const [h1x, h1y] = toPx(b[0], b[1]);
  const [h2x, h2y] = toPx(b[2], b[3]);

  const drag = (which: 0 | 1) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    beginGesture();
    const move = (ev: PointerEvent) => {
      const r = svg.current!.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * SIZE;
      const py = ((ev.clientY - r.top) / r.height) * SIZE;
      const nx = Math.min(1, Math.max(0, (px - PAD) / (SIZE - 2 * PAD)));
      const ny = Math.min(Y_MAX, Math.max(Y_MIN, Y_MAX - ((py - PAD) / (SIZE - 2 * PAD)) * (Y_MAX - Y_MIN)));
      const cur = findKey(comp.layers, keyId);
      const e0 = cur ? cur.prop.keys[cur.index].ease : 'linear';
      const base: Bezier = Array.isArray(e0) ? [e0[0], e0[1], e0[2], e0[3]] : [1 / 3, 1 / 3, 2 / 3, 2 / 3];
      if (which === 0) {
        base[0] = nx;
        base[1] = ny;
      } else {
        base[2] = nx;
        base[3] = ny;
      }
      setKeyBezier(keyId, [round(base[0]), round(base[1]), round(base[2]), round(base[3])]);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      endGesture();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="ease-editor" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()} data-testid="ease-editor">
      <header>
        <b>Easing · {prop.label}</b>
        <button className="mini" onClick={onClose}>✕</button>
      </header>
      <svg ref={svg} width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <rect x={PAD} y={toPx(0, 1)[1]} width={SIZE - 2 * PAD} height={toPx(0, 0)[1] - toPx(0, 1)[1]} className="ee-box" />
        <line x1={p0x} y1={p0y} x2={h1x} y2={h1y} className="ee-handle-line" />
        <line x1={p3x} y1={p3y} x2={h2x} y2={h2y} className="ee-handle-line" />
        <path d={`M${p0x},${p0y} C${h1x},${h1y} ${h2x},${h2y} ${p3x},${p3y}`} className="ee-curve" />
        <circle cx={h1x} cy={h1y} r={6} className="ee-handle" onPointerDown={drag(0)} data-testid="ease-handle-1" />
        <circle cx={h2x} cy={h2y} r={6} className="ee-handle" onPointerDown={drag(1)} data-testid="ease-handle-2" />
      </svg>
      <div className="ee-values">{b.map((v) => v.toFixed(2)).join(', ')}</div>
      {gallery}
      <div className="ee-hint">Time → right, value ↑. Drag the handles; pull above/below the box to overshoot.</div>
    </div>
  );
}

const round = (n: number) => Math.round(n * 1000) / 1000;
