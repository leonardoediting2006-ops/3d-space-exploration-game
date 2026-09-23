import type { Rarity } from '../core/types';

export interface ResourceDefinition {
  id: string;
  name: string;
  rarity: Rarity;
  value: number;
  color: string;
  category: string;
  description: string;
}

export const RESOURCES: Record<string, ResourceDefinition> = {
  ferrite: { id: 'ferrite', name: 'Ferrite ore', rarity: 'common', value: 14, color: '#a7a59e', category: 'Mineral', description: 'Iron-rich fragments used in basic repairs.' },
  carbon: { id: 'carbon', name: 'Carbon weave', rarity: 'common', value: 12, color: '#a9c5ae', category: 'Element', description: 'A light, reactive lattice harvested from living matter.' },
  silicon: { id: 'silicon', name: 'Silica crystal', rarity: 'common', value: 18, color: '#9caef0', category: 'Mineral', description: 'A clean semiconductor found in ancient volcanic glass.' },
  ice: { id: 'ice', name: 'Water ice', rarity: 'common', value: 8, color: '#9cdef1', category: 'Volatile', description: 'Purified for life support and reaction mass.' },
  titanium: { id: 'titanium', name: 'Titanium', rarity: 'uncommon', value: 42, color: '#b6c4d0', category: 'Metal', description: 'A durable alloying metal with high tensile strength.' },
  cobalt: { id: 'cobalt', name: 'Cobalt', rarity: 'uncommon', value: 55, color: '#7f9eff', category: 'Metal', description: 'A magnetic transition metal used in shield capacitors.' },
  nickel: { id: 'nickel', name: 'Nickel', rarity: 'uncommon', value: 38, color: '#b7c1a6', category: 'Metal', description: 'Corrosion-resistant metal for pressure seals.' },
  'quantum-crystal': { id: 'quantum-crystal', name: 'Quantum crystal', rarity: 'rare', value: 210, color: '#72daca', category: 'Exotic', description: 'A resonant lattice that holds a measurable phase offset.' },
  xenonite: { id: 'xenonite', name: 'Xenonite', rarity: 'rare', value: 265, color: '#d497ef', category: 'Exotic', description: 'A mineral that glows faintly in the presence of radio noise.' },
  'void-glass': { id: 'void-glass', name: 'Void glass', rarity: 'rare', value: 320, color: '#94a7d8', category: 'Artifact', description: 'Black silicate with a reflective surface that absorbs starlight.' },
  'dark-matter': { id: 'dark-matter', name: 'Dark matter fragment', rarity: 'exotic', value: 740, color: '#b99cff', category: 'Exotic', description: 'A stable sliver of something that should not be collectable.' },
  'ancient-alloy': { id: 'ancient-alloy', name: 'Ancient alloy', rarity: 'exotic', value: 980, color: '#d8bb83', category: 'Artifact', description: 'An unknown metal, older than the surveyed star charts.' },
  'energy-core': { id: 'energy-core', name: 'Unknown energy core', rarity: 'exotic', value: 1250, color: '#81d9e8', category: 'Artifact', description: 'A dormant power source with no known point of failure.' },
  'amber-spore': { id: 'amber-spore', name: 'Amber spore', rarity: 'uncommon', value: 72, color: '#e6bd73', category: 'Organic', description: 'A dormant seed pod adapted to vacuum and low light.' },
  'ion-salt': { id: 'ion-salt', name: 'Ion salt', rarity: 'common', value: 22, color: '#e8a9a1', category: 'Volatile', description: 'A crystalline salt used to stabilize reactor flow.' },
};

export const RESOURCE_IDS = Object.keys(RESOURCES);
