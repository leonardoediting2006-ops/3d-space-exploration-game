import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getEffectDef } from '../core/effectDefs';
import type { AnimatorKind } from '../core/factory';
import {
  BLEND_MODES,
  MASK_MODES,
  MATTE_MODES,
  type BlendMode,
  type Comp,
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
  moveEffects,
  openComp,
  precompose,
  removeEffects,
  removeMask,
  removeTextAnimator,
  resetTransform,
  selectLayers,
  setEffectsEnabled,
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
import { commonContentKeys, commonOf, sharedEffects, type Member, type SharedEffect } from './multi';
import { PropRow } from './PropRow';
import { Waveform } from './Waveform';
import { Field, Section } from './Section';

type CompLite = Pick<Comp, 'fps' | 'width' | 'height' | 'duration'>;

/** The right-hand panel: edits whatever is selected (all of it, when several layers are), or the composition when nothing is. */
export function Inspector() {
  const comp = useActiveComp();
  const selection = useApp((s) => s.selection);
  const layers = selection.map((id) => comp.layers.find((l) => l.id === id)).filter((l): l is Layer => !!l);
  if (!layers.length) return <CompInspector comp={comp} />;
  return <LayerInspector layers={layers} comp={comp} />;
}

/** The same property on the layers after the first, for rows that edit all of them. */
const peersOf = (layers: Layer[], pick: (l: Layer) => { group: PropGroup; prop: Prop | undefined }): Member[] =>
  layers.slice(1).flatMap((layer) => {
    const { group, prop } = pick(layer);
    return prop ? [{ layer, group, prop }] : [];
  });

function LayerInspector({ layers: selected, comp }: { layers: Layer[]; comp: Comp }) {
  // sound-only layers have no picture, so the picture sections skip them
  const audioOnly = selected.every((l) => l.type === 'audio');
  const layers = audioOnly ? selected : selected.filter((l) => l.type !== 'audio');
  const sound = selected.filter((l) => l.content.volume);
  const layer = layers[0];
  const d = layer.data;
  const multi = layers.length > 1;
  const ids = layers.map((l) => l.id);
  return (
    <div className="inspector" data-testid="inspector">
      <LayerHeader layers={selected} />
      {!audioOnly && <AlignBar ids={ids} />}

      {!audioOnly && (
        <Section id="transform" title="Transform" actions={<ResetTransformButton ids={ids} />}>
          {(['position', 'scale', 'rotation', 'opacity', 'anchor'] as const).map((k) => (
            <PropRow key={k} layer={layer} comp={comp} group="transform" propKey={k} prop={layer.transform[k]} label={k === 'anchor' ? 'Anchor' : undefined} peers={peersOf(layers, (l) => ({ group: 'transform', prop: l.transform[k] }))} />
          ))}
        </Section>
      )}

      {sound.length > 0 && <SoundSection layers={sound} comp={comp} />}
      {!audioOnly && <SourceSection layers={layers} comp={comp} />}
      {!audioOnly && <AnimateSection layers={layers} comp={comp} />}
      {!audioOnly && <EffectsSection layers={layers} comp={comp} />}
      {!audioOnly && !multi && d.type === 'text' && <AnimatorsSection layer={layer} comp={comp} />}
      {!audioOnly && !multi && d.type === 'shape' && <TrimSection layer={layer} comp={comp} />}
      {!audioOnly && !multi && d.type !== 'null' && <MasksSection layer={layer} comp={comp} />}
      <LayerSection layers={layers} comp={comp} />
      {selected.length > 1 && <div className="hint compact multi-note">Keyframe curves, letter animators, masks and trim paths are edited one layer at a time. Click a layer's name above to focus it.</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ sound */

const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

/** Volume, pan and mute for layers that make sound (audio layers, and video with a sound track). */
function SoundSection({ layers, comp }: { layers: Layer[]; comp: Comp }) {
  const layer = layers[0];
  const ids = layers.map((l) => l.id);
  const allMuted = layers.every((l) => l.muted);
  const project = useApp((s) => s.project);
  const a = layer.data.type === 'audio' || layer.data.type === 'video' ? project.assets[layer.data.assetId] : undefined;
  return (
    <Section id="sound" title="Sound">
      {layers.length === 1 && a && (
        <div className="sound-info" data-testid="sound-info">
          <div className="sound-name" title={a.name}>
            {a.name}
          </div>
          <small>{a.duration ? `${clock(a.duration)} long` : ''}</small>
          {layer.data.type === 'audio' && <Waveform assetId={layer.data.assetId} from={layer.inPoint - layer.start} to={layer.outPoint - layer.start} width={300} height={44} color="rgba(127,158,255,0.9)" className="sound-wave" />}
        </div>
      )}
      {['volume', 'pan'].map((k) => (
        <PropRow key={k} layer={layer} comp={comp} group="content" propKey={k} prop={layer.content[k]} peers={peersOf(layers, (l) => ({ group: 'content', prop: l.content[k] }))} />
      ))}
      <Field label="Mute">
        <div className="chips">
          <Chip on={allMuted} onClick={() => setLayerField(ids, { muted: !allMuted })} title="Leave this sound out of the preview and the export" testId="mute-toggle">
            {allMuted ? 'Muted' : 'Mute'}
          </Chip>
        </div>
      </Field>
    </Section>
  );
}

/* ------------------------------------------------------------------ header */

function LayerHeader({ layers }: { layers: Layer[] }) {
  const layer = layers[0];
  const multi = layers.length > 1;
  const ids = layers.map((l) => l.id);
  const [name, setName] = useState(layer.name);
  const menu = useAnchor();
  useEffect(() => setName(layer.name), [layer.id, layer.name]);
  const commit = () => {
    const n = name.trim();
    if (n && n !== layer.name) setLayerField(layer.id, { name: n });
    else setName(layer.name);
  };
  const soundOnly = layers.every((l) => l.type === 'audio');
  const allMutedHere = layers.every((l) => l.muted);
  const allVisible = layers.every((l) => l.visible);
  const allLocked = layers.every((l) => l.locked);
  const entries: MenuEntry[] = [
    { label: 'Duplicate', hint: 'Ctrl+D', icon: <Icon name="copy" />, run: () => duplicateLayers(ids) },
    { label: 'Split at playhead', hint: 'Ctrl+Shift+D', icon: <Icon name="layers" />, run: () => splitLayers(ids) },
    { label: 'Pre-compose…', hint: 'Ctrl+Shift+C', icon: <Icon name="comp" />, run: () => precompose(ids) },
    { label: 'Reset transform', icon: <Icon name="reset" />, run: () => resetTransform(ids), sep: true },
    { label: 'Delete', hint: 'Del', icon: <Icon name="trash" />, run: () => deleteLayers(ids), danger: true, sep: true },
  ];
  return (
    <div className="ins-header">
      {multi ? (
        <>
          <span className="type-badge multi">
            <Icon name="layers" size={14} />
          </span>
          <span className="ins-name multi-title" data-testid="ins-multi-title">
            {layers.length} layers
          </span>
        </>
      ) : (
        <>
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
        </>
      )}
      {soundOnly ? (
        <button className={`icon-btn ${allMutedHere ? 'off' : ''}`} title={allMutedHere ? 'Unmute' : 'Mute'} onClick={() => setLayerField(ids, { muted: !allMutedHere })} data-testid="ins-visible">
          <Icon name={allMutedHere ? 'volumeOff' : 'volume'} />
        </button>
      ) : (
        <button className={`icon-btn ${allVisible ? '' : 'off'}`} title={allVisible ? 'Hide layer' : 'Show layer'} onClick={() => setLayerField(ids, { visible: !allVisible })} data-testid="ins-visible">
          <Icon name={allVisible ? 'eye' : 'eyeOff'} />
        </button>
      )}
      <button className={`icon-btn ${allLocked ? 'on' : ''}`} title={allLocked ? 'Unlock layer' : 'Lock layer'} onClick={() => setLayerField(ids, { locked: !allLocked })}>
        <Icon name={allLocked ? 'lock' : 'unlock'} />
      </button>
      <button className="icon-btn" title="More" onClick={menu.toggle}>
        <Icon name="more" />
      </button>
      {menu.anchor && <MenuPopover anchor={menu.anchor} onClose={menu.close} entries={entries} side="left" />}
      {multi && <MultiBanner layers={layers} />}
      {layer.type === 'precomp' && !multi && layer.data.type === 'precomp' && (
        <button className="ins-open-comp" onClick={() => openComp((layer.data as Extract<LayerData, { type: 'precomp' }>).compId)}>
          Open composition <Icon name="arrowRight" size={12} />
        </button>
      )}
    </div>
  );
}

/** Shown when several layers are selected: how editing works, a way back to one layer, and a stagger control. */
function MultiBanner({ layers }: { layers: Layer[] }) {
  const [step, setStep] = useState(0.1);
  const shown = layers.slice(0, 6);
  return (
    <div className="ins-multi" data-testid="multi-banner">
      <div className="multi-chips">
        {shown.map((l) => (
          <button key={l.id} className="chip" title="Edit only this layer" onClick={() => selectLayers([l.id])}>
            {l.name}
          </button>
        ))}
        {layers.length > shown.length && <span className="more-count">+{layers.length - shown.length} more</span>}
      </div>
      <div>
        You are editing all {layers.length} together. Where they differ a field says <b>Mixed</b>: drag it to move them all by the same amount, or type to set them all.
      </div>
      <div className="stagger-row">
        <span>Stagger entrances</span>
        <NumberField value={step} min={0} max={5} step={0.01} decimals={2} unit="s" onChange={setStep} title="Delay between one layer's entrance and the next" />
        <button className="chip" onClick={() => staggerAnimations(layers.map((l) => l.id), step)} data-testid="stagger">
          Apply
        </button>
      </div>
    </div>
  );
}

function ResetTransformButton({ ids }: { ids: string[] }) {
  return (
    <button className="icon-btn" title="Reset position, scale, rotation and opacity" onClick={() => resetTransform(ids)}>
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

type TextData = Extract<LayerData, { type: 'text' }>;
type ShapeData = Extract<LayerData, { type: 'shape' }>;
type SizedData = Extract<LayerData, { type: 'solid' | 'adjustment' | 'null' }>;

/** Content properties a layer does not need to show right now (a stroke colour with no stroke). */
function hiddenContentKeys(layer: Layer): Set<string> {
  const d = layer.data;
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
  return hidden;
}

const SOURCE_TITLE: Record<string, string> = { text: 'Text', shape: 'Shape', solid: 'Solid', image: 'Image', video: 'Video', precomp: 'Composition', adjustment: 'Adjustment' };

function SourceSection({ layers, comp }: { layers: Layer[]; comp: Comp }) {
  const layer = layers[0];
  const d = layer.data;
  const multi = layers.length > 1;
  const ids = layers.map((l) => l.id);
  const sameType = layers.every((l) => l.data.type === d.type);
  const typing = useTypingGesture();
  const set = (patch: Partial<LayerData>) => updateLayerData(ids, patch);

  // a property is hidden only if no selected layer needs it
  const hidden = new Set([...hiddenContentKeys(layer)].filter((k) => layers.every((l) => hiddenContentKeys(l).has(k))));
  const keys = (multi ? commonContentKeys(layers) : Object.keys(layer.content)).filter((k) => !hidden.has(k) && k !== 'volume' && k !== 'pan');
  const rows = keys.map((k) => (
    <PropRow key={k} layer={layer} comp={comp} group="content" propKey={k} prop={layer.content[k]} peers={peersOf(layers, (l) => ({ group: 'content', prop: l.content[k] }))} />
  ));
  const title = multi && !sameType ? 'Shared' : (SOURCE_TITLE[d.type] ?? 'Source');
  if (multi && !sameType && !rows.length) return null;

  /** A toggle shared by several layers: lit only when every layer has it, and one click sets them all alike. */
  const flag = (get: (l: Layer) => boolean, patch: (on: boolean) => Partial<LayerData>) => {
    const all = layers.every(get);
    return { on: all, onClick: () => set(patch(!all)) };
  };
  const fontOf = commonOf(layers, (l) => (l.data as TextData).font);
  const alignOf = commonOf(layers, (l) => (l.data as TextData).align);
  const capOf = commonOf(layers, (l) => (l.data as ShapeData).lineCap);
  const joinOf = commonOf(layers, (l) => (l.data as ShapeData).lineJoin);
  const widthOf = commonOf(layers, (l) => (l.data as SizedData).width);
  const heightOf = commonOf(layers, (l) => (l.data as SizedData).height);
  const anyStroke = layers.some((l) => (l.data as ShapeData).stroke);

  return (
    <Section id="source" title={title}>
      {sameType && d.type === 'text' && (
        <>
          {!multi && (
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
          )}
          <Field label="Font">
            <select className="mini-select wide" value={fontOf.mixed ? '' : fontOf.value} onChange={(e) => set({ font: e.target.value })} data-testid="font-select">
              {fontOf.mixed && (
                <option value="" disabled>
                  Mixed
                </option>
              )}
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
              {!fontOf.mixed && ![...GENERIC_FONTS, ...installedFonts()].some((f) => f.css === fontOf.value) && <option value={fontOf.value}>{fontOf.value.split(',')[0].replace(/"/g, '')}</option>}
            </select>
          </Field>
          <Field label="Style">
            <div className="chips">
              <Chip {...flag((l) => (l.data as TextData).bold, (bold) => ({ bold }))} title="Bold">
                <b>B</b>
              </Chip>
              <Chip {...flag((l) => (l.data as TextData).italic, (italic) => ({ italic }))} title="Italic">
                <i>I</i>
              </Chip>
              <Seg value={alignOf.mixed ? ('' as TextData['align']) : alignOf.value} onChange={(align) => set({ align })} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]} />
            </div>
          </Field>
          <Field label="Paint">
            <div className="chips">
              <Chip {...flag((l) => (l.data as TextData).fill !== false, (fill) => ({ fill }))}>Fill</Chip>
              <Chip {...flag((l) => (l.data as TextData).stroke, (stroke) => ({ stroke }))} testId="stroke-toggle">
                Stroke
              </Chip>
            </div>
          </Field>
        </>
      )}
      {sameType && d.type === 'shape' && (
        <Field label="Paint">
          <div className="chips">
            <Chip {...flag((l) => (l.data as ShapeData).fill, (fill) => ({ fill }))}>Fill</Chip>
            <Chip {...flag((l) => (l.data as ShapeData).stroke, (stroke) => ({ stroke }))} testId="stroke-toggle">
              Stroke
            </Chip>
          </div>
        </Field>
      )}
      {sameType && d.type === 'shape' && anyStroke && (
        <>
          <Field label="Line cap">
            <Seg value={capOf.mixed ? ('' as ShapeData['lineCap']) : capOf.value} onChange={(lineCap) => set({ lineCap })} options={[{ value: 'butt', label: 'Flat' }, { value: 'round', label: 'Round' }, { value: 'square', label: 'Square' }]} />
          </Field>
          <Field label="Corners">
            <Seg value={joinOf.mixed ? ('' as ShapeData['lineJoin']) : joinOf.value} onChange={(lineJoin) => set({ lineJoin })} options={[{ value: 'miter', label: 'Sharp' }, { value: 'round', label: 'Round' }, { value: 'bevel', label: 'Bevel' }]} />
          </Field>
        </>
      )}
      {sameType && (d.type === 'solid' || d.type === 'adjustment' || d.type === 'null') && (
        <Field label="Size">
          <span className="vec">
            <NumberField value={widthOf.value} mixed={widthOf.mixed} min={1} max={16384} decimals={0} unit="px" onChange={(v) => set({ width: v })} />
            <span className="x-sep">×</span>
            <NumberField value={heightOf.value} mixed={heightOf.mixed} min={1} max={16384} decimals={0} unit="px" onChange={(v) => set({ height: v })} />
          </span>
        </Field>
      )}
      {!multi && d.type === 'precomp' && (
        <Field label="Contents">
          <button className="chip" onClick={() => openComp(d.compId)}>
            Open composition
          </button>
        </Field>
      )}
      {!multi && (d.type === 'image' || d.type === 'video') && <div className="hint compact">Footage layer.</div>}
      {sameType && d.type === 'adjustment' && <div className="hint compact">Effects on {multi ? 'these layers' : 'this layer'} change everything beneath {multi ? 'them' : 'it'}.</div>}
      {rows}
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

function EffectsSection({ layers, comp }: { layers: Layer[]; comp: Comp }) {
  const layer = layers[0];
  const multi = layers.length > 1;
  const picker = useAnchor();
  const namer = useAnchor();
  const shared = sharedEffects(layers);
  const partial = layers.reduce((n, l) => n + l.effects.length, 0) - shared.length * layers.length;
  return (
    <Section
      id="effects"
      title="Effects"
      count={shared.length}
      actions={
        <>
          {!multi && layer.effects.length > 0 && (
            <button className="icon-btn" onClick={namer.toggle} title="Save these effects as a look you can reuse" data-testid="save-look">
              <Icon name="heart" size={13} />
            </button>
          )}
          <button className="add-chip" onClick={picker.toggle} data-testid="add-effect" title={multi ? 'Add an effect or look to every selected layer' : 'Add an effect or a ready-made look'}>
            <Icon name="plus" size={12} /> Add
          </button>
        </>
      }
    >
      {namer.anchor && <NamePrompt anchor={namer.anchor} title="Save these effects as a look" initial="My look" onSave={(name) => saveLookPreset(layer, name)} onClose={namer.close} />}
      {shared.length === 0 && (
        <div className="empty-hint">
          {multi ? 'No effect is on all of these layers.' : 'Blur, glow, colour grading and more.'}
          <button className="link" onClick={picker.toggle}>
            Add an effect
          </button>
        </div>
      )}
      {shared.map((item, i) => (
        <EffectCard key={item.items[0].fx.id} comp={comp} shared={item} index={i} last={i === shared.length - 1} />
      ))}
      {multi && partial > 0 && <div className="hint compact">{partial} other effect{partial === 1 ? ' is' : 's are'} on only some of these layers. Focus a layer to edit {partial === 1 ? 'it' : 'them'}.</div>}
      {picker.anchor && <EffectPicker layer={layer} anchor={picker.anchor} onClose={picker.close} />}
    </Section>
  );
}

function EffectCard({ comp, shared, index, last }: { comp: CompLite; shared: SharedEffect; index: number; last: boolean }) {
  const { layer, fx } = shared.items[0];
  const multi = shared.items.length > 1;
  const open = useApp((s) => !s.folded[`fx:${fx.id}`]);
  const targets = shared.items.map((i) => ({ layerId: i.layer.id, effectId: i.fx.id }));
  const allOn = shared.items.every((i) => i.fx.enabled);
  const owner = fx.inst ? layer.anims.find((a) => a.id === fx.inst) : undefined;
  const tag = owner ? `from ${owner.name}` : fx.source?.startsWith('look:') ? 'look' : fx.source?.startsWith('style:') ? 'style' : '';
  return (
    <div className={`card fx-card ${allOn ? '' : 'disabled'}`} data-testid="fx-card">
      <div className="card-head">
        <button className="card-name" onClick={() => appStore.set((s) => ({ folded: { ...s.folded, [`fx:${fx.id}`]: open } }))}>
          <Icon name="chevronRight" size={11} className={`ac-chevron ${open ? 'open' : ''}`} />
          <span>{getEffectDef(fx.type)?.name ?? fx.type}</span>
          {tag && !multi && <small className="tag">{tag}</small>}
          {multi && <small className="tag">× {shared.items.length} layers</small>}
        </button>
        <button className="icon-btn" title="Move up" disabled={index === 0} onClick={() => moveEffects(targets, -1)}>
          <Icon name="chevronDown" size={12} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <button className="icon-btn" title="Move down" disabled={last} onClick={() => moveEffects(targets, 1)}>
          <Icon name="chevronDown" size={12} />
        </button>
        <button className={`icon-btn ${allOn ? '' : 'off'}`} title={allOn ? 'Turn off' : 'Turn on'} onClick={() => setEffectsEnabled(targets, !allOn)} data-testid="fx-enable">
          <Icon name={allOn ? 'eye' : 'eyeOff'} size={13} />
        </button>
        <button className="icon-btn" title="Remove effect" onClick={() => removeEffects(targets)} data-testid="fx-remove">
          <Icon name="close" size={12} />
        </button>
      </div>
      {open && (
        <div className="card-body">
          {Object.entries(fx.props).map(([k, p]) => (
            <PropRow
              key={k}
              layer={layer}
              comp={comp}
              group={`fx:${fx.id}` as PropGroup}
              propKey={k}
              prop={p}
              peers={shared.items.slice(1).flatMap((i) => (i.fx.props[k] ? [{ layer: i.layer, group: `fx:${i.fx.id}` as PropGroup, prop: i.fx.props[k] }] : []))}
            />
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

function LayerSection({ layers, comp }: { layers: Layer[]; comp: Comp }) {
  const layer = layers[0];
  const multi = layers.length > 1;
  const ids = layers.map((l) => l.id);
  const index = comp.layers.findIndex((l) => l.id === layer.id);
  const parents = comp.layers.filter((l) => l.id !== layer.id);
  const step = 1 / comp.fps;
  const blend = commonOf(layers, (l) => l.blend);
  const allBlur = layers.every((l) => l.motionBlur);
  const allSolo = layers.every((l) => l.solo);
  const soundOnly = layers.every((l) => l.type === 'audio');
  return (
    <Section id="layer" title="Layer" defaultFolded={!soundOnly}>
      {!soundOnly && (
      <Field label="Blend">
        <select className="mini-select wide" value={blend.mixed ? '' : blend.value} onChange={(e) => setLayerField(ids, { blend: e.target.value as BlendMode })} data-testid="ins-blend">
          {blend.mixed && (
            <option value="" disabled>
              Mixed
            </option>
          )}
          {BLEND_MODES.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </Field>
      )}
      {!multi && (
        <>
          {!soundOnly && (
          <Field label="Matte" title="Use the layer above as a matte">
            <select className="mini-select wide" disabled={index === 0} value={layer.matte} onChange={(e) => setLayerField(layer.id, { matte: e.target.value as MatteMode })}>
              {MATTE_MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
          )}
          {!soundOnly && (
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
          )}
          <Field label="Timing">
            <span className="vec">
              <NumberField value={layer.inPoint} min={0} step={step} decimals={2} unit="s" onChange={(v) => trimLayer(layer.id, 'in', v)} title="First visible moment" />
              <span className="x-sep">→</span>
              <NumberField value={layer.outPoint} min={0} step={step} decimals={2} unit="s" onChange={(v) => trimLayer(layer.id, 'out', v)} title="Last visible moment" />
            </span>
          </Field>
        </>
      )}
      <Field label="Switches">
        <div className="chips">
          {!soundOnly && (
            <Chip on={allBlur} onClick={() => setLayerField(ids, { motionBlur: !allBlur })} title="Motion blur (also needs Motion Blur on in the timeline)">
              Motion blur
            </Chip>
          )}
          <Chip on={allSolo} onClick={() => setLayerField(ids, { solo: !allSolo })} title="Show only soloed layers">
            Solo
          </Chip>
        </div>
      </Field>
    </Section>
  );
}
