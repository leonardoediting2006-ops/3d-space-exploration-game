import { uid } from './ids';
import { TRANSFORM_KEYS, TRANSFORM_KEYS_3D, type Layer, type Prop, type PropGroup, type TransformKey } from './types';

/** Every property on a layer: transform, content, then each effect's parameters. */
export function layerProps(layer: Layer): Prop[] {
  const out: Prop[] = TRANSFORM_KEYS.map((k) => layer.transform[k]);
  out.push(...Object.values(layer.content));
  for (const fx of layer.effects) out.push(...Object.values(fx.props));
  for (const m of layer.masks) out.push(...Object.values(m.props));
  for (const a of layer.animators) out.push(...Object.values(a.props));
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
  for (const m of layer.masks) for (const [k, p] of Object.entries(m.props)) out.push({ group: `mask:${m.id}`, key: k, prop: p });
  for (const a of layer.animators) for (const [k, p] of Object.entries(a.props)) out.push({ group: `anim:${a.id}`, key: k, prop: p });
  return out;
}

export function resolveProp(layer: Layer, group: PropGroup, key: string): Prop | undefined {
  if (group === 'transform') return layer.transform[key as keyof Layer['transform']];
  if (group === 'content') return layer.content[key];
  if (group.startsWith('mask:')) return layer.masks.find((m) => `mask:${m.id}` === group)?.props[key];
  if (group.startsWith('anim:')) return layer.animators.find((a) => `anim:${a.id}` === group)?.props[key];
  return layer.effects.find((e) => `fx:${e.id}` === group)?.props[key];
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
  for (const m of copy.masks) m.id = uid('mask');
  for (const a of copy.animators) a.id = uid('anim');
  return copy;
}

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

/**
 * The transform properties worth showing for a layer, in display order: a 3D layer adds Z position
 * and X/Y rotation; a camera or light only has the few that apply to it; sound has none. A property
 * that already has keyframes is always shown so animation is never hidden.
 */
export function transformKeysShown(layer: Layer): TransformKey[] {
  const base: TransformKey[] =
    layer.type === 'audio'
      ? []
      : layer.type === 'camera'
        ? ['position', 'positionZ', 'rotation']
        : layer.type === 'light'
          ? ['position', 'positionZ']
          : layer.threeD
            ? ['anchor', 'position', 'positionZ', 'scale', 'rotationX', 'rotationY', 'rotation', 'opacity']
            : ['anchor', 'position', 'scale', 'rotation', 'opacity'];
  const extra = TRANSFORM_KEYS.filter((k) => !base.includes(k) && layer.transform[k].keys.length > 0 && (layer.threeD || !TRANSFORM_KEYS_3D.includes(k)));
  return [...base, ...extra];
}

/** What the layer's Rotation property is called: with a third dimension it is the rotation about Z. */
export const rotationLabel = (layer: Layer): string => (layer.type === 'camera' ? 'Roll' : layer.threeD ? 'Z Rotation' : 'Rotation');
