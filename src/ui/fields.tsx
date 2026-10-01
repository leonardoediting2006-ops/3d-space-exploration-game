import { useRef, useState, useSyncExternalStore } from 'react';
import { beginGesture, endGesture, timeStore } from '../state/store';

/** Subscribe to the playhead only when `active`, so static properties never re-render per frame. */
export function useTimeIf(active: boolean): number {
  return useSyncExternalStore(timeStore.subscribe, () => (active ? timeStore.get().t : 0));
}

const fmt = (v: number, decimals: number) => (decimals <= 0 ? String(Math.round(v)) : v.toFixed(decimals));

interface NumberFieldProps {
  value: number;
  onChange: (v: number) => void;
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
export function NumberField({ value, onChange, step = 1, min, max, decimals = 1, unit = '', title, className }: NumberFieldProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const drag = useRef<{ x: number; start: number; moved: boolean } | null>(null);
  const clampV = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));

  if (editing) {
    const finish = (apply: boolean) => {
      setEditing(false);
      if (!apply) return;
      const v = parseFloat(text.replace(',', '.'));
      if (Number.isFinite(v)) onChange(clampV(v));
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
      className={`num ${className ?? ''}`}
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
        onChange(decimals <= 0 ? Math.round(v) : Math.round(v * 10 ** (decimals + 1)) / 10 ** (decimals + 1));
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        if (!d) return;
        if (d.moved) endGesture();
        else {
          setText(fmt(value, decimals));
          setEditing(true);
        }
      }}
    >
      {fmt(value, decimals)}
      {unit && <span className="unit">{unit}</span>}
    </span>
  );
}

export const rgbToHex = (c: number[]) =>
  '#' + [0, 1, 2].map((i) => Math.round(Math.min(255, Math.max(0, c[i] ?? 0))).toString(16).padStart(2, '0')).join('');

export const hexToRgb = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export function ColorField({ value, onChange, className }: { value: number[]; onChange: (c: [number, number, number]) => void; className?: string }) {
  const open = useRef(false);
  return (
    <input
      type="color"
      className={`color-field ${className ?? ''}`}
      value={rgbToHex(value)}
      onChange={(e) => {
        if (!open.current) {
          open.current = true;
          beginGesture();
        }
        onChange(hexToRgb(e.target.value));
      }}
      onBlur={() => {
        if (open.current) {
          open.current = false;
          endGesture();
        }
      }}
    />
  );
}
