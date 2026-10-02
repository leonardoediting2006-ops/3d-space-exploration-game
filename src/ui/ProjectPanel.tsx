import { useRef, useState } from 'react';
import { timecode } from '../core/time';
import { getAssetData } from '../render/assets';
import { addFootageLayer, addPrecompLayer, deleteAsset, deleteComp, FOOTAGE_ACCEPT, importFiles, openComp, openDialog } from '../state/actions';
import { appStore, useApp } from '../state/store';
import { Icon } from './Icon';
import { Waveform } from './Waveform';

const durationText = (s?: number) => (s === undefined ? '' : s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${s.toFixed(1)} s`);

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
        <span className="pt-actions">
          <button className="icon-btn" title="New composition" onClick={() => openDialog({ kind: 'compSettings', compId: null })}>
            <Icon name="comp" size={14} />
          </button>
          <button className="icon-btn" title="Import footage: images, sound or video" onClick={() => fileRef.current?.click()} data-testid="import-footage">
            <Icon name="image" size={14} />
          </button>
          <button
            className="icon-btn"
            title="Delete the selected item"
            disabled={!sel}
            onClick={() => {
              if (!sel) return;
              if (selIsComp) deleteComp(sel);
              else deleteAsset(sel);
              setSel(null);
            }}
          >
            <Icon name="trash" size={14} />
          </button>
          <button className="icon-btn" title="Hide the project panel" onClick={() => appStore.set({ leftOpen: false })}>
            <Icon name="chevronRight" size={14} style={{ transform: 'rotate(180deg)' }} />
          </button>
        </span>
        <input
          ref={fileRef}
          type="file"
          accept={FOOTAGE_ACCEPT}
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
            <div key={id} className={`item ${sel === id ? 'sel' : ''} ${activeCompId === id ? 'active' : ''}`} onClick={() => setSel(id)} onDoubleClick={() => openComp(id)} title="Double-click to open">
              <span className="thumb comp-thumb">
                <Icon name="comp" size={16} />
              </span>
              <span className="meta">
                <b>{c.name}</b>
                <small>
                  {c.width}×{c.height} · {c.fps} fps · {timecode(c.duration, c.fps)}
                </small>
              </span>
              {activeCompId !== id && (
                <button className="icon-btn" title="Add as a layer in the active composition" onClick={(e) => (e.stopPropagation(), addPrecompLayer(id))}>
                  <Icon name="plus" size={13} />
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
              <span className={`thumb ${a.kind}`}>
                {a.kind === 'audio' ? (
                  <Waveform assetId={id} from={0} to={a.duration ?? 0} width={40} height={30} color="rgba(127,158,255,0.9)" />
                ) : a.kind === 'video' ? (
                  <Icon name="film" size={16} />
                ) : url ? (
                  <img src={url} alt="" />
                ) : (
                  <Icon name="image" size={16} />
                )}
              </span>
              <span className="meta">
                <b>{a.name}</b>
                <small>{a.kind === 'audio' ? `sound · ${durationText(a.duration)}` : a.kind === 'video' ? `${a.width}×${a.height} video · ${durationText(a.duration)}${a.hasAudio ? ' · sound' : ''}` : `${a.width}×${a.height} image`}</small>
              </span>
              <button className="icon-btn" title="Add to the active composition" onClick={(e) => (e.stopPropagation(), addFootageLayer(id))}>
                <Icon name="plus" size={13} />
              </button>
            </div>
          );
        })}
        {project.assetOrder.length === 0 && <div className="hint">Drop images, sound or video here, or use the import button above.</div>}
      </div>
    </div>
  );
}
