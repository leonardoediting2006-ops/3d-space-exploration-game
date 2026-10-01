import { useMemo, useState } from 'react';
import { EFFECTS } from '../core/effectDefs';
import { ANIM_SLOTS, type AnimSlot, type Layer } from '../core/types';
import { addEffect } from '../state/actions';
import { applyLayerTemplate, type Placement } from '../state/templateActions';
import { appStore } from '../state/store';
import { useUserPresets } from '../state/presets';
import { LIBRARY, userItems, type LibraryItem } from '../templates';
import { templateSlot } from '../templates/types';
import { Popover, type Anchor } from './Popover';
import { TemplateThumb } from './TemplateThumb';

type LayerItem = Extract<LibraryItem, { template: unknown }>;

/** The layer being edited, or every selected layer when it is part of a multi-selection. */
const targetIds = (layer: Layer): string[] => {
  const sel = appStore.get().selection;
  return sel.length > 1 && sel.includes(layer.id) ? sel : [layer.id];
};

const PLACE: Record<AnimSlot, Placement> = { in: 'start', out: 'end', loop: 'start', emph: 'playhead' };

const matches = (i: LibraryItem, needle: string) => !needle || i.name.toLowerCase().includes(needle) || i.group.toLowerCase().includes(needle);

function ThumbGrid({ items, onPick, empty }: { items: LayerItem[]; onPick: (i: LayerItem) => void; empty: string }) {
  if (!items.length) return <div className="hint">{empty}</div>;
  return (
    <div className="pick-grid">
      {items.map((item) => (
        <button key={item.id} className="pick-card" onClick={() => onPick(item)} title={item.name} data-testid={`pick-${item.id}`}>
          <TemplateThumb item={item} />
          <span className="tpl-name">{item.name}</span>
        </button>
      ))}
    </div>
  );
}

/** Choose an In / Out / Loop / Accent animation for one layer from the library. */
export function AnimPicker({ layer, slot, anchor, onClose }: { layer: Layer; slot: AnimSlot; anchor: Anchor; onClose: () => void }) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const info = ANIM_SLOTS.find((s) => s.id === slot)!;
  const mine = useUserPresets();
  const groups = useMemo(() => {
    const pick = (list: LibraryItem[]): LayerItem[] =>
      list.filter((i): i is LayerItem => 'template' in i && i.template.accepts(layer) && templateSlot(i.template) === slot && matches(i, needle));
    return [
      { title: 'My presets', items: pick(userItems()) },
      { title: 'Text animations', items: layer.type === 'text' ? pick(LIBRARY.textAnim) : [] },
      { title: layer.type === 'text' ? 'Whole layer' : 'Motion', items: pick(LIBRARY.motion) },
      { title: 'Looks', items: pick(LIBRARY.effect) },
    ].filter((g) => g.items.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, slot, needle, mine]);

  return (
    <Popover anchor={anchor} onClose={onClose} width={332} side={anchor.left > window.innerWidth / 2 ? 'left' : 'bottom'} className="picker-pop" testId="anim-picker">
      <div className="pick-head">
        <b>
          {info.label} animation
        </b>
        <span>{info.hint}</span>
      </div>
      <input className="search" autoFocus placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      <div className="pick-body">
        {groups.length === 0 && <div className="hint">Nothing matches.</div>}
        {groups.map((g) => (
          <div key={g.title}>
            <h4>{g.title}</h4>
            <ThumbGrid
              items={g.items}
              empty=""
              onPick={(item) => {
                applyLayerTemplate(item, { layerIds: targetIds(layer), place: PLACE[slot] });
                onClose();
              }}
            />
          </div>
        ))}
      </div>
    </Popover>
  );
}

/** Add a raw effect, or a ready-made look, to a layer. */
export function EffectPicker({ layer, anchor, onClose }: { layer: Layer; anchor: Anchor; onClose: () => void }) {
  const [tab, setTab] = useState<'effects' | 'looks'>('effects');
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const groups = useMemo(() => {
    const m = new Map<string, typeof EFFECTS>();
    for (const e of EFFECTS) {
      if (needle && !e.name.toLowerCase().includes(needle) && !e.category.toLowerCase().includes(needle)) continue;
      m.set(e.category, [...(m.get(e.category) ?? []), e]);
    }
    return [...m.entries()];
  }, [needle]);
  const mine = useUserPresets();
  const looks = useMemo(
    () => [...userItems().filter((i) => i.category === 'effect'), ...LIBRARY.effect].filter((i): i is LayerItem => 'template' in i && i.template.accepts(layer) && matches(i, needle)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layer, needle, mine],
  );

  return (
    <Popover anchor={anchor} onClose={onClose} width={332} side={anchor.left > window.innerWidth / 2 ? 'left' : 'bottom'} className="picker-pop" testId="effect-picker">
      <div className="seg">
        <button className={tab === 'effects' ? 'on' : ''} onClick={() => setTab('effects')}>
          Effects <small>{EFFECTS.length}</small>
        </button>
        <button className={tab === 'looks' ? 'on' : ''} onClick={() => setTab('looks')}>
          Looks <small>{LIBRARY.effect.length + mine.filter((p) => p.kind === 'effect').length}</small>
        </button>
      </div>
      <input className="search" autoFocus placeholder={tab === 'effects' ? 'Search effects…' : 'Search looks…'} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      <div className="pick-body">
        {tab === 'effects' ? (
          <>
            {groups.length === 0 && <div className="hint">Nothing matches.</div>}
            {groups.map(([cat, list]) => (
              <div key={cat}>
                <h4>{cat}</h4>
                {list.map((e) => (
                  <button
                    key={e.type}
                    className="fx-pick"
                    onClick={() => {
                      addEffect(targetIds(layer), e.type);
                      appStore.set({ rightTab: 'inspector' });
                      onClose();
                    }}
                    data-testid={`fx-${e.type}`}
                  >
                    {e.name}
                  </button>
                ))}
              </div>
            ))}
          </>
        ) : (
          <ThumbGrid
            items={looks}
            empty="Nothing matches."
            onPick={(item) => {
              applyLayerTemplate(item, { layerIds: targetIds(layer) });
              onClose();
            }}
          />
        )}
      </div>
    </Popover>
  );
}
