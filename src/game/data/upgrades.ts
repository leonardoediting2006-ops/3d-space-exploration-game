import type { UpgradeDefinition } from '../core/types';

export const UPGRADES: UpgradeDefinition[] = [
  {
    id: 'scanner-mk2', name: 'Longwave scanner', category: 'scanner', tier: 1,
    description: 'Finds buried deposits and faint signals across a wider survey radius.',
    credits: 1800, costs: { silicon: 5, ferrite: 4 },
  },
  {
    id: 'survey-drive', name: 'Kestrel survey drive', category: 'drive', tier: 1,
    description: 'A more efficient burn profile extends your practical range.',
    credits: 2250, costs: { titanium: 3, carbon: 5 }, unlocksSystem: 'orison-drift',
  },
  {
    id: 'thermal-weave', name: 'Thermal weave suit', category: 'suit', tier: 1,
    description: 'Retains heat on cold worlds and makes long surveys safer.',
    credits: 1450, costs: { carbon: 6, silicon: 3 },
  },
  {
    id: 'reinforced-hull', name: 'Reinforced hull', category: 'hull', tier: 1,
    description: 'Extra composite plating gives the Lark room to make mistakes.',
    credits: 1950, costs: { ferrite: 8, titanium: 2 },
  },
  {
    id: 'deep-array', name: 'Deep field array', category: 'scanner', tier: 2,
    description: 'Resolves anomalies beyond the edge of a local system.',
    credits: 5200, costs: { 'quantum-crystal': 1, silicon: 10 },
  },
];
