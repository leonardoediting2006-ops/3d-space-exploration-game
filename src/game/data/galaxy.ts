import type { Planet, PlanetClass, PointOfInterest, StarSystem, StarType } from '../core/types';
import { createRandom, hashSeed, pick } from '../core/random';

interface SystemTemplate {
  id: string;
  name: string;
  starTypes: StarType[];
  starColors: string[];
  coordinates: [number, number];
  danger: number;
  unlocked: boolean;
  planets: Array<{ name: string; class: PlanetClass; color: string; accent: string; biome: string; atmosphere: string; resources: string[] }>;
}

const SYSTEMS: SystemTemplate[] = [
  {
    id: 'helios-reach', name: 'Helios Reach', starTypes: ['G-type', 'G-type', 'Binary'], starColors: ['#f7d9a0', '#f4ca83', '#ffb576'],
    coordinates: [0, 0], danger: 1, unlocked: true,
    planets: [
      { name: 'Veyra', class: 'arid', color: '#bc805f', accent: '#e6b88b', biome: 'Cinder Steppe', atmosphere: 'Thin nitrogen', resources: ['titanium', 'silicon', 'ferrite'] },
      { name: 'Nacre', class: 'oceanic', color: '#4a8394', accent: '#9bd4cc', biome: 'Pelagic shelf', atmosphere: 'Breathable traces', resources: ['ice', 'cobalt', 'amber-spore'] },
      { name: 'Orthe', class: 'glacial', color: '#a7c8d4', accent: '#dcebf1', biome: 'Bluefall ice', atmosphere: 'Frozen argon', resources: ['ice', 'nickel', 'quantum-crystal'] },
    ],
  },
  {
    id: 'orison-drift', name: 'Orison Drift', starTypes: ['Red dwarf', 'White dwarf', 'G-type'], starColors: ['#ee8667', '#c6d8f2', '#ffe2a9'],
    coordinates: [1.9, 0.9], danger: 2, unlocked: false,
    planets: [
      { name: 'Morrowglass', class: 'anomalous', color: '#705d94', accent: '#b9a0ed', biome: 'Resonant basin', atmosphere: 'Unresolved', resources: ['void-glass', 'silicon', 'xenonite'] },
      { name: 'Sable', class: 'arid', color: '#a27855', accent: '#edbd82', biome: 'Red dune sea', atmosphere: 'Carbon dioxide', resources: ['ferrite', 'titanium', 'ion-salt'] },
      { name: 'Leth', class: 'toxic', color: '#78916f', accent: '#b2d284', biome: 'Viridian hollow', atmosphere: 'Reactive chlorine', resources: ['amber-spore', 'cobalt', 'xenonite'] },
    ],
  },
  {
    id: 'quiet-reach', name: 'The Quiet Reach', starTypes: ['Pulsar', 'Anomaly', 'Binary'], starColors: ['#88bde2', '#9b83d0', '#f09a74'],
    coordinates: [3.8, -1.4], danger: 4, unlocked: false,
    planets: [
      { name: 'Asterion', class: 'glacial', color: '#7a93ad', accent: '#abd8e7', biome: 'Pale fracture', atmosphere: 'Trace methane', resources: ['quantum-crystal', 'dark-matter', 'ice'] },
      { name: 'Ilyon', class: 'oceanic', color: '#367888', accent: '#73d9c4', biome: 'Luminous trench', atmosphere: 'Dense nitrogen', resources: ['cobalt', 'xenonite', 'amber-spore'] },
      { name: 'The Lantern', class: 'anomalous', color: '#84678b', accent: '#df9fb1', biome: 'Eventide coast', atmosphere: 'Unknown', resources: ['ancient-alloy', 'energy-core', 'void-glass'] },
    ],
  },
];

const POI_NAMES: Record<PlanetClass, string[]> = {
  terran: ['Shelter ridge', 'Fallow garden', 'Basalt cairn'],
  oceanic: ['Tidal glass', 'Blue shelf', 'Salt blossom'],
  arid: ['Shale bloom', 'Sundial crater', 'Quiet arch'],
  glacial: ['Frost seam', 'Drift marker', 'Pale chasm'],
  toxic: ['Viridian vent', 'Glass root', 'Green hollow'],
  anomalous: ['Resonant hollow', 'Silent geometry', 'Phase wound'],
};

function createPlanet(template: SystemTemplate['planets'][number], systemSeed: number, index: number): Planet {
  const id = `planet-${template.name.toLowerCase().replaceAll(' ', '-')}`;
  const seed = hashSeed(`${systemSeed}:${id}`);
  const random = createRandom(seed);
  const poiNames = POI_NAMES[template.class];
  const rareType: PointOfInterest['type'] = template.resources.some((resource) => resource === 'ancient-alloy' || resource === 'energy-core' || resource === 'void-glass') ? 'artifact' : 'mineral';
  const pointsOfInterest: PointOfInterest[] = [
    { id: `${id}-deposit-a`, name: pick(poiNames, random), type: 'mineral', resourceId: template.resources[index % template.resources.length], amount: 3 + Math.floor(random() * 4), x: -17 + random() * 8, z: -27 + random() * 12 },
    { id: `${id}-deposit-b`, name: pick(poiNames, random), type: 'mineral', resourceId: template.resources[(index + 1) % template.resources.length], amount: 2 + Math.floor(random() * 4), x: 13 + random() * 9, z: -39 + random() * 12 },
    { id: `${id}-signal`, name: rareType === 'artifact' ? 'Uncatalogued structure' : 'Unmarked relay', type: 'artifact', resourceId: rareType === 'artifact' ? template.resources[0] : 'ancient-alloy', amount: 1, x: 2 + random() * 12, z: -57 - random() * 7 },
  ];

  return {
    id,
    name: template.name,
    class: template.class,
    size: 21 + Math.floor(random() * 16),
    color: template.color,
    accent: template.accent,
    seed,
    gravity: Number((0.48 + random() * 1.18).toFixed(2)),
    temperature: Math.round(template.class === 'glacial' ? -80 + random() * 70 : template.class === 'arid' ? 4 + random() * 64 : -20 + random() * 52),
    atmosphere: template.atmosphere,
    biome: template.biome,
    resources: template.resources,
    pointsOfInterest,
    scanned: false,
  };
}

export function generateGalaxy(seed: number): StarSystem[] {
  return SYSTEMS.map((template, index) => {
    const systemSeed = hashSeed(`${seed}:${template.id}`);
    const random = createRandom(systemSeed);
    const starType = pick(template.starTypes, random);
    const starColor = pick(template.starColors, random);
    return {
      ...template,
      seed: systemSeed,
      starType,
      starColor,
      planets: template.planets.map((planet, planetIndex) => createPlanet(planet, systemSeed, planetIndex)),
      discovered: index === 0,
    };
  });
}

export function getPlanet(systems: StarSystem[], id: string): { system: StarSystem; planet: Planet } | undefined {
  for (const system of systems) {
    const planet = system.planets.find((candidate) => candidate.id === id);
    if (planet) return { system, planet };
  }
  return undefined;
}

export const DEFAULT_GALAXY_SEED = 782410;
