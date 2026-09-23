export type LocationMode = 'station' | 'space' | 'orbit' | 'surface';
export type StarType = 'G-type' | 'Red dwarf' | 'Binary' | 'White dwarf' | 'Pulsar' | 'Anomaly';
export type PlanetClass = 'terran' | 'oceanic' | 'arid' | 'glacial' | 'toxic' | 'anomalous';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'exotic';
export type PanelId = 'navigation' | 'map' | 'inventory' | 'missions' | 'codex' | 'upgrades' | 'settings' | null;

export interface PointOfInterest {
  id: string;
  name: string;
  type: 'mineral' | 'artifact' | 'signal' | 'flora';
  resourceId?: string;
  amount?: number;
  x: number;
  z: number;
}

export interface Planet {
  id: string;
  name: string;
  class: PlanetClass;
  size: number;
  color: string;
  accent: string;
  seed: number;
  gravity: number;
  temperature: number;
  atmosphere: string;
  biome: string;
  resources: string[];
  pointsOfInterest: PointOfInterest[];
  scanned: boolean;
}

export interface StarSystem {
  id: string;
  name: string;
  seed: number;
  starType: StarType;
  starColor: string;
  coordinates: [number, number];
  danger: number;
  planets: Planet[];
  unlocked: boolean;
  discovered: boolean;
}

export interface Discovery {
  id: string;
  title: string;
  category: 'system' | 'planet' | 'mineral' | 'artifact' | 'signal' | 'flora';
  location: string;
  detail: string;
  discoveredAt: number;
  reward: number;
}

export interface Mission {
  id: string;
  title: string;
  detail: string;
  reward: number;
  status: 'active' | 'complete';
  progress: number;
  goal: number;
  kind: 'scan' | 'gather' | 'artifact' | 'travel';
}

export interface UpgradeDefinition {
  id: string;
  name: string;
  category: 'scanner' | 'drive' | 'suit' | 'hull';
  tier: number;
  description: string;
  credits: number;
  costs: Record<string, number>;
  unlocksSystem?: string;
}

export interface GameSave {
  version: number;
  galaxySeed: number;
  location: LocationMode;
  currentSystemId: string;
  selectedPlanetId: string;
  selectedLandingSite: string;
  discoveredSystems: string[];
  credits: number;
  fuel: number;
  hull: number;
  inventory: Record<string, number>;
  upgrades: string[];
  scannedPlanets: string[];
  visitedPlanets: string[];
  scannedObjects: string[];
  collectedNodes: string[];
  discoveries: Discovery[];
  missions: Mission[];
  tutorialStep: number;
  storySignalHeard: boolean;
  lastSavedAt: number;
}

export interface NearbyTarget {
  id: string;
  name: string;
  type: PointOfInterest['type'] | 'ship';
  distance: number;
  scanned: boolean;
}
