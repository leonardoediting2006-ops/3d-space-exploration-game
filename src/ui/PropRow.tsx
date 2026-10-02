import { useState } from 'react';
import { defaultPropValue, sameValue } from '../core/defaults';
import { baseValue } from '../core/interp';
import type { Comp, Keyframe, Layer, Prop, PropGroup, PropValue } from '../core/types';
import { deleteKeys, resetProps, setWiggle, setKeyTime, setKeyValue, setLoop, setManyProps, setPropLinkMany, setPropValue, setTime, setWiggleMany, toggleKeyHereMany, toggleStopwatchMany, setKeysEase } from '../state/actions';
import { EaseButton } from './EaseEditor';
import { NumberField, useTimeIf } from './fields';
import { Icon } from './Icon';
import { applyEdit, mixedParts, type Member } from './multi';
import { MenuPopover, useAnchor, type MenuEntry } from './Popover';
import { PropEditor, ValueEditor, type Edit } from './PropEditor';
import { PropGraph } from './PropGraph';

interface PropRowProps {
  /** The first selected layer: what the row shows and what its details panel edits. */
  layer: Layer;
  comp: Pick<Comp, 'fps' | 'width' | 'height' | 'duration'>;
  group: PropGroup;
  propKey: string;
  prop: Prop;
  label?: string;
  /** Hide the keyframe controls (properties that cannot animate, like dropdown-style settings). */
  noKeys?: boolean;
  /** The same property on the other selected layers: edits, keyframes and resets then apply to all of them. */
  peers?: Member[];
}

/**
 * One property in the Inspector: a label, its editor, and the keyframe controls. Animated
 * properties can be expanded to edit every keyframe's time, value and easing, and to add loop and wiggle.
 * With several layers selected the row edits all of them: layers that disagree show "Mixed".
 */
export function PropRow({ layer, comp, group, propKey, prop, label, noKeys, peers = [] }: PropRowProps) {
  const members: Member[] = [{ layer, group, prop }, ...peers];
  const multi = members.length > 1;
  const targets = members.map((m) => ({ layerId: m.layer.id, group: m.group, key: propKey }));
  const animatedAll = members.every((m) => m.prop.keys.length > 0);
  const animated = members.some((m) => m.prop.keys.length > 0);
  const t = useTimeIf(animated);
  const [open, setOpen] = useState(false);
  const menu = useAnchor();
  const eps = 0.5 / comp.fps;
  const keyTimes = [...new Set(members.flatMap((m) => m.prop.keys.map((k) => k.t)))].sort((a, b) => a - b);
  const atKey = animatedAll && members.every((m) => m.prop.keys.some((k) => Math.abs(k.t - t) <= eps));
  const jump = (dir: 1 | -1) => {
    const target = dir > 0 ? keyTimes.find((k) => k > t + eps) : [...keyTimes].reverse().find((k) => k < t - eps);
    if (target !== undefined) setTime(target);
  };

  const values = members.map((m) => baseValue(m.prop, t));
  const mixed = multi ? mixedParts(values) : undefined;
  const defs = members.map((m) => defaultPropValue(m.layer, comp, m.group, propKey));
  const canReset = prop.kind !== 'color' && members.some((_, i) => defs[i] !== undefined && !sameValue(values[i], defs[i]!));
  const hasReset = prop.kind !== 'color' && defs[0] !== undefined;
  const hasDetails = !multi && (animated || !!prop.wiggle);
  const canAnimate = !noKeys && prop.kind !== 'path' && !prop.options;
  if (multi && (prop.kind === 'gradient' || prop.kind === 'path')) return null;

  const change = (next: PropValue, edit?: Edit) => {
    if (!multi) return setPropValue(layer.id, group, propKey, next);
    setManyProps(members.map((m, i) => ({ layerId: m.layer.id, group: m.group, key: propKey, value: applyEdit(values[i], values[0], next, edit, prop) })));
  };

  const entries: MenuEntry[] = [];
  if (hasReset) entries.push({ label: multi ? 'Reset all to default' : 'Reset to default', icon: <Icon name="reset" />, run: () => resetProps(targets), disabled: !canReset });
  if (animatedAll) {
    if (hasDetails) entries.push({ label: open ? 'Hide keyframes' : 'Show keyframes', icon: <Icon name="diamond" />, run: () => setOpen(!open), sep: entries.length > 0 });
    entries.push({ label: multi ? 'Stop animating all (keep current values)' : 'Stop animating (keep current value)', icon: <Icon name="close" />, run: () => toggleStopwatchMany(targets), sep: entries.length > 0 && !hasDetails });
  } else if (canAnimate) {
    entries.push({ label: multi ? 'Animate on all selected layers' : 'Animate this property', icon: <Icon name="diamond" />, run: () => toggleStopwatchMany(targets), sep: entries.length > 0 });
  }
  if (canAnimate && prop.kind !== 'color' && prop.kind !== 'gradient') {
    const wiggling = members.every((m) => m.prop.wiggle);
    entries.push(
      wiggling
        ? { label: multi ? 'Remove wiggle from all' : 'Remove wiggle', icon: <Icon name="close" />, run: () => setWiggleMany(targets, null) }
        : {
            label: multi ? 'Add wiggle to all (random jitter)' : 'Add wiggle (random jitter)',
            icon: <Icon name="sparkle" />,
            run: () => {
              setWiggleMany(targets, { freq: 2, amp: prop.kind === 'vec2' ? 40 : 10, seed: Math.floor(Math.random() * 1000) });
              if (!multi) setOpen(true);
            },
          },
    );
  }

  return (
    <div className={`prop-row ${animatedAll ? 'animated' : ''} ${animated && !animatedAll ? 'partly' : ''}`} data-testid={`ins-${propKey}`}>
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
          {prop.kind === 'gradient' ? (
            <PropEditor layerId={layer.id} group={group} propKey={propKey} prop={prop} slider />
          ) : (
            <ValueEditor prop={prop} value={values[0]} mixed={mixed} slider onChange={change} onToggleLink={() => setPropLinkMany(targets, !(prop.link === true))} />
          )}
        </div>
        <div className="pr-tools">
          {canReset && (
            <button className="icon-btn reset" title={multi ? 'Reset all to default' : 'Reset to default'} onClick={() => resetProps(targets)} data-testid="prop-reset">
              <Icon name="reset" size={12} />
            </button>
          )}
          {canAnimate &&
            (animatedAll ? (
              <span className="kfnav">
                <button className="icon-btn" title="Previous keyframe" onClick={() => jump(-1)}>
                  <Icon name="prev" size={12} />
                </button>
                <button
                  className={`icon-btn kf-toggle ${atKey ? 'on' : ''}`}
                  title={atKey ? 'Remove the keyframe at the playhead' : 'Add a keyframe at the playhead'}
                  onClick={() => toggleKeyHereMany(targets)}
                  data-testid="prop-key"
                >
                  <Icon name={atKey ? 'diamondFilled' : 'diamond'} size={13} />
                </button>
                <button className="icon-btn" title="Next keyframe" onClick={() => jump(1)}>
                  <Icon name="next" size={12} />
                </button>
              </span>
            ) : (
              <button
                className={`icon-btn kf-toggle ${animated ? 'partly' : ''}`}
                title={multi ? 'Animate on all selected layers: add a keyframe at the playhead' : 'Animate: add a keyframe at the playhead'}
                onClick={() => toggleStopwatchMany(targets)}
                data-testid="prop-animate"
              >
                <Icon name="diamond" size={13} />
              </button>
            ))}
          <button className="icon-btn more" title="More" onClick={menu.toggle}>
            <Icon name="more" size={13} />
          </button>
        </div>
      </div>
      {open && hasDetails && <PropDetails layer={layer} group={group} propKey={propKey} prop={prop} comp={comp} />}
      {menu.anchor && <MenuPopover anchor={menu.anchor} onClose={menu.close} entries={entries} width={270} side={menu.anchor.left > window.innerWidth / 2 ? 'left' : 'bottom'} />}
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
