import { getEffectDef } from './effectDefs';
import { ANIMATOR_KEYS, makeTransform } from './factory';
import { BLEND_MODES, MATTE_MODES, NAMED_EASES, TRANSFORM_KEYS, type Comp, type Layer, type Project, type Prop } from './types';

const FORMAT = 'keyframe-studio';
const VERSION = 1;

export interface ProjectFile {
  format: typeof FORMAT;
  version: number;
  project: Project;
  /** Footage as data URLs, keyed by asset id. */
  assets: Record<string, string>;
}

export function serializeProject(project: Project, assets: Record<string, string>): string {
  const file: ProjectFile = { format: FORMAT, version: VERSION, project, assets };
  return JSON.stringify(file);
}

/* Project files are untrusted input. Nothing in them is ever evaluated; we still check the
 * shape and clamp sizes so a hostile or corrupt file cannot crash or exhaust the editor. */

class ProjectFileError extends Error {}
const fail = (msg: string): never => {
  throw new ProjectFileError(`Invalid project file: ${msg}`);
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown, what: string): string => (typeof v === 'string' ? v : fail(`${what} must be text`));
const numIn = (v: unknown, what: string, lo: number, hi: number): number =>
  isNum(v) && v >= lo && v <= hi ? v : fail(`${what} must be a number between ${lo} and ${hi}`);

function checkValue(kind: Prop['kind'], v: unknown, what: string): void {
  if (kind === 'number') {
    if (!isNum(v)) fail(`${what} must be a number`);
    return;
  }
  if (kind === 'gradient') {
    if (!Array.isArray(v) || v.length % 4 !== 0 || v.length < 8 || v.length > 4 * 64 || !v.every(isNum)) fail(`${what} must be a list of gradient stops`);
    return;
  }
  if (kind === 'path') {
    if (!Array.isArray(v) || v.length % 6 !== 0 || v.length > 6 * 5000 || !v.every(isNum)) fail(`${what} must be a list of path vertices`);
    return;
  }
  const n = kind === 'vec2' ? 2 : 3;
  if (!Array.isArray(v) || v.length !== n || !v.every(isNum)) fail(`${what} must be ${n} numbers`);
}

function checkProp(p: unknown, what: string): Prop {
  if (!isObj(p)) return fail(`${what} is not an object`);
  if (p.kind !== 'number' && p.kind !== 'vec2' && p.kind !== 'color' && p.kind !== 'path' && p.kind !== 'gradient') fail(`${what} has an unknown kind`);
  const kind = p.kind as Prop['kind'];
  str(p.label, `${what}.label`);
  checkValue(kind, p.value, `${what}.value`);
  if (!Array.isArray(p.keys) || p.keys.length > 20000) fail(`${what}.keys is invalid`);
  let last = -Infinity;
  for (const k of p.keys as unknown[]) {
    if (!isObj(k)) return fail(`${what} has a bad keyframe`);
    str(k.id, `${what} keyframe id`);
    if (!isNum(k.t)) fail(`${what} keyframe time`);
    if ((k.t as number) < last) fail(`${what} keyframes are out of order`);
    last = k.t as number;
    checkValue(kind, k.v, `${what} keyframe value`);
    const e = k.ease;
    const ok = e === 'linear' || e === 'hold' || (typeof e === 'string' && (NAMED_EASES as readonly string[]).includes(e)) || (Array.isArray(e) && e.length === 4 && e.every(isNum));
    if (!ok) fail(`${what} keyframe ease`);
    for (const t of [k.sIn, k.sOut]) {
      if (t !== undefined && !(Array.isArray(t) && t.length === 2 && t.every(isNum))) fail(`${what} keyframe motion-path tangent`);
    }
  }
  if (p.wiggle !== undefined) {
    const w = p.wiggle;
    if (!isObj(w) || !isNum(w.freq) || !isNum(w.amp) || !isNum(w.seed)) fail(`${what}.wiggle`);
  }
  if (p.loop !== undefined && p.loop !== 'cycle' && p.loop !== 'pingpong') fail(`${what}.loop`);
  return p as unknown as Prop;
}

function checkLayer(l: unknown, projectAssets: Record<string, unknown>, compIds: Set<string>): Layer {
  if (!isObj(l)) return fail('a layer is not an object');
  const name = str(l.name, 'layer name');
  const what = `layer "${name}"`;
  str(l.id, `${what} id`);
  for (const k of ['start', 'inPoint', 'outPoint', 'label'] as const) if (!isNum(l[k])) fail(`${what}.${k}`);
  for (const k of ['visible', 'solo', 'locked', 'motionBlur'] as const) if (typeof l[k] !== 'boolean') fail(`${what}.${k}`);
  if (l.parentId !== null && typeof l.parentId !== 'string') fail(`${what}.parentId`);
  if (!BLEND_MODES.some((b) => b.id === l.blend)) fail(`${what}.blend`);
  if (!MATTE_MODES.some((m) => m.id === l.matte)) fail(`${what}.matte`);
  if (!isObj(l.transform)) fail(`${what}.transform`);
  const tr = l.transform as Record<string, unknown>;
  for (const key of TRANSFORM_KEYS) checkProp(tr[key], `${what} ${key}`);
  if (!isObj(l.content)) fail(`${what}.content`);
  for (const [k, p] of Object.entries(l.content as Record<string, unknown>)) checkProp(p, `${what} ${k}`);
  if (!Array.isArray(l.effects)) fail(`${what}.effects`);
  for (const fx of l.effects as unknown[]) {
    if (!isObj(fx) || typeof fx.id !== 'string' || typeof fx.enabled !== 'boolean') return fail(`${what} has a bad effect`);
    if (!getEffectDef(str(fx.type, 'effect type'))) fail(`${what} uses an unknown effect "${fx.type}"`);
    if (!isObj(fx.props)) fail(`${what} effect props`);
    for (const [k, p] of Object.entries(fx.props as Record<string, unknown>)) checkProp(p, `${what} effect ${k}`);
  }
  if (l.masks !== undefined) {
    if (!Array.isArray(l.masks) || l.masks.length > 200) fail(`${what}.masks`);
    for (const m of l.masks as unknown[]) {
      if (!isObj(m) || typeof m.id !== 'string' || typeof m.name !== 'string' || typeof m.inverted !== 'boolean') return fail(`${what} has a bad mask`);
      if (!['none', 'add', 'subtract', 'intersect'].includes(String(m.mode))) fail(`${what} mask mode`);
      if (!isObj(m.props)) return fail(`${what} mask props`);
      for (const k of ['path', 'feather', 'opacity', 'expansion']) checkProp((m.props as Record<string, unknown>)[k], `${what} mask ${k}`);
    }
  }
  if (l.animators !== undefined) {
    if (!Array.isArray(l.animators) || l.animators.length > 50) fail(`${what}.animators`);
    for (const a of l.animators as unknown[]) {
      if (!isObj(a) || typeof a.id !== 'string' || typeof a.name !== 'string' || !isObj(a.props)) return fail(`${what} has a bad text animator`);
      for (const k of ANIMATOR_KEYS) checkProp((a.props as Record<string, unknown>)[k], `${what} animator ${k}`);
    }
  }
  if (!isObj(l.data)) return fail(`${what}.data`);
  const d = l.data;
  switch (l.type) {
    case 'solid':
    case 'adjustment':
    case 'null':
      numIn(d.width, `${what} width`, 1, 16384);
      numIn(d.height, `${what} height`, 1, 16384);
      if (d.type !== l.type) fail(`${what}.data.type`);
      break;
    case 'shape':
      if (!['rect', 'ellipse', 'polygon', 'star', 'path'].includes(String(d.shape))) fail(`${what} shape`);
      if (d.shape === 'path' && !(isObj(l.content) && 'path' in (l.content as object))) fail(`${what} is a path shape without a path`);
      break;
    case 'text':
      str(d.text, `${what} text`);
      str(d.font, `${what} font`);
      if (String(d.font).length > 200) fail(`${what} font`);
      break;
    case 'image':
      if (typeof d.assetId !== 'string' || !(d.assetId in projectAssets)) fail(`${what} references missing footage`);
      break;
    case 'precomp':
      if (typeof d.compId !== 'string' || !compIds.has(d.compId)) fail(`${what} references a missing composition`);
      break;
    default:
      fail(`${what} has unknown type "${String(l.type)}"`);
  }
  return l as unknown as Layer;
}

export function parseProject(text: string): { project: Project; assets: Record<string, string> } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('not valid JSON');
  }
  if (!isObj(raw) || raw.format !== FORMAT) return fail('this is not a Keyframe Studio project');
  if (!isNum(raw.version) || raw.version > VERSION) return fail('it was saved by a newer version');
  const p = raw.project;
  if (!isObj(p) || !isObj(p.comps) || !Array.isArray(p.compOrder) || !isObj(p.assets) || !Array.isArray(p.assetOrder)) {
    return fail('missing project data');
  }
  const compIds = new Set(Object.keys(p.comps));
  for (const id of p.compOrder as unknown[]) if (typeof id !== 'string' || !compIds.has(id)) fail('composition list is inconsistent');
  if (compIds.size === 0) fail('it has no compositions');

  for (const [id, c] of Object.entries(p.comps as Record<string, unknown>)) {
    if (!isObj(c)) return fail('a composition is not an object');
    if (c.id !== id) fail('composition ids do not match');
    str(c.name, 'composition name');
    numIn(c.width, 'composition width', 1, 8192);
    numIn(c.height, 'composition height', 1, 8192);
    numIn(c.fps, 'composition frame rate', 1, 240);
    numIn(c.duration, 'composition duration', 1 / 240, 3600);
    numIn(c.workStart, 'work area start', 0, 3600);
    numIn(c.workEnd, 'work area end', 0, 3600);
    numIn(c.shutterAngle, 'shutter angle', 0, 720);
    if (typeof c.motionBlur !== 'boolean') fail('composition motion blur flag');
    if (!Array.isArray(c.bg) || c.bg.length !== 3 || !c.bg.every(isNum)) fail('composition background');
    if (!Array.isArray(c.layers) || c.layers.length > 5000) fail('composition layers');
    const ids = new Set<string>();
    for (const l of c.layers as unknown[]) {
      const layer = checkLayer(l, p.assets as Record<string, unknown>, compIds);
      if (ids.has(layer.id)) fail('duplicate layer ids');
      ids.add(layer.id);
    }
  }

  const rawAssets = isObj(raw.assets) ? raw.assets : {};
  const assets: Record<string, string> = {};
  for (const [id, a] of Object.entries(p.assets as Record<string, unknown>)) {
    if (!isObj(a)) return fail('footage entry');
    numIn(a.width, 'footage width', 1, 32768);
    numIn(a.height, 'footage height', 1, 32768);
    str(a.name, 'footage name');
    const url = rawAssets[id];
    if (typeof url !== 'string' || !/^data:image\/(png|jpeg|gif|webp|svg\+xml|bmp);/i.test(url)) fail(`footage "${a.name}" has no valid image data`);
    assets[id] = url as string;
  }

  const project = p as unknown as Project;
  if (!isObj(project.counters)) project.counters = {};
  repairProject(project);
  return { project, assets };
}

/** Fill in anything a newer-than-expected file might lack so the editor never meets undefined. */
function repairProject(project: Project): void {
  for (const comp of Object.values(project.comps) as Comp[]) {
    comp.workEnd = Math.min(Math.max(comp.workEnd, comp.workStart), comp.duration);
    for (const l of comp.layers) {
      const fresh = makeTransform();
      for (const k of TRANSFORM_KEYS) l.transform[k] = { ...fresh[k], ...l.transform[k] };
      l.masks ??= [];
      l.animators ??= [];
      if (l.data.type === 'shape') l.data.closed ??= true;
    }
  }
}

export function isProjectFileError(e: unknown): e is Error {
  return e instanceof ProjectFileError;
}
