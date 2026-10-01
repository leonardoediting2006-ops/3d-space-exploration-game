import type { AnimSlot, Comp, Layer, Project } from '../core/types';

/** What a template sees when it is applied. `project` is the working draft, so templates can use counters. */
export interface TemplateCtx {
  project: Project;
  comp: Comp;
  /** The playhead: animation templates start here. */
  t: number;
  fps: number;
}

export type LayerTemplateKind = 'textStyle' | 'textAnim' | 'motion' | 'effect';

/** A look or animation applied to existing layers. */
export interface LayerTemplate {
  id: string;
  name: string;
  group: string;
  kind: LayerTemplateKind;
  accepts: (layer: Layer) => boolean;
  apply: (layer: Layer, ctx: TemplateCtx) => void;
  /** Time (seconds into the preview) of the still thumbnail. */
  previewTime?: number;
  /** Length of the looping hover preview. */
  previewDuration?: number;
  /** Backdrop for the thumbnail, for looks that would vanish on the default dark one. */
  previewBg?: [number, number, number];
  /** Show the look on an adjustment layer over the sample scene (for whole-frame grades) instead of on each layer. */
  previewOn?: 'adjustment';
}

/** A ready-made group of layers inserted into the composition. */
export interface SceneTemplate {
  id: string;
  name: string;
  group: string;
  build: (ctx: TemplateCtx) => Layer[];
  previewTime?: number;
  previewDuration?: number;
}

export type LibraryCategory = 'textStyle' | 'textAnim' | 'gradient' | 'easing' | 'motion' | 'effect' | 'scene';

export const CATEGORY_LABELS: Record<LibraryCategory, string> = {
  textStyle: 'Text Styles',
  textAnim: 'Text Animations',
  gradient: 'Gradients',
  easing: 'Easing',
  motion: 'Motion',
  effect: 'Looks',
  scene: 'Scenes',
};

const ANIMATED_LOOK_SLOT: Record<string, AnimSlot> = {
  'look.blurFocusIn': 'in',
  'look.scanDissolve': 'in',
  'look.blurDefocusOut': 'out',
  'look.flashWhite': 'emph',
  'look.pulseGlow': 'loop',
  'look.hueCycle': 'loop',
};

/**
 * Where a template's animation sits in a layer's life, or null for looks and styles that are not
 * animations. Applying an In or Out animation replaces the layer's previous one of the same kind.
 */
export function templateSlot(t: Pick<LayerTemplate, 'id' | 'kind' | 'group'>): AnimSlot | null {
  if (t.kind === 'effect') return ANIMATED_LOOK_SLOT[t.id] ?? null;
  if (t.kind === 'motion') return t.group === 'Enter' ? 'in' : t.group === 'Exit' ? 'out' : t.group === 'Emphasis' ? 'emph' : 'loop';
  if (t.kind === 'textAnim') return t.group === 'Reveal' || t.group === 'Entrance' ? 'in' : t.group === 'Exit' ? 'out' : 'loop';
  return null;
}
