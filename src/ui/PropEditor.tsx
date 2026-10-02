import type { ReactNode } from 'react';
import { baseValue } from '../core/interp';
import type { Prop, PropGroup, PropValue } from '../core/types';
import { setPropLink, setPropValue } from '../state/actions';
import { ColorField, NumberField, SliderField, useTimeIf, type EditHow } from './fields';
import { GradientBar } from './GradientEditor';
import { Icon } from './Icon';

/** What an edit changed, so a multi-layer row can apply it per component and per layer. */
export interface Edit {
  how: EditHow;
  comp: 0 | 1 | 'both';
}

interface ValueEditorProps {
  prop: Prop;
  value: PropValue;
  /** Per component: the selected layers disagree about this one (shown as "Mixed"). */
  mixed?: boolean[];
  onChange: (v: PropValue, edit?: Edit) => void;
  /** Toggle the X/Y link on scale-style properties. */
  onToggleLink?: () => void;
  /** Draw bounded numbers as filled sliders (the Inspector) instead of plain scrub fields (the timeline). */
  slider?: boolean;
}

/** The editor for one value of a property: number, slider, linked/unlinked vec2, colour or dropdown. */
export function ValueEditor({ prop, value: v, mixed, onChange, onToggleLink, slider }: ValueEditorProps): ReactNode {
  const common = { step: prop.step ?? 1, min: prop.min, max: prop.max, decimals: prop.decimals ?? 1 };
  const m0 = !!mixed?.[0];
  const m1 = !!mixed?.[1];

  if (prop.options) {
    return (
      <select className="mini-select" value={m0 ? '' : String(Math.round(v as number))} onChange={(e) => onChange(Number(e.target.value), { how: 'set', comp: 0 })}>
        {m0 && (
          <option value="" disabled>
            Mixed
          </option>
        )}
        {prop.options.map((o, i) => (
          <option key={o} value={i}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (prop.kind === 'path') return <span className="path-readout">{Math.floor((v as number[]).length / 6)} vertices</span>;
  if (prop.kind === 'color') return <ColorField value={v as number[]} mixed={m0} onChange={(c) => onChange(c, { how: 'set', comp: 'both' })} />;
  if (prop.kind === 'number') {
    if (slider && prop.min !== undefined && prop.max !== undefined) {
      return <SliderField {...common} min={prop.min} max={prop.max} value={v as number} mixed={m0} unit={prop.unit} onChange={(n, how) => onChange(n, { how: how ?? 'set', comp: 0 })} />;
    }
    return <NumberField {...common} value={v as number} mixed={m0} unit={prop.unit} onChange={(n, how) => onChange(n, { how: how ?? 'set', comp: 0 })} />;
  }

  const [x, y] = v as number[];
  const linked = prop.link === true;
  return (
    <span className="vec">
      <NumberField
        {...common}
        value={x}
        mixed={m0}
        unit={prop.unit}
        onChange={(nx, how = 'set') => {
          if (linked && x !== 0) onChange([nx, y * (nx / x)], { how, comp: 'both' });
          else onChange([nx, linked ? nx : y], { how, comp: linked ? 'both' : 0 });
        }}
      />
      {prop.link !== undefined && onToggleLink && (
        <button className={`chain ${linked ? 'on' : ''}`} title={linked ? 'Unlink X and Y' : 'Link X and Y'} onClick={onToggleLink}>
          <Icon name={linked ? 'link' : 'unlink'} size={12} />
        </button>
      )}
      <NumberField
        {...common}
        value={y}
        mixed={m1}
        unit={prop.unit}
        onChange={(ny, how = 'set') => {
          if (linked && y !== 0) onChange([x * (ny / y), ny], { how, comp: 'both' });
          else onChange([linked ? ny : x, ny], { how, comp: linked ? 'both' : 1 });
        }}
      />
    </span>
  );
}

interface PropEditorProps {
  layerId: string;
  group: PropGroup;
  propKey: string;
  prop: Prop;
  slider?: boolean;
}

/** The value editor for a layer property at the playhead. Editing a keyframed property writes a keyframe. */
export function PropEditor({ layerId, group, propKey, prop, slider }: PropEditorProps): ReactNode {
  const t = useTimeIf(prop.keys.length > 0);
  const v = baseValue(prop, t);
  if (prop.kind === 'gradient') return <GradientBar layerId={layerId} group={group} propKey={propKey} prop={prop} />;
  return (
    <ValueEditor
      prop={prop}
      value={v}
      slider={slider}
      onChange={(value) => setPropValue(layerId, group, propKey, value)}
      onToggleLink={() => setPropLink(layerId, group, propKey, !(prop.link === true))}
    />
  );
}
