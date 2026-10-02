import { useEffect, useMemo, useRef, useState } from 'react';
import { hsvToRgb, parseHex, projectColors, rgbToHex, rgbToHsv, type HSV } from '../core/color';
import type { RGB } from '../core/types';
import { appStore, beginGesture, endGesture } from '../state/store';
import { Icon } from './Icon';

interface EyeDropperLike {
  open(): Promise<{ sRGBHex: string }>;
}
const eyeDropper = (): EyeDropperLike | null => ('EyeDropper' in window ? new (window as unknown as { EyeDropper: new () => EyeDropperLike }).EyeDropper() : null);

/** Run `move` for every pointer position until release, as one undo step. */
function dragArea(e: React.PointerEvent<HTMLElement>, move: (x: number, y: number, r: DOMRect) => void): void {
  e.preventDefault();
  const el = e.currentTarget;
  const rect = el.getBoundingClientRect();
  beginGesture();
  const at = (ev: PointerEvent) => {
    const x = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height));
    move(x, y, rect);
  };
  at(e.nativeEvent);
  const up = () => {
    window.removeEventListener('pointermove', at);
    window.removeEventListener('pointerup', up);
    endGesture();
  };
  window.addEventListener('pointermove', at);
  window.addEventListener('pointerup', up);
}

/** A compact colour picker: saturation/value square, hue strip, hex field, eyedropper, and the document's own colours. */
export function ColorPicker({ value, onChange }: { value: number[]; onChange: (c: RGB) => void }) {
  const [hsv, setHsv] = useState<HSV>(() => rgbToHsv(value));
  const [hex, setHex] = useState(() => rgbToHex(value));
  const [bad, setBad] = useState(false);
  const emitted = useRef(rgbToHex(value));

  // follow outside changes (undo, keyframe scrubbing) without losing the hue of a grey
  useEffect(() => {
    const now = rgbToHex(value);
    if (now !== emitted.current) {
      emitted.current = now;
      setHsv((h) => {
        const next = rgbToHsv(value);
        return next.s === 0 || next.v === 0 ? { ...next, h: h.h } : next;
      });
      setHex(now);
      setBad(false);
    }
  }, [value]);

  const swatches = useMemo(() => projectColors(appStore.get().project, 14), []);
  const emit = (c: RGB, next?: HSV) => {
    emitted.current = rgbToHex(c);
    setHex(emitted.current);
    setBad(false);
    if (next) setHsv(next);
    onChange(c);
  };
  const setSV = (s: number, v: number) => {
    const next = { ...hsv, s, v };
    emit(hsvToRgb(next), next);
  };
  const setH = (h: number) => {
    const next = { ...hsv, h };
    emit(hsvToRgb(next), next);
  };
  const commitHex = () => {
    const c = parseHex(hex);
    if (!c) return setBad(true);
    emit(c, rgbToHsv(c));
  };
  const dropper = eyeDropper();

  return (
    <div className="color-picker" data-testid="color-picker">
      <div
        className="cp-sv"
        style={{ background: `linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,hsl(${hsv.h},100%,50%))` }}
        onPointerDown={(e) => dragArea(e, (x, y) => setSV(x, 1 - y))}
      >
        <i className="cp-knob" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: rgbToHex(value) }} />
      </div>
      <div className="cp-hue" onPointerDown={(e) => dragArea(e, (x) => setH(x * 360))}>
        <i className="cp-knob" style={{ left: `${(hsv.h / 360) * 100}%`, background: `hsl(${hsv.h},100%,50%)` }} />
      </div>
      <div className="cp-row">
        <span className="cp-preview" style={{ background: rgbToHex(value) }} />
        <input
          className={`cp-hex ${bad ? 'bad' : ''}`}
          value={hex}
          spellCheck={false}
          maxLength={7}
          onChange={(e) => {
            setHex(e.target.value);
            const c = parseHex(e.target.value);
            setBad(!c && e.target.value.length >= 4);
            if (c && (e.target.value.length === 7 || e.target.value.length === 4)) emit(c, rgbToHsv(c));
          }}
          onBlur={commitHex}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commitHex();
          }}
          data-testid="color-hex"
        />
        {dropper && (
          <button
            className="icon-btn"
            title="Pick a colour from the screen"
            onClick={() =>
              void dropper
                .open()
                .then((r) => {
                  const c = parseHex(r.sRGBHex);
                  if (c) emit(c, rgbToHsv(c));
                })
                .catch(() => undefined)
            }
          >
            <Icon name="dropper" />
          </button>
        )}
      </div>
      {swatches.length > 0 && (
        <div className="cp-swatches" title="Colours used in this project">
          {swatches.map((c) => (
            <button key={rgbToHex(c)} className="cp-swatch" style={{ background: rgbToHex(c) }} title={rgbToHex(c)} onClick={() => emit(c, rgbToHsv(c))} />
          ))}
        </div>
      )}
    </div>
  );
}
