import type { ReactNode } from 'react';
import { baseValue } from '../core/interp';
import type { Prop, PropGroup, PropValue } from '../core/types';
import { setPropLink, setPropValue } from '../state/actions';
import { ColorField, NumberField, SliderField, useTimeIf } from './fields';
import { GradientBar } from './GradientEditor';
import { Icon } from './Icon';

interface ValueEditorProps {
  prop: Prop;
  value: PropValue;
  onChange: (v: PropValue) => void;
  /** Toggle the X/Y link on scale-style properties. */
  onToggleLink?: () => void;
  /** Draw bounded numbers as filled sliders (the Inspector) instead of plain scrub fields (the timeline). */
  slider?: boolean;
}

/** The editor for one value of a property: number, slider, linked/unlinked vec2, colour or dropdown. */
export function ValueEditor({ prop, value: v, onChange, onToggleLink, slider }: ValueEditorProps): ReactNode {
  const common = { step: prop.step ?? 1, min: prop.min, max: prop.max, decimals: prop.decimals ?? 1 };

  if (prop.options) {
    return (
      <select className="mini-select" value={String(Math.round(v as number))} onChange={(e) => onChange(Number(e.target.value))}>
        {prop.options.map((o, i) => (
          <option key={o} value={i}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (prop.kind === 'path') return <span className="path-readout">{Math.floor((v as number[]).length / 6)} vertices</span>;
  if (prop.kind === 'color') return <ColorField value={v as number[]} onChange={onChange} />;
  if (prop.kind === 'number') {
    if (slider && prop.min !== undefined && prop.max !== undefined) {
      return <SliderField {...common} min={prop.min} max={prop.max} value={v as number} unit={prop.unit} onChange={onChange} />;
    }
    return <NumberField {...common} value={v as number} unit={prop.unit} onChange={onChange} />;
  }

  const [x, y] = v as number[];
  const linked = prop.link === true;
  return (
    <span className="vec">
      <NumberField
        {...common}
        value={x}
        unit={prop.unit}
        onChange={(nx) => {
          if (linked && x !== 0) onChange([nx, y * (nx / x)]);
          else onChange([nx, linked ? nx : y]);
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
        unit={prop.unit}
        onChange={(ny) => {
          if (linked && y !== 0) onChange([x * (ny / y), ny]);
          else onChange([linked ? ny : x, ny]);
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
