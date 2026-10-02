import type { ReactNode } from 'react';
import { appStore, useApp } from '../state/store';
import { Icon } from './Icon';

/** A collapsible group in the Inspector. Its folded state is remembered for the session. */
export function Section({ id, title, count, actions, children, defaultFolded = false, className }: { id: string; title: string; count?: number; actions?: ReactNode; children: ReactNode; defaultFolded?: boolean; className?: string }) {
  const folded = useApp((s) => s.folded[id] ?? defaultFolded);
  return (
    <section className={`ins-section ${folded ? 'folded' : ''} ${className ?? ''}`} data-testid={`section-${id}`}>
      <header>
        <button className="sec-toggle" onClick={() => appStore.set((s) => ({ folded: { ...s.folded, [id]: !folded } }))} aria-expanded={!folded}>
          <Icon name="chevronRight" size={12} className="sec-chevron" />
          <span className="sec-title">{title}</span>
          {count !== undefined && count > 0 && <span className="sec-count">{count}</span>}
        </button>
        {actions && <div className="sec-actions">{actions}</div>}
      </header>
      {!folded && <div className="sec-body">{children}</div>}
    </section>
  );
}

/** A labelled non-animatable setting (dropdowns, toggles) in the same grid as property rows. */
export function Field({ label, children, title }: { label: string; children: ReactNode; title?: string }) {
  return (
    <div className="field-row" title={title}>
      <span className="pr-label">
        <span className="pr-twirl-space" />
        <span className="pr-name">{label}</span>
      </span>
      <div className="fr-control">{children}</div>
    </div>
  );
}
