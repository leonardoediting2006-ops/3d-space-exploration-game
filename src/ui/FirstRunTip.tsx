import { useState } from 'react';
import { appStore } from '../state/store';
import { Icon } from './Icon';

export const TIP_KEY = 'keyframe-studio:tip-dismissed';

/** A one-time pointer to the three things that make the editor quick: the Library, the Inspector and Ctrl+K. */
export function FirstRunTip() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(TIP_KEY) !== '1';
    } catch {
      return false;
    }
  });
  if (!open) return null;
  const close = () => {
    try {
      localStorage.setItem(TIP_KEY, '1');
    } catch {
      /* storage unavailable: the tip simply shows again next time */
    }
    setOpen(false);
  };
  return (
    <div className="first-tip" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} data-testid="first-tip">
      <b>Try it</b>
      <p>
        Click a layer, open the{' '}
        <button className="link" onClick={() => appStore.set({ rightTab: 'library' })}>
          Library
        </button>{' '}
        and click an animation. Fine-tune it under <b>Inspector → Animate</b>. <kbd>Ctrl</kbd> <kbd>K</kbd> searches everything.
      </p>
      <button className="tip-close icon-btn" title="Got it" onClick={close} data-testid="tip-close">
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}
