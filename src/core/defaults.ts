import { getEffectDef } from './effectDefs';
import { createAnimator, intrinsicSize } from './factory';
import type { Comp, Layer, PropGroup, PropValue } from './types';

/**
 * The value a property has when "reset": transform properties return to their neutral state,
 * effect, animator and mask parameters to their defaults. Returns undefined when there is no
 * sensible default (a shape's size, a path…), so the interface can hide the reset button.
 */
export function defaultPropValue(layer: Layer, comp: Pick<Comp, 'width' | 'height'>, group: PropGroup, key: string): PropValue | undefined {
  if (group === 'transform') {
    switch (key) {
      case 'position':
        return [comp.width / 2, comp.height / 2];
      case 'anchor': {
        const size = intrinsicSize(layer);
        return size ? [size[0] / 2, size[1] / 2] : [0, 0];
      }
      case 'scale':
        return [100, 100];
      case 'rotation':
        return 0;
      case 'opacity':
        return 100;
    }
    return undefined;
  }
  if (group.startsWith('fx:')) {
    const fx = layer.effects.find((e) => `fx:${e.id}` === group);
    const def = fx && getEffectDef(fx.type)?.params.find((p) => p.key === key);
    if (!def) return undefined;
    const v = typeof def.value === 'function' ? def.value(comp) : def.value;
    return Array.isArray(v) ? [...v] : v;
  }
  if (group.startsWith('anim:')) {
    const v = createAnimator('x').props[key]?.value;
    return v === undefined ? undefined : Array.isArray(v) ? [...v] : v;
  }
  if (group.startsWith('mask:')) return ({ feather: 0, opacity: 100, expansion: 0 } as Record<string, number>)[key];
  return undefined;
}

export const sameValue = (a: PropValue, b: PropValue): boolean =>
  Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-6) : typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-6 : false;
