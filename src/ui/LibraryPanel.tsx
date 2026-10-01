import { useMemo } from 'react';
import { gradientCss } from '../core/gradient';
import type { Layer } from '../core/types';
import { toggleFavorite, useFavorites } from '../state/favorites';
import { applyGradient, applyLibraryItem, LIB_MIME } from '../state/templateActions';
import { appStore, useActiveComp, useApp } from '../state/store';
import { CATEGORY_LABELS, groupItems, LIBRARY, LIBRARY_ORDER, TEMPLATE_COUNT, findLibraryItem, type LibraryItem } from '../templates';
import { presetGradient } from '../templates/gradients';
import { templateSource, type LibraryCategory } from '../templates/types';
import { EaseThumb } from './EaseThumb';
import { Icon } from './Icon';
import { TemplateThumb } from './TemplateThumb';

type Tab = LibraryCategory | 'favorites';

const HINTS: Record<LibraryCategory, string> = {
  textStyle: 'Click a style to apply it to the selected text. With nothing selected, a new text layer is made.',
  textAnim: 'Pick one, then fine-tune timing, strength and easing under Inspector → Animate. Hover a card to preview.',
  gradient: 'Click to fill the selected layers with a gradient, or add a gradient background. “BG” always adds a background.',
  easing: 'Applies to the selected keyframes, or every keyframe on the selected layers if none are selected.',
  motion: 'Click to play from the playhead on the selected layers, or drag onto a layer to place it at its start or end. Retime it afterwards under Inspector → Animate.',
  effect: 'One-click looks built from effects. Tweak every setting afterwards in the Inspector.',
  scene: 'Ready-made layers inserted at the top of the stack, starting at the playhead.',
};

/** Has this template already been applied to the layer? Shown as a tick on its card. */
function appliedTo(layer: Layer | undefined, item: LibraryItem): boolean {
  if (!layer || !('template' in item)) return false;
  const source = templateSource(item.id);
  return layer.anims.some((a) => a.template === item.id) || layer.effects.some((e) => e.source === source) || layer.animators.some((a) => a.source === source);
}

function Star({ id }: { id: string }) {
  const on = useFavorites().includes(id);
  return (
    <button
      className={`tpl-fav ${on ? 'on' : ''}`}
      title={on ? 'Remove from favourites' : 'Add to favourites'}
      onClick={(e) => {
        e.stopPropagation();
        toggleFavorite(id);
      }}
    >
      <Icon name={on ? 'heartFilled' : 'heart'} size={12} />
    </button>
  );
}

/** Make a card draggable so it can be dropped on a layer in the viewer or the timeline. */
const dragProps = (item: LibraryItem) => ({
  draggable: true,
  onDragStart: (e: React.DragEvent) => {
    e.dataTransfer.setData(LIB_MIME, item.id);
    e.dataTransfer.effectAllowed = 'copy';
  },
});

function Card({ item, applied }: { item: LibraryItem; applied: boolean }) {
  if (item.category === 'gradient') {
    const css = gradientCss(presetGradient(item.gradient), 90);
    return (
      <div className="tpl-card swatch" title={item.name} onClick={() => applyLibraryItem(item)} data-testid={`tpl-${item.id}`} {...dragProps(item)}>
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
        <Star id={item.id} />
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
    <div className={`tpl-card ${applied ? 'applied' : ''}`} title={applied ? `${item.name} — applied to the selected layer` : item.name} onClick={() => applyLibraryItem(item)} data-testid={`tpl-${item.id}`} {...dragProps(item)}>
      <TemplateThumb item={item} />
      <span className="tpl-name">{item.name}</span>
      {applied && (
        <span className="tpl-badge" title="Applied to the selected layer">
          <Icon name="check" size={11} />
        </span>
      )}
      <Star id={item.id} />
    </div>
  );
}

const matches = (item: LibraryItem, needle: string) => item.name.toLowerCase().includes(needle) || item.group.toLowerCase().includes(needle);

export function LibraryPanel() {
  const cat = useApp((s) => s.libTab) as Tab;
  const q = useApp((s) => s.libQuery);
  const setCat = (t: Tab) => appStore.set({ libTab: t });
  const setQ = (v: string) => appStore.set({ libQuery: v });
  const needle = q.trim().toLowerCase();
  const favorites = useFavorites();
  const comp = useActiveComp();
  const firstId = useApp((s) => s.selection[0]);
  const layer = comp.layers.find((l) => l.id === firstId);

  const favItems = useMemo(() => favorites.map((id) => findLibraryItem(id)).filter((i): i is LibraryItem => !!i), [favorites]);

  const sections = useMemo(() => {
    if (needle) return LIBRARY_ORDER.map((c) => ({ category: c, groups: groupItems(LIBRARY[c].filter((i) => matches(i, needle))) })).filter((s) => s.groups.length);
    if (cat === 'favorites') {
      return LIBRARY_ORDER.map((c) => ({ category: c, groups: groupItems(favItems.filter((i) => i.category === c)) })).filter((s) => s.groups.length);
    }
    return [{ category: cat, groups: groupItems(LIBRARY[cat]) }];
  }, [cat, needle, favItems]);

  const shown = sections.reduce((n, s) => n + s.groups.reduce((m, [, items]) => m + items.length, 0), 0);
  const tabs: { id: Tab; label: string; count: number }[] = [
    ...(favorites.length ? [{ id: 'favorites' as const, label: '♥ Favourites', count: favItems.length }] : []),
    ...LIBRARY_ORDER.map((c) => ({ id: c as Tab, label: CATEGORY_LABELS[c], count: LIBRARY[c].length })),
  ];

  return (
    <div className="library" data-testid="library">
      <div className="lib-top">
        <input className="search" placeholder={`Search ${TEMPLATE_COUNT} templates…`} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-testid="library-search" />
        {!needle && (
          <div className="lib-cats">
            {tabs.map((t) => (
              <button key={t.id} className={cat === t.id ? 'active' : ''} onClick={() => setCat(t.id)} data-testid={`lib-cat-${t.id}`}>
                {t.label} <small>{t.count}</small>
              </button>
            ))}
          </div>
        )}
      </div>
      {!needle && cat !== 'favorites' && <div className="hint lib-hint">{HINTS[cat]}</div>}
      {!needle && cat === 'favorites' && <div className="hint lib-hint">Your starred templates. Hover a card and click the heart to add or remove.</div>}
      {needle && (
        <div className="hint lib-hint">
          {shown} match{shown === 1 ? '' : 'es'}
        </div>
      )}
      {sections.map((sec) => (
        <div key={sec.category}>
          {(needle || cat === 'favorites') && <h3 className="lib-cat-title">{CATEGORY_LABELS[sec.category]}</h3>}
          {sec.groups.map(([group, items]) => (
            <section key={group}>
              <h4>{group}</h4>
              <div className={`tpl-grid ${sec.category}`}>
                {items.map((item) => (
                  <Card key={item.id} item={item} applied={appliedTo(layer, item)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ))}
    </div>
  );
}
