// Library animations as editable units. Applying a template tags everything it creates with an
// instance id; these functions then retime, rescale, re-ease or remove that whole unit. All of
// them are pure edits of a layer, so they run inside `commit` and unit tests alike.
import { uid } from './ids';
import { sortKeys } from './interp';
import { layerProps } from './props';
import type { AnimInstance, AnimSlot, Ease, Keyframe, Layer, Prop, PropValue } from './types';

export const MIN_STRENGTH = 0.1;
export const MAX_STRENGTH = 3;

/** Text animator range-selector properties: they define *where* an animation is, never how strong. */
const SELECTOR_KEYS = new Set(['start', 'end', 'offset', 'smooth', 'units', 'shape', 'ease', 'random', 'seed']);
/** What each text animator style property looks like when it does nothing. */
const ANIMATOR_NEUTRAL: Record<string, PropValue> = {
  position: [0, 0],
  scale: [100, 100],
  rotation: 0,
  opacity: 100,
  tracking: 0,
  colorMix: 0,
};

export interface TaggedKey {
  prop: Prop;
  key: Keyframe;
}

/** Every keyframe an instance created, across all of the layer's properties. */
export function instanceKeys(layer: Layer, instId: string): TaggedKey[] {
  const out: TaggedKey[] = [];
  for (const prop of layerProps(layer)) for (const key of prop.keys) if (key.src === instId) out.push({ prop, key });
  return out;
}

export interface Span {
  start: number;
  end: number;
}

/** First and last keyframe time of an instance, or null if it has no keyframes (a static look). */
export function instanceSpan(layer: Layer, instId: string): Span | null {
  const keys = instanceKeys(layer, instId);
  if (!keys.length) return null;
  let start = Infinity;
  let end = -Infinity;
  for (const { key } of keys) {
    start = Math.min(start, key.t);
    end = Math.max(end, key.t);
  }
  return { start, end };
}

/** Properties an instance made wiggle. */
export function instanceWiggles(layer: Layer, instId: string): Prop[] {
  return layerProps(layer).filter((p) => p.wiggle?.src === instId);
}

/** True while the instance still owns anything: a keyframe, a wiggle, an effect or a text animator. */
export function instanceAlive(layer: Layer, instId: string): boolean {
  return (
    layer.effects.some((e) => e.inst === instId) ||
    layer.animators.some((a) => a.inst === instId) ||
    instanceKeys(layer, instId).length > 0 ||
    instanceWiggles(layer, instId).length > 0
  );
}

/** Drop instances whose keyframes, effects and animators have all been removed by other edits. */
export function pruneInstances(layer: Layer): void {
  layer.anims = (layer.anims ?? []).filter((a) => instanceAlive(layer, a.id));
}

/** What existed before a template ran, so `adoptNew` can tell what the template added. */
export interface Snapshot {
  /** Every keyframe that existed, by id, with a fingerprint of what it held. */
  keys: Map<string, string>;
  fx: Set<string>;
  animators: Set<string>;
  /** Properties that already wiggled, and how (a template may replace the wiggle on one). */
  wiggles: Map<Prop, string>;
}

const keyPrint = (k: Keyframe): string => JSON.stringify([k.t, k.v, k.ease, k.sIn, k.sOut]);

export function snapshot(layer: Layer): Snapshot {
  const keys = new Map<string, string>();
  const wiggles = new Map<Prop, string>();
  for (const prop of layerProps(layer)) {
    for (const k of prop.keys) keys.set(k.id, keyPrint(k));
    if (prop.wiggle) wiggles.set(prop, JSON.stringify(prop.wiggle));
  }
  return { keys, fx: new Set(layer.effects.map((e) => e.id)), animators: new Set(layer.animators.map((a) => a.id)), wiggles };
}

/**
 * Tag everything that appeared since `before` with `instId`: new keyframes, effects and animators,
 * and any existing keyframe the template rewrote (two keyframes cannot share a moment, so a
 * template starting on top of an existing key takes it over). Returns how many things were tagged.
 */
export function adoptNew(layer: Layer, before: Snapshot, instId: string): number {
  let n = 0;
  for (const prop of layerProps(layer)) {
    for (const k of prop.keys) {
      if (before.keys.get(k.id) !== keyPrint(k)) {
        k.src = instId;
        n++;
      }
    }
    if (prop.wiggle && before.wiggles.get(prop) !== JSON.stringify(prop.wiggle)) {
      prop.wiggle.src = instId;
      n++;
    }
  }
  for (const e of layer.effects) {
    if (!before.fx.has(e.id)) {
      e.inst = instId;
      n++;
    }
  }
  for (const a of layer.animators) {
    if (!before.animators.has(a.id)) {
      a.inst = instId;
      n++;
    }
  }
  return n;
}

export function makeInstance(template: string, name: string, kind: AnimInstance['kind'], slot: AnimSlot): AnimInstance {
  return { id: uid('inst'), template, name, kind, slot, strength: 1 };
}

/** Remove an instance and everything it created. */
export function removeInstance(layer: Layer, instId: string): void {
  for (const prop of layerProps(layer)) {
    if (!prop.keys.some((k) => k.src === instId)) continue;
    prop.keys = prop.keys.filter((k) => k.src !== instId);
    if (prop.keys.length < 2) delete prop.loop;
  }
  for (const prop of instanceWiggles(layer, instId)) delete prop.wiggle;
  layer.effects = layer.effects.filter((e) => e.inst !== instId);
  layer.animators = layer.animators.filter((a) => a.inst !== instId);
  layer.anims = (layer.anims ?? []).filter((a) => a.id !== instId);
}

/** Slide the whole animation in time. */
export function shiftInstance(layer: Layer, instId: string, dt: number): void {
  if (!dt) return;
  const props = new Set<Prop>();
  for (const { prop, key } of instanceKeys(layer, instId)) {
    key.t += dt;
    props.add(prop);
  }
  for (const p of props) sortKeys(p);
}

/** Move the animation so it starts at `start` seconds. */
export function setInstanceStart(layer: Layer, instId: string, start: number): void {
  const span = instanceSpan(layer, instId);
  if (span) shiftInstance(layer, instId, start - span.start);
}

/** Stretch or squeeze the animation around its start so it lasts `length` seconds. */
export function setInstanceLength(layer: Layer, instId: string, length: number): void {
  const span = instanceSpan(layer, instId);
  if (!span || span.end - span.start < 1e-9) return;
  const f = Math.max(1e-3, length) / (span.end - span.start);
  const props = new Set<Prop>();
  for (const { prop, key } of instanceKeys(layer, instId)) {
    key.t = span.start + (key.t - span.start) * f;
    props.add(prop);
  }
  for (const p of props) sortKeys(p);
}

/** The keyframes whose outgoing segment belongs to the animation: every tagged key but the last of each property. */
function segmentKeys(layer: Layer, instId: string): Keyframe[] {
  const byProp = new Map<Prop, Keyframe[]>();
  for (const { prop, key } of instanceKeys(layer, instId)) byProp.set(prop, [...(byProp.get(prop) ?? []), key]);
  const out: Keyframe[] = [];
  for (const keys of byProp.values()) out.push(...keys.sort((a, b) => a.t - b.t).slice(0, -1));
  return out;
}

/** Give every segment of the animation the same easing. */
export function setInstanceEase(layer: Layer, instId: string, ease: Ease): void {
  for (const k of segmentKeys(layer, instId)) k.ease = typeof ease === 'string' ? ease : [...ease];
}

/** The ease most of the animation's segments use, for display. Null when it has no segments. */
export function instanceEase(layer: Layer, instId: string): Ease | null {
  const counts = new Map<string, { ease: Ease; n: number }>();
  for (const key of segmentKeys(layer, instId)) {
    const id = JSON.stringify(key.ease);
    const c = counts.get(id);
    if (c) c.n++;
    else counts.set(id, { ease: key.ease, n: 1 });
  }
  let best: { ease: Ease; n: number } | null = null;
  for (const c of counts.values()) if (!best || c.n > best.n) best = c;
  return best?.ease ?? null;
}

function scaleAround(v: PropValue, pivot: PropValue, f: number): PropValue {
  if (Array.isArray(v)) {
    const p = Array.isArray(pivot) ? pivot : [pivot, pivot];
    return v.map((x, i) => p[i] + (x - p[i]) * f);
  }
  const p = Array.isArray(pivot) ? pivot[0] : pivot;
  return p + (v - p) * f;
}

const clampTo = (prop: Prop, v: PropValue): PropValue => {
  if (typeof v !== 'number') return v;
  return Math.min(prop.max ?? Infinity, Math.max(prop.min ?? -Infinity, v));
};

/**
 * Make the animation bolder or subtler: every value moves `strength` times as far from the
 * property's resting value. Keyframed numbers and positions are scaled around the static value
 * the layer would have without the animation; text animator styles around their neutral value.
 */
export function setInstanceStrength(layer: Layer, instId: string, strength: number): void {
  const inst = layer.anims.find((a) => a.id === instId);
  if (!inst) return;
  const next = Math.min(MAX_STRENGTH, Math.max(MIN_STRENGTH, strength));
  const f = next / inst.strength;
  if (Math.abs(f - 1) < 1e-12) return;

  // text animator range props are positions along the text, not amounts
  const selectors = new Set<Prop>();
  for (const a of layer.animators) for (const [k, p] of Object.entries(a.props)) if (SELECTOR_KEYS.has(k)) selectors.add(p);

  for (const { prop, key } of instanceKeys(layer, instId)) {
    if (prop.kind !== 'number' && prop.kind !== 'vec2') continue;
    if (selectors.has(prop)) continue;
    key.v = clampTo(prop, scaleAround(key.v, prop.value, f));
    if (key.sIn) key.sIn = [key.sIn[0] * f, key.sIn[1] * f];
    if (key.sOut) key.sOut = [key.sOut[0] * f, key.sOut[1] * f];
  }
  for (const prop of instanceWiggles(layer, instId)) prop.wiggle!.amp *= f;
  for (const a of layer.animators) {
    if (a.inst !== instId) continue;
    for (const [k, neutral] of Object.entries(ANIMATOR_NEUTRAL)) {
      const p = a.props[k];
      if (!p || p.keys.length) continue;
      p.value = clampTo(p, scaleAround(p.value, neutral, f));
    }
  }
  inst.strength = next;
}

/** Shift an animation so it ends exactly at `end` (for example the layer's out point). */
export function alignInstanceEnd(layer: Layer, instId: string, end: number): void {
  const span = instanceSpan(layer, instId);
  if (span) shiftInstance(layer, instId, end - span.end);
}

/** How fast a wiggle-based animation shakes (wiggles per second), or null if it has none. */
export function instanceSpeed(layer: Layer, instId: string): number | null {
  const w = instanceWiggles(layer, instId);
  return w.length ? w[0].wiggle!.freq : null;
}

export function setInstanceSpeed(layer: Layer, instId: string, freq: number): void {
  const w = instanceWiggles(layer, instId);
  const f = w.length ? freq / w[0].wiggle!.freq : 1;
  for (const p of w) p.wiggle!.freq *= f;
}

/** Set a static text-animator setting (units, random order…) on every animator an instance owns. */
export function setInstanceAnimatorSetting(layer: Layer, instId: string, key: 'units' | 'random' | 'seed' | 'smooth', value: number): void {
  for (const a of layer.animators) {
    const p = a.inst === instId ? a.props[key] : undefined;
    if (p && !p.keys.length) p.value = value;
  }
}

/** Read one such setting from the instance's first animator, or null if it owns none. */
export function instanceAnimatorSetting(layer: Layer, instId: string, key: 'units' | 'random' | 'seed' | 'smooth'): number | null {
  const a = layer.animators.find((x) => x.inst === instId);
  const p = a?.props[key];
  return p && !p.keys.length ? (p.value as number) : null;
}

/** Set the first and last moment of an animation in one step (dragging a clip's edge on the timeline). */
export function setInstanceSpan(layer: Layer, instId: string, start: number, end: number): void {
  const span = instanceSpan(layer, instId);
  if (!span) return;
  const len = Math.max(1e-3, end - start);
  if (span.end - span.start > 1e-9) setInstanceLength(layer, instId, len);
  setInstanceStart(layer, instId, start);
}
