import {
  BookOpen, ChevronRight, CircleDollarSign, Compass, Crosshair, Fuel, Gauge,
  Globe2, Map, Package, Radio, Settings2, Shield, Ship, Sparkles,
  Target, Wrench, X, Zap,
} from 'lucide-react';
import type { PanelId } from '../core/types';
import { useGameStore } from '../state/store';
import { PanelContents } from './PanelContents';

const navigationItems: Array<{ id: Exclude<PanelId, null>; title: string; label: string; icon: typeof Compass; shortcut?: string }> = [
  { id: 'navigation', title: 'Navigation', label: 'FLIGHT', icon: Compass },
  { id: 'map', title: 'Star chart', label: 'CHART', icon: Map, shortcut: 'M' },
  { id: 'inventory', title: 'Cargo manifest', label: 'CARGO', icon: Package, shortcut: 'TAB' },
  { id: 'missions', title: 'Expedition log', label: 'LOG', icon: Radio, shortcut: 'J' },
  { id: 'codex', title: 'Field codex', label: 'CODEX', icon: BookOpen },
  { id: 'upgrades', title: 'Service bay', label: 'SHIP', icon: Wrench },
  { id: 'settings', title: 'Preferences', label: 'OPTIONS', icon: Settings2 },
];

function ObjectiveCard() {
  const game = useGameStore((state) => state.game);
  const nearby = useGameStore((state) => state.nearby);
  const autopilot = useGameStore((state) => state.autopilot);
  const activeMission = game.missions.find((mission) => mission.status === 'active');
  const scanned = game.scannedPlanets.includes(game.selectedPlanetId);
  const objective = game.location === 'station'
    ? { kicker: 'DEPARTURE CHECKLIST', title: 'Your first route is plotted.', detail: 'The charts are quiet. Find out why.', step: 0 }
    : game.location === 'space'
      ? autopilot
        ? { kicker: 'IN FLIGHT · AUTO-APPROACH', title: `Closing on ${useGameStore.getState().galaxy.flatMap((system) => system.planets).find((planet) => planet.id === game.selectedPlanetId)?.name ?? 'target'}.`, detail: 'The Lark will settle into a stable orbit.', step: 2 }
        : scanned
          ? { kicker: 'NEXT · PLANETARY SURVEY', title: 'A quiet place to land.', detail: 'Approach the highlighted world, then descend.', step: 2 }
          : { kicker: 'NEXT · FIRST CONTACT', title: 'Give Veyra a closer look.', detail: 'Sweep the planet from orbit to reveal a landing site.', step: 1 }
      : game.location === 'orbit'
        ? { kicker: 'NEXT · DESCENT', title: 'Choose your landing site.', detail: 'Cinder basin is sheltered from the highland wind.', step: 3 }
        : game.storySignalHeard
          ? { kicker: 'NEXT · RETURN', title: 'The signal is still out there.', detail: 'Bring the fragment to the Lark and chart the quiet reach.', step: 5 }
          : nearby?.type === 'ship'
            ? { kicker: 'ON FOOT · FIELD SURVEY', title: 'The ridge is waiting.', detail: 'Walk toward the mineral spires ahead of you.', step: 4 }
            : nearby
              ? { kicker: 'ON FOOT · CONTACT', title: nearby.scanned ? 'Sample is ready.' : 'Unknown signature nearby.', detail: nearby.scanned ? 'Recover the sample or examine the signal.' : 'Run a scanner pass to identify the contact.', step: 4 }
              : { kicker: 'ON FOOT · FIELD SURVEY', title: 'Follow the scattered lights.', detail: 'Move toward a signal and scan it before collection.', step: 4 };

  return (
    <section className="objective-card" aria-label="Current objective">
      <div className="objective-heading"><span className="objective-glyph"><Target size={14} /></span><span className="eyebrow">{objective.kicker}</span><span className="objective-chevron"><ChevronRight size={13} /></span></div>
      <h2>{objective.title}</h2><p>{objective.detail}</p>
      <div className="objective-progress"><div className="objective-steps">{Array.from({ length: 5 }, (_, index) => <i key={index} className={index < objective.step ? 'done' : index === objective.step ? 'current' : ''} />)}</div><span>{activeMission?.title ?? 'FREE EXPLORATION'}</span></div>
    </section>
  );
}

function ShipVitals() {
  const game = useGameStore((state) => state.game);
  const speed = useGameStore((state) => state.speed);
  const boosting = speed > 48;
  return (
    <section className="ship-vitals" aria-label="Ship systems">
      <div className="vitals-heading"><span><Ship size={13} /> THE LARK <small>EXPLORATION SKIFF</small></span><span className="vitals-system">SYSTEMS NOMINAL <i /></span></div>
      <div className="vitals-grid">
        <div className="vital-item"><div className="vital-name"><Shield size={12} /><span>HULL</span><strong>{game.hull}%</strong></div><div className="vital-meter"><i className="hull" style={{ width: `${game.hull}%` }} /></div></div>
        <div className="vital-item"><div className="vital-name"><Fuel size={12} /><span>FUEL</span><strong>{game.fuel}%</strong></div><div className="vital-meter"><i className="fuel" style={{ width: `${game.fuel}%` }} /></div></div>
      </div>
      {game.location === 'space' && <div className="speed-line"><Gauge size={14} /><strong>{Math.round(speed)}</strong><span>km/s</span><span className={`boost-status ${boosting ? 'active' : ''}`}><Zap size={11} /> {boosting ? 'BOOST' : 'CRUISE'}</span></div>}
    </section>
  );
}

function SystemHeader() {
  const game = useGameStore((state) => state.game);
  const galaxy = useGameStore((state) => state.galaxy);
  const system = galaxy.find((candidate) => candidate.id === game.currentSystemId)!;
  const planet = system.planets.find((candidate) => candidate.id === game.selectedPlanetId)!;
  const location = { station: 'RELAY BERTH 04', space: 'DEEP SPACE', orbit: 'PLANETARY ORBIT', surface: 'SURFACE / EVA' }[game.location];
  return (
    <div className="system-header">
      <div className="system-mark"><span /></div>
      <div className="system-title"><span>{system.name.toUpperCase()}</span><small>{system.starType.toUpperCase()} <i /> SECTOR 04–17</small></div>
      <ChevronRight className="header-divider" size={14} />
      <div className="location-title"><span>{location}</span><small>{game.location === 'station' ? 'MORROW RELAY' : planet.name.toUpperCase()}</small></div>
      <div className="system-live"><i /> EXPEDITION LIVE</div>
    </div>
  );
}

export function Hud() {
  const game = useGameStore((state) => state.game);
  const activePanel = useGameStore((state) => state.activePanel);
  const setPanel = useGameStore((state) => state.setPanel);
  const saveNow = useGameStore((state) => state.saveNow);
  const toast = useGameStore((state) => state.toast);
  const toastTone = useGameStore((state) => state.toastTone);
  const dismissToast = useGameStore((state) => state.dismissToast);
  const discovery = useGameStore((state) => state.discoveryPopup);
  const dismissDiscovery = useGameStore((state) => state.dismissDiscovery);
  const nearby = useGameStore((state) => state.nearby);
  const speed = useGameStore((state) => state.speed);
  const credits = game.credits;
  const toggle = (panel: Exclude<PanelId, null>) => setPanel(activePanel === panel ? null : panel);

  return (
    <div className={`hud-root hud-${game.location}`}>
      <header className="topbar">
        <div className="brand-lockup"><div className="brand-sigil"><Sparkles size={15} /></div><div className="brand-type"><span>THE LONG MERIDIAN</span><small>UNION SURVEY SERVICE</small></div><span className="brand-build">FIELD BUILD <i>0.1</i></span></div>
        <SystemHeader />
        <div className="topbar-actions"><div className="credit-balance"><CircleDollarSign size={15} /><strong>{credits.toLocaleString()}</strong><small>CR</small></div><span className="top-divider" /><button className="save-action" onClick={saveNow}><span className="save-light" /> SAVED <small>LOCAL</small></button><button className="top-menu-action" aria-label="Open preferences" onClick={() => setPanel('settings')}><Settings2 size={16} /></button></div>
      </header>

      <nav className="expedition-rail" aria-label="Expedition systems">{navigationItems.map(({ id, title, label, icon: Icon, shortcut }, index) => <button key={id} className={`rail-item ${activePanel === id ? 'active' : ''} ${id === 'navigation' ? 'rail-primary' : ''}`} aria-label={title} title={`${title}${shortcut ? ` · ${shortcut}` : ''}`} aria-pressed={activePanel === id} onClick={() => toggle(id)}><span className="rail-icon"><Icon size={17} strokeWidth={1.7} />{id === 'missions' && game.missions.some((mission) => mission.status === 'active') && <i className="rail-notice" />}</span><span className="rail-label">{label}</span><span className="rail-index">0{index + 1}</span></button>)}<div className="rail-bottom"><button aria-label="Save expedition" onClick={saveNow}><span className="rail-icon"><ArrowDownToLineIcon /></span><span className="rail-label">SAVE</span></button><span className="rail-version">v0.14</span></div></nav>

      <div className="left-hud"><ObjectiveCard /><ShipVitals /></div>

      {game.location === 'space' && <div className="flight-reticle" aria-hidden="true"><div className="reticle-ring"><span /><i /><b /></div><span className="reticle-text">{useGameStore.getState().autopilot ? 'AUTO TRACK' : 'FLIGHT VECTOR'}</span></div>}
      {game.location === 'surface' && <div className="surface-reticle" aria-hidden="true"><Crosshair size={20} strokeWidth={1.1} /><i /></div>}

      {game.location === 'surface' && nearby && <div className="interaction-hint" aria-live="polite"><span className="hint-key">E</span><span><small>{nearby.type === 'ship' ? 'BOARD EXPLORATION SKIFF' : nearby.scanned ? (nearby.type === 'artifact' ? 'EXAMINE SIGNAL SOURCE' : 'RECOVER FIELD SAMPLE') : 'SCAN UNKNOWN SIGNATURE'}</small><strong>{nearby.type === 'ship' ? 'The Lark' : nearby.name}</strong></span><ChevronRight size={15} /></div>}

      <div className="lower-left-meta"><div className="signal-meter"><span className="signal-meter-label"><Radio size={12} /> RECEIVER</span><div><i /><i /><i /><i /><i /><i /><i /></div><small>{game.location === 'surface' ? 'LOCAL' : 'CLEAR'}</small></div><div className="coords-label"><span>GALACTIC POSITION</span><strong>04:17<span>:</span>08 · 2.31 AU</strong></div></div>
      <div className="bottom-controls"><div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>{game.location === 'surface' ? 'MOVE' : 'PILOT'}</span></div><i /><div><kbd>SHIFT</kbd><span>{game.location === 'surface' ? 'SPRINT' : 'BOOST'}</span></div><i /><div><kbd>R</kbd><span>SCAN</span></div><i /><div><kbd>E</kbd><span>INTERACT</span></div><span className="mouse-hint">DRAG TO LOOK</span></div>

      {activePanel && <PanelContents panel={activePanel} />}

      {toast && <div className={`toast toast-${toastTone}`} role="status"><span className="toast-icon"><Radio size={14} /></span><span>{toast}</span><button aria-label="Dismiss notification" onClick={dismissToast}><XIcon /></button></div>}
      {discovery && <div className="discovery-backdrop"><section className="discovery-card" role="dialog" aria-modal="true" aria-labelledby="discovery-title"><div className="discovery-flare"><Sparkles size={19} /></div><span className="eyebrow">FIELD RECORD ADDED</span><h2 id="discovery-title">{discovery.title}</h2><p>{discovery.detail}</p><div className="discovery-meta"><span><Globe2 size={13} /> {discovery.location}</span><span><CircleDollarSign size={13} /> +{discovery.reward} CR</span></div><button onClick={dismissDiscovery}>Add to field codex <ChevronRight size={14} /></button></section></div>}
      {game.location === 'space' && !activePanel && <button className="quick-target" onClick={() => setPanel('navigation')}><Target size={14} /> {speed > 1 ? 'FLIGHT NAVIGATION' : 'OPEN NAVIGATION'} <ChevronRight size={13} /></button>}
      <div className="hud-edge hud-edge-left" /><div className="hud-edge hud-edge-right" />
    </div>
  );
}

function ArrowDownToLineIcon() {
  return <span className="rail-save-icon"><span /></span>;
}

function XIcon() {
  return <X size={13} />;
}
