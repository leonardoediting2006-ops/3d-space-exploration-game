import type { Ease } from '../core/types';

export interface EasingPreset {
  id: string;
  name: string;
  group: string;
  ease: Ease;
}

const b = (x1: number, y1: number, x2: number, y2: number): Ease => [x1, y1, x2, y2];

/**
 * A curated easing library. Cubic-bezier values follow the widely used easings.net / CSS / Material
 * definitions; bounces, elastics, springs and steps are procedural named curves.
 */
export const EASING_PRESETS: EasingPreset[] = [
  { id: 'linear', name: 'Linear', group: 'Basic', ease: 'linear' },
  { id: 'hold', name: 'Hold', group: 'Basic', ease: 'hold' },
  { id: 'easyEase', name: 'Easy Ease', group: 'Basic', ease: b(0.33, 0, 0.67, 1) },
  { id: 'easyEaseStrong', name: 'Easy Ease Strong', group: 'Basic', ease: b(0.7, 0, 0.3, 1) },
  { id: 'cssEase', name: 'Ease', group: 'Basic', ease: b(0.25, 0.1, 0.25, 1) },
  { id: 'cssIn', name: 'Ease In', group: 'Basic', ease: b(0.42, 0, 1, 1) },
  { id: 'cssOut', name: 'Ease Out', group: 'Basic', ease: b(0, 0, 0.58, 1) },
  { id: 'cssInOut', name: 'Ease In Out', group: 'Basic', ease: b(0.42, 0, 0.58, 1) },

  { id: 'sineIn', name: 'Sine In', group: 'Sine', ease: b(0.12, 0, 0.39, 0) },
  { id: 'sineOut', name: 'Sine Out', group: 'Sine', ease: b(0.61, 1, 0.88, 1) },
  { id: 'sineInOut', name: 'Sine In Out', group: 'Sine', ease: b(0.37, 0, 0.63, 1) },
  { id: 'quadIn', name: 'Quad In', group: 'Quad', ease: b(0.11, 0, 0.5, 0) },
  { id: 'quadOut', name: 'Quad Out', group: 'Quad', ease: b(0.5, 1, 0.89, 1) },
  { id: 'quadInOut', name: 'Quad In Out', group: 'Quad', ease: b(0.45, 0, 0.55, 1) },
  { id: 'cubicIn', name: 'Cubic In', group: 'Cubic', ease: b(0.32, 0, 0.67, 0) },
  { id: 'cubicOut', name: 'Cubic Out', group: 'Cubic', ease: b(0.33, 1, 0.68, 1) },
  { id: 'cubicInOut', name: 'Cubic In Out', group: 'Cubic', ease: b(0.65, 0, 0.35, 1) },
  { id: 'quartIn', name: 'Quart In', group: 'Quart', ease: b(0.5, 0, 0.75, 0) },
  { id: 'quartOut', name: 'Quart Out', group: 'Quart', ease: b(0.25, 1, 0.5, 1) },
  { id: 'quartInOut', name: 'Quart In Out', group: 'Quart', ease: b(0.76, 0, 0.24, 1) },
  { id: 'quintIn', name: 'Quint In', group: 'Quint', ease: b(0.64, 0, 0.78, 0) },
  { id: 'quintOut', name: 'Quint Out', group: 'Quint', ease: b(0.22, 1, 0.36, 1) },
  { id: 'quintInOut', name: 'Quint In Out', group: 'Quint', ease: b(0.83, 0, 0.17, 1) },
  { id: 'expoIn', name: 'Expo In', group: 'Expo', ease: b(0.7, 0, 0.84, 0) },
  { id: 'expoOut', name: 'Expo Out', group: 'Expo', ease: b(0.16, 1, 0.3, 1) },
  { id: 'expoInOut', name: 'Expo In Out', group: 'Expo', ease: b(0.87, 0, 0.13, 1) },
  { id: 'circIn', name: 'Circ In', group: 'Circ', ease: b(0.55, 0, 1, 0.45) },
  { id: 'circOut', name: 'Circ Out', group: 'Circ', ease: b(0, 0.55, 0.45, 1) },
  { id: 'circInOut', name: 'Circ In Out', group: 'Circ', ease: b(0.85, 0, 0.15, 1) },

  { id: 'backIn', name: 'Back In (anticipate)', group: 'Overshoot', ease: b(0.36, 0, 0.66, -0.56) },
  { id: 'backOut', name: 'Back Out (overshoot)', group: 'Overshoot', ease: b(0.34, 1.56, 0.64, 1) },
  { id: 'backInOut', name: 'Back In Out', group: 'Overshoot', ease: b(0.68, -0.6, 0.32, 1.6) },
  { id: 'overshootSoft', name: 'Soft Overshoot', group: 'Overshoot', ease: b(0.25, 1.25, 0.5, 1) },
  { id: 'overshootHard', name: 'Hard Overshoot', group: 'Overshoot', ease: b(0.2, 2, 0.4, 1) },
  { id: 'slingshot', name: 'Slingshot', group: 'Overshoot', ease: b(0.5, -0.8, 0.5, 1.6) },

  { id: 'bounceOut', name: 'Bounce Out', group: 'Bounce & Spring', ease: 'bounceOut' },
  { id: 'bounceIn', name: 'Bounce In', group: 'Bounce & Spring', ease: 'bounceIn' },
  { id: 'bounceInOut', name: 'Bounce In Out', group: 'Bounce & Spring', ease: 'bounceInOut' },
  { id: 'elasticOut', name: 'Elastic Out', group: 'Bounce & Spring', ease: 'elasticOut' },
  { id: 'elasticIn', name: 'Elastic In', group: 'Bounce & Spring', ease: 'elasticIn' },
  { id: 'elasticInOut', name: 'Elastic In Out', group: 'Bounce & Spring', ease: 'elasticInOut' },
  { id: 'springOut', name: 'Spring', group: 'Bounce & Spring', ease: 'springOut' },

  { id: 'matStandard', name: 'Material Standard', group: 'UI', ease: b(0.4, 0, 0.2, 1) },
  { id: 'matDecel', name: 'Material Decelerate', group: 'UI', ease: b(0, 0, 0.2, 1) },
  { id: 'matAccel', name: 'Material Accelerate', group: 'UI', ease: b(0.4, 0, 1, 1) },
  { id: 'matEmphasized', name: 'Emphasized', group: 'UI', ease: b(0.2, 0, 0, 1) },
  { id: 'snappy', name: 'Snappy', group: 'UI', ease: b(0.7, 0, 0.3, 1) },
  { id: 'softLand', name: 'Soft Landing', group: 'UI', ease: b(0.2, 0.8, 0.2, 1) },
  { id: 'whip', name: 'Whip', group: 'UI', ease: b(0.05, 0.9, 0.1, 1) },
  { id: 'slowStart', name: 'Slow Start, Fast End', group: 'UI', ease: b(0.9, 0, 1, 0.6) },

  { id: 'steps4', name: 'Steps (4)', group: 'Steps', ease: 'steps4' },
  { id: 'steps8', name: 'Steps (8)', group: 'Steps', ease: 'steps8' },
  { id: 'steps16', name: 'Steps (16)', group: 'Steps', ease: 'steps16' },
];

export const EASING_BY_ID: Record<string, EasingPreset> = Object.fromEntries(EASING_PRESETS.map((e) => [e.id, e]));

export const easing = (id: string): Ease => {
  const e = EASING_BY_ID[id];
  if (!e) throw new Error(`Unknown easing preset "${id}"`);
  return e.ease;
};
