import { useRef, useState } from 'react';
import { timecode } from '../core/time';
import { getAssetData } from '../render/assets';
import { addFootageLayer, addPrecompLayer, deleteAsset, deleteComp, importFiles, openComp, openDialog } from '../state/actions';
import { useApp } from '../state/store';

export function ProjectPanel() {
  const project = useApp((s) => s.project);
  const activeCompId = useApp((s) => s.activeCompId);
  const assetVersion = useApp((s) => s.assetVersion);
  const [sel, setSel] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  void assetVersion;

  const selIsComp = sel ? !!project.comps[sel] : false;

  return (
    <div className="panel project-panel" data-testid="project-panel">
      <div className="panel-title">
        <span>Project</span>
      </div>
      <div className="panel-toolbar">
        <button title="New composition" onClick={() => openDialog({ kind: 'compSettings', compId: null })}>
          ＋ Comp
        </button>
        <button title="Import images" onClick={() => fileRef.current?.click()}>
          ⤓ Import
        </button>
        <button
          title="Delete selected item"
          disabled={!sel}
          onClick={() => {
            if (!sel) return;
            if (selIsComp) deleteComp(sel);
            else deleteAsset(sel);
            setSel(null);
          }}
        >
          ✕
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={async (e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            await importFiles(files);
          }}
        />
      </div>
      <div className="panel-body list">
        {project.compOrder.map((id) => {
          const c = project.comps[id];
          return (
            <div
              key={id}
              className={`item ${sel === id ? 'sel' : ''} ${activeCompId === id ? 'active' : ''}`}
              onClick={() => setSel(id)}
              onDoubleClick={() => openComp(id)}
              title="Double-click to open"
            >
              <span className="thumb comp-thumb">❏</span>
              <span className="meta">
                <b>{c.name}</b>
                <small>
                  {c.width}×{c.height}, {c.fps} fps, {timecode(c.duration, c.fps)}
                </small>
              </span>
              {activeCompId !== id && (
                <button className="mini" title="Add as precomp layer in the active composition" onClick={(e) => (e.stopPropagation(), addPrecompLayer(id))}>
                  ＋
                </button>
              )}
            </div>
          );
        })}
        {project.assetOrder.map((id) => {
          const a = project.assets[id];
          const url = getAssetData(id);
          return (
            <div key={id} className={`item ${sel === id ? 'sel' : ''}`} onClick={() => setSel(id)} onDoubleClick={() => addFootageLayer(id)} title="Double-click to add to the composition">
              <span className="thumb">{url ? <img src={url} alt="" /> : '▣'}</span>
              <span className="meta">
                <b>{a.name}</b>
                <small>
                  {a.width}×{a.height} image
                </small>
              </span>
              <button className="mini" title="Add to the active composition" onClick={(e) => (e.stopPropagation(), addFootageLayer(id))}>
                ＋
              </button>
            </div>
          );
        })}
        {project.assetOrder.length === 0 && <div className="hint">Drop images here or use Import to add footage.</div>}
      </div>
    </div>
  );
}
