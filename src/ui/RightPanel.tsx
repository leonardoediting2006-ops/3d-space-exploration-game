import { useMemo, useState } from 'react';
import { EFFECTS, getEffectDef } from '../core/effectDefs';
import { PRESETS } from '../core/props';
import type { Layer, Prop, PropGroup } from '../core/types';
import {
  addEffect,
  applyPreset,
  moveEffect,
  openComp,
  removeEffect,
  setEffectEnabled,
  toggleStopwatch,
  updateLayerData,
} from '../state/actions';
import { appStore, toast, useActiveComp, useApp, type RightTab } from '../state/store';
import { PropEditor, NumberField } from './fields';

export function RightPanel() {
  const tab = useApp((s) => s.rightTab);
  const tabs: { id: RightTab; label: string }[] = [
    { id: 'effects', label: 'Effects' },
    { id: 'controls', label: 'Controls' },
    { id: 'layer', label: 'Layer' },
  ];
  return (
    <div className="panel right-panel" data-testid="right-panel">
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => appStore.set({ rightTab: t.id })}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="panel-body">
        {tab === 'effects' && <EffectsTab />}
        {tab === 'controls' && <ControlsTab />}
        {tab === 'layer' && <LayerTab />}
      </div>
    </div>
  );
}

function EffectsTab() {
  const [q, setQ] = useState('');
  const selection = useApp((s) => s.selection);
  const needle = q.trim().toLowerCase();
  const groups = useMemo(() => {
    const m = new Map<string, typeof EFFECTS>();
    for (const e of EFFECTS) {
      if (needle && !e.name.toLowerCase().includes(needle) && !e.category.toLowerCase().includes(needle)) continue;
      m.set(e.category, [...(m.get(e.category) ?? []), e]);
    }
    return [...m.entries()];
  }, [needle]);
  const apply = (type: string) => {
    if (!selection.length) return toast('Select a layer first, then apply the effect.');
    addEffect(selection, type);
  };
  return (
    <div className="effects-tab">
      <input className="search" placeholder="Search effects…" value={q} onChange={(e) => setQ(e.target.value)} />
      {groups.map(([cat, list]) => (
        <section key={cat}>
          <h4>{cat}</h4>
          {list.map((e) => (
            <div key={e.type} className="fx-item" onDoubleClick={() => apply(e.type)} title="Double-click to apply to the selected layers" data-testid={`fx-${e.type}`}>
              <span>{e.name}</span>
              <button className="mini" onClick={() => apply(e.type)}>
                Apply
              </button>
            </div>
          ))}
        </section>
      ))}
      {(!needle || 'animation presets'.includes(needle) || PRESETS.some((p) => p.name.toLowerCase().includes(needle))) && (
        <section>
          <h4>Animation Presets</h4>
          {PRESETS.filter((p) => !needle || p.name.toLowerCase().includes(needle) || 'animation presets'.includes(needle)).map((p) => (
            <div
              key={p.id}
              className="fx-item"
              onDoubleClick={() => (selection.length ? applyPreset(selection, p.id) : toast('Select a layer first.'))}
              title="Applies keyframes at the playhead"
              data-testid={`preset-${p.id}`}
            >
              <span>{p.name}</span>
              <button className="mini" onClick={() => (selection.length ? applyPreset(selection, p.id) : toast('Select a layer first.'))}>
                Apply
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function ParamRow({ layerId, group, propKey, prop }: { layerId: string; group: PropGroup; propKey: string; prop: Prop }) {
  return (
    <div className="param-row">
      <button className={`stopwatch ${prop.keys.length ? 'on' : ''}`} title="Toggle animation" onClick={() => toggleStopwatch(layerId, group, propKey)}>
        ⏱
      </button>
      <span className="plabel">{prop.label}</span>
      <span className="pvalue">
        <PropEditor layerId={layerId} group={group} propKey={propKey} prop={prop} />
      </span>
    </div>
  );
}

function useFirstSelected(): Layer | null {
  const comp = useActiveComp();
  const selection = useApp((s) => s.selection);
  return comp.layers.find((l) => l.id === selection[0]) ?? null;
}

function ControlsTab() {
  const layer = useFirstSelected();
  if (!layer) return <div className="hint">Select a layer to edit its effects.</div>;
  if (!layer.effects.length) return <div className="hint">“{layer.name}” has no effects. Apply some from the Effects & Presets tab.</div>;
  return (
    <div className="controls-tab">
      <div className="ctl-title">{layer.name}</div>
      {layer.effects.map((fx, i) => (
        <section key={fx.id} className={fx.enabled ? '' : 'disabled'}>
          <header>
            <button className={`sw fxsw ${fx.enabled ? 'on' : ''}`} title="Enable / disable" onClick={() => setEffectEnabled(layer.id, fx.id, !fx.enabled)}>
              fx
            </button>
            <b>{getEffectDef(fx.type)?.name ?? fx.type}</b>
            <span className="spacer" />
            <button className="mini" disabled={i === 0} title="Move up" onClick={() => moveEffect(layer.id, fx.id, -1)}>↑</button>
            <button className="mini" disabled={i === layer.effects.length - 1} title="Move down" onClick={() => moveEffect(layer.id, fx.id, 1)}>↓</button>
            <button className="mini danger" title="Remove" onClick={() => removeEffect(layer.id, fx.id)}>✕</button>
          </header>
          {Object.entries(fx.props).map(([k, p]) => (
            <ParamRow key={k} layerId={layer.id} group={`fx:${fx.id}`} propKey={k} prop={p} />
          ))}
        </section>
      ))}
    </div>
  );
}

function LayerTab() {
  const layer = useFirstSelected();
  if (!layer) return <div className="hint">Select a layer to edit its source properties.</div>;
  const d = layer.data;
  return (
    <div className="layer-tab">
      <div className="ctl-title">
        {layer.name} <small>({layer.type})</small>
      </div>
      {d.type === 'text' && (
        <section>
          <header><b>Text</b></header>
          <textarea className="text-input" value={d.text} onChange={(e) => updateLayerData(layer.id, { text: e.target.value })} data-testid="text-input" />
          <div className="row">
            <label>Font</label>
            <select value={d.font} onChange={(e) => updateLayerData(layer.id, { font: e.target.value })}>
              {FONTS.map((f) => (
                <option key={f.css} value={f.css}>{f.name}</option>
              ))}
              {!FONTS.some((f) => f.css === d.font) && <option value={d.font}>{d.font}</option>}
            </select>
          </div>
          <div className="row">
            <label>Style</label>
            <label className="chk"><input type="checkbox" checked={d.bold} onChange={(e) => updateLayerData(layer.id, { bold: e.target.checked })} /> Bold</label>
            <label className="chk"><input type="checkbox" checked={d.italic} onChange={(e) => updateLayerData(layer.id, { italic: e.target.checked })} /> Italic</label>
          </div>
          <div className="row">
            <label>Align</label>
            <select value={d.align} onChange={(e) => updateLayerData(layer.id, { align: e.target.value as 'left' | 'center' | 'right' })}>
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </div>
          <div className="row">
            <label>Stroke</label>
            <label className="chk"><input type="checkbox" checked={d.stroke} onChange={(e) => updateLayerData(layer.id, { stroke: e.target.checked })} /> Enable</label>
          </div>
        </section>
      )}
      {d.type === 'shape' && (
        <section>
          <header><b>Shape</b></header>
          <div className="row">
            <label>Paint</label>
            <label className="chk"><input type="checkbox" checked={d.fill} onChange={(e) => updateLayerData(layer.id, { fill: e.target.checked })} /> Fill</label>
            <label className="chk"><input type="checkbox" checked={d.stroke} onChange={(e) => updateLayerData(layer.id, { stroke: e.target.checked })} data-testid="stroke-toggle" /> Stroke</label>
          </div>
          <div className="row">
            <label>Line cap</label>
            <select value={d.lineCap} onChange={(e) => updateLayerData(layer.id, { lineCap: e.target.value as 'butt' | 'round' | 'square' })}>
              <option value="butt">Butt</option>
              <option value="round">Round</option>
              <option value="square">Square</option>
            </select>
          </div>
          <div className="row">
            <label>Line join</label>
            <select value={d.lineJoin} onChange={(e) => updateLayerData(layer.id, { lineJoin: e.target.value as 'miter' | 'round' | 'bevel' })}>
              <option value="miter">Miter</option>
              <option value="round">Round</option>
              <option value="bevel">Bevel</option>
            </select>
          </div>
        </section>
      )}
      {(d.type === 'solid' || d.type === 'adjustment' || d.type === 'null') && (
        <section>
          <header><b>Size</b></header>
          <div className="row">
            <label>Width</label>
            <NumberField value={d.width} min={1} max={16384} decimals={0} unit="px" onChange={(v) => updateLayerData(layer.id, { width: v })} />
          </div>
          <div className="row">
            <label>Height</label>
            <NumberField value={d.height} min={1} max={16384} decimals={0} unit="px" onChange={(v) => updateLayerData(layer.id, { height: v })} />
          </div>
        </section>
      )}
      {d.type === 'precomp' && (
        <section>
          <header><b>Nested composition</b></header>
          <button onClick={() => openComp(d.compId)}>Open composition</button>
        </section>
      )}
      {Object.keys(layer.content).length > 0 && (
        <section>
          <header><b>Properties</b></header>
          {Object.entries(layer.content).map(([k, p]) => (
            <ParamRow key={k} layerId={layer.id} group="content" propKey={k} prop={p} />
          ))}
        </section>
      )}
    </div>
  );
}

const FONTS = [
  { name: 'Sans-serif', css: 'Inter, Helvetica, Arial, sans-serif' },
  { name: 'Serif', css: 'Georgia, "Times New Roman", serif' },
  { name: 'Monospace', css: '"SF Mono", Menlo, Consolas, monospace' },
  { name: 'Impact', css: 'Impact, "Arial Black", sans-serif' },
  { name: 'Rounded', css: '"Trebuchet MS", "Segoe UI", sans-serif' },
  { name: 'Cursive', css: '"Comic Sans MS", "Brush Script MT", cursive' },
];
