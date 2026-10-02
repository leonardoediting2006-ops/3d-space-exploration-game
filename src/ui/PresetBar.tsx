import { useEffect, useState } from 'react';
import { exportPresets, importPresetsFromFile } from '../state/presets';
import { chooseSyncFile, reconnectSync, syncNow, syncSupported, unlinkSync, useSyncState } from '../state/presetSync';
import { Icon } from './Icon';
import { MenuPopover, useAnchor } from './Popover';

const ago = (at: number, now: number): string => {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
};

/** Import, export and file-sync controls shown above the My presets grid. */
export function PresetBar({ count }: { count: number }) {
  const sync = useSyncState();
  const menu = useAnchor();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);
  const linked = sync.state !== 'off';

  return (
    <div className="preset-bar" data-testid="preset-bar">
      <div className="preset-actions">
        <button className="mini" onClick={() => void importPresetsFromFile()} title="Add the presets from a .kfspresets file" data-testid="presets-import">
          <Icon name="upload" size={12} /> Import
        </button>
        <button className="mini" onClick={() => exportPresets()} disabled={!count} title="Save all your presets to a .kfspresets file you can share or back up" data-testid="presets-export">
          <Icon name="download" size={12} /> Export
        </button>
        <button
          className={`mini ${sync.state === 'ok' ? 'on' : ''}`}
          onClick={(e) => (linked ? menu.toggle(e) : void chooseSyncFile())}
          title={syncSupported() ? 'Keep your presets in a file, for example in a Dropbox/OneDrive/iCloud folder, to share them between computers' : 'Syncing to a file needs a Chromium-based browser'}
          data-testid="presets-sync"
        >
          <Icon name="sync" size={12} /> {linked ? 'Synced' : 'Sync…'}
        </button>
      </div>
      {linked && (
        <div className={`sync-line ${sync.state}`} data-testid="sync-status">
          {sync.state === 'needs-permission' ? (
            <>
              <span>{sync.name}: needs your permission.</span>{' '}
              <button className="link" onClick={() => void reconnectSync()} data-testid="sync-reconnect">
                Reconnect
              </button>
            </>
          ) : sync.state === 'error' ? (
            <span>{sync.message}</span>
          ) : (
            <span>
              {sync.name} · {sync.state === 'busy' ? 'syncing…' : `synced ${ago(sync.at, now)}`}
            </span>
          )}
        </div>
      )}
      {menu.anchor && (
        <MenuPopover
          anchor={menu.anchor}
          onClose={menu.close}
          entries={[
            { label: 'Sync now', run: () => void syncNow() },
            { label: 'Use a different file…', run: () => void chooseSyncFile() },
            { label: 'Stop syncing', run: () => void unlinkSync(), danger: true, sep: true },
          ]}
        />
      )}
    </div>
  );
}
