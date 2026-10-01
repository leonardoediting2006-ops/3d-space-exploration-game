import { activeComp, appStore, useActiveComp, useApp } from '../state/store';
import { play, pause, setTime, stepFrames } from '../state/actions';
import type { Quality } from '../state/store';
import { Icon } from './Icon';

export function ViewerBar({ fitZoom }: { fitZoom: number }) {
  const comp = useActiveComp();
  const zoom = useApp((s) => s.zoom);
  const quality = useApp((s) => s.quality);
  const playing = useApp((s) => s.playing);
  const loop = useApp((s) => s.loopPlayback);
  const checker = useApp((s) => s.checkerboard);
  const safe = useApp((s) => s.safeMargins);
  const eff = zoom === 'fit' ? fitZoom : zoom;

  return (
    <div className="viewer-bar">
      <div className="vb-side" />
      <div className="transport">
        <button className="icon-btn" title="Go to start (Home)" onClick={() => setTime(0)}>
          <Icon name="skipStart" />
        </button>
        <button className="icon-btn" title="Previous frame (Page Up)" onClick={() => stepFrames(-1)}>
          <Icon name="stepBack" />
        </button>
        <button className="play" title="Play / pause (Space)" onClick={() => (playing ? pause() : play())} data-testid="play">
          <Icon name={playing ? 'pause' : 'play'} size={15} />
        </button>
        <button className="icon-btn" title="Next frame (Page Down)" onClick={() => stepFrames(1)}>
          <Icon name="stepForward" />
        </button>
        <button className="icon-btn" title="Go to end (End)" onClick={() => setTime(activeComp().duration)}>
          <Icon name="skipEnd" />
        </button>
        <button className={`icon-btn ${loop ? 'on' : ''}`} title="Loop playback" onClick={() => appStore.set({ loopPlayback: !loop })}>
          <Icon name="loop" />
        </button>
      </div>
      <div className="viewer-opts">
        <select
          className="mini-select"
          title="Magnification"
          value={zoom === 'fit' ? 'fit' : String(Math.round(eff * 100))}
          onChange={(e) => {
            const v = e.target.value;
            appStore.set(v === 'fit' ? { zoom: 'fit', panX: 0, panY: 0 } : { zoom: Number(v) / 100, panX: 0, panY: 0 });
          }}
        >
          <option value="fit">Fit ({Math.round(fitZoom * 100)}%)</option>
          {[12, 25, 50, 100, 200, 400].map((z) => (
            <option key={z} value={z}>
              {z}%
            </option>
          ))}
          {zoom !== 'fit' && ![12, 25, 50, 100, 200, 400].includes(Math.round(eff * 100)) && <option value={Math.round(eff * 100)}>{Math.round(eff * 100)}%</option>}
        </select>
        <select
          className="mini-select"
          title="Preview resolution"
          value={String(quality)}
          onChange={(e) => appStore.set({ quality: (e.target.value === 'auto' ? 'auto' : Number(e.target.value)) as Quality })}
        >
          <option value="auto">Auto</option>
          <option value="1">Full</option>
          <option value="0.5">Half</option>
          <option value="0.33">Third</option>
          <option value="0.25">Quarter</option>
        </select>
        <button className={`icon-btn ${checker ? 'on' : ''}`} title="Transparency grid" onClick={() => appStore.set({ checkerboard: !checker })}>
          <Icon name="grid" />
        </button>
        <button className={`icon-btn ${safe ? 'on' : ''}`} title="Safe margins and center guides" onClick={() => appStore.set({ safeMargins: !safe })}>
          <Icon name="safe" />
        </button>
        <span className="comp-info">{comp.fps} fps</span>
      </div>
    </div>
  );
}
