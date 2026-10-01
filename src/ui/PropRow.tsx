import { useState } from 'react';
import { defaultPropValue, sameValue } from '../core/defaults';
import { baseValue } from '../core/interp';
import type { Comp, Keyframe, Layer, Prop, PropGroup } from '../core/types';
import { deleteKeys, resetProp, setKeyTime, setKeyValue, setLoop, setTime, setWiggle, toggleKeyHere, toggleStopwatch, setKeysEase } from '../state/actions';
import { EaseButton } from './EaseEditor';
import { NumberField, useTimeIf } from './fields';
import { Icon } from './Icon';
import { MenuPopover, useAnchor, type MenuEntry } from './Popover';
import { PropEditor, ValueEditor } from './PropEditor';
import { PropGraph } from './PropGraph';

interface PropRowProps {
  layer: Layer;
  comp: Pick<Comp, 'fps' | 'width' | 'height' | 'duration'>;
  group: PropGroup;
  propKey: string;
  prop: Prop;
  label?: string;
  /** Hide the keyframe controls (properties that cannot animate, like dropdown-style settings). */
  noKeys?: boolean;
}

/**
 * One property in the Inspector: a label, its editor, and the keyframe controls. Animated
 * properties can be expanded to edit every keyframe's time, value and easing, and to add loop and wiggle.
 */
export function PropRow({ layer, comp, group, propKey, prop, label, noKeys }: PropRowProps) {
  const animated = prop.keys.length > 0;
  const t = useTimeIf(animated);
  const [open, setOpen] = useState(false);
  const menu = useAnchor();
  const eps = 0.5 / comp.fps;
  const atKey = animated && prop.keys.some((k) => Math.abs(k.t - t) <= eps);
  const jump = (dir: 1 | -1) => {
    const target = dir > 0 ? prop.keys.find((k) => k.t > t + eps) : [...prop.keys].reverse().find((k) => k.t < t - eps);
    if (target) setTime(target.t);
  };

  const def = defaultPropValue(layer, comp, group, propKey);
  const current = baseValue(prop, t);
  const canReset = def !== undefined && !(prop.kind === 'color') && !sameValue(current, def);
  const hasDetails = animated || !!prop.wiggle;
  const canAnimate = !noKeys && prop.kind !== 'path' && !prop.options;

  const entries: MenuEntry[] = [];
  if (def !== undefined && prop.kind !== 'color') entries.push({ label: 'Reset to default', icon: <Icon name="reset" />, run: () => resetProp(layer.id, group, propKey), disabled: !canReset });
  if (animated) {
    entries.push({ label: open ? 'Hide keyframes' : 'Show keyframes', icon: <Icon name="diamond" />, run: () => setOpen(!open), sep: entries.length > 0 });
    entries.push({ label: 'Stop animating (keep current value)', icon: <Icon name="close" />, run: () => toggleStopwatch(layer.id, group, propKey) });
  } else if (canAnimate) {
    entries.push({ label: 'Animate this property', icon: <Icon name="diamond" />, run: () => toggleStopwatch(layer.id, group, propKey), sep: entries.length > 0 });
  }
  if (canAnimate && prop.kind !== 'color' && prop.kind !== 'gradient') {
    entries.push(
      prop.wiggle
        ? { label: 'Remove wiggle', icon: <Icon name="close" />, run: () => setWiggle(layer.id, group, propKey, null) }
        : { label: 'Add wiggle (random jitter)', icon: <Icon name="sparkle" />, run: () => { setWiggle(layer.id, group, propKey, { freq: 2, amp: prop.kind === 'vec2' ? 40 : 10, seed: Math.floor(Math.random() * 1000) }); setOpen(true); } },
    );
  }

  return (
    <div className={`prop-row ${animated ? 'animated' : ''}`} data-testid={`ins-${propKey}`}>
      <div className="pr-line">
        <div className="pr-label" onContextMenu={(e) => { e.preventDefault(); menu.open(e); }} title={prop.label}>
          {hasDetails && !noKeys ? (
            <button className={`pr-twirl ${open ? 'open' : ''}`} onClick={() => setOpen(!open)} title={open ? 'Hide keyframes' : 'Show keyframes'}>
              <Icon name="chevronRight" size={11} />
            </button>
          ) : (
            <span className="pr-twirl-space" />
          )}
          <span className="pr-name">{label ?? prop.label}</span>
          {prop.wiggle && <i className="badge" title="Wiggle">~</i>}
          {prop.loop && <i className="badge" title={`Loops (${prop.loop})`}>∞</i>}
        </div>
        <div className="pr-editor">
          <PropEditor layerId={layer.id} group={group} propKey={propKey} prop={prop} slider />
        </div>
        <div className="pr-tools">
          {canReset && (
            <button className="icon-btn reset" title="Reset to default" onClick={() => resetProp(layer.id, group, propKey)} data-testid="prop-reset">
              <Icon name="reset" size={12} />
            </button>
          )}
          {canAnimate &&
            (animated ? (
              <span className="kfnav">
                <button className="icon-btn" title="Previous keyframe" onClick={() => jump(-1)}>
                  <Icon name="prev" size={12} />
                </button>
                <button className={`icon-btn kf-toggle ${atKey ? 'on' : ''}`} title={atKey ? 'Remove the keyframe at the playhead' : 'Add a keyframe at the playhead'} onClick={() => toggleKeyHere(layer.id, group, propKey)} data-testid="prop-key">
                  <Icon name={atKey ? 'diamondFilled' : 'diamond'} size={13} />
                </button>
                <button className="icon-btn" title="Next keyframe" onClick={() => jump(1)}>
                  <Icon name="next" size={12} />
                </button>
              </span>
            ) : (
              <button className="icon-btn kf-toggle" title="Animate: add a keyframe at the playhead" onClick={() => toggleStopwatch(layer.id, group, propKey)} data-testid="prop-animate">
                <Icon name="diamond" size={13} />
              </button>
            ))}
          <button className="icon-btn more" title="More" onClick={menu.toggle}>
            <Icon name="more" size={13} />
          </button>
        </div>
      </div>
      {open && hasDetails && <PropDetails layer={layer} group={group} propKey={propKey} prop={prop} comp={comp} />}
      {menu.anchor && <MenuPopover anchor={menu.anchor} onClose={menu.close} entries={entries} width={250} side={menu.anchor.left > window.innerWidth / 2 ? 'left' : 'bottom'} />}
    </div>
  );
}

function PropDetails({ layer, group, propKey, prop, comp }: { layer: Layer; group: PropGroup; propKey: string; prop: Prop; comp: Pick<Comp, 'fps' | 'duration'> }) {
  const editable = prop.kind === 'number' || prop.kind === 'vec2' || prop.kind === 'color';
  return (
    <div className="pr-details">
      {prop.keys.length > 1 && (prop.kind === 'number' || prop.kind === 'vec2') && <PropGraph prop={prop} duration={comp.duration} />}
      {prop.keys.map((k, i) => (
        <KeyRow key={k.id} k={k} prop={prop} last={i === prop.keys.length - 1} fps={comp.fps} editable={editable} />
      ))}
      {prop.keys.length > 1 && (
        <div className="pr-mod">
          <span>Repeat</span>
          <select className="mini-select" value={prop.loop ?? ''} onChange={(e) => setLoop(layer.id, group, propKey, (e.target.value || null) as 'cycle' | 'pingpong' | null)}>
            <option value="">Once</option>
            <option value="cycle">Repeat</option>
            <option value="pingpong">Back and forth</option>
          </select>
        </div>
      )}
      {prop.wiggle && (
        <div className="pr-mod wiggle">
          <span>Wiggle</span>
          <label>
            Amount
            <NumberField value={prop.wiggle.amp} min={0} step={0.5} decimals={1} onChange={(v) => setWiggle(layer.id, group, propKey, { ...prop.wiggle!, amp: v })} />
          </label>
          <label>
            Speed
            <NumberField value={prop.wiggle.freq} min={0.05} step={0.1} decimals={2} onChange={(v) => setWiggle(layer.id, group, propKey, { ...prop.wiggle!, freq: v })} />
          </label>
          <button className="icon-btn" title="Remove wiggle" onClick={() => setWiggle(layer.id, group, propKey, null)}>
            <Icon name="close" size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

function KeyRow({ k, prop, last, fps, editable }: { k: Keyframe; prop: Prop; last: boolean; fps: number; editable: boolean }) {
  return (
    <div className="key-row" data-testid="key-row">
      <button className="kr-time" title="Go to this keyframe" onClick={() => setTime(k.t)}>
        <Icon name="diamondFilled" size={9} />
      </button>
      <NumberField className="kr-t" value={k.t} min={0} step={1 / fps} decimals={2} unit="s" onChange={(v) => setKeyTime(k.id, v)} title="Time of this keyframe" />
      <span className="kr-value">
        {editable ? <ValueEditor prop={prop} value={k.v} onChange={(v) => setKeyValue(k.id, v)} /> : <span className="path-readout">—</span>}
      </span>
      {last ? (
        <span className="kr-ease-space" />
      ) : (
        <EaseButton ease={k.ease} title="Easing to the next keyframe" allowHold onChange={(e) => setKeysEase([k.id], e)} />
      )}
      <button className="icon-btn" title="Delete this keyframe" onClick={() => deleteKeys([k.id])}>
        <Icon name="close" size={11} />
      </button>
    </div>
  );
}
