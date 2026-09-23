import { useMemo, useState } from 'react';
import {
  Activity, ArrowDownToLine, ArrowRight, BadgeCheck, ChevronDown, CircleDollarSign,
  Compass, Database, FlaskConical, Fuel, Gem, Globe2, LockKeyhole, MapPin, Minus,
  PackageOpen, Plus, Radio, ScanLine, Search, Shield, Signal, Sparkles, Target,
  TrendingUp, Wrench, Zap,
} from 'lucide-react';
import { checkPurchase, inventoryValue } from '../core/systems';
import type { PanelId, StarSystem } from '../core/types';
import { RESOURCES } from '../data/resources';
import { UPGRADES } from '../data/upgrades';
import { useGameStore } from '../state/store';

const panelTitles: Record<Exclude<PanelId, null>, string> = {
  navigation: 'Flight systems', map: 'Star chart', inventory: 'Cargo manifest',
  missions: 'Expedition log', codex: 'Field codex', upgrades: 'Service bay', settings: 'Preferences',
};

function CardEyebrow({ children }: { children: React.ReactNode }) {
  return <div className="card-eyebrow">{children}</div>;
}

function PrimaryButton({ children, onClick, disabled = false, icon }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; icon?: React.ReactNode }) {
  return <button className="primary-button" onClick={onClick} disabled={disabled}>{icon}<span>{children}</span><ArrowRight size={15} /></button>;
}

function NavigationPanel() {
  const game = useGameStore((state) => state.game);
  const galaxy = useGameStore((state) => state.galaxy);
  const speed = useGameStore((state) => state.speed);
  const distanceToOrbit = useGameStore((state) => state.distanceToOrbit);
  const autopilot = useGameStore((state) => state.autopilot);
  const scan = useGameStore((state) => state.scan);
  const launch = useGameStore((state) => state.launch);
  const setAutopilot = useGameStore((state) => state.setAutopilot);
  const takeOff = useGameStore((state) => state.takeOff);
  const returnToStation = useGameStore((state) => state.returnToStation);
  const selectPlanet = useGameStore((state) => state.selectPlanet);
  const setLandingSite = useGameStore((state) => state.setLandingSite);
  const land = useGameStore((state) => state.land);
  const setPanel = useGameStore((state) => state.setPanel);
  const interact = useGameStore((state) => state.interact);
  const system = galaxy.find((candidate) => candidate.id === game.currentSystemId)!;
  const planet = system.planets.find((candidate) => candidate.id === game.selectedPlanetId)!;
  const scanned = game.scannedPlanets.includes(planet.id);
  const fuelPercent = game.fuel;
  const routePercent = Math.max(0, Math.min(100, 100 - (distanceToOrbit / 286) * 100));

  if (game.location === 'station') {
    return (
      <div className="panel-scroll navigation-content">
        <div className="station-hero">
          <div className="station-orbit-mark"><div /><span /></div>
          <span className="eyebrow">MORROW RELAY · BERTH 04</span>
          <h3>Quiet enough<br />to hear yourself think.</h3>
          <p>Your first survey route is plotted. Veyra is waiting just beyond the relay lights.</p>
        </div>
        <div className="departure-row"><span><span className="status-dot" /> Departure clear</span><span>08:42 local</span></div>
        <div className="target-card station-target">
          <CardEyebrow>FIRST DESTINATION</CardEyebrow>
          <div className="target-title-row"><div className="planet-swatch" style={{ '--planet': planet.color, '--accent': planet.accent } as React.CSSProperties} /><div><h4>{planet.name}</h4><p>{planet.biome} · {planet.class} world</p></div><span className="status-chip">UNCHARTED</span></div>
          <div className="stat-grid"><div><span>RANGE</span><strong>0.04 AU</strong></div><div><span>THREAT</span><strong className="safe-text">LOW / 01</strong></div></div>
        </div>
        <PrimaryButton onClick={launch} icon={<ArrowDownToLine size={16} />}>Begin expedition</PrimaryButton>
        <div className="service-shelf">
          <CardEyebrow>RELAY SERVICES</CardEyebrow>
          <div className="service-row"><span><Wrench size={14} /> Service bay</span><button onClick={() => setPanel('upgrades')}>View upgrades <ArrowRight size={12} /></button></div>
          <div className="service-row"><span><CircleDollarSign size={14} /> Cargo exchange</span><button onClick={() => setPanel('inventory')}>Manifest <ArrowRight size={12} /></button></div>
        </div>
        <p className="panel-footnote"><Shield size={13} /> Lark hull integrity <strong>{game.hull}%</strong><span className="footnote-divider">·</span><Fuel size={13} /> {fuelPercent}% fuel</p>
      </div>
    );
  }

  if (game.location === 'orbit') {
    const landingSites = [
      { id: 'cinder-basin', name: 'Cinder basin', type: 'Mineral shelf', detail: 'Sheltered lee · 2 signals', temperature: `${planet.temperature}°` },
      { id: 'echo-ridge', name: 'Echo ridge', type: 'Anomalous return', detail: 'Exposed highland · 1 signal', temperature: `${planet.temperature + 4}°` },
    ];
    return (
      <div className="panel-scroll navigation-content">
        <div className="orbital-heading"><span className="eyebrow">ORBITAL SURVEY</span><span className="orbit-badge"><span /> STABLE</span></div>
        <h3 className="planet-heading">{planet.name}<span>{planet.biome}</span></h3>
        <p className="panel-copy">{scanned ? 'The longwave sweep resolved several points of interest. Pick a quiet approach.' : 'Surface mapping is incomplete. Take a scan before choosing a descent vector.'}</p>
        <div className="orbital-stats"><span><small>GRAVITY</small><strong>{planet.gravity.toFixed(2)} g</strong></span><span><small>DAY SIDE</small><strong>{planet.temperature}° C</strong></span><span><small>ATMOSPHERE</small><strong>{planet.atmosphere}</strong></span></div>
        {!scanned && <button className="quiet-button scan-action" onClick={scan}><ScanLine size={15} /> Run orbital sweep <kbd>R</kbd></button>}
        <CardEyebrow>LANDING ZONES <span className="section-count">02</span></CardEyebrow>
        <div className="landing-options">
          {landingSites.map((site, index) => (
            <button className={`landing-card ${game.selectedLandingSite === site.id ? 'selected' : ''}`} key={site.id} onClick={() => setLandingSite(site.id)}>
              <span className={`landing-thumbnail landing-thumb-${index}`}><span /></span>
              <span className="landing-text"><strong>{site.name}</strong><small>{site.type} · {site.detail}</small></span>
              <span className="landing-select" />
            </button>
          ))}
        </div>
        <PrimaryButton onClick={() => land(game.selectedLandingSite)} icon={<ArrowDownToLine size={16} />}>Descend to surface</PrimaryButton>
        <button className="text-action" onClick={takeOff}>Remain in orbit · take off <ArrowRight size={13} /></button>
      </div>
    );
  }

  if (game.location === 'surface') {
    const nearby = useGameStore.getState().nearby;
    const targetScanned = nearby ? game.scannedObjects.includes(nearby.id) : false;
    const isArtifact = nearby?.type === 'artifact';
    return (
      <div className="panel-scroll navigation-content surface-nav">
        <div className="surface-live"><span className="surface-live-dot" /> SURFACE SURVEY <span className="surface-coords">34.08° N · 108.26° E</span></div>
        <h3 className="planet-heading">{planet.name}<span>{game.selectedLandingSite === 'echo-ridge' ? 'Echo ridge · 2,418 m' : 'Cinder basin · 1,860 m'}</span></h3>
        <div className="surface-objective"><span className="objective-spark"><Sparkles size={14} /></span><div><CardEyebrow>FIELD OBJECTIVE</CardEyebrow><strong>{game.storySignalHeard ? 'Follow the signal back to the Lark' : 'Survey the ridge and recover a sample'}</strong><small>Suit integrity stable · thermal load nominal</small></div></div>
        <div className="nearby-card">
          <CardEyebrow>LOCAL CONTACT</CardEyebrow>
          {nearby ? <><div className="nearby-title"><Signal size={15} /><strong>{nearby.type === 'ship' ? 'The Lark' : nearby.name}</strong><span>{nearby.distance.toFixed(0)} m</span></div><p>{nearby.type === 'ship' ? 'Your ship is within boarding range.' : targetScanned ? (isArtifact ? 'Repeating signal source · close enough to examine.' : 'Sample is catalogued and ready for recovery.') : 'Unresolved signature · scanner pass recommended.'}</p></> : <><div className="nearby-title muted"><Target size={15} /><strong>No contact in range</strong></div><p>Walk toward a survey marker. Scan contacts before collection.</p></>}
        </div>
        <div className="surface-actions">
          <button className="quiet-button" onClick={scan}><ScanLine size={15} /> Scan contact <kbd>R</kbd></button>
          <button className="quiet-button" onClick={interact} disabled={!nearby}><Radio size={15} /> {nearby?.type === 'ship' ? 'Board ship' : isArtifact && targetScanned ? 'Examine signal' : 'Recover sample'} <kbd>E</kbd></button>
        </div>
        <div className="suit-card"><div className="suit-icon"><Activity size={15} /></div><div><span>EXPLORER SUIT</span><strong>Thermal field stable</strong></div><span className="suit-percent">94%</span></div>
        <div className="signal-list"><CardEyebrow>LOCAL SIGNALS <span className="section-count">{planet.pointsOfInterest.length.toString().padStart(2, '0')}</span></CardEyebrow>{planet.pointsOfInterest.map((point) => <div className="signal-row" key={point.id}><span className={`signal-icon signal-${point.type}`}><Signal size={12} /></span><span>{game.collectedNodes.includes(point.id) ? 'Survey complete' : point.name}</span><span>{game.collectedNodes.includes(point.id) ? 'DONE' : game.scannedObjects.includes(point.id) ? 'LOCKED' : '•••'}</span></div>)}</div>
      </div>
    );
  }

  return (
    <div className="panel-scroll navigation-content">
      <div className="orbital-heading"><span className="eyebrow">NAVIGATION · TARGET LOCK</span><span className={`orbit-badge ${autopilot ? 'route-active' : ''}`}><span /> {autopilot ? 'ROUTE ACTIVE' : 'IN FLIGHT'}</span></div>
      <div className="target-summary">
        <div className="planet-swatch large" style={{ '--planet': planet.color, '--accent': planet.accent } as React.CSSProperties} />
        <div><h3>{planet.name}</h3><p>{planet.biome} · {planet.class}</p></div>
        <span className="target-compass"><Compass size={18} /></span>
      </div>
      <div className="distance-readout"><span><Target size={13} /> RANGE TO ORBIT</span><strong>{Math.round(distanceToOrbit)}<small> km</small></strong></div>
      <div className="route-meter"><span style={{ width: `${routePercent}%` }} /></div>
      <div className="route-meta"><span>{autopilot ? 'AUTO-APPROACH' : speed > 1 ? 'MANUAL FLIGHT' : 'ROUTE PLOTTED'}</span><span>{autopilot ? 'ALIGNING' : scanned ? 'SURVEY COMPLETE' : 'UNSURVEYED'}</span></div>
      {autopilot ? <button className="quiet-button scan-action" onClick={() => setAutopilot(false)}>Cancel approach <kbd>ESC</kbd></button> : <PrimaryButton onClick={() => setAutopilot(true)} icon={<Compass size={16} />}>Engage approach</PrimaryButton>}
      <button className="quiet-button scan-action" onClick={scan}><ScanLine size={15} /> {scanned ? 'Review scan results' : 'Scan planet'} <kbd>R</kbd></button>
      <div className="planet-facts"><div><span>CLASS</span><strong>{planet.class.toUpperCase()}</strong></div><div><span>TEMP.</span><strong>{planet.temperature}° C</strong></div><div><span>GRAVITY</span><strong>{planet.gravity} g</strong></div></div>
      <div className="target-list-heading"><CardEyebrow>LOCAL CELESTIALS</CardEyebrow><span>{system.planets.length.toString().padStart(2, '0')} OBJECTS</span></div>
      <div className="planet-list">{system.planets.map((item, index) => <button className={`planet-list-row ${item.id === planet.id ? 'active' : ''}`} key={item.id} onClick={() => selectPlanet(item.id)}><span className="planet-orbit-index">0{index + 1}</span><span className="planet-mini" style={{ '--planet': item.color, '--accent': item.accent } as React.CSSProperties} /><span className="planet-row-name"><strong>{item.name}</strong><small>{item.biome}</small></span><span className="scan-state">{game.scannedPlanets.includes(item.id) ? <BadgeCheck size={14} /> : <span className="scan-unknown" />}</span></button>)}</div>
      <div className="nav-bottom-actions"><button onClick={returnToStation}><MapPin size={14} /> Return to Morrow Relay</button><button onClick={() => setPanel('map')}><Globe2 size={14} /> Open star chart</button></div>
      <div className="nav-fuel"><Fuel size={13} /><span>FUEL RESERVE</span><strong>{fuelPercent}%</strong><div className="fuel-meter"><span style={{ width: `${fuelPercent}%` }} /></div></div>
    </div>
  );
}

function GalaxyMapPanel() {
  const galaxy = useGameStore((state) => state.galaxy);
  const currentSystemId = useGameStore((state) => state.game.currentSystemId);
  const selectSystem = useGameStore((state) => state.selectSystem);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState([0, 0]);
  const [drag, setDrag] = useState<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [selectedId, setSelectedId] = useState(currentSystemId);
  const selected = galaxy.find((system) => system.id === selectedId) ?? galaxy[0]!;
  const nodePosition = (system: StarSystem) => ({ x: 112 + system.coordinates[0] * 116, y: 185 - system.coordinates[1] * 80 });

  return (
    <div className="panel-scroll map-content">
      <div className="map-topline"><span className="eyebrow">HELIOGRAPH NAVIGATION ARRAY</span><span><span className="status-dot" /> {galaxy.filter((system) => system.discovered).length} / {galaxy.length} CHARTED</span></div>
      <div className="star-map" onPointerDown={(event) => { if ((event.target as Element).closest('.map-node, .map-zoom')) return; setDrag({ x: event.clientX, y: event.clientY, panX: pan[0], panY: pan[1] }); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (drag) setPan([drag.panX + (event.clientX - drag.x), drag.panY + (event.clientY - drag.y)]); }} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
        <div className="map-grain" />
        <svg viewBox="0 0 660 370" role="img" aria-label="Interactive three-system star chart">
          <g transform={`translate(${pan[0]} ${pan[1]}) translate(330 185) scale(${zoom}) translate(-330 -185)`}>
            <path className="route-line route-charted" d="M112 185 L332 113" />
            <path className="route-line route-unknown" d="M332 113 L552 297" />
            <circle className="chart-ring" cx="112" cy="185" r="78" />
            {galaxy.map((system) => {
              const pos = nodePosition(system);
              const current = system.id === currentSystemId;
              const focused = system.id === selectedId;
              const accessible = system.unlocked || current;
              return <g key={system.id} className={`map-node ${accessible ? 'accessible' : 'restricted'} ${focused ? 'focused' : ''}`} transform={`translate(${pos.x} ${pos.y})`} onClick={() => { setSelectedId(system.id); if (accessible && !current) selectSystem(system.id); }} role="button" tabIndex={0} aria-label={`${system.name}${accessible ? '' : ', locked'}`} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { setSelectedId(system.id); if (accessible && !current) selectSystem(system.id); } }}>
                {focused && <circle className="node-focus-ring" r="24" />}
                {current && <circle className="current-pulse" r="19" />}
                <circle className="node-core" r={current ? 7 : system.starType === 'Anomaly' ? 5.5 : 5} />
                <circle className="node-glow" r="14" />
                {!accessible && <text className="node-lock" x="0" y="3">⌑</text>}
                <text className="node-label" x="0" y="34">{system.name.toUpperCase()}</text>
                <text className="node-sub-label" x="0" y="48">{accessible ? `${system.planets.length} WORLDS` : 'SIGNAL UNRESOLVED'}</text>
              </g>;
            })}
          </g>
        </svg>
        <div className="map-zoom"><button aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(1.55, value + 0.12))}><Plus size={13} /></button><button aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.76, value - 0.12))}><Minus size={13} /></button></div>
        <div className="map-scale"><span /><span>2.4 LY</span></div>
      </div>
      <div className="chart-legend"><span><i className="legend-dot known" /> CHARTED</span><span><i className="legend-dot locked" /> BEYOND RANGE</span><span><i className="legend-line" /> CURRENT ROUTE</span></div>
      <div className="system-inspector"><div className="inspector-title"><div><CardEyebrow>{selected.starType} · DANGER {selected.danger}/5</CardEyebrow><h3>{selected.name}</h3></div>{selected.unlocked || selected.id === currentSystemId ? <span className="status-chip">IN RANGE</span> : <LockKeyhole size={16} />}</div><p>{selected.planets.length} bodies detected · {selected.discovered ? 'Survey data available' : 'No local charts on record'}</p><div className="map-world-list">{selected.planets.map((planet) => <span key={planet.id}><i style={{ '--planet': planet.color } as React.CSSProperties} />{planet.name}</span>)}</div>
        {selected.id === currentSystemId ? <div className="current-destination"><Radio size={14} /> You are navigating {selected.name}</div> : <button className="map-route-button" disabled={!selected.unlocked} onClick={() => selectSystem(selected.id)}>{selected.unlocked ? <><Compass size={15} /> Set route to {selected.name} <ArrowRight size={14} /></> : <><LockKeyhole size={14} /> Upgrade drive to chart this system</>}</button>}
      </div>
      <p className="map-hint"><span>DRAG</span> to pan <span>+</span> / <span>−</span> to zoom · Local physics omitted at this scale</p>
    </div>
  );
}

function InventoryPanel() {
  const inventory = useGameStore((state) => state.game.inventory);
  const credits = useGameStore((state) => state.game.credits);
  const location = useGameStore((state) => state.game.location);
  const sellCargo = useGameStore((state) => state.sellCargo);
  const [search, setSearch] = useState('');
  const [sortByValue, setSortByValue] = useState(false);
  const cargo = useMemo(() => Object.entries(inventory).map(([id, amount]) => ({ resource: RESOURCES[id], amount })).filter((entry) => entry.resource && entry.resource.name.toLowerCase().includes(search.toLowerCase())).sort((a, b) => sortByValue ? b.resource.value - a.resource.value : a.resource.name.localeCompare(b.resource.name)), [inventory, search, sortByValue]);
  const units = Object.values(inventory).reduce((sum, amount) => sum + amount, 0);
  const capacity = 64 + (useGameStore((state) => state.game.upgrades.includes('cargo-expansion')) ? 32 : 0);

  return (
    <div className="panel-scroll inventory-content">
      <div className="cargo-summary"><div className="cargo-total"><span>AVAILABLE CREDITS</span><strong><CircleDollarSign size={16} /> {credits.toLocaleString()} <small>CR</small></strong></div><div className="cargo-capacity"><span>CARGO CAPACITY</span><strong>{units}<small> / {capacity} units</small></strong><div className="capacity-meter"><span style={{ width: `${Math.min(100, units / capacity * 100)}%` }} /></div></div></div>
      <div className="manifest-toolbar"><label className="manifest-search"><Search size={14} /><input aria-label="Search cargo" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search manifest" /></label><button className={`sort-button ${sortByValue ? 'active' : ''}`} aria-label="Sort by value" onClick={() => setSortByValue((value) => !value)}><TrendingUp size={14} /></button></div>
      <div className="manifest-heading"><span>ITEM</span><span>QTY</span><span>UNIT VALUE</span></div>
      {cargo.length ? <div className="cargo-list">{cargo.map(({ resource, amount }) => <div className="cargo-row" key={resource.id}><span className="resource-gem" style={{ '--gem': resource.color } as React.CSSProperties}><Gem size={15} /></span><span className="cargo-name"><strong>{resource.name}</strong><small>{resource.rarity} · {resource.category}</small></span><span className="cargo-quantity">× {amount}</span><span className="cargo-value">{resource.value} <small>CR</small></span></div>)}</div> : <div className="empty-manifest"><PackageOpen size={26} /><strong>{search ? 'No matching cargo' : 'No recovered resources'}</strong><span>Survey a world and bring something back.</span></div>}
      <div className="cargo-footer"><span>ESTIMATED RELAY VALUE <strong>{inventoryValue(inventory).toLocaleString()} CR</strong></span><button className="sell-button" disabled={location !== 'station' || units === 0} onClick={sellCargo}><CircleDollarSign size={14} /> {location === 'station' ? 'Exchange all' : 'At relay only'}</button></div>
      <div className="manifest-note"><Database size={14} /><span>Stacked by material · local manifest auto-saved to this expedition.</span></div>
    </div>
  );
}

function UpgradePanel() {
  const game = useGameStore((state) => state.game);
  const buyUpgrade = useGameStore((state) => state.buyUpgrade);
  const notify = useGameStore((state) => state.setPanel);
  const inStation = game.location === 'station';
  const repaired = game.hull >= 100;
  return (
    <div className="panel-scroll upgrade-content">
      <div className="upgrade-status"><div className="upgrade-status-icon"><Wrench size={17} /></div><div><span>SHIPYARD · MORROW RELAY</span><strong>{inStation ? 'Technicians standing by' : 'Relay service unavailable'}</strong></div><span className={`service-light ${inStation ? '' : 'offline'}`} /></div>
      {!inStation && <div className="inline-notice"><Radio size={14} /> Dock at Morrow Relay to install hardware.</div>}
      <div className="upgrade-summary"><span>THE LARK <small>EXPLORATION SKIFF</small></span><span>MK <strong>{1 + game.upgrades.length}</strong></span><div className="ship-stat"><span>HULL</span><div className="thin-meter"><i style={{ width: `${game.hull}%` }} /></div><strong>{game.hull}%</strong></div><div className="ship-stat"><span>FUEL</span><div className="thin-meter fuel"><i style={{ width: `${game.fuel}%` }} /></div><strong>{game.fuel}%</strong></div></div>
      <div className="upgrade-heading"><CardEyebrow>AVAILABLE SYSTEMS</CardEyebrow><span>{game.upgrades.length.toString().padStart(2, '0')} INSTALLED</span></div>
      <div className="upgrade-list">{UPGRADES.map((upgrade) => {
        const installed = game.upgrades.includes(upgrade.id);
        const blocked = upgrade.id === 'deep-array' && !game.upgrades.includes('scanner-mk2');
        const check = checkPurchase(upgrade, game.credits, game.inventory);
        return <article className={`upgrade-card ${installed ? 'installed' : ''} ${blocked ? 'upgrade-locked' : ''}`} key={upgrade.id}><div className="upgrade-card-top"><div className={`upgrade-glyph glyph-${upgrade.category}`}>{upgrade.category === 'scanner' ? <ScanLine size={16} /> : upgrade.category === 'drive' ? <Zap size={16} /> : upgrade.category === 'suit' ? <Shield size={16} /> : <Wrench size={16} />}</div><span className="upgrade-tier">{installed ? <BadgeCheck size={13} /> : blocked ? <LockKeyhole size={12} /> : `MK ${upgrade.tier}`}</span></div><h4>{upgrade.name}</h4><p>{upgrade.description}</p><div className="upgrade-cost"><span><CircleDollarSign size={13} /> {upgrade.credits.toLocaleString()} CR</span><span>{Object.entries(upgrade.costs).map(([id, amount]) => <i key={id} className={(game.inventory[id] ?? 0) >= amount ? 'material-owned' : ''}>{amount} {RESOURCES[id]?.name ?? id}</i>)}</span></div><button className={installed ? 'installed-button' : 'install-button'} disabled={!inStation || installed || !check.affordable || blocked} onClick={() => buyUpgrade(upgrade.id)}>{installed ? <><BadgeCheck size={14} /> INSTALLED</> : blocked ? 'REQUIRES LONGWAVE SCANNER' : !inStation ? 'DOCK TO INSTALL' : check.affordable ? 'INSTALL SYSTEM' : 'INSUFFICIENT MATERIALS'}{!installed && !blocked && <ArrowRight size={13} />}</button></article>;
      })}</div>
      <button className="repair-row" disabled={!inStation || repaired || game.credits < (100 - game.hull) * 9} onClick={() => useGameStore.getState().repairShip()}><span><Wrench size={14} /><span>Hull repair<small>{repaired ? 'Integrity nominal' : `Restore to 100% · ${((100 - game.hull) * 9).toLocaleString()} CR`}</small></span></span><strong>{repaired ? 'NOMINAL' : 'SERVICE'}</strong></button>
      <button className="subtle-link" onClick={() => notify('inventory')}>View cargo manifest <ArrowRight size={13} /></button>
    </div>
  );
}

function MissionPanel() {
  const missions = useGameStore((state) => state.game.missions);
  const setPanel = useGameStore((state) => state.setPanel);
  const active = missions.filter((mission) => mission.status === 'active');
  const complete = missions.filter((mission) => mission.status === 'complete');
  return (
    <div className="panel-scroll mission-content">
      <div className="mission-brief"><div className="brief-icon"><Compass size={19} /></div><span className="eyebrow">THE HELIOS FIELD OFFICE</span><h3>Nothing here was<br />made for a map.</h3><p>Small observations become routes. Routes become stories. Keep looking.</p></div>
      <div className="mission-section-title"><CardEyebrow>ACTIVE THREADS</CardEyebrow><span>{active.length.toString().padStart(2, '0')}</span></div>
      {active.map((mission, index) => <article className={`mission-card ${index === 0 ? 'mission-featured' : ''}`} key={mission.id}><div className="mission-card-top"><span>{mission.kind.toUpperCase()} · {String(index + 1).padStart(2, '0')}</span><span className="mission-reward"><CircleDollarSign size={13} /> {mission.reward.toLocaleString()} CR</span></div><h4>{mission.title}</h4><p>{mission.detail}</p><div className="mission-progress"><span><i style={{ width: `${mission.progress / mission.goal * 100}%` }} /></span><small>{mission.progress} / {mission.goal}</small></div></article>)}
      <div className="mission-section-title completed-title"><CardEyebrow>ARCHIVE</CardEyebrow><span>{complete.length.toString().padStart(2, '0')} COMPLETE</span></div>
      {complete.length ? complete.map((mission) => <div className="mission-complete" key={mission.id}><BadgeCheck size={15} /><span><strong>{mission.title}</strong><small>Contract settled · {mission.reward.toLocaleString()} CR</small></span></div>) : <div className="empty-archive"><span>◌</span><strong>The archive is quiet.</strong><small>Your first report is waiting on Veyra.</small><button onClick={() => setPanel('navigation')}>Return to flight deck <ArrowRight size={13} /></button></div>}
    </div>
  );
}

function CodexPanel() {
  const discoveries = useGameStore((state) => state.game.discoveries);
  const galaxy = useGameStore((state) => state.galaxy);
  const scanned = useGameStore((state) => state.game.scannedPlanets.length);
  const visited = useGameStore((state) => state.game.visitedPlanets.length);
  const [category, setCategory] = useState('ALL');
  const categories = ['ALL', 'PLANET', 'MINERAL', 'SIGNAL', 'ARTIFACT'];
  const filtered = category === 'ALL' ? discoveries : discoveries.filter((entry) => entry.category.toUpperCase() === category);
  return (
    <div className="panel-scroll codex-content">
      <div className="codex-masthead"><div className="codex-sigil"><FlaskConical size={21} /></div><div><span className="eyebrow">PERSONAL RESEARCH ARCHIVE</span><h3>Field codex</h3></div><span className="codex-total">{discoveries.length.toString().padStart(2, '0')}<small>ENTRIES</small></span></div>
      <div className="codex-progress"><div><span>GALAXY MAPPED</span><strong>{Math.round((galaxy.filter((system) => system.discovered).length / galaxy.length) * 100)}%</strong></div><div className="progress-track"><i style={{ width: `${galaxy.filter((system) => system.discovered).length / galaxy.length * 100}%` }} /></div><div className="codex-stats"><span><strong>{scanned}</strong> systems surveyed</span><span><strong>{visited}</strong> worlds visited</span></div></div>
      <div className="codex-filters">{categories.map((item) => <button className={category === item ? 'active' : ''} key={item} onClick={() => setCategory(item)}>{item}</button>)}</div>
      {filtered.length ? <div className="codex-entries">{filtered.slice().reverse().map((entry, index) => <article className={`codex-entry ${entry.category === 'artifact' || entry.category === 'signal' ? 'rare-entry' : ''}`} key={entry.id}><div className="entry-index">{String(filtered.length - index).padStart(2, '0')}<span>{entry.category.toUpperCase()}</span></div><div className="entry-content"><h4>{entry.title}</h4><span className="entry-location"><MapPin size={11} /> {entry.location}</span><p>{entry.detail}</p><small>LOGGED {new Date(entry.discoveredAt).toLocaleDateString()}</small></div><span className="entry-reward">+{entry.reward} CR</span></article>)}</div> : <div className="codex-empty"><div className="empty-orbit"><Radio size={20} /></div><span className="eyebrow">NOTHING LOGGED</span><strong>Give the quiet a listen.</strong><p>Scan a world or a surface signature to start your field notes.</p></div>}
    </div>
  );
}

function SettingsPanel() {
  const game = useGameStore((state) => state.game);
  const saveNow = useGameStore((state) => state.saveNow);
  const [motion, setMotion] = useState(false);
  const [contrast, setContrast] = useState(false);
  const [scale, setScale] = useState(100);
  return (
    <div className="panel-scroll settings-content">
      <div className="settings-note"><div><Sparkles size={17} /></div><span><strong>A quiet interface, by design.</strong><small>Adjust your expedition display at any time.</small></span></div>
      <section className="settings-group"><CardEyebrow>DISPLAY</CardEyebrow><label className="range-setting"><span>Interface scale <strong>{scale}%</strong></span><input type="range" min="85" max="125" step="5" value={scale} onChange={(event) => setScale(Number(event.target.value))} /></label><button className="setting-toggle" onClick={() => setContrast((value) => !value)}><span><strong>High contrast</strong><small>Strengthen panel and type contrast</small></span><i className={contrast ? 'on' : ''} /></button><button className="setting-toggle" onClick={() => setMotion((value) => !value)}><span><strong>Reduce motion</strong><small>Soften transitions and camera easing</small></span><i className={motion ? 'on' : ''} /></button></section>
      <section className="settings-group"><CardEyebrow>AUDIO</CardEyebrow><label className="range-setting"><span>Ambient sound <strong>42%</strong></span><input type="range" min="0" max="100" defaultValue="42" /></label><label className="range-setting"><span>Interface signals <strong>65%</strong></span><input type="range" min="0" max="100" defaultValue="65" /></label><p className="settings-caption">Sound design is intentionally sparse. The ship and the silence are part of the field recording.</p></section>
      <section className="settings-group control-reference"><CardEyebrow>CONTROLS</CardEyebrow><div><kbd>W A S D</kbd><span>Flight / walk</span></div><div><kbd>SHIFT</kbd><span>Boost / sprint</span></div><div><kbd>R</kbd><span>Survey scanner</span></div><div><kbd>E</kbd><span>Context interaction</span></div><div><kbd>M</kbd><span>Star chart</span></div><div><kbd>TAB</kbd><span>Cargo manifest</span></div></section>
      <div className="save-card"><div><span>EXPEDITION SAVE</span><strong>Local · this device</strong><small>Last saved {new Date(game.lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></div><button onClick={saveNow}>Save now <ArrowDownToLine size={13} /></button></div>
      <p className="settings-build">THE LONG MERIDIAN <span>·</span> FIELD BUILD 0.1.4</p>
    </div>
  );
}

export function PanelContents({ panel }: { panel: Exclude<PanelId, null> }) {
  const setPanel = useGameStore((state) => state.setPanel);
  const title = panelTitles[panel];
  return (
    <aside className={`side-panel panel-${panel}`} aria-label={title}>
      <div className="panel-head"><div className="panel-title-wrap"><span className="panel-index">{String(['navigation', 'map', 'inventory', 'missions', 'codex', 'upgrades', 'settings'].indexOf(panel) + 1).padStart(2, '0')}</span><h2>{title}</h2></div><button className="panel-close" onClick={() => setPanel(null)} aria-label="Close panel"><ChevronDown size={16} /></button></div>
      {panel === 'navigation' && <NavigationPanel />}
      {panel === 'map' && <GalaxyMapPanel />}
      {panel === 'inventory' && <InventoryPanel />}
      {panel === 'upgrades' && <UpgradePanel />}
      {panel === 'missions' && <MissionPanel />}
      {panel === 'codex' && <CodexPanel />}
      {panel === 'settings' && <SettingsPanel />}
    </aside>
  );
}
