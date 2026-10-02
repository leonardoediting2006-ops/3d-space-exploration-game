import { useRef } from 'react';
import { EASE_IN, EASE_OUT, EASY_EASE, easeProgress, type Bezier } from '../core/interp';
import { findKey } from '../core/props';
import type { Ease } from '../core/types';
import { EASING_PRESETS } from '../templates/easing';
import { setKeysEase } from '../state/actions';
import { beginGesture, endGesture, useActiveComp } from '../state/store';
import { EaseThumb } from './EaseThumb';
import { Icon } from './Icon';
import { Popover, useAnchor } from './Popover';

const SIZE = 200;
const PAD = 14;
const Y_MIN = -0.5;
const Y_MAX = 1.5;

const toPx = (x: number, y: number): [number, number] => [PAD + x * (SIZE - 2 * PAD), PAD + ((Y_MAX - y) / (Y_MAX - Y_MIN)) * (SIZE - 2 * PAD)];
const round = (n: number) => Math.round(n * 1000) / 1000;
const LINEAR_HANDLES: Bezier = [1 / 3, 1 / 3, 2 / 3, 2 / 3];
const same = (a: Ease, b: Ease) => JSON.stringify(a) === JSON.stringify(b);

const QUICK: { label: string; ease: Ease }[] = [
  { label: 'Linear', ease: 'linear' },
  { label: 'Ease', ease: [...EASY_EASE] },
  { label: 'In', ease: [...EASE_IN] },
  { label: 'Out', ease: [...EASE_OUT] },
];

interface EasePanelProps {
  ease: Ease;
  onChange: (ease: Ease) => void;
  title?: string;
  /** Show the Hold option (a keyframe can hold its value; a whole animation cannot). */
  allowHold?: boolean;
  /** Explain why there is nothing to edit yet, instead of the curve. */
  note?: string;
}

/**
 * Edits one easing curve: drag the two bezier handles (pull past the box to overshoot), or pick a
 * curve from the gallery. Used for a keyframe's outgoing segment and for a whole library animation.
 */
export function EasePanel({ ease, onChange, title, allowHold = true, note }: EasePanelProps) {
  const svg = useRef<SVGSVGElement>(null);
  const latest = useRef(ease);
  latest.current = ease;

  const gallery = (
    <div className="ee-gallery" data-testid="ease-gallery">
      {EASING_PRESETS.map((p) => (
        <button key={p.id} className="ee-item" title={p.name} onClick={() => onChange(p.ease)} data-testid={`ease-${p.id}`}>
          <EaseThumb ease={p.ease} size={38} active={same(p.ease, ease)} />
        </button>
      ))}
    </div>
  );
  const quick = (
    <div className="ee-quick">
      {QUICK.map((q) => (
        <button key={q.label} className={`chip ${same(q.ease, ease) ? 'on' : ''}`} onClick={() => onChange(q.ease)}>
          {q.label}
        </button>
      ))}
      {allowHold && (
        <button className={`chip ${ease === 'hold' ? 'on' : ''}`} onClick={() => onChange('hold')}>
          Hold
        </button>
      )}
    </div>
  );
  const head = <div className="ee-title">{title ?? 'Easing'}</div>;

  if (note !== undefined || ease === 'hold') {
    return (
      <div className="ease-panel" data-testid="ease-editor">
        {head}
        <p className="note">{note ?? 'This keyframe holds its value until the next one. Pick a curve to ease it.'}</p>
        {note === undefined && quick}
        {note === undefined && gallery}
      </div>
    );
  }

  if (typeof ease === 'string' && ease !== 'linear') {
    // a named procedural curve: show it, but it has no bezier handles to drag
    const n = 48;
    let d = '';
    for (let i = 0; i <= n; i++) {
      const [px, py] = toPx(i / n, easeProgress(ease, i / n));
      d += `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)} `;
    }
    return (
      <div className="ease-panel" data-testid="ease-editor">
        {head}
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <rect x={PAD} y={toPx(0, 1)[1]} width={SIZE - 2 * PAD} height={toPx(0, 0)[1] - toPx(0, 1)[1]} className="ee-box" />
          <path d={d} className="ee-curve" />
        </svg>
        <div className="ee-values">{ease} — a procedural curve</div>
        {quick}
        {gallery}
      </div>
    );
  }

  const b: Bezier = ease === 'linear' ? LINEAR_HANDLES : [ease[0], ease[1], ease[2], ease[3]];
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
      const e0 = latest.current;
      const base: Bezier = Array.isArray(e0) ? [e0[0], e0[1], e0[2], e0[3]] : [...LINEAR_HANDLES];
      if (which === 0) {
        base[0] = nx;
        base[1] = ny;
      } else {
        base[2] = nx;
        base[3] = ny;
      }
      onChange([round(base[0]), round(base[1]), round(base[2]), round(base[3])]);
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
    <div className="ease-panel" data-testid="ease-editor">
      {head}
      <svg ref={svg} width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <rect x={PAD} y={toPx(0, 1)[1]} width={SIZE - 2 * PAD} height={toPx(0, 0)[1] - toPx(0, 1)[1]} className="ee-box" />
        <line x1={p0x} y1={p0y} x2={h1x} y2={h1y} className="ee-handle-line" />
        <line x1={p3x} y1={p3y} x2={h2x} y2={h2y} className="ee-handle-line" />
        <path d={`M${p0x},${p0y} C${h1x},${h1y} ${h2x},${h2y} ${p3x},${p3y}`} className="ee-curve" />
        <circle cx={h1x} cy={h1y} r={6} className="ee-handle" onPointerDown={drag(0)} data-testid="ease-handle-1" />
        <circle cx={h2x} cy={h2y} r={6} className="ee-handle" onPointerDown={drag(1)} data-testid="ease-handle-2" />
      </svg>
      <div className="ee-values">{b.map((v) => v.toFixed(2)).join(', ')}</div>
      {quick}
      {gallery}
      <div className="ee-hint">Time → right, value ↑. Drag the handles; pull above or below the box to overshoot.</div>
    </div>
  );
}

/**
 * The easing of the segment that leaves a keyframe, in a popover at a screen point (timeline
 * double-click). x is time progress, y is value progress and may overshoot.
 */
export function EaseEditor({ keyId, x, y, onClose }: { keyId: string; x: number; y: number; onClose: () => void }) {
  const comp = useActiveComp();
  const found = findKey(comp.layers, keyId);
  if (!found) return null;
  const { prop, index } = found;
  const key = prop.keys[index];
  const hasNext = !!prop.keys[index + 1];
  return (
    <Popover anchor={{ left: x, right: x, top: y, bottom: y }} onClose={onClose} width={232} className="ease-pop">
      <EasePanel
        ease={key.ease}
        title={`Easing · ${prop.label}`}
        note={hasNext ? undefined : 'The last keyframe has no outgoing segment to ease.'}
        onChange={(e) => setKeysEase([keyId], e)}
      />
    </Popover>
  );
}

/** A small curve button that opens an `EasePanel`. */
export function EaseButton({ ease, onChange, title, allowHold = false, mixed = false }: { ease: Ease; onChange: (e: Ease) => void; title: string; allowHold?: boolean; mixed?: boolean }) {
  const { anchor, toggle, close } = useAnchor();
  return (
    <>
      <button className={`ease-btn ${mixed ? 'mixed' : ''}`} title={mixed ? `${title} — the layers differ; pick a curve to set them all` : `${title} — click to edit the curve`} onClick={toggle} data-testid="ease-button">
        {mixed ? <span className="mixed-text">Mixed</span> : <EaseThumb ease={ease} size={26} />}
        <Icon name="chevronDown" size={10} />
      </button>
      {anchor && (
        <Popover anchor={anchor} onClose={close} width={232} side={anchor.left > window.innerWidth / 2 ? 'left' : 'bottom'} className="ease-pop">
          <EasePanel ease={ease} title={title} allowHold={allowHold} onChange={onChange} />
        </Popover>
      )}
    </>
  );
}
