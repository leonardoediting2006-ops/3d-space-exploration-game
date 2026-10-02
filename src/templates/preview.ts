import { createAdjustment, createComp, createProject, createShape, createSolid, createText } from '../core/factory';
import { setVal } from './helpers';
import { GRADIENT_BY_ID, presetGradient } from './gradients';
import { createEffect } from '../core/effectDefs';
import type { Comp, Layer, Project } from '../core/types';
import type { LibraryItem } from './index';
import type { TemplateCtx } from './types';

/** A tiny self-contained composition that shows what a template does. */
export interface PreviewSpec {
  project: Project;
  comp: Comp;
  /** Render scale that produces the thumbnail size. */
  scale: number;
  /** Time of the still thumbnail. */
  still: number;
  /** Length of the looping hover preview (0.1 or less means "static"). */
  length: number;
}

/**
 * Previews are authored at the size the template is tuned for and merely rendered small, so every
 * pixel-valued parameter looks as it will in use. Motion, looks and scenes are tuned to a 1080p frame;
 * text styles and animations are tuned to the default 96 px type, so they get a small frame to match.
 */
export const PREVIEW_W = 1920;
export const PREVIEW_H = 1080;
const TEXT_W = 640;
const TEXT_H = 360;
export const THUMB_W = 288;
export const THUMB_H = 162;

const cache = new Map<string, PreviewSpec | null>();

function freshComp(length: number, w = PREVIEW_W, h = PREVIEW_H): { project: Project; comp: Comp } {
  const project = createProject();
  const first = project.compOrder[0];
  const comp = createComp({ name: 'Preview', width: w, height: h, fps: 30, duration: length + 0.5, bg: [22, 23, 29] });
  comp.id = first;
  project.comps = { [first]: comp };
  return { project, comp };
}

function previewText(comp: Comp, text: string, size: number): Layer {
  const l = createText({ name: 'Preview', comp, time: 0, text, position: [comp.width / 2, comp.height / 2 + size * 0.3] });
  setVal(l.content.fontSize, size);
  return l;
}

function gradientSolid(ctx: TemplateCtx, id: string, angle = 120): Layer {
  const bg = createSolid({ comp: ctx.comp, time: 0, name: 'Backdrop', color: [255, 255, 255], width: PREVIEW_W, height: PREVIEW_H });
  const fx = createEffect('gradientFill', ctx.comp);
  if (fx) {
    fx.props.gradient.value = presetGradient(GRADIENT_BY_ID[id]);
    fx.props.angle.value = angle;
    bg.effects.push(fx);
  }
  return bg;
}

export function buildPreview(item: LibraryItem): PreviewSpec | null {
  if (cache.has(item.id)) return cache.get(item.id) ?? null;
  let spec: PreviewSpec | null = null;
  try {
    spec = make(item);
  } catch {
    spec = null;
  }
  cache.set(item.id, spec);
  return spec;
}

function make(item: LibraryItem): PreviewSpec | null {
  if (item.category === 'gradient' || item.category === 'easing') return null;

  if (item.category === 'scene') {
    const length = item.scene.previewDuration ?? 3;
    const { project, comp } = freshComp(length);
    const ctx: TemplateCtx = { project, comp, t: 0, fps: comp.fps };
    comp.layers = item.scene.build(ctx);
    return { project, comp, scale: THUMB_W / comp.width, still: item.scene.previewTime ?? 1.2, length };
  }

  const tpl = item.template;
  const length = tpl.previewDuration ?? 2.4;
  const isText = item.category === 'textStyle' || item.category === 'textAnim';
  const { project, comp } = isText ? freshComp(length, TEXT_W, TEXT_H) : freshComp(length);
  if (tpl.previewBg) comp.bg = [...tpl.previewBg];
  const ctx: TemplateCtx = { project, comp, t: 0, fps: comp.fps };

  if (item.category === 'textStyle' || item.category === 'textAnim') {
    // the default 96 px type, so strokes, shadows and offsets are judged at the size they were designed for
    const layer = previewText(comp, item.category === 'textStyle' ? 'Style' : 'Keyframe', 96);
    comp.layers = [layer];
    tpl.apply(layer, ctx);
  } else if (item.category === 'motion') {
    const layer = createShape({ name: 'Preview', comp, time: 0, shape: 'rect', size: [360, 360], position: [PREVIEW_W / 2, PREVIEW_H / 2], fill: [74, 144, 226] });
    setVal(layer.content.roundness, 80);
    comp.layers = [layer];
    tpl.apply(layer, ctx);
  } else {
    // a look: grade a small scene — the backdrop, a star and a title — so tints, glows and shadows all show
    const bg = gradientSolid(ctx, 'sunset');
    const star = createShape({ name: 'Star', comp, time: 0, shape: 'star', size: [420, 420], position: [PREVIEW_W * 0.3, PREVIEW_H / 2], fill: [255, 214, 102] });
    const txt = previewText(comp, 'Fx', 380);
    setVal(txt.transform.position, [PREVIEW_W * 0.68, PREVIEW_H / 2 + 130]);
    if (tpl.previewOn === 'adjustment') {
      const adj = createAdjustment({ comp, time: 0, name: 'Look' });
      comp.layers = [adj, txt, star, bg];
      tpl.apply(adj, ctx);
    } else {
      comp.layers = [txt, star, bg];
      for (const l of comp.layers) tpl.apply(l, ctx);
    }
  }
  return { project, comp, scale: THUMB_W / comp.width, still: tpl.previewTime ?? 1, length };
}
