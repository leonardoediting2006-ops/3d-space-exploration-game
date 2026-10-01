import { createEffect } from '../core/effectDefs';
import {
  createAdjustment,
  createComp,
  createAnimator,
  createMask,
  createPathShape,
  starterMaskPath,
  createImageLayer,
  createNull,
  createPrecompLayer,
  createProject,
  createShape,
  createSolid,
  createText,
  nextCount,
} from '../core/factory';
import { uid } from '../core/ids';
import type { AnimatorKind } from '../core/factory';
import { baseValue, evalProp, NAMED_EASE_REVERSE, setAnimated, setKeyAt, sortKeys } from '../core/interp';
import { clamp } from '../core/math';
import { insertVertex, removeVertex } from '../core/path';
import { cloneLayer, findKey, layerProps, layerPropEntries, resolveProp, shiftLayer } from '../core/props';
import { parseProject, serializeProject, isProjectFileError } from '../core/serialize';
import { snapToFrame } from '../core/time';
import type {
  BlendMode,
  Comp,
  Ease,
  Keyframe,
  Layer,
  LayerData,
  MaskMode,
  MatteMode,
  Project,
  Prop,
  PropGroup,
  PropValue,
  RGB,
  ShapeKind,
  Vec2,
  Wiggle,
} from '../core/types';
import { allAssetData, clearAssets, imageSize, readFileAsDataUrl, setAssetData } from '../render/assets';
import { localBounds } from '../render/geometry';
import { downloadBlob } from '../render/export';
import { appStore, activeComp, commit, resetHistory, timeStore, toast } from './store';

const S = () => appStore.get();
const now = () => timeStore.get().t;
const keyTol = (comp: Comp) => 0.25 / comp.fps;

/* ------------------------------------------------------------------ navigation */

export function setTime(t: number): void {
  const comp = activeComp();
  const frame = 1 / comp.fps;
  const next = clamp(snapToFrame(t, comp.fps), 0, Math.max(0, comp.duration - frame));
  if (next !== now()) timeStore.set({ t: next });
}

export const stepFrames = (n: number): void => setTime(now() + n / activeComp().fps);

export function goToKeyframe(dir: 1 | -1): void {
  const s = S();
  const comp = activeComp(s);
  const layers = s.selection.length ? comp.layers.filter((l) => s.selection.includes(l.id)) : comp.layers;
  const times = new Set<number>();
  for (const l of layers) for (const p of layerProps(l)) for (const k of p.keys) times.add(k.t);
  const t = now();
  const eps = 0.5 / comp.fps;
  const sorted = [...times].sort((a, b) => a - b);
  const target = dir > 0 ? sorted.find((x) => x > t + eps) : [...sorted].reverse().find((x) => x < t - eps);
  if (target !== undefined) setTime(target);
}

let raf = 0;
let playWall = 0;
let playFrom = 0;

function tick(wall: number): void {
  const s = S();
  const comp = activeComp(s);
  const end = comp.workEnd > comp.workStart ? comp.workEnd : comp.duration;
  let t = playFrom + (wall - playWall) / 1000;
  if (t >= end - 1e-6) {
    if (s.loopPlayback) {
      playWall = wall;
      playFrom = comp.workStart;
      t = comp.workStart;
    } else {
      pause();
      setTime(end - 1 / comp.fps);
      return;
    }
  }
  setTime(t);
  raf = requestAnimationFrame(tick);
}

export function play(): void {
  if (S().playing) return;
  const comp = activeComp();
  const end = comp.workEnd > comp.workStart ? comp.workEnd : comp.duration;
  if (now() >= end - 1.5 / comp.fps || now() < comp.workStart) setTime(comp.workStart);
  appStore.set({ playing: true });
  playWall = performance.now();
  playFrom = now();
  raf = requestAnimationFrame(tick);
}

export function pause(): void {
  cancelAnimationFrame(raf);
  if (S().playing) appStore.set({ playing: false });
}

export const togglePlay = (): void => (S().playing ? pause() : play());

/* ------------------------------------------------------------------ selection / UI */

export function selectLayers(ids: string[], additive = false): void {
  const cur = S().selection;
  const next = additive ? [...new Set([...cur, ...ids])] : ids;
  appStore.set({ selection: next, selKeys: [] });
}

export function toggleLayerSelected(id: string): void {
  const cur = S().selection;
  appStore.set({ selection: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id], selKeys: [] });
}

export const selectAllLayers = (): void => selectLayers(activeComp().layers.map((l) => l.id));

export function selectKeys(ids: string[], additive = false): void {
  appStore.set({ selKeys: additive ? [...new Set([...S().selKeys, ...ids])] : ids });
}

export function setExpanded(id: string, open: boolean): void {
  appStore.set({ expanded: { ...S().expanded, [id]: open } });
}

export function openDialog(d: NonNullable<ReturnType<typeof S>['dialog']>): void {
  appStore.set({ dialog: d });
}
export const closeDialog = (): void => appStore.set({ dialog: null });

/** AE-style property reveal: P, S, R, T, A, U show just those properties on selected layers. */
export function revealProps(keys: string[] | 'animated', additive: boolean): void {
  const s = S();
  const showOnly = { ...s.showOnly };
  const targets = s.selection.length ? s.selection : activeComp(s).layers.map((l) => l.id);
  for (const id of targets) {
    const cur = showOnly[id];
    if (keys === 'animated') {
      showOnly[id] = cur === 'animated' && !additive ? [] : 'animated';
      if (showOnly[id] instanceof Array && !(showOnly[id] as string[]).length) delete showOnly[id];
    } else if (additive && Array.isArray(cur)) {
      showOnly[id] = [...new Set([...cur, ...keys])];
    } else {
      showOnly[id] = keys;
    }
  }
  appStore.set({ showOnly });
}

/* ------------------------------------------------------------------ compositions */

export function openComp(id: string): void {
  const s = S();
  if (!s.project.comps[id]) return;
  pause();
  const openComps = s.openComps.includes(id) ? s.openComps : [...s.openComps, id];
  appStore.set({ openComps, activeCompId: id, selection: [], selKeys: [] });
  setTime(0);
}

export function closeCompTab(id: string): void {
  const s = S();
  if (s.openComps.length <= 1) return;
  const openComps = s.openComps.filter((x) => x !== id);
  const activeCompId = s.activeCompId === id ? openComps[openComps.length - 1] : s.activeCompId;
  appStore.set({ openComps, activeCompId, selection: s.activeCompId === id ? [] : s.selection });
}

export function newComp(opts: Partial<Omit<Comp, 'id' | 'layers'>> & { name: string }): string {
  let id = '';
  commit((p) => {
    const c = createComp(opts);
    id = c.id;
    p.comps[c.id] = c;
    p.compOrder.push(c.id);
  });
  openComp(id);
  return id;
}

export function updateComp(id: string, patch: Partial<Omit<Comp, 'id' | 'layers'>>): void {
  commit((p) => {
    const c = p.comps[id];
    if (!c) return;
    const wasFull = c.workStart === 0 && c.workEnd >= c.duration - 1e-6;
    Object.assign(c, patch);
    c.width = clamp(Math.round(c.width), 1, 8192);
    c.height = clamp(Math.round(c.height), 1, 8192);
    c.fps = clamp(c.fps, 1, 240);
    c.duration = Math.max(1 / c.fps, snapToFrame(c.duration, c.fps));
    if (wasFull || c.workEnd > c.duration) c.workEnd = c.duration;
    c.workStart = clamp(c.workStart, 0, c.workEnd);
  });
  setTime(now());
}

export function deleteComp(id: string): void {
  const s = S();
  if (s.project.compOrder.length <= 1) {
    toast('A project needs at least one composition.');
    return;
  }
  commit((p) => {
    delete p.comps[id];
    p.compOrder = p.compOrder.filter((x) => x !== id);
    for (const c of Object.values(p.comps)) c.layers = c.layers.filter((l) => !(l.data.type === 'precomp' && l.data.compId === id));
  });
  const next = S();
  const openComps = next.openComps.filter((x) => x !== id);
  const activeCompId = next.activeCompId === id ? (openComps[0] ?? next.project.compOrder[0]) : next.activeCompId;
  if (!openComps.includes(activeCompId)) openComps.push(activeCompId);
  appStore.set({ openComps, activeCompId, selection: next.activeCompId === id ? [] : next.selection });
}

export function setWorkArea(start: number, end: number): void {
  const comp = activeComp();
  const a = clamp(snapToFrame(Math.min(start, end), comp.fps), 0, comp.duration);
  const b = clamp(snapToFrame(Math.max(start, end), comp.fps), 0, comp.duration);
  if (b - a < 1 / comp.fps) return;
  commit((p) => {
    const c = p.comps[comp.id];
    c.workStart = a;
    c.workEnd = b;
  });
}

/* ------------------------------------------------------------------ layers: create */

function insertLayer(build: (comp: Comp, project: Project) => Layer): string {
  const s = S();
  const compId = s.activeCompId;
  let newId = '';
  commit((p) => {
    const comp = p.comps[compId];
    const layer = build(comp, p);
    newId = layer.id;
    const idx = s.selection
      .map((id) => comp.layers.findIndex((l) => l.id === id))
      .filter((i) => i >= 0)
      .reduce((m, i) => Math.min(m, i), comp.layers.length);
    comp.layers.splice(idx === comp.layers.length ? 0 : idx, 0, layer);
  });
  appStore.set({ selection: [newId], selKeys: [] });
  return newId;
}

export function addSolid(o?: { name?: string; color?: RGB; width?: number; height?: number }): string {
  const t = now();
  return insertLayer((comp, p) =>
    createSolid({
      name: o?.name ?? `Solid ${nextCount(p, 'solid')}`,
      comp,
      time: t,
      color: o?.color ?? [86, 98, 190],
      width: o?.width ?? comp.width,
      height: o?.height ?? comp.height,
    }),
  );
}

export function addShape(shape: ShapeKind, size: Vec2, position?: Vec2): string {
  const t = now();
  const names = { rect: 'Rectangle', ellipse: 'Ellipse', polygon: 'Polygon', star: 'Star', path: 'Shape' } as const;
  return insertLayer((comp, p) =>
    createShape({ name: `${names[shape]} ${nextCount(p, 'shape')}`, comp, time: t, shape, size, position }),
  );
}

export function addText(text = 'Text', position?: Vec2): string {
  const t = now();
  return insertLayer((comp) => createText({ name: text, comp, time: t, text, position }));
}

export const addNull = (): string => {
  const t = now();
  return insertLayer((comp, p) => createNull({ name: `Null ${nextCount(p, 'null')}`, comp, time: t }));
};

export const addAdjustment = (): string => {
  const t = now();
  return insertLayer((comp, p) => createAdjustment({ name: `Adjustment Layer ${nextCount(p, 'adjustment')}`, comp, time: t }));
};

export function addFootageLayer(assetId: string, position?: Vec2): string | null {
  const a = S().project.assets[assetId];
  if (!a) return null;
  const t = now();
  return insertLayer((comp) => createImageLayer({ name: a.name, comp, time: t, assetId, width: a.width, height: a.height, position }));
}

export function addPrecompLayer(compId: string): string | null {
  const s = S();
  if (compId === s.activeCompId) {
    toast('A composition cannot contain itself.');
    return null;
  }
  if (containsComp(s.project, compId, s.activeCompId)) {
    toast('That would create a circular composition.');
    return null;
  }
  const t = now();
  return insertLayer((comp, p) => createPrecompLayer({ name: p.comps[compId].name, comp, time: t, compId, sub: p.comps[compId] }));
}

/** Does `inside` (transitively) contain a precomp of `target`? */
function containsComp(p: Project, inside: string, target: string, seen = new Set<string>()): boolean {
  if (seen.has(inside)) return false;
  seen.add(inside);
  const c = p.comps[inside];
  if (!c) return false;
  return c.layers.some((l) => l.data.type === 'precomp' && (l.data.compId === target || containsComp(p, l.data.compId, target, seen)));
}

/** Move the selected layers into a new composition and replace them with one precomp layer. */
export function precompose(ids: string[], name?: string): void {
  const s = S();
  const comp = activeComp(s);
  const chosen = comp.layers.filter((l) => ids.includes(l.id));
  if (!chosen.length) return;
  let precompLayerId = '';
  commit((p) => {
    const parent = p.comps[comp.id];
    const moving = parent.layers.filter((l) => ids.includes(l.id));
    const movingIds = new Set(moving.map((l) => l.id));
    const topIndex = parent.layers.findIndex((l) => movingIds.has(l.id));
    const sub = createComp({
      name: name ?? `${moving[0].name} Comp ${nextCount(p, 'precomp')}`,
      width: parent.width,
      height: parent.height,
      fps: parent.fps,
      duration: parent.duration,
      bg: parent.bg,
      motionBlur: parent.motionBlur,
      shutterAngle: parent.shutterAngle,
    });
    sub.layers = moving.map((l) => ({ ...l, parentId: l.parentId && movingIds.has(l.parentId) ? l.parentId : null }));
    p.comps[sub.id] = sub;
    p.compOrder.push(sub.id);
    parent.layers = parent.layers.filter((l) => !movingIds.has(l.id));
    for (const l of parent.layers) if (l.parentId && movingIds.has(l.parentId)) l.parentId = null;
    const pre = createPrecompLayer({ name: sub.name, comp: parent, time: 0, compId: sub.id, sub });
    precompLayerId = pre.id;
    parent.layers.splice(Math.min(topIndex, parent.layers.length), 0, pre);
  });
  appStore.set({ selection: [precompLayerId], selKeys: [] });
}

/* ------------------------------------------------------------------ layers: edit */

export function deleteLayers(ids: string[]): void {
  if (!ids.length) return;
  const compId = S().activeCompId;
  commit((p) => {
    const comp = p.comps[compId];
    const gone = new Set(ids);
    comp.layers = comp.layers.filter((l) => !gone.has(l.id));
    for (const l of comp.layers) if (l.parentId && gone.has(l.parentId)) l.parentId = null;
  });
  appStore.set({ selection: S().selection.filter((id) => !ids.includes(id)), selKeys: [] });
}

export function duplicateLayers(ids: string[]): void {
  const compId = S().activeCompId;
  const created: string[] = [];
  commit((p) => {
    const comp = p.comps[compId];
    const map = new Map<string, string>();
    const copies: { orig: Layer; copy: Layer }[] = [];
    for (const l of comp.layers.filter((x) => ids.includes(x.id))) {
      const copy = cloneLayer(l);
      copy.name = /\s\d+$/.test(l.name) ? l.name.replace(/\d+$/, (n) => String(Number(n) + 1)) : `${l.name} 2`;
      map.set(l.id, copy.id);
      copies.push({ orig: l, copy });
    }
    for (const { orig, copy } of copies) {
      if (orig.parentId && map.has(orig.parentId)) copy.parentId = map.get(orig.parentId)!;
      const idx = comp.layers.findIndex((x) => x.id === orig.id);
      comp.layers.splice(idx, 0, copy);
      created.push(copy.id);
    }
  });
  appStore.set({ selection: created, selKeys: [] });
}

type LayerFlags = Partial<Pick<Layer, 'name' | 'visible' | 'solo' | 'locked' | 'motionBlur' | 'label'>> & {
  blend?: BlendMode;
  matte?: MatteMode;
};

export function setLayerField(id: string, patch: LayerFlags): void {
  const compId = S().activeCompId;
  commit((p) => {
    const l = p.comps[compId].layers.find((x) => x.id === id);
    if (l) Object.assign(l, patch);
  });
}

export function updateLayerData(id: string, patch: Partial<LayerData>): void {
  const compId = S().activeCompId;
  commit((p) => {
    const l = p.comps[compId].layers.find((x) => x.id === id);
    if (!l) return;
    if (l.data.type === 'text' && 'text' in patch && l.name === l.data.text) l.name = String((patch as { text: string }).text);
    l.data = { ...l.data, ...patch } as LayerData;
  });
}

export function setParent(id: string, parentId: string | null): void {
  const compId = S().activeCompId;
  commit((p) => {
    const comp = p.comps[compId];
    const l = comp.layers.find((x) => x.id === id);
    if (!l) return;
    if (parentId) {
      // refuse cycles: the new parent must not be this layer or one of its descendants
      const byId = new Map(comp.layers.map((x) => [x.id, x]));
      for (let cur = byId.get(parentId), i = 0; cur && i < 64; cur = cur.parentId ? byId.get(cur.parentId) : undefined, i++) {
        if (cur.id === id) return;
      }
    }
    l.parentId = parentId;
  });
}

export function moveLayerToIndex(id: string, index: number): void {
  const compId = S().activeCompId;
  commit((p) => {
    const layers = p.comps[compId].layers;
    const from = layers.findIndex((l) => l.id === id);
    if (from < 0) return;
    const [l] = layers.splice(from, 1);
    layers.splice(clamp(index, 0, layers.length), 0, l);
  });
}

export function stackMove(ids: string[], where: 'up' | 'down' | 'top' | 'bottom'): void {
  const compId = S().activeCompId;
  commit((p) => {
    const layers = p.comps[compId].layers;
    const set = new Set(ids);
    if (where === 'top' || where === 'bottom') {
      const moved = layers.filter((l) => set.has(l.id));
      const rest = layers.filter((l) => !set.has(l.id));
      p.comps[compId].layers = where === 'top' ? [...moved, ...rest] : [...rest, ...moved];
      return;
    }
    if (where === 'up') {
      for (let i = 1; i < layers.length; i++) if (set.has(layers[i].id) && !set.has(layers[i - 1].id)) [layers[i - 1], layers[i]] = [layers[i], layers[i - 1]];
    } else {
      for (let i = layers.length - 2; i >= 0; i--) if (set.has(layers[i].id) && !set.has(layers[i + 1].id)) [layers[i + 1], layers[i]] = [layers[i], layers[i + 1]];
    }
  });
}

/* ------------------------------------------------------------------ layers: timing */

/** Slide layers (and their keyframes) in time by dt seconds. */
export function moveLayersInTime(ids: string[], dt: number): void {
  if (Math.abs(dt) < 1e-9) return;
  const compId = S().activeCompId;
  commit((p) => {
    for (const l of p.comps[compId].layers) if (ids.includes(l.id)) shiftLayer(l, dt);
  });
}

export function trimLayer(id: string, edge: 'in' | 'out', t: number): void {
  const compId = S().activeCompId;
  commit((p) => {
    const comp = p.comps[compId];
    const l = comp.layers.find((x) => x.id === id);
    if (!l) return;
    const frame = 1 / comp.fps;
    if (edge === 'in') l.inPoint = clamp(snapToFrame(t, comp.fps), 0, l.outPoint - frame);
    else l.outPoint = clamp(snapToFrame(t, comp.fps), l.inPoint + frame, Math.max(comp.duration, l.outPoint));
  });
}

/* ------------------------------------------------------------------ properties & keyframes */

export function setPropValue(layerId: string, group: PropGroup, key: string, value: PropValue, at = now()): void {
  const compId = S().activeCompId;
  commit((p) => {
    const comp = p.comps[compId];
    const l = comp.layers.find((x) => x.id === layerId);
    const prop = l && resolveProp(l, group, key);
    if (!prop) return;
    if (prop.keys.length) setKeyAt(prop, at, value, keyTol(comp));
    else prop.value = Array.isArray(value) ? [...value] : value;
  });
}

export function toggleStopwatch(layerId: string, group: PropGroup, key: string): void {
  const compId = S().activeCompId;
  const t = now();
  commit((p) => {
    const l = p.comps[compId].layers.find((x) => x.id === layerId);
    const prop = l && resolveProp(l, group, key);
    if (prop) setAnimated(prop, prop.keys.length === 0, t);
  });
}

/** The ◆ button: add a keyframe at the playhead holding the current value, or remove the one there. */
export function toggleKeyHere(layerId: string, group: PropGroup, key: string): void {
  const compId = S().activeCompId;
  const t = now();
  commit((p) => {
    const comp = p.comps[compId];
    const l = comp.layers.find((x) => x.id === layerId);
    const prop = l && resolveProp(l, group, key);
    if (!prop) return;
    const near = prop.keys.find((k) => Math.abs(k.t - t) <= keyTol(comp));
    if (!prop.keys.length) setAnimated(prop, true, t);
    else if (near) {
      if (prop.keys.length === 1) setAnimated(prop, false, t);
      else prop.keys = prop.keys.filter((k) => k !== near);
    } else setKeyAt(prop, t, evalProp(prop, t), keyTol(comp));
  });
}

export function deleteKeys(ids: string[]): void {
  if (!ids.length) return;
  const compId = S().activeCompId;
  const gone = new Set(ids);
  const t = now();
  commit((p) => {
    for (const l of p.comps[compId].layers) {
      for (const prop of layerProps(l)) {
        if (!prop.keys.some((k) => gone.has(k.id))) continue;
        const before = baseValue(prop, t);
        prop.keys = prop.keys.filter((k) => !gone.has(k.id));
        if (!prop.keys.length) {
          prop.value = Array.isArray(before) ? [...before] : before;
          delete prop.loop;
        }
      }
    }
  });
  appStore.set({ selKeys: [] });
}

export function moveKeys(ids: string[], dt: number): void {
  if (Math.abs(dt) < 1e-9) return;
  const compId = S().activeCompId;
  commit((p) => {
    const comp = p.comps[compId];
    const sel = new Set(ids);
    for (const l of comp.layers) {
      for (const prop of layerProps(l)) {
        let touched = false;
        for (const k of prop.keys) {
          if (sel.has(k.id)) {
            k.t = clamp(k.t + dt, 0, comp.duration);
            touched = true;
          }
        }
        if (touched) sortKeys(prop);
      }
    }
  });
}

export function setKeysEase(ids: string[], ease: Ease): void {
  const compId = S().activeCompId;
  const sel = new Set(ids);
  commit((p) => {
    for (const l of p.comps[compId].layers) for (const prop of layerProps(l)) for (const k of prop.keys) if (sel.has(k.id)) k.ease = ease;
  });
}

export function setWiggle(layerId: string, group: PropGroup, key: string, wiggle: Wiggle | null): void {
  const compId = S().activeCompId;
  commit((p) => {
    const l = p.comps[compId].layers.find((x) => x.id === layerId);
    const prop = l && resolveProp(l, group, key);
    if (!prop) return;
    if (wiggle) prop.wiggle = wiggle;
    else delete prop.wiggle;
  });
}

export function setLoop(layerId: string, group: PropGroup, key: string, loop: 'cycle' | 'pingpong' | null): void {
  const compId = S().activeCompId;
  commit((p) => {
    const l = p.comps[compId].layers.find((x) => x.id === layerId);
    const prop = l && resolveProp(l, group, key);
    if (!prop) return;
    if (loop) prop.loop = loop;
    else delete prop.loop;
  });
}

export function setPropLink(layerId: string, group: PropGroup, key: string, link: boolean): void {
  const compId = S().activeCompId;
  commit((p) => {
    const l = p.comps[compId].layers.find((x) => x.id === layerId);
    const prop = l && resolveProp(l, group, key);
    if (prop) prop.link = link;
  });
}

/* ------------------------------------------------------------------ effects */

export function addEffect(layerIds: string[], type: string): void {
  const compId = S().activeCompId;
  commit((p) => {
    const comp = p.comps[compId];
    for (const l of comp.layers) {
      if (!layerIds.includes(l.id)) continue;
      const fx = createEffect(type, comp);
      if (fx) l.effects.push(fx);
    }
  });
  if (layerIds.length) appStore.set({ rightTab: 'controls' });
}

export function removeEffect(layerId: string, effectId: string): void {
  const compId = S().activeCompId;
  commit((p) => {
    const l = p.comps[compId].layers.find((x) => x.id === layerId);
    if (l) l.effects = l.effects.filter((e) => e.id !== effectId);
  });
}

export function setEffectEnabled(layerId: string, effectId: string, enabled: boolean): void {
  const compId = S().activeCompId;
  commit((p) => {
    const fx = p.comps[compId].layers.find((x) => x.id === layerId)?.effects.find((e) => e.id === effectId);
    if (fx) fx.enabled = enabled;
  });
}

export function moveEffect(layerId: string, effectId: string, dir: -1 | 1): void {
  const compId = S().activeCompId;
  commit((p) => {
    const l = p.comps[compId].layers.find((x) => x.id === layerId);
    if (!l) return;
    const i = l.effects.findIndex((e) => e.id === effectId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= l.effects.length) return;
    [l.effects[i], l.effects[j]] = [l.effects[j], l.effects[i]];
  });
}

/* ------------------------------------------------------------------ footage */

export async function importFiles(files: File[]): Promise<string[]> {
  const ids: string[] = [];
  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      toast(`"${file.name}" is not an image — only images can be imported.`);
      continue;
    }
    try {
      const url = await readFileAsDataUrl(file);
      const { width, height } = await imageSize(url);
      const id = uid('asset');
      await setAssetData(id, url);
      commit((p) => {
        p.assets[id] = { id, name: file.name, kind: 'image', width, height };
        p.assetOrder.push(id);
      });
      ids.push(id);
    } catch {
      toast(`Could not import "${file.name}".`);
    }
  }
  appStore.set({ assetVersion: S().assetVersion + 1 });
  return ids;
}

export function deleteAsset(id: string): void {
  commit((p) => {
    delete p.assets[id];
    p.assetOrder = p.assetOrder.filter((x) => x !== id);
    for (const c of Object.values(p.comps)) c.layers = c.layers.filter((l) => !(l.data.type === 'image' && l.data.assetId === id));
  });
}

/* ------------------------------------------------------------------ project files */

export function loadProjectInto(project: Project, assets: Record<string, string>, fileName: string): Promise<void[]> {
  pause();
  clearAssets();
  resetHistory();
  const first = project.compOrder[0];
  appStore.set({
    project,
    fileName,
    dirty: false,
    openComps: [first],
    activeCompId: first,
    selection: [],
    selKeys: [],
    expanded: {},
    showOnly: {},
    zoom: 'fit',
    panX: 0,
    panY: 0,
  });
  timeStore.set({ t: 0 });
  return Promise.all(Object.entries(assets).map(([id, url]) => setAssetData(id, url))).then((r) => {
    appStore.set({ assetVersion: S().assetVersion + 1 });
    return r;
  });
}

export function newProject(): void {
  void loadProjectInto(createProject(), {}, 'Untitled.kfs');
}

export async function openProjectText(text: string, fileName: string): Promise<boolean> {
  try {
    const { project, assets } = parseProject(text);
    await loadProjectInto(project, assets, fileName);
    return true;
  } catch (e) {
    toast(isProjectFileError(e) ? e.message : 'Could not open that file.');
    return false;
  }
}

export function saveProjectFile(): void {
  const s = S();
  const text = serializeProject(s.project, allAssetData());
  const name = s.fileName.endsWith('.kfs') ? s.fileName : `${s.fileName.replace(/\.[^.]+$/, '')}.kfs`;
  downloadBlob(new Blob([text], { type: 'application/json' }), name);
  appStore.set({ dirty: false, fileName: name });
  toast(`Saved ${name}`);
}

/* ------------------------------------------------------------------ viewer helpers */

export function nudgeSelection(dx: number, dy: number): void {
  const s = S();
  const comp = activeComp(s);
  const t = now();
  commit((p) => {
    const c = p.comps[comp.id];
    for (const l of c.layers) {
      if (!s.selection.includes(l.id)) continue;
      const pos = evalProp(l.transform.position, t) as number[];
      const v: Vec2 = [pos[0] + dx, pos[1] + dy];
      if (l.transform.position.keys.length) setKeyAt(l.transform.position, t, v, keyTol(comp));
      else l.transform.position.value = v;
    }
  });
}

export interface PropUpdate {
  layerId: string;
  group: PropGroup;
  key: string;
  value: PropValue;
}

/** Several property writes as one undo step (used by viewer drags that touch many layers). */
export function setManyProps(updates: PropUpdate[], at = now()): void {
  const compId = S().activeCompId;
  commit((p) => {
    const comp = p.comps[compId];
    for (const u of updates) {
      const l = comp.layers.find((x) => x.id === u.layerId);
      const prop = l && resolveProp(l, u.group, u.key);
      if (!prop) continue;
      if (prop.keys.length) setKeyAt(prop, at, u.value, keyTol(comp));
      else prop.value = Array.isArray(u.value) ? [...u.value] : u.value;
    }
  });
}

/* ------------------------------------------------------------------ clipboard */

interface ClipKeys {
  kind: 'keys';
  items: { path: string; valueKind: Prop['kind']; keys: { dt: number; v: PropValue; ease: Ease }[] }[];
}
interface ClipLayers {
  kind: 'layers';
  layers: Layer[];
}
let clipboard: ClipKeys | ClipLayers | null = null;

export const hasClipboard = (): boolean => clipboard !== null;

/** Ctrl+C: selected keyframes if any, otherwise selected layers. */
export function copySelection(): boolean {
  const s = S();
  const comp = activeComp(s);
  if (s.selKeys.length) {
    const sel = new Set(s.selKeys);
    const raw: { path: string; valueKind: Prop['kind']; keys: Keyframe[] }[] = [];
    let t0 = Infinity;
    for (const l of comp.layers) {
      for (const { group, key, prop } of layerPropEntries(l)) {
        const ks = prop.keys.filter((k) => sel.has(k.id));
        if (!ks.length) continue;
        raw.push({ path: `${group}/${key}`, valueKind: prop.kind, keys: ks });
        t0 = Math.min(t0, ks[0].t);
      }
    }
    clipboard = {
      kind: 'keys',
      items: raw.map((r) => ({
        path: r.path,
        valueKind: r.valueKind,
        keys: r.keys.map((k) => ({ dt: k.t - t0, v: structuredClone(k.v), ease: structuredClone(k.ease) })),
      })),
    };
    toast(`Copied ${s.selKeys.length} keyframe${s.selKeys.length === 1 ? '' : 's'}`);
    return true;
  }
  if (s.selection.length) {
    clipboard = { kind: 'layers', layers: comp.layers.filter((l) => s.selection.includes(l.id)).map((l) => structuredClone(l)) };
    toast(`Copied ${clipboard.layers.length} layer${clipboard.layers.length === 1 ? '' : 's'}`);
    return true;
  }
  return false;
}

export function cutSelection(): void {
  const s = S();
  if (!copySelection()) return;
  if (s.selKeys.length) deleteKeys(s.selKeys);
  else deleteLayers(s.selection);
}

/** Ctrl+V: layers land at the playhead; keyframes paste onto the selected layer's matching properties. */
export function pasteClipboard(): void {
  const s = S();
  const comp = activeComp(s);
  const t = now();
  if (!clipboard) return void toast('Nothing to paste — copy layers or keyframes first.');
  if (clipboard.kind === 'layers') {
    const source = clipboard.layers;
    const created: string[] = [];
    commit((p) => {
      const c = p.comps[comp.id];
      const idMap = new Map<string, string>();
      const copies = source.map((l) => {
        const copy = cloneLayer(l);
        idMap.set(l.id, copy.id);
        return copy;
      });
      const dt = snapToFrame(t - Math.min(...source.map((l) => l.inPoint)), comp.fps);
      for (const copy of copies) {
        copy.parentId = copy.parentId && idMap.has(copy.parentId) ? idMap.get(copy.parentId)! : null;
        shiftLayer(copy, dt);
      }
      const idx = s.selection.map((id) => c.layers.findIndex((l) => l.id === id)).filter((i) => i >= 0).reduce((m, i) => Math.min(m, i), 0);
      c.layers.splice(idx, 0, ...copies);
      created.push(...copies.map((x) => x.id));
    });
    appStore.set({ selection: created, selKeys: [] });
    return;
  }
  const target = comp.layers.find((l) => l.id === s.selection[0]);
  if (!target) return void toast('Select a layer to paste keyframes onto.');
  const items = clipboard.items;
  let pasted = 0;
  const newIds: string[] = [];
  commit((p) => {
    const layer = p.comps[comp.id].layers.find((l) => l.id === target.id)!;
    for (const item of items) {
      const [group, key] = [item.path.slice(0, item.path.indexOf('/')), item.path.slice(item.path.indexOf('/') + 1)];
      const prop = resolveProp(layer, group as PropGroup, key);
      if (!prop || prop.kind !== item.valueKind) continue;
      for (const k of item.keys) {
        const nk = setKeyAt(prop, snapToFrame(t + k.dt, comp.fps), k.v, keyTol(comp), k.ease);
        nk.ease = structuredClone(k.ease);
        newIds.push(nk.id);
        pasted++;
      }
    }
  });
  if (!pasted) toast('The selected layer has no matching properties for those keyframes.');
  else appStore.set({ selKeys: newIds });
}

/* ------------------------------------------------------------------ more layer operations */

/** Ctrl+Shift+D: cut each selected layer in two at the playhead. */
export function splitLayers(ids: string[], at = now()): void {
  const comp = activeComp();
  const created: string[] = [];
  commit((p) => {
    const c = p.comps[comp.id];
    for (const id of ids) {
      const i = c.layers.findIndex((l) => l.id === id);
      const l = c.layers[i];
      if (!l || !(at > l.inPoint + 1e-6 && at < l.outPoint - 1e-6)) continue;
      const copy = cloneLayer(l);
      copy.name = /\s\d+$/.test(l.name) ? l.name.replace(/\d+$/, (n) => String(Number(n) + 1)) : `${l.name} 2`;
      copy.inPoint = at;
      l.outPoint = at;
      c.layers.splice(i, 0, copy);
      created.push(copy.id);
    }
  });
  if (created.length) appStore.set({ selection: created, selKeys: [] });
  else toast('Move the playhead inside a selected layer to split it.');
}

/** Lay selected layers end to end, in the order they were selected. */
export function sequenceLayers(ids: string[]): void {
  if (ids.length < 2) return void toast('Select two or more layers to sequence.');
  const comp = activeComp();
  commit((p) => {
    const c = p.comps[comp.id];
    let cursor: number | null = null;
    for (const id of ids) {
      const l = c.layers.find((x) => x.id === id);
      if (!l) continue;
      if (cursor !== null) shiftLayer(l, cursor - l.inPoint);
      cursor = l.outPoint;
    }
  });
}

/* ------------------------------------------------------------------ keyframe interpolation */

export type EaseMode = 'both' | 'in' | 'out' | 'linear' | 'hold';

type Bez = [number, number, number, number];
/** A bezier to edit: real curves are copied; linear and named curves start from a straight line; hold has none. */
const asBezier = (e: Ease): Bez | null => (e === 'hold' ? null : Array.isArray(e) ? [e[0], e[1], e[2], e[3]] : [1 / 3, 1 / 3, 2 / 3, 2 / 3]);

/**
 * AE-style keyframe assistant. A keyframe's "out" influence lives on the segment leaving it and its
 * "in" influence on the segment arriving, so Easy Ease touches both neighbouring segments.
 */
export function applyKeyEase(ids: string[], mode: EaseMode): void {
  if (!ids.length) return;
  const sel = new Set(ids);
  const compId = S().activeCompId;
  commit((p) => {
    for (const l of p.comps[compId].layers) {
      for (const prop of layerProps(l)) {
        const ks = prop.keys;
        ks.forEach((k, i) => {
          if (!sel.has(k.id)) return;
          const leaving = i < ks.length - 1;
          const arriving = i > 0;
          if (mode === 'linear') {
            if (leaving) k.ease = 'linear';
            if (arriving && ks[i - 1].ease !== 'hold') ks[i - 1].ease = 'linear';
          } else if (mode === 'hold') {
            if (leaving) k.ease = 'hold';
          } else {
            if (leaving && (mode === 'both' || mode === 'out')) {
              // easing a Hold keyframe turns it into an eased one, as in AE
              const b = k.ease === 'hold' ? ([1 / 3, 1 / 3, 2 / 3, 2 / 3] as Bez) : asBezier(k.ease);
              if (b) {
                b[0] = 0.33;
                b[1] = 0;
                k.ease = b;
              }
            }
            if (arriving && (mode === 'both' || mode === 'in')) {
              const b = asBezier(ks[i - 1].ease);
              if (b) {
                b[2] = 0.67;
                b[3] = 1;
                ks[i - 1].ease = b;
              }
            }
          }
        });
      }
    }
  });
}

/** Set one keyframe's outgoing bezier (used by the easing editor). */
export function setKeyBezier(id: string, b: Bez): void {
  setKeysEase([id], b);
}

export function timeReverseKeys(ids: string[]): void {
  const sel = new Set(ids);
  const compId = S().activeCompId;
  commit((p) => {
    for (const l of p.comps[compId].layers) {
      for (const prop of layerProps(l)) {
        const picked = prop.keys.filter((k) => sel.has(k.id));
        if (picked.length < 2) continue;
        const t0 = picked[0].t;
        const t1 = picked[picked.length - 1].t;
        const snapshot = picked.map((k) => ({ t: k.t, v: k.v, ease: k.ease, sIn: k.sIn, sOut: k.sOut }));
        const m = picked.length;
        picked.forEach((k, j) => {
          const src = snapshot[m - 1 - j];
          k.t = t0 + t1 - src.t;
          k.v = src.v;
          // a reversed path swaps which tangent arrives and which leaves
          const [sIn, sOut] = [src.sOut, src.sIn];
          if (sIn) k.sIn = sIn;
          else delete k.sIn;
          if (sOut) k.sOut = sOut;
          else delete k.sOut;
          const seg = snapshot[m - 2 - j]?.ease;
          if (seg === undefined) k.ease = 'linear';
          else if (seg === 'hold' || seg === 'linear') k.ease = seg;
          else if (typeof seg === 'string') k.ease = NAMED_EASE_REVERSE[seg];
          else k.ease = [1 - seg[2], 1 - seg[3], 1 - seg[0], 1 - seg[1]];
        });
        sortKeys(prop);
      }
    }
  });
}

/* ------------------------------------------------------------------ anchor point (pan behind) */

export function setAnchorKeepingPlace(layerId: string, anchor: Vec2, position: Vec2): void {
  setManyProps([
    { layerId, group: 'transform', key: 'anchor', value: anchor },
    { layerId, group: 'transform', key: 'position', value: position },
  ]);
}

/* ------------------------------------------------------------------ paths & masks */

/** A freeform bezier shape layer from a path in composition coordinates. */
export function addPathShape(path: number[], closed: boolean): string {
  const t = now();
  return insertLayer((comp, p) => createPathShape({ name: `Shape ${nextCount(p, 'shape')}`, comp, time: t, path, closed }));
}

/** Add a mask to a layer. `path` is in the layer's own coordinate space. */
export function addMask(layerId: string, path: number[], mode: MaskMode = 'add'): string {
  const compId = S().activeCompId;
  let id = '';
  commit((p) => {
    const l = p.comps[compId].layers.find((x) => x.id === layerId);
    if (!l) return;
    const m = createMask(path, `Mask ${l.masks.length + 1}`, mode);
    id = m.id;
    l.masks.push(m);
  });
  if (id) appStore.set({ activeMask: id, selVertex: null });
  return id;
}

/** A starter rectangular or elliptical mask covering the layer's bounds. */
export function addStarterMask(layerId: string, kind: 'rect' | 'ellipse'): void {
  const s = S();
  const layer = activeComp(s).layers.find((l) => l.id === layerId);
  const b = layer && localBounds(s.project, layer, now());
  if (!layer || !b) return void toast('That layer has nothing to mask.');
  addMask(layerId, starterMaskPath(kind, b.x, b.y, b.w, b.h));
}

export function removeMask(layerId: string, maskId: string): void {
  const compId = S().activeCompId;
  commit((p) => {
    const l = p.comps[compId].layers.find((x) => x.id === layerId);
    if (l) l.masks = l.masks.filter((m) => m.id !== maskId);
  });
  if (S().activeMask === maskId) appStore.set({ activeMask: null, selVertex: null });
}

export function setMaskField(layerId: string, maskId: string, patch: { mode?: MaskMode; inverted?: boolean; name?: string }): void {
  const compId = S().activeCompId;
  commit((p) => {
    const m = p.comps[compId].layers.find((x) => x.id === layerId)?.masks.find((x) => x.id === maskId);
    if (m) Object.assign(m, patch);
  });
}

function mapPath(prop: { value: PropValue; keys: Keyframe[] }, fn: (v: number[]) => number[]): void {
  prop.value = fn(prop.value as number[]);
  for (const k of prop.keys) k.v = fn(k.v as number[]);
}

/** Split a path segment, adding the same vertex to every keyframe so the shapes stay compatible. */
export function insertPathVertex(layerId: string, group: PropGroup, key: string, seg: number, u: number, closed: boolean): void {
  const compId = S().activeCompId;
  commit((p) => {
    const l = p.comps[compId].layers.find((x) => x.id === layerId);
    const prop = l && resolveProp(l, group, key);
    if (prop) mapPath(prop, (v) => insertVertex(v, seg, u, closed));
  });
  appStore.set({ selVertex: seg + 1 });
}

export function removePathVertex(layerId: string, group: PropGroup, key: string, index: number): void {
  const compId = S().activeCompId;
  commit((p) => {
    const l = p.comps[compId].layers.find((x) => x.id === layerId);
    const prop = l && resolveProp(l, group, key);
    if (prop) mapPath(prop, (v) => removeVertex(v, index));
  });
  appStore.set({ selVertex: null });
}

/* ------------------------------------------------------------------ spatial motion paths */

/** Auto-bezier: curve the motion path smoothly through the selected position keyframes. */
export function smoothMotionPath(ids: string[]): void {
  const sel = new Set(ids);
  const compId = S().activeCompId;
  commit((p) => {
    for (const l of p.comps[compId].layers) {
      for (const prop of layerProps(l)) {
        if (prop.kind !== 'vec2' || prop.keys.length < 3) continue;
        const ks = prop.keys;
        ks.forEach((k, i) => {
          if (!sel.has(k.id) || i === 0 || i === ks.length - 1) return;
          const a = ks[i - 1].v as number[];
          const b = ks[i + 1].v as number[];
          const tx = (b[0] - a[0]) / 6;
          const ty = (b[1] - a[1]) / 6;
          k.sIn = [-tx, -ty];
          k.sOut = [tx, ty];
        });
      }
    }
  });
}

export function clearMotionPathCurves(ids: string[]): void {
  const sel = new Set(ids);
  const compId = S().activeCompId;
  commit((p) => {
    for (const l of p.comps[compId].layers) for (const prop of layerProps(l)) for (const k of prop.keys) if (sel.has(k.id)) {
      delete k.sIn;
      delete k.sOut;
    }
  });
}

/** Set a keyframe's value (and optionally its motion-path tangents) without changing its time. */
export function setKeyframeSpatial(keyId: string, patch: { v?: Vec2; sIn?: Vec2 | null; sOut?: Vec2 | null }): void {
  const compId = S().activeCompId;
  commit((p) => {
    const found = findKey(p.comps[compId].layers, keyId);
    if (!found) return;
    const k = found.prop.keys[found.index];
    if (patch.v) k.v = [...patch.v];
    if (patch.sIn !== undefined) {
      if (patch.sIn) k.sIn = [...patch.sIn];
      else delete k.sIn;
    }
    if (patch.sOut !== undefined) {
      if (patch.sOut) k.sOut = [...patch.sOut];
      else delete k.sOut;
    }
  });
}

/** Apply an easing curve to the selected keyframes, or — with none selected — to every keyframe on the selected layers. */
export function applyEasePreset(ease: Ease): number {
  const s = S();
  const comp = activeComp(s);
  let count = 0;
  const ids = new Set(s.selKeys);
  const targetLayers = new Set(s.selection);
  if (!ids.size && !targetLayers.size) {
    toast('Select keyframes (or a layer) first, then pick an easing curve.');
    return 0;
  }
  commit((p) => {
    for (const l of p.comps[comp.id].layers) {
      if (!ids.size && !targetLayers.has(l.id)) continue;
      for (const prop of layerProps(l)) {
        prop.keys.forEach((k, i) => {
          if (i === prop.keys.length - 1) return; // the last keyframe has no segment leaving it
          if (ids.size ? ids.has(k.id) : true) {
            k.ease = typeof ease === 'object' ? [...ease] : ease;
            count++;
          }
        });
      }
    }
  });
  toast(count ? `Applied to ${count} keyframe${count === 1 ? '' : 's'}` : 'Nothing to ease — keyframes need a following keyframe.');
  return count;
}

/* ------------------------------------------------------------------ text animators */

export function addTextAnimator(layerId: string, kind: AnimatorKind = 'blank'): string {
  const compId = S().activeCompId;
  let id = '';
  commit((p) => {
    const l = p.comps[compId].layers.find((x) => x.id === layerId);
    if (!l || l.data.type !== 'text') return;
    const a = createAnimator(`Animator ${l.animators.length + 1}`, kind);
    id = a.id;
    l.animators.push(a);
  });
  if (!id) toast('Text animators work on text layers.');
  return id;
}

export function removeTextAnimator(layerId: string, animatorId: string): void {
  const compId = S().activeCompId;
  commit((p) => {
    const l = p.comps[compId].layers.find((x) => x.id === layerId);
    if (l) l.animators = l.animators.filter((a) => a.id !== animatorId);
  });
}
