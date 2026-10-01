import type { ReactNode } from 'react';
import { baseValue } from '../core/interp';
import type { Prop, PropGroup } from '../core/types';
import { setPropLink, setPropValue } from '../state/actions';
import { ColorField, NumberField, useTimeIf } from './fields';
import { GradientBar } from './GradientEditor';

interface PropEditorProps {
  layerId: string;
  group: PropGroup;
  propKey: string;
  prop: Prop;
}

/** The value editor for any property: number, linked/unlinked vec2, colour or dropdown. */
export function PropEditor({ layerId, group, propKey, prop }: PropEditorProps): ReactNode {
  const t = useTimeIf(prop.keys.length > 0);
  const v = baseValue(prop, t);
  const set = (value: number | number[]) => setPropValue(layerId, group, propKey, value);
  const common = { step: prop.step ?? 1, min: prop.min, max: prop.max, decimals: prop.decimals ?? 1 };

  if (prop.options) {
    return (
      <select className="mini-select" value={String(Math.round(v as number))} onChange={(e) => set(Number(e.target.value))}>
        {prop.options.map((o, i) => (
          <option key={o} value={i}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (prop.kind === 'gradient') return <GradientBar layerId={layerId} group={group} propKey={propKey} prop={prop} />;
  if (prop.kind === 'path') return <span className="path-readout">{Math.floor((v as number[]).length / 6)} vertices</span>;
  if (prop.kind === 'color') return <ColorField value={v as number[]} onChange={set} />;
  if (prop.kind === 'number') return <NumberField {...common} value={v as number} unit={prop.unit} onChange={set} />;

  const [x, y] = v as number[];
  const linked = prop.link === true;
  return (
    <span className="vec">
      <NumberField
        {...common}
        value={x}
        unit={prop.unit}
        onChange={(nx) => {
          if (linked && x !== 0) set([nx, y * (nx / x)]);
          else set([nx, linked ? nx : y]);
        }}
      />
      {prop.link !== undefined && (
        <button
          className={`chain ${linked ? 'on' : ''}`}
          title={linked ? 'Unlink X and Y' : 'Link X and Y'}
          onClick={() => setPropLink(layerId, group, propKey, !linked)}
        >
          {linked ? '⛓' : '⛓︎'}
        </button>
      )}
      <NumberField
        {...common}
        value={y}
        unit={prop.unit}
        onChange={(ny) => {
          if (linked && y !== 0) set([x * (ny / y), ny]);
          else set([linked ? ny : x, ny]);
        }}
      />
    </span>
  );
}
