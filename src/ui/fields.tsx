import { useRef, useState, useSyncExternalStore } from 'react';
import { rgbToHex } from '../core/color';
import { beginGesture, endGesture, timeStore } from '../state/store';
import { ColorPicker } from './ColorPicker';
import { Popover, useAnchor } from './Popover';

/** Subscribe to the playhead only when `active`, so static properties never re-render per frame. */
export function useTimeIf(active: boolean): number {
  return useSyncExternalStore(timeStore.subscribe, () => (active ? timeStore.get().t : 0));
}

const fmt = (v: number, decimals: number) => (decimals <= 0 ? String(Math.round(v)) : v.toFixed(decimals));

/** How an edit should reach several layers that disagree: 'set' makes them all equal, 'delta' moves each by the same amount. */
export type EditHow = 'set' | 'delta';

interface NumberFieldProps {
  value: number;
  /** `how` matters only when this field edits several layers at once (see EditHow). */
  onChange: (v: number, how?: EditHow) => void;
  /** The layers being edited have different values: show "Mixed" instead of one of them. */
  mixed?: boolean;
  step?: number;
  min?: number;
  max?: number;
  decimals?: number;
  unit?: string;
  title?: string;
  className?: string;
}

/**
 * A scrubbable number: drag horizontally to change it, click to type. Shift is ×10, Alt ×0.1.
 * Each drag is one undo step.
 */
export function NumberField({ value, onChange, mixed, step = 1, min, max, decimals = 1, unit = '', title, className }: NumberFieldProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const drag = useRef<{ x: number; start: number; moved: boolean } | null>(null);
  const clampV = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));

  if (editing) {
    const finish = (apply: boolean) => {
      setEditing(false);
      if (!apply) return;
      const v = parseFloat(text.replace(',', '.'));
      if (Number.isFinite(v)) onChange(clampV(v), 'set');
    };
    return (
      <input
        className={`num-input ${className ?? ''}`}
        autoFocus
        value={text}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') finish(true);
          if (e.key === 'Escape') finish(false);
        }}
      />
    );
  }

  return (
    <span
      className={`num ${mixed ? 'mixed' : ''} ${className ?? ''}`}
      title={title ?? 'Drag to scrub, click to type'}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, start: value, moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x;
        if (!d.moved && Math.abs(dx) < 3) return;
        if (!d.moved) {
          d.moved = true;
          beginGesture();
        }
        const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
        const v = clampV(d.start + dx * step * mult);
        onChange(decimals <= 0 ? Math.round(v) : Math.round(v * 10 ** (decimals + 1)) / 10 ** (decimals + 1), 'delta');
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        if (!d) return;
        if (d.moved) endGesture();
        else {
          setText(mixed ? '' : fmt(value, decimals));
          setEditing(true);
        }
      }}
    >
      {mixed ? <span className="mixed-text">Mixed</span> : fmt(value, decimals)}
      {unit && !mixed && <span className="unit">{unit}</span>}
    </span>
  );
}

export { rgbToHex };

export const hexToRgb = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

interface SliderFieldProps {
  value: number;
  onChange: (v: number, how?: EditHow) => void;
  mixed?: boolean;
  min: number;
  max: number;
  step?: number;
  decimals?: number;
  unit?: string;
  title?: string;
  className?: string;
}

/**
 * A bounded number drawn as a filled bar: drag to set it, click to type, arrow keys to nudge.
 * Short ranges map the bar to the whole range; very wide ones scrub relatively so small values stay reachable.
 */
export function SliderField({ value, onChange, mixed, min, max, step = 1, decimals = 1, unit = '', title, className }: SliderFieldProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; start: number; moved: boolean } | null>(null);
  const clampV = (v: number) => Math.min(max, Math.max(min, v));
  const round = (v: number) => (decimals <= 0 ? Math.round(v) : Math.round(v * 10 ** (decimals + 1)) / 10 ** (decimals + 1));
  const absolute = max - min <= 400;
  const ratio = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;

  if (editing) {
    const finish = (apply: boolean) => {
      setEditing(false);
      if (!apply) return;
      const v = parseFloat(text.replace(',', '.'));
      if (Number.isFinite(v)) onChange(clampV(v), 'set');
    };
    return (
      <input
        className={`num-input slider-input ${className ?? ''}`}
        autoFocus
        value={text}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') finish(true);
          if (e.key === 'Escape') finish(false);
        }}
      />
    );
  }

  return (
    <div
      ref={track}
      className={`slider ${mixed ? 'mixed' : ''} ${className ?? ''}`}
      tabIndex={0}
      role="slider"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      title={mixed ? 'The selected layers differ. Drag or type to set them all to one value; arrow keys nudge each.' : (title ?? 'Drag to change, click to type. Hold Alt for fine control.')}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, start: value, moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x;
        if (!d.moved && Math.abs(dx) < 3) return;
        if (!d.moved) {
          d.moved = true;
          beginGesture();
        }
        const w = track.current?.getBoundingClientRect().width || 1;
        let v: number;
        if (e.altKey) v = d.start + (dx / w) * (max - min) * 0.1;
        else if (absolute) v = min + ((e.clientX - track.current!.getBoundingClientRect().left) / w) * (max - min);
        else v = d.start + dx * step * (e.shiftKey ? 10 : 1);
        onChange(round(clampV(Math.round(v / step) * step)), 'set');
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        if (!d) return;
        if (d.moved) endGesture();
        else {
          setText(mixed ? '' : fmt(value, decimals));
          setEditing(true);
        }
      }}
      onKeyDown={(e) => {
        const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        e.stopPropagation();
        onChange(round(clampV(value + dir * step * (e.shiftKey ? 10 : 1))), 'delta');
      }}
    >
      {!mixed && <i className="slider-fill" style={{ width: `${ratio * 100}%` }} />}
      <span className="slider-text">
        {mixed ? <span className="mixed-text">Mixed</span> : fmt(value, decimals)}
        {unit && !mixed && <span className="unit">{unit}</span>}
      </span>
    </div>
  );
}

/** A colour swatch that opens a full picker. */
export function ColorField({ value, onChange, mixed, className }: { value: number[]; onChange: (c: [number, number, number]) => void; mixed?: boolean; className?: string }) {
  const { anchor, toggle, close } = useAnchor();
  return (
    <>
      <button
        className={`swatch-btn ${mixed ? 'mixed' : ''} ${className ?? ''}`}
        style={mixed ? undefined : { background: rgbToHex(value) }}
        title={mixed ? 'The selected layers have different colours — click to set them all' : `${rgbToHex(value)} — click to change`}
        onClick={toggle}
        data-testid="color-swatch"
      />
      {anchor && (
        <Popover anchor={anchor} onClose={close} width={232} side={anchor.left > window.innerWidth / 2 ? 'left' : 'bottom'} className="color-pop">
          <ColorPicker value={value} onChange={onChange} />
        </Popover>
      )}
    </>
  );
}
