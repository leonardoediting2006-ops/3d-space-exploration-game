import { adoptNew, alignInstanceEnd, makeInstance, pruneInstances, removeInstance, setInstanceStart, snapshot } from '../core/anims';
import { createSolid, nextCount } from '../core/factory';
import { setAnimated } from '../core/interp';
import { createEffect } from '../core/effectDefs';
import type { Layer } from '../core/types';
import { findLibraryItem, type LibraryItem } from '../templates';
import { presetGradient } from '../templates/gradients';
import { templateSlot, type LayerTemplate, type TemplateCtx } from '../templates/types';
import { addText, applyEasePreset } from './actions';
import { activeComp, appStore, commit, timeStore, toast } from './store';

const S = () => appStore.get();

function runTemplate(label: string, edit: (ctx: TemplateCtx) => void, at?: number): boolean {
  const s = S();
  const comp = activeComp(s);
  const t = at ?? timeStore.get().t;
  try {
    commit((draft) => edit({ project: draft, comp: draft.comps[comp.id], t, fps: comp.fps }));
    return true;
  } catch (e) {
    toast(`Could not apply “${label}”: ${e instanceof Error ? e.message : 'unknown error'}`);
    return false;
  }
}

/**
 * Apply one template to one layer. Animations are remembered as instances on the layer, so they
 * can be retimed, rescaled and removed later; an In or Out animation replaces the previous one.
 */
export function applyTemplateToLayer(layer: Layer, tpl: LayerTemplate, ctx: TemplateCtx): void {
  const slot = templateSlot(tpl);
  if (!slot) {
    tpl.apply(layer, ctx);
    pruneInstances(layer); // a new look may have replaced an animated one
    return;
  }
  for (const a of [...layer.anims]) {
    const sameSlot = (slot === 'in' || slot === 'out') && a.kind === tpl.kind && a.slot === slot;
    if (a.template === tpl.id || sameSlot) removeInstance(layer, a.id);
  }
  const before = snapshot(layer);
  tpl.apply(layer, ctx);
  const inst = makeInstance(tpl.id, tpl.name, tpl.kind as 'motion' | 'textAnim' | 'effect', slot);
  if (adoptNew(layer, before, inst.id) > 0) layer.anims.push(inst);
  pruneInstances(layer);
}

/** Where a new animation should land: at the playhead, at the layer's start, or ending as the layer ends. */
export type Placement = 'playhead' | 'start' | 'end';

/** Text styles, text animations, motion and looks: apply to the selected layers that can take them. */
export function applyLayerTemplate(item: Extract<LibraryItem, { template: unknown }>, opts: { place?: Placement; layerIds?: string[] } = {}): void {
  const tpl = item.template;
  const place = opts.place ?? 'playhead';
  const pool = opts.layerIds ?? S().selection;
  let ids = pool.filter((id) => {
    const l = activeComp().layers.find((x) => x.id === id);
    return l && tpl.accepts(l);
  });
  // text looks with nothing selected: make a text layer to apply them to
  if (!ids.length && (tpl.kind === 'textStyle' || tpl.kind === 'textAnim')) {
    if (pool.length) return void toast('Select a text layer to use this.');
    const c = activeComp();
    ids = [addText('Your Text', [c.width / 2, c.height / 2 + 30])];
  }
  if (!ids.length) return void toast(tpl.kind === 'textStyle' || tpl.kind === 'textAnim' ? 'Select a text layer first.' : 'Select a layer first.');
  const idSet = new Set(ids);
  const ok = runTemplate(tpl.name, (ctx) => {
    for (const l of ctx.comp.layers) {
      if (!idSet.has(l.id)) continue;
      // a start/end placement needs per-layer times, so shift the context for each layer
      const t = place === 'start' ? l.inPoint : place === 'end' ? Math.max(l.inPoint, l.outPoint - 1) : ctx.t;
      applyTemplateToLayer(l, tpl, { ...ctx, t });
      const inst = l.anims[l.anims.length - 1];
      if (inst?.template === tpl.id) {
        if (place === 'start') setInstanceStart(l, inst.id, l.inPoint);
        if (place === 'end') alignInstanceEnd(l, inst.id, Math.min(l.outPoint, ctx.comp.duration));
      }
    }
  });
  if (ok) toast(`Applied “${tpl.name}”`);
}

export function insertScene(item: Extract<LibraryItem, { scene: unknown }>): void {
  const scene = item.scene;
  let created: string[] = [];
  const ok = runTemplate(scene.name, (ctx) => {
    const layers = scene.build(ctx);
    ctx.comp.layers.unshift(...layers);
    created = layers.map((l) => l.id);
  });
  if (ok) {
    appStore.set({ selection: created, selKeys: [] });
    toast(`Inserted “${scene.name}”`);
  }
}

/** Add (or replace) a Gradient Fill on a layer, leaving its other effects alone. */
function setGradientFill(layer: Layer, ctx: TemplateCtx, value: number[]): void {
  const existing = layer.effects.find((e) => e.type === 'gradientFill');
  if (existing) {
    setAnimated(existing.props.gradient, false, ctx.t);
    existing.props.gradient.value = [...value];
    return;
  }
  const fx = createEffect('gradientFill', ctx.comp);
  if (!fx) return;
  fx.props.gradient.value = [...value];
  layer.effects.unshift(fx);
}

/** Fill the selected layers (text, shapes, solids…) with a gradient. */
export function applyGradient(item: Extract<LibraryItem, { gradient: unknown }>, mode: 'fill' | 'background' = 'fill'): void {
  const value = presetGradient(item.gradient);
  const targets = mode === 'background' ? [] : S().selection.filter((id) => activeComp().layers.find((l) => l.id === id)?.type !== 'null');
  if (!targets.length) {
    // no layer to fill: make a full-frame gradient background
    let created = '';
    const ok = runTemplate(item.name, (ctx) => {
      const bg = createSolid({ comp: ctx.comp, time: 0, name: `${item.name} Background`, color: [255, 255, 255], width: ctx.comp.width, height: ctx.comp.height });
      bg.outPoint = Math.max(bg.outPoint, ctx.comp.duration);
      bg.label = 5;
      setGradientFill(bg, ctx, value);
      const fx = bg.effects[0];
      fx.props.angle.value = 120;
      ctx.comp.layers.push(bg);
      created = bg.id;
      nextCount(ctx.project, 'solid');
    });
    if (ok) {
      appStore.set({ selection: [created], selKeys: [] });
      toast(`Added “${item.name}” background`);
    }
    return;
  }
  const set = new Set(targets);
  if (runTemplate(item.name, (ctx) => {
    for (const l of ctx.comp.layers) if (set.has(l.id)) setGradientFill(l, ctx, value);
  })) toast(`Applied “${item.name}” gradient`);
}

export function applyLibraryItem(item: LibraryItem): void {
  switch (item.category) {
    case 'gradient':
      return applyGradient(item);
    case 'easing':
      return void applyEasePreset(item.easing.ease);
    case 'scene':
      return insertScene(item);
    default:
      return applyLayerTemplate(item);
  }
}

export const applyLibraryItemById = (id: string): void => {
  const item = findLibraryItem(id);
  if (item) applyLibraryItem(item);
};

