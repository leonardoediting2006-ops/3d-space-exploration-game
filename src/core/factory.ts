import { uid } from './ids';
import { ellipsePath, pathBounds, rectPath, translatePath } from './path';
import type { TextAnimator } from './types';
import type {
  Comp,
  Layer,
  LayerData,
  Mask,
  MaskMode,
  LayerType,
  Project,
  Prop,
  PropKind,
  PropValue,
  RGB,
  ShapeKind,
  TransformKey,
  Vec2,
} from './types';

export function makeProp(
  kind: PropKind,
  label: string,
  value: PropValue,
  opts: Partial<Omit<Prop, 'kind' | 'label' | 'value' | 'keys'>> = {},
): Prop {
  return { kind, label, value: Array.isArray(value) ? [...value] : value, keys: [], ...opts };
}

export function makeTransform(position: Vec2 = [0, 0], anchor: Vec2 = [0, 0]): Record<TransformKey, Prop> {
  return {
    anchor: makeProp('vec2', 'Anchor Point', anchor, { unit: 'px', step: 1, decimals: 1 }),
    position: makeProp('vec2', 'Position', position, { unit: 'px', step: 1, decimals: 1 }),
    scale: makeProp('vec2', 'Scale', [100, 100], { unit: '%', step: 1, decimals: 1, link: true }),
    rotation: makeProp('number', 'Rotation', 0, { unit: '°', step: 1, decimals: 1 }),
    opacity: makeProp('number', 'Opacity', 100, { unit: '%', min: 0, max: 100, step: 1, decimals: 0 }),
  };
}

export function createComp(opts: Partial<Omit<Comp, 'id' | 'layers'>> & { name: string }): Comp {
  const duration = opts.duration ?? 10;
  return {
    id: uid('comp'),
    width: 1920,
    height: 1080,
    fps: 30,
    bg: [18, 18, 20],
    workStart: 0,
    workEnd: duration,
    motionBlur: false,
    shutterAngle: 180,
    ...opts,
    duration,
    layers: [],
  };
}

export function createProject(): Project {
  const comp = createComp({ name: 'Comp 1' });
  return {
    name: 'Untitled Project',
    comps: { [comp.id]: comp },
    compOrder: [comp.id],
    assets: {},
    assetOrder: [],
    counters: {},
  };
}

/** Per-project counters give default names like "Solid 3". */
export function nextCount(project: Project, key: string): number {
  project.counters[key] = (project.counters[key] ?? 0) + 1;
  return project.counters[key];
}

interface BaseOpts {
  name: string;
  comp: Comp;
  time: number;
  position?: Vec2;
  anchor?: Vec2;
}

function baseLayer(type: LayerType, data: LayerData, o: BaseOpts, content: Record<string, Prop>): Layer {
  const center: Vec2 = [o.comp.width / 2, o.comp.height / 2];
  return {
    id: uid('layer'),
    name: o.name,
    type,
    label: ({ solid: 0, shape: 1, text: 2, image: 3, precomp: 5, null: 6, adjustment: 7 } as const)[type],
    start: o.time,
    inPoint: o.time,
    outPoint: Math.max(o.time + 1 / o.comp.fps, o.comp.duration),
    visible: true,
    solo: false,
    locked: false,
    motionBlur: false,
    parentId: null,
    blend: 'normal',
    matte: 'none',
    transform: makeTransform(o.position ?? center, o.anchor ?? [0, 0]),
    content,
    effects: [],
    masks: [],
    animators: [],
    data,
  };
}

export function createSolid(o: BaseOpts & { color: RGB; width: number; height: number }): Layer {
  return baseLayer(
    'solid',
    { type: 'solid', width: o.width, height: o.height },
    { ...o, anchor: o.anchor ?? [o.width / 2, o.height / 2] },
    { color: makeProp('color', 'Color', o.color) },
  );
}

export function createAdjustment(o: BaseOpts): Layer {
  const { width, height } = o.comp;
  return baseLayer(
    'adjustment',
    { type: 'adjustment', width, height },
    { ...o, anchor: [width / 2, height / 2] },
    {},
  );
}

export function createNull(o: BaseOpts): Layer {
  return baseLayer('null', { type: 'null', width: 100, height: 100 }, { ...o, anchor: [50, 50] }, {});
}

export function createShape(
  o: BaseOpts & { shape: ShapeKind; size: Vec2; fill?: RGB; stroke?: RGB; strokeWidth?: number },
): Layer {
  const content: Record<string, Prop> = {
    size: makeProp('vec2', 'Size', o.size, { unit: 'px', step: 1, decimals: 1, min: 0 }),
  };
  if (o.shape === 'rect') {
    content.roundness = makeProp('number', 'Roundness', 0, { unit: 'px', min: 0, step: 1, decimals: 1 });
  }
  if (o.shape === 'polygon' || o.shape === 'star') {
    content.points = makeProp('number', 'Points', o.shape === 'star' ? 5 : 6, { min: 3, max: 40, step: 1, decimals: 0 });
  }
  if (o.shape === 'star') {
    content.innerRatio = makeProp('number', 'Inner Radius', 45, { unit: '%', min: 1, max: 100, step: 1, decimals: 0 });
  }
  content.fillColor = makeProp('color', 'Fill Color', o.fill ?? [74, 144, 226]);
  content.strokeColor = makeProp('color', 'Stroke Color', o.stroke ?? [255, 255, 255]);
  content.strokeWidth = makeProp('number', 'Stroke Width', o.strokeWidth ?? 6, { unit: 'px', min: 0, step: 0.5, decimals: 1 });
  content.trimStart = makeProp('number', 'Trim Start', 0, { unit: '%', min: 0, max: 100, step: 1, decimals: 1 });
  content.trimEnd = makeProp('number', 'Trim End', 100, { unit: '%', min: 0, max: 100, step: 1, decimals: 1 });
  content.trimOffset = makeProp('number', 'Trim Offset', 0, { unit: '°', step: 1, decimals: 1 });
  return baseLayer(
    'shape',
    {
      type: 'shape',
      shape: o.shape,
      fill: true,
      stroke: false,
      closed: true,
      lineCap: 'round',
      lineJoin: 'round',
    },
    o,
    content,
  );
}

export function createText(o: BaseOpts & { text: string }): Layer {
  return baseLayer(
    'text',
    { type: 'text', text: o.text, font: 'Inter, Helvetica, Arial, sans-serif', bold: true, italic: false, align: 'center', stroke: false },
    o,
    {
      fontSize: makeProp('number', 'Font Size', 96, { unit: 'px', min: 1, max: 2000, step: 1, decimals: 0 }),
      tracking: makeProp('number', 'Tracking', 0, { unit: 'px', step: 0.5, decimals: 1 }),
      fillColor: makeProp('color', 'Fill Color', [255, 255, 255]),
      strokeColor: makeProp('color', 'Stroke Color', [0, 0, 0]),
      strokeWidth: makeProp('number', 'Stroke Width', 4, { unit: 'px', min: 0, step: 0.5, decimals: 1 }),
    },
  );
}

export function createImageLayer(o: BaseOpts & { assetId: string; width: number; height: number }): Layer {
  return baseLayer('image', { type: 'image', assetId: o.assetId }, { ...o, anchor: [o.width / 2, o.height / 2] }, {});
}

export function createPrecompLayer(o: BaseOpts & { compId: string; sub: Comp }): Layer {
  const l = baseLayer(
    'precomp',
    { type: 'precomp', compId: o.compId },
    { ...o, anchor: [o.sub.width / 2, o.sub.height / 2] },
    {},
  );
  l.outPoint = o.time + o.sub.duration;
  return l;
}

/** Size of a layer's own pixel box in local space, when it is fixed. */
export function intrinsicSize(layer: Layer): Vec2 | null {
  const d = layer.data;
  if (d.type === 'solid' || d.type === 'adjustment' || d.type === 'null') return [d.width, d.height];
  return null;
}

export function cloneDeep<T>(v: T): T {
  return structuredClone(v);
}

/** A freeform bezier shape layer. `path` is in comp coordinates; the layer origin moves to its centre. */
export function createPathShape(
  o: BaseOpts & { path: number[]; closed: boolean; fill?: RGB; stroke?: RGB; strokeWidth?: number },
): Layer {
  const b = pathBounds(o.path, o.closed);
  const cx = b ? b.x + b.w / 2 : 0;
  const cy = b ? b.y + b.h / 2 : 0;
  const layer = createShape({
    ...o,
    shape: 'rect',
    size: [1, 1],
    position: [cx, cy],
    fill: o.fill,
    stroke: o.stroke,
    strokeWidth: o.strokeWidth,
  });
  delete layer.content.size;
  delete layer.content.roundness;
  const content: Record<string, Prop> = { path: makeProp('path', 'Path', translatePath(o.path, -cx, -cy)) };
  Object.assign(content, layer.content);
  layer.content = content;
  if (layer.data.type === 'shape') {
    layer.data.shape = 'path';
    layer.data.closed = o.closed;
    layer.data.fill = o.closed;
    layer.data.stroke = true;
  }
  return layer;
}

export function createMask(path: number[], name: string, mode: MaskMode = 'add'): Mask {
  return {
    id: uid('mask'),
    name,
    mode,
    inverted: false,
    props: {
      path: makeProp('path', 'Mask Path', path),
      feather: makeProp('number', 'Mask Feather', 0, { unit: 'px', min: 0, max: 1000, step: 0.5, decimals: 1 }),
      opacity: makeProp('number', 'Mask Opacity', 100, { unit: '%', min: 0, max: 100, step: 1, decimals: 0 }),
      expansion: makeProp('number', 'Mask Expansion', 0, { unit: 'px', min: -1000, max: 1000, step: 0.5, decimals: 1 }),
    },
  };
}

/** A rectangular or elliptical starter mask that covers the layer's bounds. */
export function starterMaskPath(kind: 'rect' | 'ellipse', x: number, y: number, w: number, h: number): number[] {
  return kind === 'rect' ? rectPath(x, y, w, h) : ellipsePath(x + w / 2, y + h / 2, w / 2, h / 2);
}

export type AnimatorKind = 'blank' | 'opacity' | 'position' | 'scale' | 'rotation' | 'tracking' | 'color';

/** The animator property keys the renderer reads. */
export const ANIMATOR_KEYS = ['start', 'end', 'offset', 'smooth', 'units', 'shape', 'random', 'seed', 'position', 'scale', 'rotation', 'opacity', 'tracking', 'colorMix', 'color'] as const;

/** A text animator with every property at its neutral value; `kind` pre-sets the one it is meant to drive. */
export function createAnimator(name: string, kind: AnimatorKind = 'blank'): TextAnimator {
  const props: Record<string, Prop> = {
    start: makeProp('number', 'Range Start', 0, { unit: '%', min: -200, max: 300, step: 1, decimals: 1 }),
    end: makeProp('number', 'Range End', 100, { unit: '%', min: -200, max: 300, step: 1, decimals: 1 }),
    offset: makeProp('number', 'Range Offset', 0, { unit: '%', min: -300, max: 300, step: 1, decimals: 1 }),
    smooth: makeProp('number', 'Smoothness', 100, { unit: '%', min: 0, max: 100, step: 1, decimals: 0 }),
    units: makeProp('number', 'Based On', 0, { options: ['Characters', 'Words', 'Lines'] }),
    shape: makeProp('number', 'Shape', 0, { options: ['Square', 'Ramp Up', 'Ramp Down', 'Triangle', 'Round', 'Smooth'] }),
    random: makeProp('number', 'Randomize Order', 0, { options: ['Off', 'On'] }),
    seed: makeProp('number', 'Random Seed', 1, { min: 0, max: 9999, step: 1, decimals: 0 }),
    position: makeProp('vec2', 'Position', [0, 0], { unit: 'px', step: 1, decimals: 1 }),
    scale: makeProp('vec2', 'Scale', [100, 100], { unit: '%', step: 1, decimals: 1, link: true }),
    rotation: makeProp('number', 'Rotation', 0, { unit: '°', step: 1, decimals: 1 }),
    opacity: makeProp('number', 'Opacity', 100, { unit: '%', min: 0, max: 100, step: 1, decimals: 0 }),
    tracking: makeProp('number', 'Tracking', 0, { unit: 'px', step: 0.5, decimals: 1 }),
    colorMix: makeProp('number', 'Color Amount', 0, { unit: '%', min: 0, max: 100, step: 1, decimals: 0 }),
    color: makeProp('color', 'Fill Color', [255, 90, 90]),
  };
  const a: TextAnimator = { id: uid('anim'), name, props };
  switch (kind) {
    case 'opacity':
      props.opacity.value = 0;
      break;
    case 'position':
      props.position.value = [0, -60];
      break;
    case 'scale':
      props.scale.value = [0, 0];
      break;
    case 'rotation':
      props.rotation.value = 90;
      break;
    case 'tracking':
      props.tracking.value = 24;
      break;
    case 'color':
      props.colorMix.value = 100;
      break;
  }
  return a;
}
