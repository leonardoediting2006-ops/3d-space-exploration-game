// Helpers for editing several selected layers at once in the Inspector: which values disagree,
// how one edit is applied to each layer, and which effects and animations the layers share.
import type { AnimInstance, Effect, Layer, Prop, PropGroup, PropValue } from '../core/types';
import { clamp } from '../core/math';
import type { Edit } from './PropEditor';

/** One layer's copy of a property. */
export interface Member {
  layer: Layer;
  group: PropGroup;
  prop: Prop;
}

const parts = (v: PropValue): number[] => (Array.isArray(v) ? v : [v]);

/** For each component of the value: do the layers disagree about it? */
export function mixedParts(values: PropValue[]): boolean[] {
  const first = parts(values[0]);
  const out = first.map(() => false);
  for (const v of values) {
    const p = parts(v);
    for (let i = 0; i < first.length; i++) if (Math.abs(first[i] - p[i]) > 1e-6) out[i] = true;
  }
  return out;
}

/**
 * Work out one layer's new value from an edit made in the field that shows the first layer's value.
 * 'set' gives every layer the typed value; 'delta' moves each layer by the amount the field moved.
 * Only the component that was edited changes (so typing X leaves every layer's Y alone).
 */
export function applyEdit(own: PropValue, shown: PropValue, next: PropValue, edit?: Edit, limits: { min?: number; max?: number } = {}): PropValue {
  const how = edit?.how ?? 'set';
  const lo = limits.min ?? -Infinity;
  const hi = limits.max ?? Infinity;
  if (!Array.isArray(next)) {
    const base = parts(own)[0];
    return clamp(how === 'delta' ? base + (next - parts(shown)[0]) : next, lo, hi);
  }
  const mine = parts(own);
  const was = parts(shown);
  const out = [...mine];
  const which = edit && edit.comp !== 'both' ? [edit.comp] : next.map((_, i) => i);
  for (const c of which) out[c] = clamp(how === 'delta' ? mine[c] + (next[c] - was[c]) : next[c], lo, hi);
  return out;
}

/** The value every layer agrees on, or the first layer's value and `mixed` when they differ. */
export function commonOf<T>(layers: Layer[], get: (l: Layer) => T): { value: T; mixed: boolean } {
  const value = get(layers[0]);
  return { value, mixed: layers.some((l) => get(l) !== value) };
}

/** The effect on `layer` that corresponds to `fx` on the first layer: same type, same position among effects of that type. */
export function matchingEffect(first: Layer, fx: Effect, layer: Layer): Effect | undefined {
  if (layer === first) return fx;
  const nth = first.effects.filter((e) => e.type === fx.type).indexOf(fx);
  return layer.effects.filter((e) => e.type === fx.type)[nth];
}

export interface SharedEffect {
  /** One entry per layer, the first layer first. */
  items: { layer: Layer; fx: Effect }[];
}

/** Effects the first layer has that every other layer has too, in the first layer's order. */
export function sharedEffects(layers: Layer[]): SharedEffect[] {
  const out: SharedEffect[] = [];
  for (const fx of layers[0].effects) {
    const items: SharedEffect['items'] = [];
    for (const layer of layers) {
      const match = matchingEffect(layers[0], fx, layer);
      if (!match) break;
      items.push({ layer, fx: match });
    }
    if (items.length === layers.length) out.push({ items });
  }
  return out;
}

/** The animation on `layer` that corresponds to `inst` on the first layer: same template and slot, same position among those. */
export function matchingInstance(first: Layer, inst: AnimInstance, layer: Layer): AnimInstance | undefined {
  if (layer === first) return inst;
  const same = (a: AnimInstance) => a.template === inst.template && a.slot === inst.slot;
  const nth = first.anims.filter(same).indexOf(inst);
  return layer.anims.filter(same)[nth];
}

export interface SharedInstance {
  items: { layer: Layer; inst: AnimInstance }[];
}

/** Animations the first layer has that every other layer has too (same library template and slot). */
export function sharedInstances(layers: Layer[]): SharedInstance[] {
  const out: SharedInstance[] = [];
  for (const inst of layers[0].anims) {
    const items: SharedInstance['items'] = [];
    for (const layer of layers) {
      const match = matchingInstance(layers[0], inst, layer);
      if (!match) break;
      items.push({ layer, inst: match });
    }
    if (items.length === layers.length) out.push({ items });
  }
  return out;
}

/** Property keys that every layer has with the same kind, in the first layer's order. */
export function commonContentKeys(layers: Layer[]): string[] {
  return Object.keys(layers[0].content).filter((k) => layers.every((l) => l.content[k]?.kind === layers[0].content[k].kind && !!l.content[k].options === !!layers[0].content[k].options));
}
