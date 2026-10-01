import { useMemo, useState } from 'react';
import { gradientCss } from '../core/gradient';
import { applyGradient, applyLibraryItem } from '../state/templateActions';
import { useApp } from '../state/store';
import { CATEGORY_LABELS, groupItems, LIBRARY, LIBRARY_ORDER, TEMPLATE_COUNT, type LibraryItem } from '../templates';
import type { LibraryCategory } from '../templates/types';
import { presetGradient } from '../templates/gradients';
import { EaseThumb } from './EaseThumb';
import { TemplateThumb } from './TemplateThumb';

const HINTS: Record<LibraryCategory, string> = {
  textStyle: 'Click a style to apply it to the selected text layers. With nothing selected, a new text layer is created.',
  textAnim: 'Animations are built from text animators: edit them in the timeline (press U). Hover a card to preview.',
  gradient: 'Click to fill the selected layers with a gradient (or add a gradient background). “BG” always adds a background.',
  easing: 'Applies to the selected keyframes — or every keyframe on the selected layers if none are selected.',
  motion: 'Keyframes start at the playhead on the selected layers. Hover a card to preview.',
  effect: 'One-click looks built from effects. They replace the previous look on the layer.',
  scene: 'Ready-made layers inserted at the top of the stack, starting at the playhead.',
};

function Card({ item }: { item: LibraryItem }) {
  if (item.category === 'gradient') {
    const css = gradientCss(presetGradient(item.gradient), 90);
    return (
      <div className="tpl-card swatch" title={item.name} onClick={() => applyLibraryItem(item)} data-testid={`tpl-${item.id}`}>
        <div className="swatch-fill" style={{ background: css }}>
          <button
            className="mini bg-btn"
            title="Add as a full-frame background"
            onClick={(e) => {
              e.stopPropagation();
              applyGradient(item, 'background');
            }}
          >
            BG
          </button>
        </div>
        <span className="tpl-name">{item.name}</span>
      </div>
    );
  }
  if (item.category === 'easing') {
    return (
      <div className="tpl-card ease" title={item.name} onClick={() => applyLibraryItem(item)} data-testid={`tpl-${item.id}`}>
        <EaseThumb ease={item.easing.ease} size={56} />
        <span className="tpl-name">{item.name}</span>
      </div>
    );
  }
  return (
    <div className="tpl-card" title={item.name} onClick={() => applyLibraryItem(item)} data-testid={`tpl-${item.id}`}>
      <TemplateThumb item={item} />
      <span className="tpl-name">{item.name}</span>
    </div>
  );
}

const matches = (item: LibraryItem, needle: string) => item.name.toLowerCase().includes(needle) || item.group.toLowerCase().includes(needle);

export function LibraryPanel() {
  const [cat, setCat] = useState<LibraryCategory>('textStyle');
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  // re-render when selection changes so hints stay current (cheap)
  useApp((s) => s.selection.length);

  const sections = useMemo(() => {
    if (!needle) return [{ category: cat, groups: groupItems(LIBRARY[cat]) }];
    return LIBRARY_ORDER.map((c) => ({ category: c, groups: groupItems(LIBRARY[c].filter((i) => matches(i, needle))) })).filter((s) => s.groups.length);
  }, [cat, needle]);

  const shown = sections.reduce((n, s) => n + s.groups.reduce((m, [, items]) => m + items.length, 0), 0);

  return (
    <div className="library" data-testid="library">
      <input className="search" placeholder={`Search ${TEMPLATE_COUNT} templates…`} value={q} onChange={(e) => setQ(e.target.value)} data-testid="library-search" />
      {!needle && (
        <div className="lib-cats">
          {LIBRARY_ORDER.map((c) => (
            <button key={c} className={cat === c ? 'active' : ''} onClick={() => setCat(c)} data-testid={`lib-cat-${c}`}>
              {CATEGORY_LABELS[c]} <small>{LIBRARY[c].length}</small>
            </button>
          ))}
        </div>
      )}
      {!needle && <div className="hint lib-hint">{HINTS[cat]}</div>}
      {needle && <div className="hint lib-hint">{shown} match{shown === 1 ? '' : 'es'}</div>}
      {sections.map((sec) => (
        <div key={sec.category}>
          {needle && <h3 className="lib-cat-title">{CATEGORY_LABELS[sec.category]}</h3>}
          {sec.groups.map(([group, items]) => (
            <section key={group}>
              <h4>{group}</h4>
              <div className={`tpl-grid ${sec.category}`}>
                {items.map((item) => (
                  <Card key={item.id} item={item} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ))}
    </div>
  );
}
