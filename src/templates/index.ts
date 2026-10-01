import { EASING_PRESETS, type EasingPreset } from './easing';
import { LOOKS } from './effectPresets';
import { GRADIENT_PRESETS, type GradientPreset } from './gradients';
import { MOTION } from './motion';
import { SCENES } from './scenes';
import { TEXT_ANIMATIONS } from './textAnimations';
import { TEXT_STYLES } from './textStyles';
import type { LayerTemplate, LibraryCategory, SceneTemplate } from './types';

export * from './types';
export { EASING_PRESETS, GRADIENT_PRESETS, LOOKS, MOTION, SCENES, TEXT_ANIMATIONS, TEXT_STYLES };

/** Everything the library panel can show, tagged by category. */
export type LibraryItem =
  | { category: 'textStyle' | 'textAnim' | 'motion' | 'effect'; id: string; name: string; group: string; template: LayerTemplate }
  | { category: 'scene'; id: string; name: string; group: string; scene: SceneTemplate }
  | { category: 'gradient'; id: string; name: string; group: string; gradient: GradientPreset }
  | { category: 'easing'; id: string; name: string; group: string; easing: EasingPreset };

const layerItems = (category: 'textStyle' | 'textAnim' | 'motion' | 'effect', list: LayerTemplate[]): LibraryItem[] =>
  list.map((template) => ({ category, id: template.id, name: template.name, group: template.group, template }));

export const LIBRARY: Record<LibraryCategory, LibraryItem[]> = {
  textStyle: layerItems('textStyle', TEXT_STYLES),
  textAnim: layerItems('textAnim', TEXT_ANIMATIONS),
  gradient: GRADIENT_PRESETS.map((gradient) => ({ category: 'gradient' as const, id: `gradient.${gradient.id}`, name: gradient.name, group: gradient.group, gradient })),
  easing: EASING_PRESETS.map((easing) => ({ category: 'easing' as const, id: `easing.${easing.id}`, name: easing.name, group: easing.group, easing })),
  motion: layerItems('motion', MOTION),
  effect: layerItems('effect', LOOKS),
  scene: SCENES.map((scene) => ({ category: 'scene' as const, id: scene.id, name: scene.name, group: scene.group, scene })),
};

export const LIBRARY_ORDER: LibraryCategory[] = ['textStyle', 'textAnim', 'gradient', 'easing', 'motion', 'effect', 'scene'];

export const TEMPLATE_COUNT = LIBRARY_ORDER.reduce((n, c) => n + LIBRARY[c].length, 0);

/** The user's own presets, registered by the state layer so they behave like built-in templates. */
let userLibrary = new Map<string, LibraryItem>();
export function setUserItems(items: LibraryItem[]): void {
  userLibrary = new Map(items.map((i) => [i.id, i]));
}
export const userItems = (): LibraryItem[] => [...userLibrary.values()];

export function findLibraryItem(id: string): LibraryItem | undefined {
  for (const cat of LIBRARY_ORDER) {
    const hit = LIBRARY[cat].find((i) => i.id === id);
    if (hit) return hit;
  }
  return userLibrary.get(id);
}

/** Items grouped for display: [group name, items] in first-seen order. */
export function groupItems(items: LibraryItem[]): [string, LibraryItem[]][] {
  const map = new Map<string, LibraryItem[]>();
  for (const i of items) map.set(i.group, [...(map.get(i.group) ?? []), i]);
  return [...map.entries()];
}
