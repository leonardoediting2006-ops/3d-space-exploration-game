import { uid } from './ids';
import type {
  Comp,
  Layer,
  LayerData,
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
