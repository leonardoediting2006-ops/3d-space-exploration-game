import { activeComp, appStore, useActiveComp, useApp } from '../state/store';
import { play, pause, setTime, stepFrames } from '../state/actions';
import type { Quality } from '../state/store';

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
      <div className="transport">
        <button title="Go to start (Home)" onClick={() => setTime(0)}>⏮</button>
        <button title="Previous frame (Page Up)" onClick={() => stepFrames(-1)}>◂</button>
        <button className="play" title="Play / pause (Space)" onClick={() => (playing ? pause() : play())} data-testid="play">
          {playing ? '❚❚' : '▶'}
        </button>
        <button title="Next frame (Page Down)" onClick={() => stepFrames(1)}>▸</button>
        <button title="Go to end (End)" onClick={() => setTime(activeComp().duration)}>⏭</button>
        <button className={loop ? 'on' : ''} title="Loop playback" onClick={() => appStore.set({ loopPlayback: !loop })}>⟲</button>
      </div>
      <div className="viewer-opts">
        <select
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
          {zoom !== 'fit' && ![12, 25, 50, 100, 200, 400].includes(Math.round(eff * 100)) && (
            <option value={Math.round(eff * 100)}>{Math.round(eff * 100)}%</option>
          )}
        </select>
        <select
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
        <button className={checker ? 'on' : ''} title="Transparency grid" onClick={() => appStore.set({ checkerboard: !checker })}>▦</button>
        <button className={safe ? 'on' : ''} title="Title/action safe margins and center guides" onClick={() => appStore.set({ safeMargins: !safe })}>⛶</button>
        <span className="comp-info">{comp.fps} fps</span>
      </div>
    </div>
  );
}
