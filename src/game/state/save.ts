import type { GameSave, Mission } from '../core/types';
import { DEFAULT_GALAXY_SEED } from '../data/galaxy';

export const SAVE_KEY = 'long-meridian:expedition:v1';

const initialMissions: Mission[] = [
  { id: 'field-notes', title: 'Field notes: Veyra', detail: 'Complete an orbital survey of an uncharted world.', reward: 380, status: 'active', progress: 0, goal: 1, kind: 'scan' },
  { id: 'mineral-report', title: 'Mineral report', detail: 'Recover a sample for the relay science team.', reward: 520, status: 'active', progress: 0, goal: 1, kind: 'gather' },
  { id: 'quiet-signal', title: 'The quiet signal', detail: 'Find the source of the repeating pulse beneath the basalt.', reward: 900, status: 'active', progress: 0, goal: 1, kind: 'artifact' },
  { id: 'a-larger-map', title: 'A larger map', detail: 'Chart a world beyond the Helios Reach.', reward: 1150, status: 'active', progress: 0, goal: 1, kind: 'travel' },
];

export function createDefaultSave(seed = DEFAULT_GALAXY_SEED): GameSave {
  return {
    version: 1,
    galaxySeed: seed,
    location: 'station',
    currentSystemId: 'helios-reach',
    selectedPlanetId: 'planet-veyra',
    selectedLandingSite: 'cinder-basin',
    discoveredSystems: ['helios-reach'],
    credits: 4850,
    fuel: 86,
    hull: 100,
    inventory: { ferrite: 10, carbon: 12, silicon: 8, titanium: 2 },
    upgrades: [],
    scannedPlanets: [],
    visitedPlanets: [],
    scannedObjects: [],
    collectedNodes: [],
    discoveries: [],
    missions: initialMissions.map((mission) => ({ ...mission })),
    tutorialStep: 0,
    storySignalHeard: false,
    lastSavedAt: Date.now(),
  };
}

export function decodeSave(value: string | null): GameSave | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return undefined;
    const save = parsed as Partial<GameSave>;
    if (
      save.version !== 1 ||
      !Number.isInteger(save.galaxySeed) ||
      !Array.isArray(save.upgrades) ||
      !Array.isArray(save.discoveries) ||
      !Array.isArray(save.missions) ||
      (save.discoveredSystems !== undefined && !Array.isArray(save.discoveredSystems)) ||
      !save.inventory || typeof save.inventory !== 'object' ||
      typeof save.currentSystemId !== 'string' ||
      typeof save.selectedPlanetId !== 'string' ||
      !['station', 'space', 'orbit', 'surface'].includes(save.location ?? '')
    ) return undefined;
    return { ...save, discoveredSystems: save.discoveredSystems ?? ['helios-reach'] } as GameSave;
  } catch {
    return undefined;
  }
}

export function loadSave(storage?: Pick<Storage, 'getItem'>): GameSave {
  try {
    const value = storage?.getItem(SAVE_KEY) ?? (typeof localStorage === 'undefined' ? null : localStorage.getItem(SAVE_KEY));
    return decodeSave(value) ?? createDefaultSave();
  } catch {
    return createDefaultSave();
  }
}

export function serializeSave(save: GameSave): string {
  return JSON.stringify({ ...save, lastSavedAt: Date.now() });
}
