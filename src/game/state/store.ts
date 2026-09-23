import { create } from 'zustand';
import type { Discovery, GameSave, LocationMode, NearbyTarget, PanelId, StarSystem } from '../core/types';
import { getMissionProgress, inventoryValue, missionReward, purchaseUpgrade } from '../core/systems';
import { generateGalaxy, getPlanet } from '../data/galaxy';
import { RESOURCES } from '../data/resources';
import { UPGRADES } from '../data/upgrades';
import { createDefaultSave, loadSave, SAVE_KEY, serializeSave } from './save';

interface GameState {
  game: GameSave;
  galaxy: StarSystem[];
  activePanel: PanelId;
  toast: string | null;
  toastTone: 'neutral' | 'success' | 'warning';
  discoveryPopup: Discovery | null;
  speed: number;
  distanceToOrbit: number;
  nearby: NearbyTarget | null;
  autopilot: boolean;
  scanPulse: number;
  sceneReady: boolean;
  saveCorrupt: boolean;
  launch: () => void;
  resetExpedition: () => void;
  selectPlanet: (id: string) => void;
  setLandingSite: (id: string) => void;
  selectSystem: (id: string) => void;
  travelToSystem: (id: string) => void;
  setPanel: (panel: PanelId) => void;
  setLocation: (location: LocationMode) => void;
  setSceneReady: (ready: boolean) => void;
  setFlightTelemetry: (speed: number, distanceToOrbit: number) => void;
  setNearby: (nearby: NearbyTarget | null) => void;
  setAutopilot: (enabled: boolean) => void;
  scan: () => void;
  land: (siteId: string) => void;
  interact: () => void;
  takeOff: () => void;
  returnToStation: () => void;
  sellCargo: () => void;
  buyUpgrade: (upgradeId: string) => void;
  saveNow: () => void;
  dismissDiscovery: () => void;
  dismissToast: () => void;
  repairShip: () => void;
}

const loadedSave = loadSave();

function withMissions(save: GameSave, kind: GameSave['missions'][number]['kind']): GameSave {
  const missions = getMissionProgress(save.missions, kind);
  const reward = missionReward(save.missions, missions);
  return { ...save, missions, credits: save.credits + reward };
}

function makeDiscovery(
  id: string,
  title: string,
  category: Discovery['category'],
  location: string,
  detail: string,
  reward: number,
): Discovery {
  return { id, title, category, location, detail, reward, discoveredAt: Date.now() };
}

function discoveredSave(save: GameSave, discovery: Discovery): GameSave {
  if (save.discoveries.some((entry) => entry.id === discovery.id)) return save;
  return { ...save, discoveries: [...save.discoveries, discovery], credits: save.credits + discovery.reward };
}

function currentPlanet(save: GameSave, galaxy: StarSystem[]) {
  return getPlanet(galaxy, save.selectedPlanetId);
}

function galaxyForSave(save: GameSave): StarSystem[] {
  return generateGalaxy(save.galaxySeed).map((system) => ({
    ...system,
    unlocked: system.id === 'helios-reach' || (system.id === 'orison-drift' && save.upgrades.includes('survey-drive')) || (system.id === 'quiet-reach' && save.upgrades.includes('deep-array')),
    discovered: save.discoveredSystems.includes(system.id) || system.planets.some((planet) => save.scannedPlanets.includes(planet.id) || save.visitedPlanets.includes(planet.id)),
  }));
}

export const useGameStore = create<GameState>((set, get) => ({
  game: loadedSave,
  galaxy: galaxyForSave(loadedSave),
  activePanel: 'navigation',
  toast: null,
  toastTone: 'neutral',
  discoveryPopup: null,
  speed: 0,
  distanceToOrbit: 286,
  nearby: null,
  autopilot: false,
  scanPulse: 0,
  sceneReady: false,
  saveCorrupt: false,

  launch: () => {
    set((state) => ({ game: { ...state.game, location: 'space', tutorialStep: Math.max(1, state.game.tutorialStep) }, activePanel: null, toast: 'Departure clamps released. You have the helm.', toastTone: 'success' }));
  },

  resetExpedition: () => {
    const game = createDefaultSave(Math.floor(Math.random() * 2_000_000_000));
    set({ game, galaxy: galaxyForSave(game), activePanel: 'navigation', autopilot: false, speed: 0, distanceToOrbit: 286, discoveryPopup: null, toast: 'New expedition initialized.', toastTone: 'success' });
  },

  selectPlanet: (id) => {
    const selected = getPlanet(get().galaxy, id);
    if (!selected || selected.system.id !== get().game.currentSystemId) return;
    set((state) => ({ game: { ...state.game, selectedPlanetId: id }, activePanel: 'navigation', autopilot: false, distanceToOrbit: 286 }));
  },
  setLandingSite: (id) => set((state) => ({ game: { ...state.game, selectedLandingSite: id } })),

  selectSystem: (id) => {
    const system = get().galaxy.find((candidate) => candidate.id === id);
    if (!system) return;
    if (!system.unlocked && id === 'orison-drift' && !get().game.upgrades.includes('survey-drive')) {
      set({ toast: 'Install the survey drive to chart beyond Helios Reach.', toastTone: 'warning' });
      return;
    }
    if (!system.unlocked && id === 'quiet-reach' && !get().game.upgrades.includes('deep-array')) {
      set({ toast: 'A deep field array is needed to resolve this signal.', toastTone: 'warning' });
      return;
    }
    if (id !== get().game.currentSystemId) get().travelToSystem(id);
  },

  travelToSystem: (id) => {
    const system = get().galaxy.find((candidate) => candidate.id === id);
    if (!system) return;
    const unlocked = id === 'helios-reach' || (id === 'orison-drift' && get().game.upgrades.includes('survey-drive')) || (id === 'quiet-reach' && get().game.upgrades.includes('deep-array'));
    if (!unlocked) {
      set({ toast: 'This route is beyond the current drive envelope.', toastTone: 'warning' });
      return;
    }
    const firstPlanet = system.planets[0];
    set((state) => {
      const missions = getMissionProgress(state.game.missions, 'travel');
      const reward = missionReward(state.game.missions, missions);
      return {
        game: { ...state.game, currentSystemId: id, selectedPlanetId: firstPlanet.id, location: 'space', fuel: Math.max(12, state.game.fuel - 14), discoveredSystems: state.game.discoveredSystems.includes(id) ? state.game.discoveredSystems : [...state.game.discoveredSystems, id], missions, credits: state.game.credits + reward },
        galaxy: state.galaxy.map((entry) => entry.id === id ? { ...entry, discovered: true } : entry),
        activePanel: 'navigation', autopilot: false, speed: 0, distanceToOrbit: 286,
        toast: `Translation complete · ${system.name}`, toastTone: 'success',
      };
    });
  },

  setPanel: (panel) => set({ activePanel: panel }),
  setLocation: (location) => set((state) => ({ game: { ...state.game, location } })),
  setSceneReady: (sceneReady) => set({ sceneReady }),
  setFlightTelemetry: (speed, distanceToOrbit) => set({ speed, distanceToOrbit }),
  setNearby: (nearby) => set({ nearby }),
  setAutopilot: (autopilot) => set({ autopilot }),

  scan: () => {
    const state = get();
    const { game, galaxy } = state;
    const location = game.location;
    const activeTarget = state.nearby;
    set((current) => ({ scanPulse: current.scanPulse + 1 }));

    if (location === 'space' || location === 'orbit') {
      const found = currentPlanet(game, galaxy);
      if (!found) return;
      if (game.scannedPlanets.includes(found.planet.id)) {
        set({ toast: `${found.planet.name} already catalogued · ${found.planet.pointsOfInterest.length} surface signals resolved.`, toastTone: 'neutral' });
        return;
      }
      const discovery = makeDiscovery(`planet:${found.planet.id}`, found.planet.name, 'planet', found.system.name, `${found.planet.biome} · ${found.planet.atmosphere} · ${found.planet.resources.length} useful signatures`, 260);
      set((current) => {
        let next = { ...current.game, scannedPlanets: [...current.game.scannedPlanets, found.planet.id], tutorialStep: Math.max(current.game.tutorialStep, 2) };
        next = discoveredSave(next, discovery);
        next = withMissions(next, 'scan');
        next = { ...next, discoveredSystems: next.discoveredSystems.includes(found.system.id) ? next.discoveredSystems : [...next.discoveredSystems, found.system.id] };
        return { game: next, galaxy: current.galaxy.map((entry) => entry.id === found.system.id ? { ...entry, discovered: true } : entry), discoveryPopup: discovery, toast: 'Survey pulse resolved. Cartography updated.', toastTone: 'success' };
      });
      return;
    }

    if (location !== 'surface' || !activeTarget || activeTarget.type === 'ship') {
      set({ toast: 'No survey signature in range. Move toward a marked contact.', toastTone: 'warning' });
      return;
    }
    if (game.scannedObjects.includes(activeTarget.id)) {
      set({ toast: `${activeTarget.name} · sample signature confirmed.`, toastTone: 'neutral' });
      return;
    }
    const isArtifact = activeTarget.type === 'artifact';
    const discovery = makeDiscovery(
      `object:${activeTarget.id}`,
      isArtifact ? 'A signal beneath the stone' : activeTarget.name,
      isArtifact ? 'signal' : activeTarget.type,
      currentPlanet(game, galaxy)?.planet.name ?? 'Unknown surface',
      isArtifact ? 'A repeating pulse, older than the relay network. Its source is close.' : `${activeTarget.name} · chemical signature matched against the Lark field guide.`,
      isArtifact ? 0 : 90,
    );
    set((current) => {
      let next = { ...current.game, scannedObjects: [...current.game.scannedObjects, activeTarget.id], tutorialStep: Math.max(current.game.tutorialStep, 4) };
      if (!isArtifact) next = discoveredSave(next, discovery);
      return { game: next, discoveryPopup: isArtifact ? null : discovery, toast: isArtifact ? 'A pulse answers from below the ridge.' : `${activeTarget.name} · specimen identified.`, toastTone: isArtifact ? 'warning' : 'success' };
    });
  },

  land: (siteId) => {
    const state = get();
    if (state.game.location !== 'orbit') return;
    const found = currentPlanet(state.game, state.galaxy);
    if (!found) return;
    set((current) => ({
      game: { ...current.game, location: 'surface', selectedLandingSite: siteId, visitedPlanets: current.game.visitedPlanets.includes(found.planet.id) ? current.game.visitedPlanets : [...current.game.visitedPlanets, found.planet.id], tutorialStep: Math.max(current.game.tutorialStep, 3) },
      activePanel: null,
      toast: `Touchdown · ${siteId === 'echo-ridge' ? 'Echo ridge' : 'Cinder basin'}`, toastTone: 'success',
    }));
  },

  interact: () => {
    const state = get();
    const { game, nearby } = state;
    if (game.location === 'station') {
      get().launch();
      return;
    }
    if (game.location === 'orbit') {
      get().land(game.selectedLandingSite);
      return;
    }
    if (game.location !== 'surface' || !nearby) {
      set({ toast: 'Nothing close enough to interact with.', toastTone: 'warning' });
      return;
    }
    if (nearby.type === 'ship') {
      set((current) => ({ game: { ...current.game, location: 'orbit', tutorialStep: Math.max(current.game.tutorialStep, 5) }, activePanel: 'navigation', nearby: null, toast: 'Ramp sealed · ready for ascent.', toastTone: 'success' }));
      return;
    }
    const found = currentPlanet(game, state.galaxy);
    if (!found) return;
    const poi = found.planet.pointsOfInterest.find((point) => point.id === nearby.id);
    if (!poi) return;
    if (game.collectedNodes.includes(poi.id)) {
      set({ toast: 'This site has already been sampled.', toastTone: 'neutral' });
      return;
    }
    if (!game.scannedObjects.includes(poi.id)) {
      set({ toast: 'Run a scanner pass before disturbing the sample.', toastTone: 'warning' });
      return;
    }
    if (poi.type === 'artifact') {
      const discovery = makeDiscovery(`artifact:${poi.id}`, 'The Silent Arch', 'artifact', found.planet.name, 'A seam of impossible geometry. The signal does not originate here; the rock is only a receiver.', 720);
      set((current) => {
        let next: GameSave = { ...current.game, collectedNodes: [...current.game.collectedNodes, poi.id], inventory: { ...current.game.inventory, 'ancient-alloy': (current.game.inventory['ancient-alloy'] ?? 0) + 1 }, storySignalHeard: true, tutorialStep: Math.max(current.game.tutorialStep, 5) };
        next = discoveredSave(next, discovery);
        next = withMissions(next, 'artifact');
        return { game: next, discoveryPopup: discovery, toast: 'Recovered a fragment · the signal continues somewhere beyond this system.', toastTone: 'success' };
      });
      return;
    }
    const resourceId = poi.resourceId ?? 'ferrite';
    const amount = poi.amount ?? 3;
    set((current) => {
      let next = { ...current.game, collectedNodes: [...current.game.collectedNodes, poi.id], inventory: { ...current.game.inventory, [resourceId]: (current.game.inventory[resourceId] ?? 0) + amount }, tutorialStep: Math.max(current.game.tutorialStep, 4) };
      next = withMissions(next, 'gather');
      return { game: next, toast: `Recovered ${amount} × ${RESOURCES[resourceId]?.name ?? resourceId}.`, toastTone: 'success' };
    });
  },

  takeOff: () => {
    if (get().game.location !== 'orbit') return;
    set((state) => ({ game: { ...state.game, location: 'space', fuel: Math.max(8, state.game.fuel - 4) }, activePanel: 'navigation', autopilot: false, toast: 'Ascent complete · orbit cleared.', toastTone: 'success' }));
  },

  returnToStation: () => {
    const state = get();
    if (state.game.location !== 'space') return;
    set((current) => ({ game: { ...current.game, location: 'station', tutorialStep: Math.max(current.game.tutorialStep, 6) }, activePanel: 'navigation', autopilot: false, speed: 0, toast: 'Docking complete · Morrow Relay has you on approach.', toastTone: 'success' }));
  },

  sellCargo: () => {
    const state = get();
    if (state.game.location !== 'station') {
      set({ toast: 'Cargo exchange is only available at the relay.', toastTone: 'warning' });
      return;
    }
    const value = inventoryValue(state.game.inventory);
    if (value <= 0) {
      set({ toast: 'Your cargo hold is empty.', toastTone: 'neutral' });
      return;
    }
    set((current) => ({ game: { ...current.game, inventory: {}, credits: current.game.credits + value }, toast: `Cargo exchanged · +${value.toLocaleString()} CR`, toastTone: 'success' }));
  },

  buyUpgrade: (upgradeId) => {
    const state = get();
    if (state.game.location !== 'station') {
      set({ toast: 'Ship modifications require a relay service bay.', toastTone: 'warning' });
      return;
    }
    const upgrade = UPGRADES.find((candidate) => candidate.id === upgradeId);
    if (!upgrade) return;
    if (upgrade.id === 'deep-array' && !state.game.upgrades.includes('scanner-mk2')) {
      set({ toast: 'Install the Longwave scanner first.', toastTone: 'warning' });
      return;
    }
    const game = purchaseUpgrade(state.game, upgrade);
    if (!game) {
      set({ toast: 'Not enough credits or recovered materials.', toastTone: 'warning' });
      return;
    }
    const galaxy = state.galaxy.map((system) => ({
      ...system,
      unlocked: system.id === 'helios-reach' || (system.id === 'orison-drift' && game.upgrades.includes('survey-drive')) || (system.id === 'quiet-reach' && game.upgrades.includes('deep-array')),
    }));
    set({ game, galaxy, toast: `${upgrade.name} installed.`, toastTone: 'success' });
  },

  saveNow: () => {
    const game = { ...get().game, lastSavedAt: Date.now() };
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(SAVE_KEY, serializeSave(game));
      set({ game, toast: 'Expedition saved to this device.', toastTone: 'success' });
    } catch {
      set({ toast: 'Save unavailable in this browser session.', toastTone: 'warning' });
    }
  },

  dismissDiscovery: () => set({ discoveryPopup: null }),
  dismissToast: () => set({ toast: null }),

  repairShip: () => {
    const state = get();
    if (state.game.location !== 'station') return;
    const missing = 100 - state.game.hull;
    const cost = missing * 9;
    if (!missing) {
      set({ toast: 'Hull integrity is already at 100%.', toastTone: 'neutral' });
      return;
    }
    if (state.game.credits < cost) {
      set({ toast: `Repairs require ${Math.ceil(cost - state.game.credits)} more credits.`, toastTone: 'warning' });
      return;
    }
    set((current) => ({ game: { ...current.game, hull: 100, credits: current.game.credits - cost }, toast: `Hull restored · −${cost.toLocaleString()} CR`, toastTone: 'success' }));
  },
}));

useGameStore.subscribe((state, previous) => {
  if (state.game === previous.game || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SAVE_KEY, serializeSave(state.game));
  } catch {
    // The session stays playable when browser storage is unavailable.
  }
});
