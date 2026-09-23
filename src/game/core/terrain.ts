import { createRandom } from './random';

const phaseCache = new Map<number, [number, number]>();

export function terrainHeight(x: number, z: number, seed: number): number {
  let phase = phaseCache.get(seed);
  if (!phase) {
    const random = createRandom(seed);
    phase = [random() * 40, random() * 40];
    phaseCache.set(seed, phase);
  }
  const [offsetX, offsetZ] = phase;
  const broad = Math.sin((x + offsetX) * 0.06) * Math.cos((z + offsetZ) * 0.047) * 2.2;
  const ridge = Math.sin((x + z + offsetX) * 0.125) * Math.cos((z - offsetX) * 0.09) * 0.85;
  const fine = Math.sin((x + offsetZ) * 0.31) * Math.cos((z + offsetX) * 0.28) * 0.18;
  const craterDistance = Math.hypot(x + 13, z + 23);
  const crater = -Math.max(0, 1 - Math.abs(craterDistance - 10) / 3) * 2.3;
  return broad + ridge + fine + crater;
}

export function resourcePosition(seed: number, index: number): { x: number; z: number } {
  const random = createRandom(seed + index * 701);
  return { x: -22 + random() * 44, z: -12 - random() * 42 };
}
