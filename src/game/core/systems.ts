import type { GameSave, Mission, UpgradeDefinition } from './types';
import { RESOURCES } from '../data/resources';

export interface PurchaseCheck {
  affordable: boolean;
  missingCredits: number;
  missingResources: Record<string, number>;
}

export function addToInventory(inventory: Record<string, number>, resourceId: string, amount: number): Record<string, number> {
  return { ...inventory, [resourceId]: (inventory[resourceId] ?? 0) + amount };
}

export function consumeInventory(inventory: Record<string, number>, costs: Record<string, number>): Record<string, number> {
  const next = { ...inventory };
  for (const [resourceId, amount] of Object.entries(costs)) {
    const remainder = (next[resourceId] ?? 0) - amount;
    if (remainder <= 0) delete next[resourceId];
    else next[resourceId] = remainder;
  }
  return next;
}

export function checkPurchase(
  upgrade: UpgradeDefinition,
  credits: number,
  inventory: Record<string, number>,
): PurchaseCheck {
  const missingResources: Record<string, number> = {};
  for (const [resourceId, amount] of Object.entries(upgrade.costs)) {
    const missing = amount - (inventory[resourceId] ?? 0);
    if (missing > 0) missingResources[resourceId] = missing;
  }
  const missingCredits = Math.max(0, upgrade.credits - credits);
  return { affordable: missingCredits === 0 && Object.keys(missingResources).length === 0, missingCredits, missingResources };
}

export function inventoryValue(inventory: Record<string, number>, saleRate = 0.72): number {
  return Object.entries(inventory).reduce((total, [resourceId, amount]) => total + Math.floor((RESOURCES[resourceId]?.value ?? 0) * saleRate) * amount, 0);
}

export function getMissionProgress(missions: Mission[], kind: Mission['kind']): Mission[] {
  let completedReward = 0;
  const next = missions.map((mission) => {
    if (mission.status !== 'active' || mission.kind !== kind) return mission;
    const progress = Math.min(mission.goal, mission.progress + 1);
    const complete = progress >= mission.goal;
    if (complete) completedReward += mission.reward;
    return { ...mission, progress, status: complete ? 'complete' as const : 'active' as const };
  });
  return next;
}

export function missionReward(missionsBefore: Mission[], missionsAfter: Mission[]): number {
  return missionsAfter.reduce((total, mission, index) => {
    return total + (mission.status === 'complete' && missionsBefore[index]?.status === 'active' ? mission.reward : 0);
  }, 0);
}

export function purchaseUpgrade(save: GameSave, upgrade: UpgradeDefinition): GameSave | undefined {
  if (save.upgrades.includes(upgrade.id) || !checkPurchase(upgrade, save.credits, save.inventory).affordable) return undefined;
  return {
    ...save,
    credits: save.credits - upgrade.credits,
    inventory: consumeInventory(save.inventory, upgrade.costs),
    upgrades: [...save.upgrades, upgrade.id],
  };
}
