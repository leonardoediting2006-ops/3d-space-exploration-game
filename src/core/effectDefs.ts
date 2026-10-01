import { uid } from './ids';
import type { Comp, Effect, Prop, PropKind, PropValue } from './types';

export interface ParamDef {
  key: string;
  label: string;
  kind: PropKind;
  value: PropValue | ((comp: { width: number; height: number }) => PropValue);
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  options?: string[];
}

export interface EffectDef {
  type: string;
  name: string;
  category: string;
  params: ParamDef[];
}

export const EFFECTS: EffectDef[] = [
  {
    type: 'gaussianBlur',
    name: 'Gaussian Blur',
    category: 'Blur & Sharpen',
    params: [{ key: 'blurriness', label: 'Blurriness', kind: 'number', value: 10, min: 0, max: 250, step: 0.5, decimals: 1 }],
  },
  {
    type: 'directionalBlur',
    name: 'Directional Blur',
    category: 'Blur & Sharpen',
    params: [
      { key: 'direction', label: 'Direction', kind: 'number', value: 0, unit: '°', step: 1, decimals: 0 },
      { key: 'length', label: 'Blur Length', kind: 'number', value: 20, min: 0, max: 1000, step: 1, decimals: 0 },
    ],
  },
  {
    type: 'mosaic',
    name: 'Mosaic',
    category: 'Stylize',
    params: [{ key: 'blocks', label: 'Horizontal Blocks', kind: 'number', value: 24, min: 2, max: 400, step: 1, decimals: 0 }],
  },
  {
    type: 'brightnessContrast',
    name: 'Brightness & Contrast',
    category: 'Color Correction',
    params: [
      { key: 'brightness', label: 'Brightness', kind: 'number', value: 0, min: -100, max: 100, step: 1, decimals: 0 },
      { key: 'contrast', label: 'Contrast', kind: 'number', value: 0, min: -100, max: 100, step: 1, decimals: 0 },
    ],
  },
  {
    type: 'hueSaturation',
    name: 'Hue/Saturation',
    category: 'Color Correction',
    params: [
      { key: 'hue', label: 'Master Hue', kind: 'number', value: 0, unit: '°', min: -360, max: 360, step: 1, decimals: 0 },
      { key: 'saturation', label: 'Master Saturation', kind: 'number', value: 0, min: -100, max: 100, step: 1, decimals: 0 },
      { key: 'lightness', label: 'Master Lightness', kind: 'number', value: 0, min: -100, max: 100, step: 1, decimals: 0 },
    ],
  },
  {
    type: 'blackWhite',
    name: 'Black & White',
    category: 'Color Correction',
    params: [{ key: 'amount', label: 'Amount', kind: 'number', value: 100, unit: '%', min: 0, max: 100, step: 1, decimals: 0 }],
  },
  {
    type: 'invert',
    name: 'Invert',
    category: 'Color Correction',
    params: [{ key: 'amount', label: 'Blend With Original', kind: 'number', value: 100, unit: '%', min: 0, max: 100, step: 1, decimals: 0 }],
  },
  {
    type: 'tint',
    name: 'Tint',
    category: 'Color Correction',
    params: [
      { key: 'black', label: 'Map Black To', kind: 'color', value: [0, 0, 0] },
      { key: 'white', label: 'Map White To', kind: 'color', value: [255, 255, 255] },
      { key: 'amount', label: 'Amount to Tint', kind: 'number', value: 100, unit: '%', min: 0, max: 100, step: 1, decimals: 0 },
    ],
  },
  {
    type: 'dropShadow',
    name: 'Drop Shadow',
    category: 'Perspective',
    params: [
      { key: 'color', label: 'Shadow Color', kind: 'color', value: [0, 0, 0] },
      { key: 'opacity', label: 'Opacity', kind: 'number', value: 50, unit: '%', min: 0, max: 100, step: 1, decimals: 0 },
      { key: 'direction', label: 'Direction', kind: 'number', value: 135, unit: '°', step: 1, decimals: 0 },
      { key: 'distance', label: 'Distance', kind: 'number', value: 10, min: 0, max: 1000, step: 1, decimals: 0 },
      { key: 'softness', label: 'Softness', kind: 'number', value: 10, min: 0, max: 250, step: 1, decimals: 0 },
    ],
  },
  {
    type: 'glow',
    name: 'Glow',
    category: 'Stylize',
    params: [
      { key: 'threshold', label: 'Glow Threshold', kind: 'number', value: 60, unit: '%', min: 0, max: 100, step: 1, decimals: 0 },
      { key: 'radius', label: 'Glow Radius', kind: 'number', value: 20, min: 0, max: 500, step: 1, decimals: 0 },
      { key: 'intensity', label: 'Glow Intensity', kind: 'number', value: 1, min: 0, max: 5, step: 0.05, decimals: 2 },
    ],
  },
  {
    type: 'fill',
    name: 'Fill',
    category: 'Generate',
    params: [
      { key: 'color', label: 'Color', kind: 'color', value: [255, 0, 0] },
      { key: 'opacity', label: 'Opacity', kind: 'number', value: 100, unit: '%', min: 0, max: 100, step: 1, decimals: 0 },
    ],
  },
  {
    type: 'gradientRamp',
    name: 'Gradient Ramp',
    category: 'Generate',
    params: [
      { key: 'start', label: 'Start of Ramp', kind: 'vec2', value: () => [0, 0], unit: 'px', step: 1, decimals: 0 },
      { key: 'startColor', label: 'Start Color', kind: 'color', value: [0, 0, 0] },
      { key: 'end', label: 'End of Ramp', kind: 'vec2', value: (c) => [0, c.height], unit: 'px', step: 1, decimals: 0 },
      { key: 'endColor', label: 'End Color', kind: 'color', value: [255, 255, 255] },
      { key: 'shape', label: 'Ramp Shape', kind: 'number', value: 0, options: ['Linear Ramp', 'Radial Ramp'] },
      { key: 'blend', label: 'Blend With Original', kind: 'number', value: 0, unit: '%', min: 0, max: 100, step: 1, decimals: 0 },
    ],
  },
  {
    type: 'noise',
    name: 'Noise',
    category: 'Noise & Grain',
    params: [{ key: 'amount', label: 'Amount of Noise', kind: 'number', value: 20, unit: '%', min: 0, max: 100, step: 1, decimals: 0 }],
  },
];

export function getEffectDef(type: string): EffectDef | undefined {
  return EFFECTS.find((e) => e.type === type);
}

export function makeParamProp(def: ParamDef, comp: { width: number; height: number }): Prop {
  const raw = typeof def.value === 'function' ? def.value(comp) : def.value;
  const value = Array.isArray(raw) ? [...raw] : raw;
  const p: Prop = { kind: def.kind, label: def.label, value, keys: [] };
  if (def.unit !== undefined) p.unit = def.unit;
  if (def.min !== undefined) p.min = def.min;
  if (def.max !== undefined) p.max = def.max;
  if (def.step !== undefined) p.step = def.step;
  if (def.decimals !== undefined) p.decimals = def.decimals;
  if (def.options) p.options = def.options;
  return p;
}

export function createEffect(type: string, comp: Pick<Comp, 'width' | 'height'>): Effect | null {
  const def = getEffectDef(type);
  if (!def) return null;
  const props: Record<string, Prop> = {};
  for (const p of def.params) props[p.key] = makeParamProp(p, comp);
  return { id: uid('fx'), type, enabled: true, props };
}
