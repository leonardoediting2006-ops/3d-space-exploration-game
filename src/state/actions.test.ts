import { beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '../core/factory';
import { baseValue, setKeyAt } from '../core/interp';
import { apply } from '../core/math';
import { worldMatrix, layerMap, localMatrix } from '../render/geometry';
import * as A from './actions';
import { activeComp, appStore, beginGesture, endGesture, redo, resetHistory, timeStore, undo } from './store';

// The store and actions run in Node here; playback is the only part that needs a frame scheduler.
globalThis.requestAnimationFrame ??= (() => 0) as typeof requestAnimationFrame;
globalThis.cancelAnimationFrame ??= (() => undefined) as typeof cancelAnimationFrame;

function reset(): void {
  const project = createProject();
  const id = project.compOrder[0];
  appStore.set({ project, activeCompId: id, openComps: [id], selection: [], selKeys: [], dirty: false });
  timeStore.set({ t: 0 });
  resetHistory();
}

const layers = () => activeComp().layers;

beforeEach(reset);

describe('layers', () => {
  it('adds layers on top and selects the new one', () => {
    const a = A.addSolid({ name: 'A' });
    const b = A.addSolid({ name: 'B' });
    expect(layers().map((l) => l.name)).toEqual(['B', 'A']);
    expect(appStore.get().selection).toEqual([b]);
    expect(layers()[1].id).toBe(a);
  });

  it('inserts new layers above the selected one', () => {
    const a = A.addSolid({ name: 'A' });
    A.addSolid({ name: 'B' });
    A.selectLayers([a]);
    A.addSolid({ name: 'C' });
    expect(layers().map((l) => l.name)).toEqual(['B', 'C', 'A']);
  });

  it('undo and redo walk the history', () => {
    A.addSolid({ name: 'A' });
    A.addSolid({ name: 'B' });
    undo();
    expect(layers().map((l) => l.name)).toEqual(['A']);
    undo();
    expect(layers()).toHaveLength(0);
    redo();
    expect(layers().map((l) => l.name)).toEqual(['A']);
  });

  it('a gesture collapses into a single undo step', () => {
    const id = A.addSolid({ name: 'A' });
    const before = appStore.get().undoCount;
    beginGesture();
    for (let i = 1; i <= 20; i++) A.setPropValue(id, 'transform', 'rotation', i);
    endGesture();
    expect(appStore.get().undoCount).toBe(before + 1);
    expect(layers()[0].transform.rotation.value).toBe(20);
    undo();
    expect(layers()[0].transform.rotation.value).toBe(0);
  });

  it('an empty gesture leaves no undo step behind', () => {
    A.addSolid({ name: 'A' });
    const before = appStore.get().undoCount;
    beginGesture();
    endGesture();
    expect(appStore.get().undoCount).toBe(before);
  });

  it('refuses parenting cycles', () => {
    const a = A.addSolid({ name: 'A' });
    const b = A.addSolid({ name: 'B' });
    A.setParent(a, b);
    A.setParent(b, a);
    expect(layers().find((l) => l.id === a)!.parentId).toBe(b);
    expect(layers().find((l) => l.id === b)!.parentId).toBeNull();
  });

  it('deleting a parent releases its children', () => {
    const a = A.addSolid({ name: 'A' });
    const b = A.addSolid({ name: 'B' });
    A.setParent(a, b);
    A.deleteLayers([b]);
    expect(layers()[0].parentId).toBeNull();
  });

  it('duplicating remaps parents within the duplicated set', () => {
    const parent = A.addNull();
    const child = A.addSolid({ name: 'child' });
    A.setParent(child, parent);
    A.duplicateLayers([parent, child]);
    const ls = layers();
    expect(ls).toHaveLength(4);
    const copies = ls.filter((l) => appStore.get().selection.includes(l.id));
    const copyChild = copies.find((l) => l.name.startsWith('child'))!;
    const copyParent = copies.find((l) => l.type === 'null')!;
    expect(copyChild.parentId).toBe(copyParent.id);
    expect(copyParent.id).not.toBe(parent);
  });

  it('moving a layer in time carries its keyframes', () => {
    const id = A.addSolid({ name: 'A' });
    A.toggleStopwatch(id, 'transform', 'opacity');
    A.setPropValue(id, 'transform', 'opacity', 0, 0);
    A.setPropValue(id, 'transform', 'opacity', 100, 1);
    A.moveLayersInTime([id], 2);
    const l = layers()[0];
    expect(l.inPoint).toBe(2);
    expect(l.transform.opacity.keys.map((k) => k.t)).toEqual([2, 3]);
  });

  it('trim never inverts the layer', () => {
    const id = A.addSolid({ name: 'A' });
    A.trimLayer(id, 'in', 99);
    const l = layers()[0];
    expect(l.inPoint).toBeLessThan(l.outPoint);
  });

  it('splits a layer at the playhead into two contiguous halves', () => {
    const id = A.addSolid({ name: 'A' });
    A.splitLayers([id], 4);
    const [top, bottom] = layers();
    expect(bottom.outPoint).toBe(4);
    expect(top.inPoint).toBe(4);
    expect(top.outPoint).toBe(10);
    expect(top.id).not.toBe(bottom.id);
  });

  it('sequences layers end to end in selection order', () => {
    const a = A.addSolid({ name: 'A' });
    const b = A.addSolid({ name: 'B' });
    A.trimLayer(a, 'out', 2);
    A.trimLayer(b, 'out', 3);
    A.sequenceLayers([a, b]);
    const lb = layers().find((l) => l.id === b)!;
    expect(lb.inPoint).toBe(2);
    expect(lb.outPoint).toBe(5);
  });

  it('precompose moves layers into a new composition', () => {
    const a = A.addSolid({ name: 'A' });
    const b = A.addSolid({ name: 'B' });
    A.precompose([a, b]);
    const p = appStore.get().project;
    expect(p.compOrder).toHaveLength(2);
    expect(layers()).toHaveLength(1);
    expect(layers()[0].data.type).toBe('precomp');
    const sub = p.comps[(layers()[0].data as { compId: string }).compId];
    expect(sub.layers.map((l) => l.name)).toEqual(['B', 'A']);
  });

  it('will not nest a composition inside itself, directly or indirectly', () => {
    const first = appStore.get().activeCompId;
    const second = A.newComp({ name: 'Second' });
    expect(A.addPrecompLayer(first)).toBeTruthy(); // second contains first
    A.openComp(first);
    expect(A.addPrecompLayer(second)).toBeNull(); // would make first contain second contain first
    expect(A.addPrecompLayer(first)).toBeNull(); // itself
  });
});

describe('keyframes', () => {
  it('stopwatch + value edits create and update keyframes at the playhead', () => {
    const id = A.addSolid({ name: 'A' });
    timeStore.set({ t: 1 });
    A.toggleStopwatch(id, 'transform', 'rotation');
    expect(layers()[0].transform.rotation.keys).toHaveLength(1);
    timeStore.set({ t: 2 });
    A.setPropValue(id, 'transform', 'rotation', 90);
    expect(layers()[0].transform.rotation.keys.map((k) => k.t)).toEqual([1, 2]);
    A.setPropValue(id, 'transform', 'rotation', 45);
    expect(layers()[0].transform.rotation.keys).toHaveLength(2);
    expect(layers()[0].transform.rotation.keys[1].v).toBe(45);
  });

  it('toggleKeyHere adds and removes the keyframe at the playhead', () => {
    const id = A.addSolid({ name: 'A' });
    A.toggleStopwatch(id, 'transform', 'rotation');
    timeStore.set({ t: 1 });
    A.toggleKeyHere(id, 'transform', 'rotation');
    expect(layers()[0].transform.rotation.keys).toHaveLength(2);
    A.toggleKeyHere(id, 'transform', 'rotation');
    expect(layers()[0].transform.rotation.keys).toHaveLength(1);
  });

  it('deleting every keyframe keeps the value instead of snapping back', () => {
    const id = A.addSolid({ name: 'A' });
    A.toggleStopwatch(id, 'transform', 'rotation');
    timeStore.set({ t: 2 });
    A.setPropValue(id, 'transform', 'rotation', 80);
    const ids = layers()[0].transform.rotation.keys.map((k) => k.id);
    A.deleteKeys(ids);
    const r = layers()[0].transform.rotation;
    expect(r.keys).toHaveLength(0);
    expect(r.value).toBe(80);
  });

  it('Easy Ease softens both sides of a middle keyframe and leaves the ends alone', () => {
    const id = A.addSolid({ name: 'A' });
    const l = layers()[0];
    for (const [t, v] of [[0, 0], [1, 50], [2, 100]] as const) setKeyAt(l.transform.rotation, t, v, 1e-3);
    appStore.set({ project: structuredClone(appStore.get().project) });
    const keys = layers()[0].transform.rotation.keys;
    A.applyKeyEase([keys[1].id], 'both');
    const k = layers()[0].transform.rotation.keys;
    const arriving = k[0].ease as number[]; // segment 0→1 ends at the eased keyframe: slow finish
    expect(arriving[2]).toBeCloseTo(0.67);
    expect(arriving[3]).toBe(1);
    expect(arriving[0]).toBeCloseTo(1 / 3); // its own start is untouched
    const leaving = k[1].ease as number[]; // segment 1→2 starts at the eased keyframe: slow start
    expect(leaving[0]).toBeCloseTo(0.33);
    expect(leaving[1]).toBe(0);
    expect(leaving[2]).toBeCloseTo(2 / 3); // its far end is untouched
    expect(k[2].ease).toBe('linear'); // last keyframe has no leaving segment
    void id;
  });

  it('time-reversing keyframes mirrors values and times', () => {
    const id = A.addSolid({ name: 'A' });
    const l = layers()[0];
    for (const [t, v] of [[1, 10], [2, 20], [4, 40]] as const) setKeyAt(l.transform.rotation, t, v, 1e-3);
    appStore.set({ project: structuredClone(appStore.get().project) });
    A.timeReverseKeys(layers()[0].transform.rotation.keys.map((k) => k.id));
    const k = layers()[0].transform.rotation.keys;
    expect(k.map((x) => x.t)).toEqual([1, 3, 4]);
    expect(k.map((x) => x.v)).toEqual([40, 20, 10]);
    void id;
  });

  it('copy and paste layers places them at the playhead with fresh ids', () => {
    const id = A.addSolid({ name: 'A' });
    A.selectLayers([id]);
    A.copySelection();
    timeStore.set({ t: 3 });
    A.pasteClipboard();
    const ls = layers();
    expect(ls).toHaveLength(2);
    const pasted = ls.find((l) => l.id !== id)!;
    expect(pasted.inPoint).toBe(3);
    expect(pasted.id).not.toBe(id);
  });

  it('copy and paste keyframes onto another layer at the playhead', () => {
    const a = A.addSolid({ name: 'A' });
    const b = A.addSolid({ name: 'B' });
    A.toggleStopwatch(a, 'transform', 'rotation');
    timeStore.set({ t: 1 });
    A.setPropValue(a, 'transform', 'rotation', 90);
    const keys = layers().find((l) => l.id === a)!.transform.rotation.keys;
    appStore.set({ selection: [a], selKeys: keys.map((k) => k.id) });
    A.copySelection();
    appStore.set({ selection: [b], selKeys: [] });
    timeStore.set({ t: 5 });
    A.pasteClipboard();
    const pasted = layers().find((l) => l.id === b)!.transform.rotation.keys;
    expect(pasted.map((k) => k.t)).toEqual([5, 6]);
    expect(pasted.map((k) => k.v)).toEqual([0, 90]);
  });
});

describe('anchor point', () => {
  it('moving the anchor keeps the layer visually in place', () => {
    const id = A.addSolid({ name: 'A', width: 200, height: 100 });
    A.setPropValue(id, 'transform', 'rotation', 30);
    A.setPropValue(id, 'transform', 'scale', [150, 150]);
    const probe: [number, number] = [37, 11];
    const world = () => {
      const c = activeComp();
      return apply(worldMatrix(c.layers[0], 0, layerMap(c)), probe);
    };
    const before = world();
    const l = layers()[0];
    const a0 = baseValue(l.transform.anchor, 0) as number[];
    const pos0 = baseValue(l.transform.position, 0) as number[];
    const a1: [number, number] = [20, 70];
    const lin = localMatrix(l, 0);
    const dp: [number, number] = [lin[0] * (a1[0] - a0[0]) + lin[2] * (a1[1] - a0[1]), lin[1] * (a1[0] - a0[0]) + lin[3] * (a1[1] - a0[1])];
    A.setAnchorKeepingPlace(id, a1, [pos0[0] + dp[0], pos0[1] + dp[1]]);
    const after = world();
    expect(after[0]).toBeCloseTo(before[0], 6);
    expect(after[1]).toBeCloseTo(before[1], 6);
  });
});

describe('compositions', () => {
  it('keeps a valid work area when the duration changes', () => {
    const id = appStore.get().activeCompId;
    A.updateComp(id, { duration: 4 });
    const c = appStore.get().project.comps[id];
    expect(c.workEnd).toBe(4);
    expect(c.workStart).toBe(0);
  });

  it('deleting a comp removes precomp layers that used it', () => {
    const first = appStore.get().activeCompId;
    const second = A.newComp({ name: 'Second' });
    A.addPrecompLayer(first);
    A.deleteComp(first);
    expect(appStore.get().project.comps[second].layers).toHaveLength(0);
    expect(appStore.get().project.compOrder).toEqual([second]);
  });

  it('refuses to delete the last composition', () => {
    A.deleteComp(appStore.get().activeCompId);
    expect(appStore.get().project.compOrder).toHaveLength(1);
  });
});

describe('easing a Hold keyframe', () => {
  it('Easy Ease converts the leaving segment but leaves an arriving Hold alone', () => {
    const id = A.addSolid({ name: 'A' });
    const l = layers()[0];
    setKeyAt(l.transform.rotation, 0, 0, 1e-3, 'hold');
    setKeyAt(l.transform.rotation, 1, 50, 1e-3, 'hold');
    setKeyAt(l.transform.rotation, 2, 100, 1e-3);
    appStore.set({ project: structuredClone(appStore.get().project) });
    const keys = layers()[0].transform.rotation.keys;
    A.applyKeyEase([keys[1].id], 'both');
    const k = layers()[0].transform.rotation.keys;
    expect(k[0].ease).toBe('hold'); // arriving segment is still a step
    expect(Array.isArray(k[1].ease)).toBe(true); // the keyframe itself is now eased
    void id;
  });
});

describe('easing presets', () => {
  it('applies to selected keyframes only, skipping the last one', () => {
    const id = A.addSolid({ name: 'A' });
    const l = layers()[0];
    for (const [t, v] of [[0, 0], [1, 50], [2, 100]] as const) setKeyAt(l.transform.rotation, t, v, 1e-3);
    appStore.set({ project: structuredClone(appStore.get().project) });
    const keys = layers()[0].transform.rotation.keys;
    appStore.set({ selection: [id], selKeys: [keys[0].id, keys[2].id] });
    expect(A.applyEasePreset('bounceOut')).toBe(1);
    const k = layers()[0].transform.rotation.keys;
    expect(k[0].ease).toBe('bounceOut');
    expect(k[1].ease).toBe('linear');
    expect(k[2].ease).toBe('linear');
  });

  it('with no keyframes selected it eases every keyframe on the selected layers', () => {
    const id = A.addSolid({ name: 'A' });
    const l = layers()[0];
    for (const [t, v] of [[0, 0], [1, 50], [2, 100]] as const) setKeyAt(l.transform.rotation, t, v, 1e-3);
    appStore.set({ project: structuredClone(appStore.get().project), selection: [id], selKeys: [] });
    expect(A.applyEasePreset([0.5, 1, 0.9, 1])).toBe(2);
    expect(layers()[0].transform.rotation.keys.slice(0, 2).every((k) => Array.isArray(k.ease))).toBe(true);
  });

  it('time-reversing a named curve swaps in and out', () => {
    const id = A.addSolid({ name: 'A' });
    const l = layers()[0];
    setKeyAt(l.transform.rotation, 0, 0, 1e-3, 'bounceOut');
    setKeyAt(l.transform.rotation, 1, 90, 1e-3);
    appStore.set({ project: structuredClone(appStore.get().project) });
    A.timeReverseKeys(layers()[0].transform.rotation.keys.map((k) => k.id));
    expect(layers()[0].transform.rotation.keys[0].ease).toBe('bounceIn'); // the segment itself plays backwards
    expect(layers()[0].transform.rotation.keys[1].ease).toBe('linear'); // the new last key has no segment
    void id;
  });
});
