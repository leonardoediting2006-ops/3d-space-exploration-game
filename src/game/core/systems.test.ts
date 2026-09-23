import { describe, expect, it } from 'vitest';
import { generateGalaxy } from '../data/galaxy';
import { UPGRADES } from '../data/upgrades';
import { addToInventory, checkPurchase, getMissionProgress, inventoryValue, purchaseUpgrade } from './systems';
import { createDefaultSave, decodeSave, serializeSave } from '../state/save';
import { terrainHeight } from './terrain';

describe('procedural galaxy', () => {
  it('generates the same systems and survey sites from a seed', () => {
    expect(generateGalaxy(78123)).toEqual(generateGalaxy(78123));
    expect(generateGalaxy(78123)).not.toEqual(generateGalaxy(78124));
  });

  it('contains a stable three-system, nine-world starting map', () => {
    const galaxy = generateGalaxy(99);
    expect(galaxy).toHaveLength(3);
    expect(galaxy.flatMap((system) => system.planets)).toHaveLength(9);
    expect(galaxy.flatMap((system) => system.planets).every((planet) => planet.pointsOfInterest.length >= 3)).toBe(true);
  });

  it('keeps procedural terrain finite and stable', () => {
    expect(terrainHeight(12.4, -8.2, 44)).toBe(terrainHeight(12.4, -8.2, 44));
    expect(Number.isFinite(terrainHeight(100, -100, 44))).toBe(true);
  });
});

describe('cargo and service economy', () => {
  it('stacks resources and values cargo at the exchange rate', () => {
    const cargo = addToInventory({ ferrite: 3 }, 'ferrite', 4);
    expect(cargo.ferrite).toBe(7);
    expect(inventoryValue(cargo)).toBe(70);
  });

  it('does not let an upgrade overspend missing resources', () => {
    const upgrade = UPGRADES.find((entry) => entry.id === 'scanner-mk2')!;
    const check = checkPurchase(upgrade, 9000, { silicon: 2 });
    expect(check.affordable).toBe(false);
    expect(check.missingCredits).toBe(0);
    expect(check.missingResources).toEqual({ silicon: 3, ferrite: 4 });
  });

  it('deducts credits and materials exactly once when installing a system', () => {
    const upgrade = UPGRADES.find((entry) => entry.id === 'scanner-mk2')!;
    const save = { ...createDefaultSave(), inventory: { silicon: 7, ferrite: 5 } };
    const purchased = purchaseUpgrade(save, upgrade)!;
    expect(purchased.credits).toBe(save.credits - upgrade.credits);
    expect(purchased.inventory).toEqual({ silicon: 2, ferrite: 1 });
    expect(purchaseUpgrade(purchased, upgrade)).toBeUndefined();
  });

  it('pays a mission reward only on the transition to complete', () => {
    const mission = { id: 'survey', title: 'Survey', detail: 'Scan', reward: 250, status: 'active' as const, progress: 0, goal: 1, kind: 'scan' as const };
    const complete = getMissionProgress([mission], 'scan');
    expect(complete[0]?.status).toBe('complete');
    expect(getMissionProgress(complete, 'scan')).toEqual(complete);
  });
});

describe('local save data', () => {
  it('round-trips a save and rejects malformed storage', () => {
    const save = createDefaultSave(1234);
    expect(decodeSave(serializeSave(save))).toMatchObject({ galaxySeed: 1234, currentSystemId: 'helios-reach' });
    expect(decodeSave('{broken')).toBeUndefined();
    expect(decodeSave('{"version":2}')).toBeUndefined();
  });
});
