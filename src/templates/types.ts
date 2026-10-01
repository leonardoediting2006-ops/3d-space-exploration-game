import type { Comp, Layer, Project } from '../core/types';

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
