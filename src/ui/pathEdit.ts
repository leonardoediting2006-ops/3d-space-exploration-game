import type { Comp, Layer, Prop, PropGroup } from '../core/types';

export interface PathTarget {
  layer: Layer;
  group: PropGroup;
  key: string;
  prop: Prop;
  closed: boolean;
  /** Mask id when the target is a mask path. */
  maskId: string | null;
}

/** The path the viewer is currently editing: a path shape layer, or the active mask of a layer. */
export function editTarget(comp: Comp, selection: string[], activeMask: string | null): PathTarget | null {
  if (selection.length !== 1) return null;
  const layer = comp.layers.find((l) => l.id === selection[0]);
  if (!layer || layer.locked) return null;
  if (layer.data.type === 'shape' && layer.data.shape === 'path') {
    return { layer, group: 'content', key: 'path', prop: layer.content.path, closed: layer.data.closed, maskId: null };
  }
  if (!layer.masks.length) return null;
  const m = layer.masks.find((x) => x.id === activeMask) ?? layer.masks[layer.masks.length - 1];
  return { layer, group: `mask:${m.id}`, key: 'path', prop: m.props.path, closed: true, maskId: m.id };
}
