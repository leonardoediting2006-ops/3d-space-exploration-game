import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getEffectDef } from '../core/effectDefs';
import type { AnimatorKind } from '../core/factory';
import {
  BLEND_MODES,
  MASK_MODES,
  MATTE_MODES,
  type BlendMode,
  type Comp,
  type Effect,
  type Layer,
  type LayerData,
  type Mask,
  type MaskMode,
  type MatteMode,
  type Prop,
  type PropGroup,
  type TextAnimator,
} from '../core/types';
import {
  addStarterMask,
  addTextAnimator,
  alignLayers,
  deleteLayers,
  distributeLayers,
  duplicateLayers,
  moveEffect,
  openComp,
  precompose,
  removeEffect,
  removeMask,
  removeTextAnimator,
  resetTransform,
  setEffectEnabled,
  setLayerField,
  setMaskField,
  setParent,
  splitLayers,
  staggerAnimations,
  trimLayer,
  updateLayerData,
  type AlignMode,
} from '../state/actions';
import { appStore, beginGesture, endGesture, useActiveComp, useApp } from '../state/store';
import { AnimateSection } from './AnimCard';
import { CompInspector } from './CompInspector';
import { saveLookPreset } from '../state/presets';
import { NumberField } from './fields';
import { NamePrompt } from './NamePrompt';
import { GENERIC_FONTS, installedFonts } from './fonts';
import { Icon, LAYER_ICON, type IconName } from './Icon';
import { MenuPopover, useAnchor, type MenuEntry } from './Popover';
import { EffectPicker } from './Pickers';
import { PropRow } from './PropRow';
import { Field, Section } from './Section';

type CompLite = Pick<Comp, 'fps' | 'width' | 'height' | 'duration'>;

/** The right-hand panel: edits whatever is selected, or the composition when nothing is. */
export function Inspector() {
  const comp = useActiveComp();
  const selection = useApp((s) => s.selection);
  const layer = comp.layers.find((l) => l.id === selection[0]) ?? null;
  if (!layer) return <CompInspector comp={comp} />;
  return <LayerInspector layer={layer} comp={comp} selectedCount={selection.filter((id) => comp.layers.some((l) => l.id === id)).length} />;
}

function LayerInspector({ layer, comp, selectedCount }: { layer: Layer; comp: Comp; selectedCount: number }) {
  const d = layer.data;
  const selection = useApp((s) => s.selection);
  return (
    <div className="inspector" data-testid="inspector">
      <LayerHeader layer={layer} selectedCount={selectedCount} />
      <AlignBar ids={selection} />

      <Section id="transform" title="Transform" actions={<ResetTransformButton id={layer.id} />}>
        {(['position', 'scale', 'rotation', 'opacity', 'anchor'] as const).map((k) => (
          <PropRow key={k} layer={layer} comp={comp} group="transform" propKey={k} prop={layer.transform[k]} label={k === 'anchor' ? 'Anchor' : undefined} />
        ))}
      </Section>

      <SourceSection layer={layer} comp={comp} />
      <AnimateSection layer={layer} comp={comp} />
      <EffectsSection layer={layer} comp={comp} />
      {d.type === 'text' && <AnimatorsSection layer={layer} comp={comp} />}
      {d.type === 'shape' && <TrimSection layer={layer} comp={comp} />}
      {d.type !== 'null' && <MasksSection layer={layer} comp={comp} />}
      <LayerSection layer={layer} comp={comp} />
    </div>
  );
}

/* ------------------------------------------------------------------ header */

function LayerHeader({ layer, selectedCount }: { layer: Layer; selectedCount: number }) {
  const [name, setName] = useState(layer.name);
  const menu = useAnchor();
  useEffect(() => setName(layer.name), [layer.id, layer.name]);
  const commit = () => {
    const n = name.trim();
    if (n && n !== layer.name) setLayerField(layer.id, { name: n });
    else setName(layer.name);
  };
  const ids = appStore.get().selection;
  const entries: MenuEntry[] = [
    { label: 'Duplicate', hint: 'Ctrl+D', icon: <Icon name="copy" />, run: () => duplicateLayers(ids) },
    { label: 'Split at playhead', hint: 'Ctrl+Shift+D', icon: <Icon name="layers" />, run: () => splitLayers(ids) },
    { label: 'Pre-compose…', hint: 'Ctrl+Shift+C', icon: <Icon name="comp" />, run: () => precompose(ids) },
    { label: 'Reset transform', icon: <Icon name="reset" />, run: () => resetTransform([layer.id]), sep: true },
    { label: 'Delete', hint: 'Del', icon: <Icon name="trash" />, run: () => deleteLayers(ids), danger: true, sep: true },
  ];
  return (
    <div className="ins-header">
      <span className={`type-badge ${layer.type}`}>
        <Icon name={LAYER_ICON[layer.type]} size={14} />
      </span>
      <input
        className="ins-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setName(layer.name);
            (e.target as HTMLInputElement).blur();
          }
        }}
        title="Rename layer"
        data-testid="ins-name"
        spellCheck={false}
      />
      <button className={`icon-btn ${layer.visible ? '' : 'off'}`} title={layer.visible ? 'Hide layer' : 'Show layer'} onClick={() => setLayerField(layer.id, { visible: !layer.visible })}>
        <Icon name={layer.visible ? 'eye' : 'eyeOff'} />
      </button>
      <button className={`icon-btn ${layer.locked ? 'on' : ''}`} title={layer.locked ? 'Unlock layer' : 'Lock layer'} onClick={() => setLayerField(layer.id, { locked: !layer.locked })}>
        <Icon name={layer.locked ? 'lock' : 'unlock'} />
      </button>
      <button className="icon-btn" title="More" onClick={menu.toggle}>
        <Icon name="more" />
      </button>
      {menu.anchor && <MenuPopover anchor={menu.anchor} onClose={menu.close} entries={entries} side="left" />}
      {selectedCount > 1 && <MultiBanner layer={layer} count={selectedCount} />}
      {layer.type === 'precomp' && layer.data.type === 'precomp' && (
        <button className="ins-open-comp" onClick={() => openComp((layer.data as Extract<LayerData, { type: 'precomp' }>).compId)}>
          Open composition <Icon name="arrowRight" size={12} />
        </button>
      )}
    </div>
  );
}

/** Shown when several layers are selected: what applies to all of them, and a stagger control. */
function MultiBanner({ layer, count }: { layer: Layer; count: number }) {
  const [step, setStep] = useState(0.1);
  return (
    <div className="ins-multi" data-testid="multi-banner">
      <div>
        {count} layers selected. Editing <b>{layer.name}</b>. Align, distribute and animations you add apply to all of them.
      </div>
      <div className="stagger-row">
        <span>Stagger entrances</span>
        <NumberField value={step} min={0} max={5} step={0.01} decimals={2} unit="s" onChange={setStep} title="Delay between one layer's entrance and the next" />
        <button className="chip" onClick={() => staggerAnimations(appStore.get().selection, step)} data-testid="stagger">
          Apply
        </button>
      </div>
    </div>
  );
}

function ResetTransformButton({ id }: { id: string }) {
  return (
    <button className="icon-btn" title="Reset position, scale, rotation and opacity" onClick={() => resetTransform([id])}>
      <Icon name="reset" size={13} />
    </button>
  );
}

const ALIGN: { mode: AlignMode; icon: IconName; label: string }[] = [
  { mode: 'left', icon: 'alignLeft', label: 'Align left' },
  { mode: 'centerH', icon: 'alignCenterH', label: 'Align horizontal centers' },
  { mode: 'right', icon: 'alignRight', label: 'Align right' },
  { mode: 'top', icon: 'alignTop', label: 'Align top' },
  { mode: 'middle', icon: 'alignMiddle', label: 'Align vertical centers' },
  { mode: 'bottom', icon: 'alignBottom', label: 'Align bottom' },
];

/** Align to the composition (one layer) or to each other (several), and distribute three or more. */
function AlignBar({ ids }: { ids: string[] }) {
  const many = ids.length > 1;
  return (
    <div className="align-bar" data-testid="align-bar">
      {ALIGN.map((a) => (
        <button key={a.mode} className="icon-btn" title={`${a.label}${many ? ' (to the selection)' : ' (to the composition)'}`} onClick={() => alignLayers(ids, a.mode)} data-testid={`align-${a.mode}`}>
          <Icon name={a.icon} />
        </button>
      ))}
      <span className="ab-sep" />
      <button className="icon-btn" title="Distribute horizontally (3+ layers)" disabled={ids.length < 3} onClick={() => distributeLayers(ids, 'h')} data-testid="distribute-h">
        <Icon name="distributeH" />
      </button>
      <button className="icon-btn" title="Distribute vertically (3+ layers)" disabled={ids.length < 3} onClick={() => distributeLayers(ids, 'v')}>
        <Icon name="distributeV" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ source (what the layer is) */

/** A row of mutually exclusive choices. */
function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={String(o.value)} className={value === o.value ? 'on' : ''} title={o.title} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Chip({ on, onClick, children, title, testId }: { on: boolean; onClick: () => void; children: ReactNode; title?: string; testId?: string }) {
  return (
    <button className={`chip ${on ? 'on' : ''}`} onClick={onClick} title={title} data-testid={testId}>
      {children}
    </button>
  );
}

/** Gestures keep a typing session as one undo step. */
function useTypingGesture() {
  const open = useRef(false);
  return {
    onFocus: () => {
      if (!open.current) {
        open.current = true;
        beginGesture();
      }
    },
    onBlur: () => {
      if (open.current) {
        open.current = false;
        endGesture();
      }
    },
  };
}

function SourceSection({ layer, comp }: { layer: Layer; comp: Comp }) {
  const d = layer.data;
  const typing = useTypingGesture();
  const rows = (keys?: string[]) =>
    Object.entries(layer.content)
      .filter(([k]) => (keys ? keys.includes(k) : true))
      .map(([k, p]) => <PropRow key={k} layer={layer} comp={comp} group="content" propKey={k} prop={p} />);
  const set = (patch: Partial<LayerData>) => updateLayerData(layer.id, patch);
  const hidden = new Set<string>();
  if (d.type === 'text') {
    if (d.fill === false) hidden.add('fillColor');
    if (!d.stroke) ['strokeColor', 'strokeWidth'].forEach((k) => hidden.add(k));
  }
  if (d.type === 'shape') {
    if (!d.fill) hidden.add('fillColor');
    if (!d.stroke) ['strokeColor', 'strokeWidth'].forEach((k) => hidden.add(k));
    ['trimStart', 'trimEnd', 'trimOffset'].forEach((k) => hidden.add(k));
  }
  const visibleKeys = Object.keys(layer.content).filter((k) => !hidden.has(k));
  const title = d.type === 'text' ? 'Text' : d.type === 'shape' ? 'Shape' : d.type === 'solid' ? 'Solid' : d.type === 'image' ? 'Image' : d.type === 'precomp' ? 'Composition' : d.type === 'adjustment' ? 'Adjustment' : 'Source';

  return (
    <Section id="source" title={title}>
      {d.type === 'text' && (
        <>
          <textarea
            className="text-input"
            value={d.text}
            rows={2}
            spellCheck={false}
            {...typing}
            onChange={(e) => set({ text: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
            data-testid="text-input"
          />
          <Field label="Font">
            <select className="mini-select wide" value={d.font} onChange={(e) => set({ font: e.target.value })} data-testid="font-select">
              <optgroup label="Everywhere">
                {GENERIC_FONTS.map((f) => (
                  <option key={f.css} value={f.css}>
                    {f.name}
                  </option>
                ))}
              </optgroup>
              {installedFonts().length > 0 && (
                <optgroup label="Installed on this computer">
                  {installedFonts().map((f) => (
                    <option key={f.css} value={f.css}>
                      {f.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {![...GENERIC_FONTS, ...installedFonts()].some((f) => f.css === d.font) && <option value={d.font}>{d.font.split(',')[0].replace(/"/g, '')}</option>}
            </select>
          </Field>
          <Field label="Style">
            <div className="chips">
              <Chip on={d.bold} onClick={() => set({ bold: !d.bold })} title="Bold">
                <b>B</b>
              </Chip>
              <Chip on={d.italic} onClick={() => set({ italic: !d.italic })} title="Italic">
                <i>I</i>
              </Chip>
              <Seg value={d.align} onChange={(align) => set({ align })} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]} />
            </div>
          </Field>
          <Field label="Paint">
            <div className="chips">
              <Chip on={d.fill !== false} onClick={() => set({ fill: d.fill === false })}>
                Fill
              </Chip>
              <Chip on={d.stroke} onClick={() => set({ stroke: !d.stroke })} testId="stroke-toggle">
                Stroke
              </Chip>
            </div>
          </Field>
        </>
      )}
      {d.type === 'shape' && (
        <Field label="Paint">
          <div className="chips">
            <Chip on={d.fill} onClick={() => set({ fill: !d.fill })}>
              Fill
            </Chip>
            <Chip on={d.stroke} onClick={() => set({ stroke: !d.stroke })} testId="stroke-toggle">
              Stroke
            </Chip>
          </div>
        </Field>
      )}
      {d.type === 'shape' && d.stroke && (
        <>
          <Field label="Line cap">
            <Seg value={d.lineCap} onChange={(lineCap) => set({ lineCap })} options={[{ value: 'butt', label: 'Flat' }, { value: 'round', label: 'Round' }, { value: 'square', label: 'Square' }]} />
          </Field>
          <Field label="Corners">
            <Seg value={d.lineJoin} onChange={(lineJoin) => set({ lineJoin })} options={[{ value: 'miter', label: 'Sharp' }, { value: 'round', label: 'Round' }, { value: 'bevel', label: 'Bevel' }]} />
          </Field>
        </>
      )}
      {(d.type === 'solid' || d.type === 'adjustment' || d.type === 'null') && (
        <Field label="Size">
          <span className="vec">
            <NumberField value={d.width} min={1} max={16384} decimals={0} unit="px" onChange={(v) => set({ width: v })} />
            <span className="x-sep">×</span>
            <NumberField value={d.height} min={1} max={16384} decimals={0} unit="px" onChange={(v) => set({ height: v })} />
          </span>
        </Field>
      )}
      {d.type === 'precomp' && (
        <Field label="Contents">
          <button className="chip" onClick={() => openComp(d.compId)}>
            Open composition
          </button>
        </Field>
      )}
      {d.type === 'image' && <div className="hint compact">Footage layer.</div>}
      {d.type === 'adjustment' && <div className="hint compact">Effects on this layer change everything beneath it.</div>}
      {rows(visibleKeys)}
    </Section>
  );
}

function TrimSection({ layer, comp }: { layer: Layer; comp: Comp }) {
  const keys = ['trimStart', 'trimEnd', 'trimOffset'].filter((k) => layer.content[k]);
  if (!keys.length) return null;
  return (
    <Section id="trim" title="Trim paths" defaultFolded>
      {keys.map((k) => (
        <PropRow key={k} layer={layer} comp={comp} group="content" propKey={k} prop={layer.content[k]} />
      ))}
    </Section>
  );
}

/* ------------------------------------------------------------------ effects */

function EffectsSection({ layer, comp }: { layer: Layer; comp: Comp }) {
  const picker = useAnchor();
  const namer = useAnchor();
  return (
    <Section
      id="effects"
      title="Effects"
      count={layer.effects.length}
      actions={
        <>
          {layer.effects.length > 0 && (
            <button className="icon-btn" onClick={namer.toggle} title="Save these effects as a look you can reuse" data-testid="save-look">
              <Icon name="heart" size={13} />
            </button>
          )}
          <button className="add-chip" onClick={picker.toggle} data-testid="add-effect" title="Add an effect or a ready-made look">
            <Icon name="plus" size={12} /> Add
          </button>
        </>
      }
    >
      {namer.anchor && <NamePrompt anchor={namer.anchor} title="Save these effects as a look" initial="My look" onSave={(name) => saveLookPreset(layer, name)} onClose={namer.close} />}
      {layer.effects.length === 0 && (
        <div className="empty-hint">
          Blur, glow, colour grading and more.
          <button className="link" onClick={picker.toggle}>
            Add an effect
          </button>
        </div>
      )}
      {layer.effects.map((fx, i) => (
        <EffectCard key={fx.id} layer={layer} comp={comp} fx={fx} index={i} last={i === layer.effects.length - 1} />
      ))}
      {picker.anchor && <EffectPicker layer={layer} anchor={picker.anchor} onClose={picker.close} />}
    </Section>
  );
}

function EffectCard({ layer, comp, fx, index, last }: { layer: Layer; comp: CompLite; fx: Effect; index: number; last: boolean }) {
  const open = useApp((s) => !s.folded[`fx:${fx.id}`]);
  const owner = fx.inst ? layer.anims.find((a) => a.id === fx.inst) : undefined;
  const tag = owner ? `from ${owner.name}` : fx.source?.startsWith('look:') ? 'look' : fx.source?.startsWith('style:') ? 'style' : '';
  return (
    <div className={`card fx-card ${fx.enabled ? '' : 'disabled'}`} data-testid="fx-card">
      <div className="card-head">
        <button className="card-name" onClick={() => appStore.set((s) => ({ folded: { ...s.folded, [`fx:${fx.id}`]: open } }))}>
          <Icon name="chevronRight" size={11} className={`ac-chevron ${open ? 'open' : ''}`} />
          <span>{getEffectDef(fx.type)?.name ?? fx.type}</span>
          {tag && <small className="tag">{tag}</small>}
        </button>
        <button className="icon-btn" title="Move up" disabled={index === 0} onClick={() => moveEffect(layer.id, fx.id, -1)}>
          <Icon name="chevronDown" size={12} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <button className="icon-btn" title="Move down" disabled={last} onClick={() => moveEffect(layer.id, fx.id, 1)}>
          <Icon name="chevronDown" size={12} />
        </button>
        <button className={`icon-btn ${fx.enabled ? '' : 'off'}`} title={fx.enabled ? 'Turn off' : 'Turn on'} onClick={() => setEffectEnabled(layer.id, fx.id, !fx.enabled)} data-testid="fx-enable">
          <Icon name={fx.enabled ? 'eye' : 'eyeOff'} size={13} />
        </button>
        <button className="icon-btn" title="Remove effect" onClick={() => removeEffect(layer.id, fx.id)} data-testid="fx-remove">
          <Icon name="close" size={12} />
        </button>
      </div>
      {open && (
        <div className="card-body">
          {Object.entries(fx.props).map(([k, p]) => (
            <PropRow key={k} layer={layer} comp={comp} group={`fx:${fx.id}` as PropGroup} propKey={k} prop={p} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ text animators */

const RANGE_KEYS = ['start', 'end', 'offset', 'smooth', 'units', 'shape', 'ease', 'random', 'seed'];

function AnimatorsSection({ layer, comp }: { layer: Layer; comp: Comp }) {
  const menu = useAnchor();
  const kinds: { kind: AnimatorKind; label: string }[] = [
    { kind: 'opacity', label: 'Fade letters' },
    { kind: 'position', label: 'Move letters' },
    { kind: 'scale', label: 'Scale letters' },
    { kind: 'rotation', label: 'Rotate letters' },
    { kind: 'tracking', label: 'Spread letters (tracking)' },
    { kind: 'color', label: 'Tint letters' },
    { kind: 'blank', label: 'Blank animator' },
  ];
  return (
    <Section
      id="animators"
      title="Letter animators"
      count={layer.animators.length}
      defaultFolded={layer.animators.length === 0}
      actions={
        <button className="add-chip" onClick={menu.toggle} title="Move, fade, scale or tint individual letters, words or lines" data-testid="add-animator">
          <Icon name="plus" size={12} /> Add
        </button>
      }
    >
      {layer.animators.length === 0 && <div className="empty-hint">Animate individual letters, words or lines with a moving range.</div>}
      {layer.animators.map((a) => (
        <AnimatorCard key={a.id} layer={layer} comp={comp} a={a} />
      ))}
      {menu.anchor && (
        <MenuPopover
          anchor={menu.anchor}
          onClose={menu.close}
          side={menu.anchor.left > window.innerWidth / 2 ? 'left' : 'bottom'}
          entries={kinds.map((k) => ({ label: k.label, run: () => void addTextAnimator(layer.id, k.kind) }))}
        />
      )}
    </Section>
  );
}

function AnimatorCard({ layer, comp, a }: { layer: Layer; comp: CompLite; a: TextAnimator }) {
  const open = useApp((s) => !s.folded[`anim:${a.id}`]);
  const owner = a.inst ? layer.anims.find((x) => x.id === a.inst) : undefined;
  const group = `anim:${a.id}` as PropGroup;
  const entry = (k: string): [string, Prop] | null => (a.props[k] ? [k, a.props[k]] : null);
  const range = RANGE_KEYS.map(entry).filter((x): x is [string, Prop] => !!x);
  const style = Object.entries(a.props).filter(([k]) => !RANGE_KEYS.includes(k));
  return (
    <div className="card" data-testid="animator-card">
      <div className="card-head">
        <button className="card-name" onClick={() => appStore.set((s) => ({ folded: { ...s.folded, [`anim:${a.id}`]: open } }))}>
          <Icon name="chevronRight" size={11} className={`ac-chevron ${open ? 'open' : ''}`} />
          <span>{a.name}</span>
          {owner && <small className="tag">from {owner.name}</small>}
        </button>
        <button className="icon-btn" title="Remove animator" onClick={() => removeTextAnimator(layer.id, a.id)}>
          <Icon name="close" size={12} />
        </button>
      </div>
      {open && (
        <div className="card-body">
          <div className="sub-head">Range</div>
          {range.map(([k, p]) => (
            <PropRow key={k} layer={layer} comp={comp} group={group} propKey={k} prop={p} />
          ))}
          <div className="sub-head">Each letter gets</div>
          {style.map(([k, p]) => (
            <PropRow key={k} layer={layer} comp={comp} group={group} propKey={k} prop={p} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ masks */

function MasksSection({ layer, comp }: { layer: Layer; comp: Comp }) {
  const menu = useAnchor();
  return (
    <Section
      id="masks"
      title="Masks"
      count={layer.masks.length}
      defaultFolded={layer.masks.length === 0}
      actions={
        <button className="add-chip" onClick={menu.toggle} title="Cut the layer to a shape" data-testid="add-mask">
          <Icon name="plus" size={12} /> Add
        </button>
      }
    >
      {layer.masks.length === 0 && <div className="empty-hint">Cut this layer to a shape. Draw custom masks with the pen tool while “Mask” is ticked.</div>}
      {layer.masks.map((m) => (
        <MaskCard key={m.id} layer={layer} comp={comp} mask={m} />
      ))}
      {menu.anchor && (
        <MenuPopover
          anchor={menu.anchor}
          onClose={menu.close}
          side={menu.anchor.left > window.innerWidth / 2 ? 'left' : 'bottom'}
          entries={[
            { label: 'Rectangle mask', icon: <Icon name="shape" />, run: () => addStarterMask(layer.id, 'rect') },
            { label: 'Ellipse mask', icon: <Icon name="ellipse" />, run: () => addStarterMask(layer.id, 'ellipse') },
          ]}
        />
      )}
    </Section>
  );
}

function MaskCard({ layer, comp, mask }: { layer: Layer; comp: CompLite; mask: Mask }) {
  const activeMask = useApp((s) => s.activeMask);
  const group = `mask:${mask.id}` as PropGroup;
  return (
    <div className={`card ${activeMask === mask.id ? 'active' : ''}`} data-testid="mask-card">
      <div className="card-head">
        <button className="card-name" onClick={() => appStore.set({ activeMask: mask.id, selVertex: null })} title="Edit this mask in the viewer">
          <Icon name="mask" size={13} />
          <span>{mask.name}</span>
        </button>
        <select className="mini-select" value={mask.mode} onChange={(e) => setMaskField(layer.id, mask.id, { mode: e.target.value as MaskMode })} data-testid="mask-mode">
          {MASK_MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <Chip on={mask.inverted} onClick={() => setMaskField(layer.id, mask.id, { inverted: !mask.inverted })} title="Invert the mask" testId="mask-invert">
          Invert
        </Chip>
        <button className="icon-btn" title="Remove mask" onClick={() => removeMask(layer.id, mask.id)}>
          <Icon name="close" size={12} />
        </button>
      </div>
      <div className="card-body">
        {['feather', 'opacity', 'expansion'].map((k) => (mask.props[k] ? <PropRow key={k} layer={layer} comp={comp} group={group} propKey={k} prop={mask.props[k]} /> : null))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ layer switches & timing */

function LayerSection({ layer, comp }: { layer: Layer; comp: Comp }) {
  const index = comp.layers.findIndex((l) => l.id === layer.id);
  const parents = comp.layers.filter((l) => l.id !== layer.id);
  const step = 1 / comp.fps;
  return (
    <Section id="layer" title="Layer" defaultFolded>
      <Field label="Blend">
        <select className="mini-select wide" value={layer.blend} onChange={(e) => setLayerField(layer.id, { blend: e.target.value as BlendMode })} data-testid="ins-blend">
          {BLEND_MODES.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Matte" title="Use the layer above as a matte">
        <select className="mini-select wide" disabled={index === 0} value={layer.matte} onChange={(e) => setLayerField(layer.id, { matte: e.target.value as MatteMode })}>
          {MATTE_MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Parent" title="This layer follows its parent's movement">
        <select className="mini-select wide" value={layer.parentId ?? ''} onChange={(e) => setParent(layer.id, e.target.value || null)}>
          <option value="">None</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {comp.layers.indexOf(p) + 1}. {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Timing">
        <span className="vec">
          <NumberField value={layer.inPoint} min={0} step={step} decimals={2} unit="s" onChange={(v) => trimLayer(layer.id, 'in', v)} title="First visible moment" />
          <span className="x-sep">→</span>
          <NumberField value={layer.outPoint} min={0} step={step} decimals={2} unit="s" onChange={(v) => trimLayer(layer.id, 'out', v)} title="Last visible moment" />
        </span>
      </Field>
      <Field label="Switches">
        <div className="chips">
          <Chip on={layer.motionBlur} onClick={() => setLayerField(layer.id, { motionBlur: !layer.motionBlur })} title="Motion blur (also needs Motion Blur on in the timeline)">
            Motion blur
          </Chip>
          <Chip on={layer.solo} onClick={() => setLayerField(layer.id, { solo: !layer.solo })} title="Show only soloed layers">
            Solo
          </Chip>
        </div>
      </Field>
    </Section>
  );
}
