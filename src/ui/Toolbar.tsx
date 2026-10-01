import { useRef } from 'react';
import type { ShapeKind } from '../core/types';
import { addAdjustment, addFootageLayer, addNull, addShape, addText, closeCompTab, importFiles, openComp, openDialog } from '../state/actions';
import { activeComp, appStore, useApp, type Tool } from '../state/store';
import { Icon, type IconName } from './Icon';
import { MenuPopover, useAnchor, type MenuEntry } from './Popover';

const TOOLS: { id: Tool; icon: IconName; label: string; key: string }[] = [
  { id: 'select', icon: 'select', label: 'Selection', key: 'V' },
  { id: 'hand', icon: 'hand', label: 'Hand — or hold Space', key: 'H' },
  { id: 'zoom', icon: 'zoom', label: 'Zoom — Alt-click zooms out', key: 'Z' },
  { id: 'shape', icon: 'shape', label: 'Shape — drag in the viewer. Shift = square, Alt = from center', key: 'Q' },
  { id: 'pen', icon: 'pen', label: 'Pen — click to add vertices, drag for curves, click the first vertex to close. Enter finishes an open path, Esc cancels', key: 'G' },
  { id: 'text', icon: 'text', label: 'Text — click in the viewer to type', key: '' },
  { id: 'anchor', icon: 'anchor', label: 'Anchor point (pan behind) — drag to move the anchor without moving the layer', key: 'Y' },
];

const SHAPES: { id: ShapeKind; label: string }[] = [
  { id: 'rect', label: 'Rectangle' },
  { id: 'ellipse', label: 'Ellipse' },
  { id: 'polygon', label: 'Polygon' },
  { id: 'star', label: 'Star' },
];

const GAP_AFTER = new Set<Tool>(['zoom', 'anchor']);

export function Toolbar() {
  const tool = useApp((s) => s.tool);
  const shapeTool = useApp((s) => s.shapeTool);
  const toolMakesMask = useApp((s) => s.toolMakesMask);
  const project = useApp((s) => s.project);
  const openComps = useApp((s) => s.openComps);
  const activeCompId = useApp((s) => s.activeCompId);
  const add = useAnchor();
  const fileRef = useRef<HTMLInputElement>(null);

  const center = () => {
    const c = activeComp();
    return [c.width / 2, c.height / 2] as [number, number];
  };
  const addEntries: MenuEntry[] = [
    { label: 'Text', hint: 'T tool', icon: <Icon name="text" />, run: () => addText('Your text', center()) },
    { label: 'Rectangle', icon: <Icon name="shape" />, run: () => addShape('rect', [420, 300], center()) },
    { label: 'Ellipse', icon: <Icon name="ellipse" />, run: () => addShape('ellipse', [320, 320], center()) },
    { label: 'Star', icon: <Icon name="star" />, run: () => addShape('star', [320, 320], center()) },
    { label: 'Image…', icon: <Icon name="image" />, run: () => fileRef.current?.click(), sep: true },
    { label: 'Solid…', icon: <Icon name="shape" />, run: () => openDialog({ kind: 'solid' }) },
    { label: 'Adjustment layer', icon: <Icon name="sliders" />, run: () => void addAdjustment() },
    { label: 'Null object', icon: <Icon name="anchor" />, run: () => void addNull() },
    { label: 'Composition…', icon: <Icon name="comp" />, run: () => openDialog({ kind: 'compSettings', compId: null }), sep: true },
  ];

  return (
    <div className="toolbar">
      <div className="tools">
        {TOOLS.map((t) => (
          <span key={t.id} className="tool-wrap">
            <button className={`tool ${tool === t.id ? 'active' : ''}`} title={`${t.label}${t.key ? ` (${t.key})` : ''}`} onClick={() => appStore.set({ tool: t.id })} data-testid={`tool-${t.id}`}>
              <Icon name={t.icon} size={16} />
            </button>
            {GAP_AFTER.has(t.id) && <span className="tool-gap" />}
          </span>
        ))}
        {(tool === 'shape' || tool === 'pen') && (
          <label className="chk mask-toggle" title="Cut a mask on the selected layer instead of creating a new shape layer">
            <input type="checkbox" checked={toolMakesMask} onChange={(e) => appStore.set({ toolMakesMask: e.target.checked })} data-testid="tool-makes-mask" /> Mask
          </label>
        )}
        {tool === 'shape' && (
          <select className="mini-select" value={shapeTool} onChange={(e) => appStore.set({ shapeTool: e.target.value as ShapeKind })} title="Shape type" data-testid="shape-kind">
            {SHAPES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        )}
        <span className="tool-gap" />
        <button className="add-main" onClick={add.toggle} title="Add a layer" data-testid="add-menu">
          <Icon name="plus" size={14} /> Add
        </button>
        {add.anchor && <MenuPopover anchor={add.anchor} onClose={add.close} entries={addEntries} width={210} />}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={async (e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            const ids = await importFiles(files);
            for (const id of ids.reverse()) addFootageLayer(id);
          }}
        />
      </div>
      <div className="comp-tabs">
        {openComps.map((id) => {
          const c = project.comps[id];
          if (!c) return null;
          return (
            <div key={id} className={`comp-tab ${id === activeCompId ? 'active' : ''}`} onClick={() => openComp(id)} data-testid="comp-tab">
              {c.name}
              {openComps.length > 1 && (
                <button
                  title="Close"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeCompTab(id);
                  }}
                >
                  <Icon name="close" size={10} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
