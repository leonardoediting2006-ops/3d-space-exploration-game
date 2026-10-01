// Data model for Keyframe Studio. Everything here is plain, JSON-serialisable data
// so projects can be cloned for undo/redo and saved to disk without any custom logic.

export type Vec2 = [number, number];
export type RGB = [number, number, number]; // 0..255
export type PropValue = number | number[];
export type PropKind = 'number' | 'vec2' | 'color' | 'path';

/** Interpolation leaving a keyframe: linear, hold, or a CSS-style cubic bezier. */
export type Ease = 'linear' | 'hold' | [number, number, number, number];

export interface Keyframe {
  id: string;
  /** Composition time in seconds. Keyframes travel with their layer when it is moved. */
  t: number;
  v: PropValue;
  ease: Ease;
}

export interface Wiggle {
  freq: number; // wiggles per second
  amp: number; // peak deviation, in the property's own units
  seed: number;
}

export interface Prop {
  kind: PropKind;
  label: string;
  value: PropValue;
  keys: Keyframe[]; // sorted by t; non-empty means "stopwatch on"
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  /** When set, the numeric value is an index into this list and is edited with a dropdown. */
  options?: string[];
  /** Scale-style properties edit both axes together. */
  link?: boolean;
  wiggle?: Wiggle;
  /** Repeat the keyframed animation after the last keyframe. */
  loop?: 'cycle' | 'pingpong';
}

export type TransformKey = 'anchor' | 'position' | 'scale' | 'rotation' | 'opacity';
export const TRANSFORM_KEYS: TransformKey[] = ['anchor', 'position', 'scale', 'rotation', 'opacity'];

export type BlendMode =
  | 'normal'
  | 'add'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

export const BLEND_MODES: { id: BlendMode; label: string; op: GlobalCompositeOperation }[] = [
  { id: 'normal', label: 'Normal', op: 'source-over' },
  { id: 'add', label: 'Add', op: 'lighter' },
  { id: 'multiply', label: 'Multiply', op: 'multiply' },
  { id: 'screen', label: 'Screen', op: 'screen' },
  { id: 'overlay', label: 'Overlay', op: 'overlay' },
  { id: 'darken', label: 'Darken', op: 'darken' },
  { id: 'lighten', label: 'Lighten', op: 'lighten' },
  { id: 'color-dodge', label: 'Color Dodge', op: 'color-dodge' },
  { id: 'color-burn', label: 'Color Burn', op: 'color-burn' },
  { id: 'hard-light', label: 'Hard Light', op: 'hard-light' },
  { id: 'soft-light', label: 'Soft Light', op: 'soft-light' },
  { id: 'difference', label: 'Difference', op: 'difference' },
  { id: 'exclusion', label: 'Exclusion', op: 'exclusion' },
  { id: 'hue', label: 'Hue', op: 'hue' },
  { id: 'saturation', label: 'Saturation', op: 'saturation' },
  { id: 'color', label: 'Color', op: 'color' },
  { id: 'luminosity', label: 'Luminosity', op: 'luminosity' },
];

export type MatteMode = 'none' | 'alpha' | 'alphaInv' | 'luma' | 'lumaInv';
export const MATTE_MODES: { id: MatteMode; label: string }[] = [
  { id: 'none', label: 'No Matte' },
  { id: 'alpha', label: 'Alpha' },
  { id: 'alphaInv', label: 'Alpha Inverted' },
  { id: 'luma', label: 'Luma' },
  { id: 'lumaInv', label: 'Luma Inverted' },
];

export type LayerType = 'solid' | 'shape' | 'text' | 'image' | 'precomp' | 'null' | 'adjustment';

export type ShapeKind = 'rect' | 'ellipse' | 'polygon' | 'star' | 'path';

export type LayerData =
  | { type: 'solid'; width: number; height: number }
  | { type: 'adjustment'; width: number; height: number }
  | { type: 'null'; width: number; height: number }
  | {
      type: 'shape';
      shape: ShapeKind;
      fill: boolean;
      stroke: boolean;
      /** Only meaningful for custom bezier paths. */
      closed: boolean;
      lineCap: 'butt' | 'round' | 'square';
      lineJoin: 'miter' | 'round' | 'bevel';
    }
  | {
      type: 'text';
      text: string;
      font: string;
      bold: boolean;
      italic: boolean;
      align: 'left' | 'center' | 'right';
      stroke: boolean;
    }
  | { type: 'image'; assetId: string }
  | { type: 'precomp'; compId: string };

export interface Effect {
  id: string;
  type: string;
  enabled: boolean;
  props: Record<string, Prop>;
}

export type MaskMode = 'none' | 'add' | 'subtract' | 'intersect';
export const MASK_MODES: { id: MaskMode; label: string }[] = [
  { id: 'add', label: 'Add' },
  { id: 'subtract', label: 'Subtract' },
  { id: 'intersect', label: 'Intersect' },
  { id: 'none', label: 'None' },
];

export interface Mask {
  id: string;
  name: string;
  mode: MaskMode;
  inverted: boolean;
  /** path, feather, opacity, expansion */
  props: Record<string, Prop>;
}

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  label: number; // index into the label palette
  /** Comp time at which the layer's own time 0 sits (matters for precomps). */
  start: number;
  inPoint: number;
  outPoint: number;
  visible: boolean;
  solo: boolean;
  locked: boolean;
  motionBlur: boolean;
  parentId: string | null;
  blend: BlendMode;
  /** Uses the layer directly above as its matte. */
  matte: MatteMode;
  transform: Record<TransformKey, Prop>;
  content: Record<string, Prop>;
  effects: Effect[];
  masks: Mask[];
  data: LayerData;
}

export interface Comp {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  bg: RGB;
  workStart: number;
  workEnd: number;
  motionBlur: boolean;
  /** Shutter angle in degrees (180 is a half-frame exposure). */
  shutterAngle: number;
  /** Top of the stack first, like a timeline panel. */
  layers: Layer[];
}

export interface Asset {
  id: string;
  name: string;
  kind: 'image';
  width: number;
  height: number;
}

export interface Project {
  name: string;
  comps: Record<string, Comp>;
  compOrder: string[];
  assets: Record<string, Asset>;
  assetOrder: string[];
  counters: Record<string, number>;
}

export type PropGroup = 'transform' | 'content' | `fx:${string}` | `mask:${string}`;
export interface PropRef {
  layerId: string;
  group: PropGroup;
  key: string;
}

export const LABEL_COLORS = [
  '#e0584d',
  '#e8a83a',
  '#d6d447',
  '#59b863',
  '#3fb5b0',
  '#4d8fe0',
  '#9a6bdb',
  '#d86bb2',
  '#8d8d8d',
];
