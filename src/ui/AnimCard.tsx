import { useState } from 'react';
import { instanceAnimatorSetting, instanceEase, instanceSpan, instanceSpeed } from '../core/anims';
import { ANIM_SLOTS, type AnimSlot, type Comp, type Ease, type Layer } from '../core/types';
import { alignAnim, previewRange, removeAnim, setAnimEase, setAnimLength, setAnimSpeed, setAnimStart, setAnimStrength, setAnimTextSetting } from '../state/actions';
import { batch } from '../state/store';
import { EaseButton } from './EaseEditor';
import { NumberField, SliderField, type EditHow } from './fields';
import { Icon } from './Icon';
import { sharedInstances, type SharedInstance } from './multi';
import { MenuPopover, useAnchor, type MenuEntry } from './Popover';
import { AnimPicker } from './Pickers';
import { NamePrompt } from './NamePrompt';
import { Field, Section } from './Section';
import { saveAnimationPreset } from '../state/presets';

type CompLite = Pick<Comp, 'fps' | 'duration'>;

const SLOT_ICON: Record<AnimSlot, 'startOfLayer' | 'endOfLayer' | 'loop' | 'sparkle'> = { in: 'startOfLayer', out: 'endOfLayer', loop: 'loop', emph: 'sparkle' };

/**
 * Everything applied from the Library as an animation, grouped by In / Out / Loop / Accent, each fully adjustable.
 * With several layers selected it shows the animations they all share and edits them together.
 */
export function AnimateSection({ layers, comp }: { layers: Layer[]; comp: CompLite }) {
  const layer = layers[0];
  const shared = sharedInstances(layers);
  const partial = layers.reduce((n, l) => n + l.anims.length, 0) - shared.length * layers.length;
  return (
    <Section id="animate" title="Animate" count={shared.length}>
      <div className="anim-slots" data-testid="animate">
        {ANIM_SLOTS.map((slot) => (
          <SlotRow key={slot.id} layer={layer} comp={comp} slot={slot.id} label={slot.label} hint={slot.hint} items={shared.filter((s) => s.items[0].inst.slot === slot.id)} many={layers.length > 1} />
        ))}
      </div>
      {layers.length > 1 && partial > 0 && <div className="hint compact">{partial} other animation{partial === 1 ? ' is' : 's are'} on only some of these layers. Focus a layer to edit {partial === 1 ? 'it' : 'them'}.</div>}
    </Section>
  );
}

function SlotRow({ layer, comp, slot, label, hint, items, many }: { layer: Layer; comp: CompLite; slot: AnimSlot; label: string; hint: string; items: SharedInstance[]; many: boolean }) {
  const picker = useAnchor();
  return (
    <div className={`slot ${items.length ? 'has' : ''}`} data-testid={`slot-${slot}`}>
      <div className="slot-label" title={hint}>
        <Icon name={SLOT_ICON[slot]} size={13} />
        {label}
      </div>
      <div className="slot-body">
        {items.map((shared) => (
          <AnimCard key={shared.items[0].inst.id} comp={comp} shared={shared} />
        ))}
        <button className="add-btn" onClick={picker.toggle} title={many ? `${hint} Applies to every selected layer.` : hint} data-testid={`add-${slot}`}>
          <Icon name="plus" size={12} />
          {items.length ? `Add another` : `Add ${label.toLowerCase()} animation`}
        </button>
        {picker.anchor && <AnimPicker layer={layer} slot={slot} anchor={picker.anchor} onClose={picker.close} />}
      </div>
    </div>
  );
}

const differs = (values: number[]) => values.some((v) => Math.abs(v - values[0]) > 1e-6);

function AnimCard({ comp, shared }: { comp: CompLite; shared: SharedInstance }) {
  const { layer, inst } = shared.items[0];
  const many = shared.items.length > 1;
  const [open, setOpen] = useState(true);
  const menu = useAnchor();
  const replace = useAnchor();
  const namer = useAnchor();
  const each = (run: (layerId: string, instId: string, l: Layer) => void) => batch(() => shared.items.forEach((i) => run(i.layer.id, i.inst.id, i.layer)));

  const spans = shared.items.map((i) => instanceSpan(i.layer, i.inst.id));
  const span = spans[0];
  const timed = !!span && span.end - span.start > 1e-6;
  const ease = instanceEase(layer, inst.id);
  const eases = shared.items.map((i) => JSON.stringify(instanceEase(i.layer, i.inst.id)));
  const speed = instanceSpeed(layer, inst.id);
  const units = instanceAnimatorSetting(layer, inst.id, 'units');
  const random = instanceAnimatorSetting(layer, inst.id, 'random');
  const step = 1 / comp.fps;

  const mixedStart = differs(spans.map((s) => s?.start ?? 0));
  const mixedLength = differs(spans.map((s) => (s ? s.end - s.start : 0)));
  const mixedStrength = differs(shared.items.map((i) => i.inst.strength));
  const mixedSpeed = speed !== null && differs(shared.items.map((i) => instanceSpeed(i.layer, i.inst.id) ?? 0));
  const mixedEase = eases.some((e) => e !== eases[0]);
  const mixedUnits = units !== null && differs(shared.items.map((i) => instanceAnimatorSetting(i.layer, i.inst.id, 'units') ?? 0));
  const mixedRandom = random !== null && differs(shared.items.map((i) => (instanceAnimatorSetting(i.layer, i.inst.id, 'random') ?? 0) >= 0.5 ? 1 : 0));

  /** Typing sets every layer to the value; dragging moves each by the same amount. */
  const timing = (pick: (i: number) => number, shown: number, apply: (layerId: string, instId: string, v: number) => void) => (v: number, how: EditHow = 'set') =>
    batch(() => shared.items.forEach((it, i) => apply(it.layer.id, it.inst.id, how === 'delta' ? pick(i) + (v - shown) : v)));

  const entries: MenuEntry[] = [
    { label: 'Replace…', icon: <Icon name="wand" />, run: () => menu.anchor && replace.openAt(menu.anchor) },
    ...(timed
      ? [
          { label: "Start at the layer's first frame", icon: <Icon name="startOfLayer" />, run: () => each((l, i) => alignAnim(l, i, 'start')), sep: true },
          { label: "End at the layer's last frame", icon: <Icon name="endOfLayer" />, run: () => each((l, i) => alignAnim(l, i, 'end')) },
        ]
      : []),
    ...(many ? [] : [{ label: 'Save as preset…', icon: <Icon name="heart" />, run: () => menu.anchor && namer.openAt(menu.anchor), sep: true }]),
    { label: many ? `Remove from all ${shared.items.length} layers` : 'Remove animation', icon: <Icon name="trash" />, run: () => each((l, i) => removeAnim(l, i)), danger: true, sep: many },
  ];

  return (
    <div className={`anim-card ${open ? 'open' : ''}`} data-testid="anim-card" data-template={inst.template}>
      <div className="ac-head">
        <button className="ac-name" onClick={() => setOpen(!open)} title={open ? 'Collapse' : 'Expand'}>
          <Icon name="chevronRight" size={11} className="ac-chevron" />
          <span>{inst.name}</span>
          {many && <small className="tag">× {shared.items.length}</small>}
        </button>
        {span && (
          <button className="icon-btn" title="Preview this animation" onClick={() => previewRange(span.start, span.end)} data-testid="anim-preview">
            <Icon name="play" size={12} />
          </button>
        )}
        <button className="icon-btn" title="More" onClick={menu.toggle}>
          <Icon name="more" size={13} />
        </button>
        <button className="icon-btn" title={many ? 'Remove this animation from every selected layer' : 'Remove this animation'} onClick={() => each((l, i) => removeAnim(l, i))} data-testid="anim-remove">
          <Icon name="close" size={12} />
        </button>
      </div>
      {open && (
        <div className="ac-body">
          {timed && (
            <div className="ac-pair">
              <label>
                <span>Start</span>
                <NumberField
                  value={span.start}
                  mixed={mixedStart}
                  min={0}
                  step={step}
                  decimals={2}
                  unit="s"
                  onChange={timing((i) => spans[i]?.start ?? 0, span.start, setAnimStart)}
                  title="When it begins (seconds)"
                />
              </label>
              <label>
                <span>Length</span>
                <NumberField
                  value={span.end - span.start}
                  mixed={mixedLength}
                  min={step}
                  step={step}
                  decimals={2}
                  unit="s"
                  onChange={timing((i) => (spans[i] ? spans[i]!.end - spans[i]!.start : 0), span.end - span.start, setAnimLength)}
                  title="How long it takes (seconds)"
                />
              </label>
            </div>
          )}
          <Field label="Strength" title="How far it strays from the layer's resting values">
            <SliderField
              value={Math.round(inst.strength * 100)}
              mixed={mixedStrength}
              min={10}
              max={300}
              step={5}
              decimals={0}
              unit="%"
              onChange={(v, how = 'set') =>
                batch(() => shared.items.forEach((it) => setAnimStrength(it.layer.id, it.inst.id, (how === 'delta' ? Math.round(it.inst.strength * 100 + (v - Math.round(inst.strength * 100))) : v) / 100)))
              }
            />
          </Field>
          {speed !== null && (
            <Field label="Speed">
              <NumberField value={speed} mixed={mixedSpeed} min={0.05} step={0.1} decimals={2} unit="/s" onChange={(v) => each((l, i) => setAnimSpeed(l, i, v))} />
            </Field>
          )}
          {ease !== null && timed && (
            <Field label="Easing" title="The curve every step of this animation follows">
              <EaseButton ease={ease as Ease} mixed={mixedEase} title={`${inst.name} easing`} onChange={(e) => each((l, i) => setAnimEase(l, i, e))} />
            </Field>
          )}
          {units !== null && (
            <Field label="Animate by">
              <select className="mini-select" value={mixedUnits ? '' : units} onChange={(e) => each((l, i) => setAnimTextSetting(l, i, 'units', Number(e.target.value)))}>
                {mixedUnits && (
                  <option value="" disabled>
                    Mixed
                  </option>
                )}
                <option value={0}>Characters</option>
                <option value={1}>Words</option>
                <option value={2}>Lines</option>
              </select>
            </Field>
          )}
          {random !== null && (
            <Field label="Order">
              <select className="mini-select" value={mixedRandom ? '' : random >= 0.5 ? 1 : 0} onChange={(e) => each((l, i) => setAnimTextSetting(l, i, 'random', Number(e.target.value)))}>
                {mixedRandom && (
                  <option value="" disabled>
                    Mixed
                  </option>
                )}
                <option value={0}>In order</option>
                <option value={1}>Random</option>
              </select>
            </Field>
          )}
        </div>
      )}
      {menu.anchor && <MenuPopover anchor={menu.anchor} onClose={menu.close} entries={entries} width={260} side={menu.anchor.left > window.innerWidth / 2 ? 'left' : 'bottom'} />}
      {replace.anchor && <AnimPicker layer={layer} slot={inst.slot} anchor={replace.anchor} onClose={replace.close} />}
      {namer.anchor && <NamePrompt anchor={namer.anchor} title="Save as preset" initial={`${inst.name} (mine)`} onSave={(name) => saveAnimationPreset(layer, inst, name)} onClose={namer.close} />}
    </div>
  );
}
