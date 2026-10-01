import { useState } from 'react';
import { instanceAnimatorSetting, instanceEase, instanceSpan, instanceSpeed } from '../core/anims';
import { ANIM_SLOTS, type AnimInstance, type AnimSlot, type Comp, type Layer } from '../core/types';
import { alignAnim, removeAnim, setAnimEase, setAnimLength, setAnimSpeed, setAnimStart, setAnimStrength, setAnimTextSetting } from '../state/actions';
import { EaseButton } from './EaseEditor';
import { NumberField, SliderField } from './fields';
import { Icon } from './Icon';
import { MenuPopover, useAnchor, type MenuEntry } from './Popover';
import { AnimPicker } from './Pickers';
import { Field, Section } from './Section';

const SLOT_ICON: Record<AnimSlot, 'startOfLayer' | 'endOfLayer' | 'loop' | 'sparkle'> = { in: 'startOfLayer', out: 'endOfLayer', loop: 'loop', emph: 'sparkle' };

/** Everything applied from the Library as an animation, grouped by In / Out / Loop / Accent, each fully adjustable. */
export function AnimateSection({ layer, comp }: { layer: Layer; comp: Pick<Comp, 'fps' | 'duration'> }) {
  const alive = layer.anims;
  return (
    <Section id="animate" title="Animate" count={alive.length}>
      <div className="anim-slots" data-testid="animate">
        {ANIM_SLOTS.map((slot) => {
          const items = alive.filter((a) => a.slot === slot.id);
          return <SlotRow key={slot.id} layer={layer} comp={comp} slot={slot.id} label={slot.label} hint={slot.hint} items={items} />;
        })}
      </div>
    </Section>
  );
}

function SlotRow({ layer, comp, slot, label, hint, items }: { layer: Layer; comp: Pick<Comp, 'fps' | 'duration'>; slot: AnimSlot; label: string; hint: string; items: AnimInstance[] }) {
  const picker = useAnchor();
  return (
    <div className={`slot ${items.length ? 'has' : ''}`} data-testid={`slot-${slot}`}>
      <div className="slot-label" title={hint}>
        <Icon name={SLOT_ICON[slot]} size={13} />
        {label}
      </div>
      <div className="slot-body">
        {items.map((inst) => (
          <AnimCard key={inst.id} layer={layer} comp={comp} inst={inst} />
        ))}
        <button className="add-btn" onClick={picker.toggle} title={hint} data-testid={`add-${slot}`}>
          <Icon name="plus" size={12} />
          {items.length ? `Add another` : `Add ${label.toLowerCase()} animation`}
        </button>
        {picker.anchor && <AnimPicker layer={layer} slot={slot} anchor={picker.anchor} onClose={picker.close} />}
      </div>
    </div>
  );
}

function AnimCard({ layer, comp, inst }: { layer: Layer; comp: Pick<Comp, 'fps' | 'duration'>; inst: AnimInstance }) {
  const [open, setOpen] = useState(true);
  const menu = useAnchor();
  const replace = useAnchor();
  const span = instanceSpan(layer, inst.id);
  const timed = !!span && span.end - span.start > 1e-6;
  const ease = instanceEase(layer, inst.id);
  const speed = instanceSpeed(layer, inst.id);
  const units = instanceAnimatorSetting(layer, inst.id, 'units');
  const random = instanceAnimatorSetting(layer, inst.id, 'random');
  const step = 1 / comp.fps;

  const entries: MenuEntry[] = [
    { label: 'Replace…', icon: <Icon name="wand" />, run: () => menu.anchor && replace.openAt(menu.anchor) },
    ...(timed
      ? [
          { label: 'Start at the layer\'s first frame', icon: <Icon name="startOfLayer" />, run: () => alignAnim(layer.id, inst.id, 'start'), sep: true },
          { label: 'End at the layer\'s last frame', icon: <Icon name="endOfLayer" />, run: () => alignAnim(layer.id, inst.id, 'end') },
        ]
      : []),
    { label: 'Remove animation', icon: <Icon name="trash" />, run: () => removeAnim(layer.id, inst.id), danger: true, sep: true },
  ];

  return (
    <div className={`anim-card ${open ? 'open' : ''}`} data-testid="anim-card" data-template={inst.template}>
      <div className="ac-head">
        <button className="ac-name" onClick={() => setOpen(!open)} title={open ? 'Collapse' : 'Expand'}>
          <Icon name="chevronRight" size={11} className="ac-chevron" />
          <span>{inst.name}</span>
        </button>
        <button className="icon-btn" title="More" onClick={menu.toggle}>
          <Icon name="more" size={13} />
        </button>
        <button className="icon-btn" title="Remove this animation" onClick={() => removeAnim(layer.id, inst.id)} data-testid="anim-remove">
          <Icon name="close" size={12} />
        </button>
      </div>
      {open && (
        <div className="ac-body">
          {timed && (
            <div className="ac-pair">
              <label>
                <span>Start</span>
                <NumberField value={span.start} min={0} step={step} decimals={2} unit="s" onChange={(v) => setAnimStart(layer.id, inst.id, v)} title="When it begins (seconds)" />
              </label>
              <label>
                <span>Length</span>
                <NumberField value={span.end - span.start} min={step} step={step} decimals={2} unit="s" onChange={(v) => setAnimLength(layer.id, inst.id, v)} title="How long it takes (seconds)" />
              </label>
            </div>
          )}
          <Field label="Strength" title="How far it strays from the layer's resting values">
            <SliderField value={Math.round(inst.strength * 100)} min={10} max={300} step={5} decimals={0} unit="%" onChange={(v) => setAnimStrength(layer.id, inst.id, v / 100)} />
          </Field>
          {speed !== null && (
            <Field label="Speed">
              <NumberField value={speed} min={0.05} step={0.1} decimals={2} unit="/s" onChange={(v) => setAnimSpeed(layer.id, inst.id, v)} />
            </Field>
          )}
          {ease !== null && timed && (
            <Field label="Easing" title="The curve every step of this animation follows">
              <EaseButton ease={ease} title={`${inst.name} easing`} onChange={(e) => setAnimEase(layer.id, inst.id, e)} />
            </Field>
          )}
          {units !== null && (
            <Field label="Animate by">
              <select className="mini-select" value={units} onChange={(e) => setAnimTextSetting(layer.id, inst.id, 'units', Number(e.target.value))}>
                <option value={0}>Characters</option>
                <option value={1}>Words</option>
                <option value={2}>Lines</option>
              </select>
            </Field>
          )}
          {random !== null && (
            <Field label="Order">
              <select className="mini-select" value={random >= 0.5 ? 1 : 0} onChange={(e) => setAnimTextSetting(layer.id, inst.id, 'random', Number(e.target.value))}>
                <option value={0}>In order</option>
                <option value={1}>Random</option>
              </select>
            </Field>
          )}
        </div>
      )}
      {menu.anchor && <MenuPopover anchor={menu.anchor} onClose={menu.close} entries={entries} width={240} side={menu.anchor.left > window.innerWidth / 2 ? 'left' : 'bottom'} />}
      {replace.anchor && <AnimPicker layer={layer} slot={inst.slot} anchor={replace.anchor} onClose={replace.close} />}
    </div>
  );
}
