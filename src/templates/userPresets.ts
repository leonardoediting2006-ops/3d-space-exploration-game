// Your own presets: an animation or look you tuned, saved so it can be applied again like any
// library template. A preset records what an applied animation created (keyframes relative to its
// start, effects, letter animators, loops, wiggles); applying it replays that onto any layer.
import { instanceSpan, restFor } from '../core/anims';
import { createEffect, getEffectDef } from '../core/effectDefs';
import { ANIMATOR_KEYS, createAnimator } from '../core/factory';
import { uid } from '../core/ids';
import { setKeyAt } from '../core/interp';
import { NAMED_EASES, TRANSFORM_KEYS, type AnimInstance, type AnimSlot, type Ease, type Effect, type Layer, type Prop, type PropValue, type TextAnimator, type TransformKey, type Wiggle } from '../core/types';
import { anyLayer, dropSource, isText, motionBase } from './helpers';
import type { LayerTemplate, TemplateCtx } from './types';
import { templateSource } from './types';
import type { LibraryItem } from './index';

export interface SavedKey {
  /** Seconds after the preset's start. */
  t: number;
  /** Position and rotation are stored as offsets from the layer's resting value, scale and opacity as ratios of it. */
  v: PropValue;
  ease: Ease;
  sIn?: [number, number];
  sOut?: [number, number];
}

export type SavedTarget =
  | { group: 'transform'; key: TransformKey }
  | { group: 'content'; key: string }
  | { group: 'fx'; index: number; key: string }
  | { group: 'anim'; index: number; key: string };

export interface SavedProp {
  target: SavedTarget;
  keys: SavedKey[];
  loop?: 'cycle' | 'pingpong';
  wiggle?: Omit<Wiggle, 'src'>;
}

export interface UserPreset {
  id: string;
  name: string;
  kind: AnimInstance['kind'];
  slot: AnimSlot | null;
  /** Seconds from the first to the last keyframe, for previews. */
  length: number;
  props: SavedProp[];
  /** Effects and letter animators as they were, with their keyframes moved into `props`. */
  effects: Effect[];
  animators: TextAnimator[];
  /** When it was saved or last renamed (ms since epoch); decides which copy wins when presets are synced. */
  updatedAt?: number;
}

const copy = <T extends PropValue>(v: T): T => (Array.isArray(v) ? ([...v] as T) : v);
const nz = (n: number, fallback: number) => (Math.abs(n) < 1e-9 ? fallback : n);

/* ------------------------------------------------------------------ capture */

function savedKeys(prop: Prop, own: (k: { src?: string }) => boolean, t0: number, key: SavedTarget, rest: PropValue | null): SavedKey[] {
  return prop.keys
    .filter(own)
    .map((k) => {
      let v = copy(k.v);
      if (key.group === 'transform' && rest) {
        const base = rest;
        if (key.key === 'position' && Array.isArray(v) && Array.isArray(base)) v = [v[0] - base[0], v[1] - base[1]];
        else if (key.key === 'rotation' && typeof v === 'number' && typeof base === 'number') v = v - base;
        else if (key.key === 'scale' && Array.isArray(v) && Array.isArray(base)) v = [v[0] / nz(base[0], 100), v[1] / nz(base[1], 100)];
        else if (key.key === 'opacity' && typeof v === 'number' && typeof base === 'number') v = v / nz(base, 100);
      }
      const out: SavedKey = { t: Math.max(0, k.t - t0), v, ease: typeof k.ease === 'string' ? k.ease : ([...k.ease] as Ease) };
      if (k.sIn) out.sIn = [...k.sIn];
      if (k.sOut) out.sOut = [...k.sOut];
      return out;
    });
}

/** Strip an effect / animator down to its static settings; its keyframes live in the preset's `props`. */
function stripped<T extends Effect | TextAnimator>(item: T): T {
  const clone = structuredClone(item);
  clone.id = '';
  delete clone.inst;
  delete (clone as Partial<Effect>).source;
  for (const p of Object.values(clone.props)) {
    p.keys = [];
    delete p.loop;
    delete p.wiggle;
  }
  return clone;
}

function collect(layer: Layer, effects: Effect[], animators: TextAnimator[], inst: AnimInstance | null, t0: number): SavedProp[] {
  const out: SavedProp[] = [];
  const push = (target: SavedTarget, prop: Prop, ownKey: (k: { src?: string }) => boolean, ownWiggle: boolean) => {
    const keys = savedKeys(prop, ownKey, t0, target, target.group === 'transform' ? (inst ? restFor(layer, inst, layer.transform[target.key]) : layer.transform[target.key].value) : null);
    const wiggle = ownWiggle && prop.wiggle ? { freq: prop.wiggle.freq, amp: prop.wiggle.amp, seed: prop.wiggle.seed } : undefined;
    if (!keys.length && !wiggle) return;
    const sp: SavedProp = { target, keys };
    if (keys.length > 1 && prop.loop) sp.loop = prop.loop;
    if (wiggle) sp.wiggle = wiggle;
    out.push(sp);
  };
  for (const k of TRANSFORM_KEYS) push({ group: 'transform', key: k }, layer.transform[k], (key) => !inst || key.src === inst.id, !inst || layer.transform[k].wiggle?.src === inst.id);
  for (const [k, p] of Object.entries(layer.content)) push({ group: 'content', key: k }, p, (key) => !!inst && key.src === inst.id, !!inst && p.wiggle?.src === inst.id);
  effects.forEach((e, index) => {
    for (const [k, p] of Object.entries(e.props)) push({ group: 'fx', index, key: k }, p, () => true, true);
  });
  animators.forEach((a, index) => {
    for (const [k, p] of Object.entries(a.props)) push({ group: 'anim', index, key: k }, p, () => true, true);
  });
  return out;
}

const spanOf = (props: SavedProp[]): number => {
  let max = 0;
  for (const p of props) for (const k of p.keys) max = Math.max(max, k.t);
  return max;
};

/** Save an applied animation (with whatever tuning you gave it) as a preset. */
export function captureAnimation(layer: Layer, inst: AnimInstance, name: string): UserPreset | null {
  const effects = layer.effects.filter((e) => e.inst === inst.id);
  const animators = layer.animators.filter((a) => a.inst === inst.id);
  const t0 = instanceSpan(layer, inst.id)?.start ?? 0;
  const props = collect(layer, effects, animators, inst, t0);
  if (!props.length && !effects.length && !animators.length) return null;
  return {
    id: `user.${uid('p').slice(2)}`,
    name: name.trim().slice(0, 60) || inst.name,
    kind: inst.kind,
    slot: inst.slot,
    length: spanOf(props),
    props,
    effects: effects.map(stripped),
    animators: animators.map(stripped),
  };
}

/** Save the layer's whole effect stack as a look. */
export function captureLook(layer: Layer, name: string): UserPreset | null {
  if (!layer.effects.length) return null;
  const firstKey = Math.min(Infinity, ...layer.effects.flatMap((e) => Object.values(e.props).flatMap((p) => p.keys.map((k) => k.t))));
  const t0 = Number.isFinite(firstKey) ? firstKey : 0;
  const props = collect(layer, layer.effects, [], null, t0).filter((p) => p.target.group === 'fx');
  return {
    id: `user.${uid('p').slice(2)}`,
    name: name.trim().slice(0, 60) || 'My look',
    kind: 'effect',
    slot: null,
    length: spanOf(props),
    props,
    effects: layer.effects.map(stripped),
    animators: [],
  };
}

/* ------------------------------------------------------------------ apply */

function compatible(prop: Prop, v: PropValue): boolean {
  switch (prop.kind) {
    case 'number':
      return typeof v === 'number';
    case 'vec2':
      return Array.isArray(v) && v.length === 2;
    case 'color':
      return Array.isArray(v) && v.length === 3;
    case 'gradient':
      return Array.isArray(v) && v.length % 4 === 0 && v.length >= 8 && v.length <= 256;
    default:
      return false;
  }
}

/** Replay a preset onto a layer at `c.t`, relative to the layer's own position, scale, rotation and opacity. */
export function applyPreset(preset: UserPreset, layer: Layer, c: TemplateCtx, source: string): void {
  const effects = preset.effects.map((e) => {
    const fx = createEffect(e.type, c.comp);
    if (!fx) return null;
    for (const [k, p] of Object.entries(e.props)) if (fx.props[k] && p.kind === fx.props[k].kind && compatible(fx.props[k], p.value)) fx.props[k].value = copy(p.value);
    fx.enabled = e.enabled !== false;
    fx.source = source;
    return fx;
  });
  const animators = preset.animators.map((a) => {
    const an = createAnimator(a.name);
    for (const [k, p] of Object.entries(a.props)) if (an.props[k] && p.kind === an.props[k].kind && compatible(an.props[k], p.value)) an.props[k].value = copy(p.value);
    an.source = source;
    return an;
  });
  for (const fx of effects) if (fx) layer.effects.push(fx);
  if (layer.type === 'text') layer.animators.push(...animators);

  const b = motionBase(layer, c);
  const tol = 0.25 / c.fps;
  for (const sp of preset.props) {
    const t = sp.target;
    let prop: Prop | undefined;
    if (t.group === 'transform') prop = layer.transform[t.key];
    else if (t.group === 'content') prop = layer.content[t.key];
    else if (t.group === 'fx') prop = effects[t.index]?.props[t.key];
    else prop = layer.type === 'text' ? animators[t.index]?.props[t.key] : undefined;
    if (!prop) continue;
    for (const k of sp.keys) {
      let v = copy(k.v);
      if (t.group === 'transform') {
        if (t.key === 'position' && Array.isArray(v)) v = [b.pos[0] + v[0], b.pos[1] + v[1]];
        else if (t.key === 'rotation' && typeof v === 'number') v = b.rot + v;
        else if (t.key === 'scale' && Array.isArray(v)) v = [b.scale[0] * v[0], b.scale[1] * v[1]];
        else if (t.key === 'opacity' && typeof v === 'number') v = b.op * v;
      }
      if (!compatible(prop, v)) continue;
      const key = setKeyAt(prop, c.t + k.t, v, tol, k.ease);
      key.ease = typeof k.ease === 'string' ? k.ease : ([...k.ease] as Ease);
      if (k.sIn) key.sIn = [...k.sIn];
      else delete key.sIn;
      if (k.sOut) key.sOut = [...k.sOut];
      else delete key.sOut;
    }
    if (sp.loop) prop.loop = sp.loop;
    if (sp.wiggle) prop.wiggle = { ...sp.wiggle };
  }
}

/** A preset as a library template: it plugs into the Library, drag-and-drop, pickers and the palette. */
export function presetTemplate(p: UserPreset): LayerTemplate {
  const source = templateSource(p.id);
  const needsText = p.animators.length > 0;
  return {
    id: p.id,
    name: p.name,
    group: 'My presets',
    kind: p.kind,
    slot: p.slot ?? undefined,
    accepts: needsText ? isText : anyLayer,
    previewTime: Math.max(0.1, p.length * 0.45),
    previewDuration: p.length + 1,
    apply(layer, c) {
      dropSource(layer, source);
      applyPreset(p, layer, c, source);
    },
  };
}

export function presetItem(p: UserPreset): Extract<LibraryItem, { template: unknown }> {
  return { category: p.kind, id: p.id, name: p.name, group: 'My presets', template: presetTemplate(p) };
}

/* ------------------------------------------------------------------ loading untrusted data */

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const numList = (v: unknown, n?: number, max = 8): v is number[] => Array.isArray(v) && v.length <= max && (n === undefined || v.length === n) && v.every(isNum);
const validEase = (e: unknown): e is Ease =>
  e === 'linear' || e === 'hold' || (typeof e === 'string' && (NAMED_EASES as readonly string[]).includes(e)) || (Array.isArray(e) && e.length === 4 && e.every(isNum));
const KINDS = ['motion', 'textAnim', 'effect'];
const SLOTS = ['in', 'out', 'loop', 'emph'];

function sanitizeTarget(raw: unknown): SavedTarget | null {
  if (!isObj(raw) || typeof raw.key !== 'string') return null;
  if (raw.group === 'transform') return (TRANSFORM_KEYS as string[]).includes(raw.key) ? { group: 'transform', key: raw.key as TransformKey } : null;
  if (raw.group === 'content') return { group: 'content', key: raw.key };
  if ((raw.group === 'fx' || raw.group === 'anim') && isNum(raw.index) && raw.index >= 0 && raw.index < 40) return { group: raw.group, index: Math.floor(raw.index), key: raw.key };
  return null;
}

function sanitizeProps(raw: unknown): SavedProp[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedProp[] = [];
  for (const r of raw.slice(0, 300)) {
    if (!isObj(r)) continue;
    const target = sanitizeTarget(r.target);
    if (!target || !Array.isArray(r.keys)) continue;
    const keys: SavedKey[] = [];
    for (const k of r.keys.slice(0, 400)) {
      if (!isObj(k) || !isNum(k.t) || k.t < 0 || k.t > 3600 || !validEase(k.ease)) continue;
      if (!(isNum(k.v) || numList(k.v))) continue;
      const key: SavedKey = { t: k.t, v: copy(k.v as PropValue), ease: k.ease };
      if (numList(k.sIn, 2)) key.sIn = [k.sIn[0], k.sIn[1]];
      if (numList(k.sOut, 2)) key.sOut = [k.sOut[0], k.sOut[1]];
      keys.push(key);
    }
    const sp: SavedProp = { target, keys };
    if (r.loop === 'cycle' || r.loop === 'pingpong') sp.loop = r.loop;
    if (isObj(r.wiggle) && isNum(r.wiggle.freq) && isNum(r.wiggle.amp) && isNum(r.wiggle.seed)) sp.wiggle = { freq: r.wiggle.freq, amp: r.wiggle.amp, seed: r.wiggle.seed };
    if (keys.length || sp.wiggle) out.push(sp);
  }
  return out;
}

/** Rebuild a stored preset from untrusted JSON, dropping anything malformed. Returns null if nothing usable is left. */
export function sanitizePreset(raw: unknown): UserPreset | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || !raw.id.startsWith('user.') || raw.id.length > 60 || typeof raw.name !== 'string') return null;
  if (!KINDS.includes(String(raw.kind))) return null;
  const slot = raw.slot === null || raw.slot === undefined ? null : SLOTS.includes(String(raw.slot)) ? (raw.slot as AnimSlot) : null;
  const effects: Effect[] = [];
  for (const e of (Array.isArray(raw.effects) ? raw.effects : []).slice(0, 20)) {
    if (!isObj(e) || typeof e.type !== 'string' || !getEffectDef(e.type)) continue;
    const fx = createEffect(e.type, { width: 1920, height: 1080 })!;
    if (isObj(e.props)) {
      for (const [k, p] of Object.entries(e.props)) {
        const mine = fx.props[k];
        if (mine && isObj(p) && p.kind === mine.kind && (isNum(p.value) || numList(p.value, undefined, 256)) && compatible(mine, p.value as PropValue)) mine.value = copy(p.value as PropValue);
      }
    }
    fx.enabled = e.enabled !== false;
    effects.push(fx);
  }
  const animators: TextAnimator[] = [];
  for (const a of (Array.isArray(raw.animators) ? raw.animators : []).slice(0, 20)) {
    if (!isObj(a)) continue;
    const an = createAnimator(typeof a.name === 'string' ? a.name.slice(0, 60) : 'Animator');
    if (isObj(a.props)) {
      for (const k of ANIMATOR_KEYS) {
        const p = (a.props as Record<string, unknown>)[k];
        const mine = an.props[k];
        if (isObj(p) && p.kind === mine.kind && (isNum(p.value) || numList(p.value)) && compatible(mine, p.value as PropValue)) mine.value = copy(p.value as PropValue);
      }
    }
    animators.push(an);
  }
  const props = sanitizeProps(raw.props);
  if (!props.length && !effects.length && !animators.length) return null;
  return {
    id: raw.id,
    name: raw.name.slice(0, 60) || 'Preset',
    kind: raw.kind as UserPreset['kind'],
    slot,
    length: isNum(raw.length) ? Math.min(120, Math.max(0, raw.length)) : spanOf(props),
    props,
    effects,
    animators,
    ...(isNum(raw.updatedAt) && raw.updatedAt > 0 && raw.updatedAt < 4e12 ? { updatedAt: Math.floor(raw.updatedAt) } : {}),
  };
}
