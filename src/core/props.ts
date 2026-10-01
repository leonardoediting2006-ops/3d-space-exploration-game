import { uid } from './ids';
import { EASY_EASE, evalVec, setKeyAt } from './interp';
import { TRANSFORM_KEYS, type Layer, type Prop, type PropGroup } from './types';

/** Every property on a layer: transform, content, then each effect's parameters. */
export function layerProps(layer: Layer): Prop[] {
  const out: Prop[] = TRANSFORM_KEYS.map((k) => layer.transform[k]);
  out.push(...Object.values(layer.content));
  for (const fx of layer.effects) out.push(...Object.values(fx.props));
  return out;
}

export interface PropEntry {
  group: PropGroup;
  key: string;
  prop: Prop;
}

/** Every property on a layer with its address. */
export function layerPropEntries(layer: Layer): PropEntry[] {
  const out: PropEntry[] = TRANSFORM_KEYS.map((k) => ({ group: 'transform' as PropGroup, key: k, prop: layer.transform[k] }));
  for (const [k, p] of Object.entries(layer.content)) out.push({ group: 'content', key: k, prop: p });
  for (const fx of layer.effects) for (const [k, p] of Object.entries(fx.props)) out.push({ group: `fx:${fx.id}`, key: k, prop: p });
  return out;
}

export function resolveProp(layer: Layer, group: PropGroup, key: string): Prop | undefined {
  if (group === 'transform') return layer.transform[key as keyof Layer['transform']];
  if (group === 'content') return layer.content[key];
  const fx = layer.effects.find((e) => `fx:${e.id}` === group);
  return fx?.props[key];
}

/** Move a layer in time: its in/out/start and every keyframe travel together. */
export function shiftLayer(layer: Layer, dt: number): void {
  layer.start += dt;
  layer.inPoint += dt;
  layer.outPoint += dt;
  for (const p of layerProps(layer)) for (const k of p.keys) k.t += dt;
}

export function layerHasKeys(layer: Layer): boolean {
  return layerProps(layer).some((p) => p.keys.length > 0);
}

/** Clone a layer with fresh ids for the layer, keyframes and effects. */
export function cloneLayer(layer: Layer): Layer {
  const copy = structuredClone(layer);
  copy.id = uid('layer');
  for (const p of layerProps(copy)) for (const k of p.keys) k.id = uid('k');
  for (const fx of copy.effects) fx.id = uid('fx');
  return copy;
}

export interface Preset {
  id: string;
  name: string;
  apply(layer: Layer, t: number, fps: number): void;
}

const tol = (fps: number) => 0.25 / fps;

export const PRESETS: Preset[] = [
  {
    id: 'fadeIn',
    name: 'Fade In',
    apply(l, t, fps) {
      setKeyAt(l.transform.opacity, t, 0, tol(fps), EASY_EASE);
      setKeyAt(l.transform.opacity, t + 0.5, 100, tol(fps));
    },
  },
  {
    id: 'fadeOut',
    name: 'Fade Out',
    apply(l, t, fps) {
      setKeyAt(l.transform.opacity, t, 100, tol(fps), EASY_EASE);
      setKeyAt(l.transform.opacity, t + 0.5, 0, tol(fps));
    },
  },
  {
    id: 'slideIn',
    name: 'Slide In From Left',
    apply(l, t, fps) {
      const [x, y] = evalVec(l.transform.position, t);
      setKeyAt(l.transform.position, t, [x - 700, y], tol(fps), EASY_EASE);
      setKeyAt(l.transform.position, t + 0.7, [x, y], tol(fps));
    },
  },
  {
    id: 'popIn',
    name: 'Pop In',
    apply(l, t, fps) {
      const [sx, sy] = evalVec(l.transform.scale, t);
      setKeyAt(l.transform.scale, t, [0, 0], tol(fps), EASY_EASE);
      setKeyAt(l.transform.scale, t + 0.35, [sx * 1.15, sy * 1.15], tol(fps), EASY_EASE);
      setKeyAt(l.transform.scale, t + 0.55, [sx, sy], tol(fps));
    },
  },
  {
    id: 'spin',
    name: 'Spin (360°)',
    apply(l, t, fps) {
      const r = l.transform.rotation.keys.length ? 0 : (l.transform.rotation.value as number);
      setKeyAt(l.transform.rotation, t, r, tol(fps));
      setKeyAt(l.transform.rotation, t + 2, r + 360, tol(fps));
    },
  },
  {
    id: 'pulse',
    name: 'Pulse (looping)',
    apply(l, t, fps) {
      const [sx, sy] = evalVec(l.transform.scale, t);
      setKeyAt(l.transform.scale, t, [sx, sy], tol(fps), EASY_EASE);
      setKeyAt(l.transform.scale, t + 0.5, [sx * 1.12, sy * 1.12], tol(fps), EASY_EASE);
      setKeyAt(l.transform.scale, t + 1, [sx, sy], tol(fps));
      l.transform.scale.loop = 'cycle';
    },
  },
  {
    id: 'wiggle',
    name: 'Wiggle Position',
    apply(l) {
      l.transform.position.wiggle = { freq: 2, amp: 30, seed: Math.floor(Math.random() * 1000) };
    },
  },
];

export interface FoundKey {
  layer: Layer;
  prop: Prop;
  index: number;
}

/** Locate a keyframe by id anywhere in a list of layers. */
export function findKey(layers: Layer[], keyId: string): FoundKey | null {
  for (const layer of layers) {
    for (const prop of layerProps(layer)) {
      const index = prop.keys.findIndex((k) => k.id === keyId);
      if (index >= 0) return { layer, prop, index };
    }
  }
  return null;
}
