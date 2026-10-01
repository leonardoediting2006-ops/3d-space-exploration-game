import { easeProgress } from '../core/interp';
import type { Ease } from '../core/types';

const Y_MIN = -0.45;
const Y_MAX = 1.45;

/** A small SVG plot of an easing curve (time → value progress). */
export function EaseThumb({ ease, size = 44, active = false }: { ease: Ease; size?: number; active?: boolean }) {
  const pad = 5;
  const w = size - pad * 2;
  const h = size - pad * 2;
  const y = (v: number) => pad + ((Y_MAX - v) / (Y_MAX - Y_MIN)) * h;
  let d = '';
  if (ease === 'hold') {
    d = `M${pad},${y(0)} L${pad + w},${y(0)} L${pad + w},${y(1)}`;
  } else {
    const n = 48;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      d += `${i === 0 ? 'M' : 'L'}${(pad + u * w).toFixed(1)},${y(easeProgress(ease, u)).toFixed(1)} `;
    }
  }
  return (
    <svg className={`ease-thumb ${active ? 'active' : ''}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <line x1={pad} y1={y(0)} x2={pad + w} y2={y(0)} className="et-axis" />
      <line x1={pad} y1={y(1)} x2={pad + w} y2={y(1)} className="et-axis" />
      <path d={d} className="et-curve" />
    </svg>
  );
}
