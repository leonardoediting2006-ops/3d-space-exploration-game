import { appStore, useApp, type RightTab } from '../state/store';
import { Icon, type IconName } from './Icon';
import { Inspector } from './Inspector';
import { LibraryPanel } from './LibraryPanel';

const TABS: { id: RightTab; label: string; icon: IconName }[] = [
  { id: 'inspector', label: 'Inspector', icon: 'sliders' },
  { id: 'library', label: 'Library', icon: 'sparkle' },
];

export function RightPanel() {
  const tab = useApp((s) => s.rightTab);
  return (
    <div className="panel right-panel" data-testid="right-panel">
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => appStore.set({ rightTab: t.id })} data-testid={`tab-${t.id}`}>
            <Icon name={t.icon} size={14} />
            {t.label}
          </button>
        ))}
      </div>
      <div className="panel-body">{tab === 'inspector' ? <Inspector /> : <LibraryPanel />}</div>
    </div>
  );
}
