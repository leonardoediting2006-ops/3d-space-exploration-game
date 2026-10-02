import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent as RMouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface Anchor {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const rectOf = (r: DOMRect): Anchor => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });

/** Open/close state for a popover anchored to whatever was clicked. */
export function useAnchor(): { anchor: Anchor | null; open: (e: RMouseEvent<HTMLElement>) => void; openAt: (a: Anchor) => void; close: () => void; toggle: (e: RMouseEvent<HTMLElement>) => void } {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const closedAt = useRef(0);
  const open = useCallback((e: RMouseEvent<HTMLElement>) => setAnchor(rectOf(e.currentTarget.getBoundingClientRect())), []);
  const openAt = useCallback((a: Anchor) => setAnchor(a), []);
  const close = useCallback(() => {
    closedAt.current = performance.now();
    setAnchor(null);
  }, []);
  // clicking the trigger of an open popover first closes it (outside pointer-down), and the click
  // that follows must not immediately reopen it
  const toggle = useCallback((e: RMouseEvent<HTMLElement>) => {
    if (performance.now() - closedAt.current < 250) return;
    const r = rectOf(e.currentTarget.getBoundingClientRect());
    setAnchor((a) => (a ? null : r));
  }, []);
  return { anchor, open, openAt, close, toggle };
}

interface PopoverProps {
  anchor: Anchor;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  /** Prefer opening upwards, or to the left of the anchor (for the right-hand panel). */
  side?: 'bottom' | 'top' | 'left';
  className?: string;
  testId?: string;
}

/**
 * A floating panel that stays inside the window, closes on Escape or an outside click, and is
 * rendered in a portal so panels with overflow never clip it.
 */
export function Popover({ anchor, onClose, children, width, side = 'bottom', className, testId }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ left: anchor.left, top: anchor.bottom + 6, visibility: 'hidden' });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const m = 8;
    let left = side === 'left' ? anchor.left - w - 8 : anchor.left;
    let top = side === 'top' ? anchor.top - h - 6 : side === 'left' ? anchor.top : anchor.bottom + 6;
    if (side === 'bottom' && top + h > vh - m) top = Math.max(m, anchor.top - h - 6); // flip above
    if (side === 'top' && top < m) top = anchor.bottom + 6;
    if (left + w > vw - m) left = vw - m - w;
    left = Math.max(m, left);
    top = Math.max(m, Math.min(top, vh - m - h));
    setStyle({ left, top, maxHeight: vh - 2 * m });
  }, [anchor, side, children]);

  useLayoutEffect(() => {
    const down = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [onClose]);

  return createPortal(
    <div ref={ref} className={`popover ${className ?? ''}`} style={{ ...style, width }} onPointerDown={(e) => e.stopPropagation()} data-testid={testId}>
      {children}
    </div>,
    document.body,
  );
}

export interface MenuEntry {
  label: string;
  hint?: string;
  icon?: ReactNode;
  run?: () => void;
  disabled?: boolean;
  checked?: boolean;
  danger?: boolean;
  /** A thin divider before this entry. */
  sep?: boolean;
  heading?: string;
}

/** A popover menu of actions. Closes after one is chosen. */
export function MenuPopover({ anchor, onClose, entries, width = 220, side }: { anchor: Anchor; onClose: () => void; entries: MenuEntry[]; width?: number; side?: PopoverProps['side'] }) {
  return (
    <Popover anchor={anchor} onClose={onClose} width={width} side={side} className="menu-pop">
      {entries.map((e, i) =>
        e.heading ? (
          <div key={`h${i}`} className="menu-heading">
            {e.heading}
          </div>
        ) : (
          <button
            key={`${e.label}${i}`}
            className={`menu-item ${e.danger ? 'danger' : ''} ${e.sep ? 'sep' : ''}`}
            disabled={e.disabled}
            onClick={() => {
              onClose();
              e.run?.();
            }}
          >
            <span className="mi-icon">{e.checked ? '✓' : e.icon}</span>
            <span className="mi-label">{e.label}</span>
            {e.hint && <span className="mi-hint">{e.hint}</span>}
          </button>
        ),
      )}
    </Popover>
  );
}
