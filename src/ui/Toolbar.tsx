import type { ShapeKind } from '../core/types';
import { closeCompTab, openComp } from '../state/actions';
import { appStore, useApp, type Tool } from '../state/store';

const TOOLS: { id: Tool; glyph: string; label: string }[] = [
  { id: 'select', glyph: '➤', label: 'Selection (V)' },
  { id: 'hand', glyph: '✋', label: 'Hand (H, or hold Space)' },
  { id: 'zoom', glyph: '⌕', label: 'Zoom (Z) — Alt-click zooms out' },
  { id: 'shape', glyph: '▭', label: 'Shape (Q) — drag in the viewer. Shift = square, Alt = from center' },
  { id: 'pen', glyph: '✒', label: 'Pen (G) — click to add vertices, drag for curves, click the first vertex to close. Enter finishes an open path, Esc cancels' },
  { id: 'text', glyph: 'T', label: 'Text — click in the viewer' },
  { id: 'anchor', glyph: '⊹', label: 'Anchor Point / Pan Behind (Y) — drag to move the anchor without moving the layer' },
];

const SHAPES: { id: ShapeKind; label: string }[] = [
  { id: 'rect', label: 'Rectangle' },
  { id: 'ellipse', label: 'Ellipse' },
  { id: 'polygon', label: 'Polygon' },
  { id: 'star', label: 'Star' },
];

export function Toolbar() {
  const tool = useApp((s) => s.tool);
  const shapeTool = useApp((s) => s.shapeTool);
  const toolMakesMask = useApp((s) => s.toolMakesMask);
  const project = useApp((s) => s.project);
  const openComps = useApp((s) => s.openComps);
  const activeCompId = useApp((s) => s.activeCompId);
  return (
    <div className="toolbar">
      <div className="tools">
        {TOOLS.map((t) => (
          <button key={t.id} className={tool === t.id ? 'active' : ''} title={t.label} onClick={() => appStore.set({ tool: t.id })} data-testid={`tool-${t.id}`}>
            {t.glyph}
          </button>
        ))}
        {(tool === 'shape' || tool === 'pen') && (
          <label className="chk mask-toggle" title="Cut a mask on the selected layer instead of creating a new shape layer">
            <input type="checkbox" checked={toolMakesMask} onChange={(e) => appStore.set({ toolMakesMask: e.target.checked })} data-testid="tool-makes-mask" /> Mask
          </label>
        )}
        {tool === 'shape' && (
          <select value={shapeTool} onChange={(e) => appStore.set({ shapeTool: e.target.value as ShapeKind })} title="Shape type" data-testid="shape-kind">
            {SHAPES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        )}
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
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
