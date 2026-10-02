// Data model for Keyframe Studio. Everything here is plain, JSON-serialisable data
// so projects can be cloned for undo/redo and saved to disk without any custom logic.

export type Vec2 = [number, number];
export type RGB = [number, number, number]; // 0..255
export type PropValue = number | number[];
export type PropKind = 'number' | 'vec2' | 'color' | 'path' | 'gradient';

/** Procedural easing curves a single cubic bezier cannot express (bounces, springs, steps). */
export const NAMED_EASES = [
  'bounceOut',
  'bounceIn',
  'bounceInOut',
  'elasticOut',
  'elasticIn',
  'elasticInOut',
  'springOut',
  'steps4',
  'steps8',
  'steps16',
] as const;
export type NamedEase = (typeof NAMED_EASES)[number];

/** Interpolation leaving a keyframe: linear, hold, a CSS-style cubic bezier, or a named curve. */
export type Ease = 'linear' | 'hold' | [number, number, number, number] | NamedEase;

export interface Keyframe {
  id: string;
  /** Composition time in seconds. Keyframes travel with their layer when it is moved. */
  t: number;
  v: PropValue;
  ease: Ease;
  /**
   * Spatial (motion path) tangents for vec2 properties such as Position, as offsets from the
   * keyframe's value. Zero or absent means a straight line to the neighbouring keyframe.
   */
  sIn?: [number, number];
  sOut?: [number, number];
  /** The library animation (an `AnimInstance` id on the layer) that created this keyframe. */
  src?: string;
}

export interface Wiggle {
  freq: number; // wiggles per second
  amp: number; // peak deviation, in the property's own units
  seed: number;
  /** The library animation (an `AnimInstance` id on the layer) that added this wiggle. */
  src?: string;
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

export type TransformKey = 'anchor' | 'position' | 'scale' | 'rotation' | 'opacity' | 'positionZ' | 'rotationX' | 'rotationY';
/** Every transform property a layer carries. The last three only matter on 3D layers. */
export const TRANSFORM_KEYS: TransformKey[] = ['anchor', 'position', 'scale', 'rotation', 'opacity', 'positionZ', 'rotationX', 'rotationY'];
/** The properties every project file has had since the start (the 3D ones are filled in when missing). */
export const TRANSFORM_KEYS_2D: TransformKey[] = ['anchor', 'position', 'scale', 'rotation', 'opacity'];
export const TRANSFORM_KEYS_3D: TransformKey[] = ['positionZ', 'rotationX', 'rotationY'];

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

export type LayerType = 'solid' | 'shape' | 'text' | 'image' | 'video' | 'audio' | 'precomp' | 'null' | 'adjustment' | 'camera' | 'light';

/** Layers whose content is a footage file (and so may carry sound). */
export const isFootageType = (t: LayerType): t is 'image' | 'video' | 'audio' => t === 'image' || t === 'video' || t === 'audio';

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
      /** Draw the fill (default true). Turn it off for outline-only type. */
      fill?: boolean;
    }
  | { type: 'image'; assetId: string }
  | { type: 'video'; assetId: string }
  | { type: 'audio'; assetId: string }
  | { type: 'camera' }
  | { type: 'light' }
  | { type: 'precomp'; compId: string };

export interface Effect {
  id: string;
  type: string;
  enabled: boolean;
  props: Record<string, Prop>;
  /** The template that created this effect, so applying a new look can replace the old one. */
  source?: string;
  /** The library animation (an `AnimInstance` id on the layer) this effect belongs to. */
  inst?: string;
}

/**
 * A text animator: a range selector over characters, words or lines, plus the properties applied
 * to whatever the selector covers (position, scale, rotation, opacity, tracking, colour).
 */
export interface TextAnimator {
  id: string;
  name: string;
  source?: string;
  /** The library animation (an `AnimInstance` id on the layer) this animator belongs to. */
  inst?: string;
  props: Record<string, Prop>;
}

/** Where an applied library animation sits in a layer's life. */
export type AnimSlot = 'in' | 'out' | 'loop' | 'emph';
export const ANIM_SLOTS: { id: AnimSlot; label: string; hint: string }[] = [
  { id: 'in', label: 'In', hint: 'How the layer arrives' },
  { id: 'out', label: 'Out', hint: 'How the layer leaves' },
  { id: 'loop', label: 'Loop', hint: 'Keeps going while the layer is on screen' },
  { id: 'emph', label: 'Emphasis', hint: 'A one-off accent' },
];

/**
 * A library animation applied to a layer. Everything it made (keyframes, effects, text animators)
 * is tagged with `id`, so it can be retimed, rescaled, re-eased or removed as one unit.
 */
export interface AnimInstance {
  id: string;
  /** Library id of the template, for example `motion.slideInLeft`. */
  template: string;
  name: string;
  kind: 'motion' | 'textAnim' | 'effect';
  slot: AnimSlot;
  /** 1 = as designed. Scales how far the animation strays from the layer's resting values. */
  strength: number;
  /**
   * The layer's own position, scale, rotation and opacity at the moment the animation was applied,
   * before it: what the animation returns to, and what Strength scales around. (A layer that is
   * already keyframed has a resting value that differs from the property's stored value.)
   */
  rest?: Partial<Record<'position' | 'scale' | 'rotation' | 'opacity', PropValue>>;
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
  /** Audio and video layers: leave this layer's sound out of the mix. */
  muted?: boolean;
  /** Place the layer in 3D space: Z position, X/Y rotation, perspective from the camera, lighting. */
  threeD?: boolean;
  motionBlur: boolean;
  parentId: string | null;
  blend: BlendMode;
  /** Uses the layer directly above as its matte. */
  matte: MatteMode;
  transform: Record<TransformKey, Prop>;
  content: Record<string, Prop>;
  effects: Effect[];
  masks: Mask[];
  /** Only used by text layers. */
  animators: TextAnimator[];
  /** Library animations applied to this layer (their keyframes carry the instance id). */
  anims: AnimInstance[];
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

export type AssetKind = 'image' | 'video' | 'audio';

export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  /** Pixels; 0 for audio. */
  width: number;
  height: number;
  /** Video and audio: length in seconds. */
  duration?: number;
  /** Video: the file has a sound track. */
  hasAudio?: boolean;
  /** Video: nominal frame rate. */
  fps?: number;
}

export interface Project {
  name: string;
  comps: Record<string, Comp>;
  compOrder: string[];
  assets: Record<string, Asset>;
  assetOrder: string[];
  counters: Record<string, number>;
}

export type PropGroup = 'transform' | 'content' | `fx:${string}` | `mask:${string}` | `anim:${string}`;
export interface PropRef {
  layerId: string;
  group: PropGroup;
  key: string;
}

/** Light layers choose how they shine with their `lightType` property (an index into this list). */
export const LIGHT_TYPES = ['Parallel', 'Spot', 'Point', 'Ambient'] as const;
export type LightType = 'parallel' | 'spot' | 'point' | 'ambient';
export const LIGHT_KINDS: LightType[] = ['parallel', 'spot', 'point', 'ambient'];

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
