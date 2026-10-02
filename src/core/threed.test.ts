import { describe, expect, it } from 'vitest';
import { createAudioLayer, createCamera, createComp, createLight, createNull, createProject, createSolid } from './factory';
import { rotationLabel, transformKeysShown } from './props';
import { parseProject, serializeProject } from './serialize';
import type { Layer, Project } from './types';

const comp = createComp({ name: 'T', width: 1920, height: 1080, fps: 30, duration: 5 });
const solid = (): Layer => createSolid({ name: 'S', comp, time: 0, color: [1, 2, 3], width: 100, height: 100 });

describe('which transform properties a layer shows', () => {
  it('a flat layer shows the five 2D ones', () => {
    expect(transformKeysShown(solid())).toEqual(['anchor', 'position', 'scale', 'rotation', 'opacity']);
  });

  it('a 3D layer adds Z position and X/Y rotation, in a sensible order', () => {
    const l = solid();
    l.threeD = true;
    expect(transformKeysShown(l)).toEqual(['anchor', 'position', 'positionZ', 'scale', 'rotationX', 'rotationY', 'rotation', 'opacity']);
  });

  it('3D properties that do nothing on a flat layer are hidden, but come back (once) with 3D', () => {
    const l = solid();
    l.transform.rotationY.keys = [{ id: 'k', t: 0, v: 10, ease: 'linear' }];
    expect(transformKeysShown(l)).not.toContain('rotationY');
    l.threeD = true;
    expect(transformKeysShown(l).filter((k) => k === 'rotationY')).toHaveLength(1);
  });

  it('keyframes on a property a layer does not normally show keep it visible', () => {
    const cam = createCamera({ name: 'C', comp, time: 0 });
    cam.transform.opacity.keys = [{ id: 'k', t: 0, v: 50, ease: 'linear' }];
    expect(transformKeysShown(cam)).toEqual(['position', 'positionZ', 'rotation', 'opacity']);
  });

  it('cameras, lights and sound show only what applies to them', () => {
    expect(transformKeysShown(createCamera({ name: 'C', comp, time: 0 }))).toEqual(['position', 'positionZ', 'rotation']);
    expect(transformKeysShown(createLight({ name: 'L', comp, time: 0 }))).toEqual(['position', 'positionZ']);
    expect(transformKeysShown(createAudioLayer({ name: 'A', comp, time: 0, assetId: 'x', duration: 1 }))).toEqual([]);
  });

  it('names Rotation for what it does', () => {
    const l = solid();
    expect(rotationLabel(l)).toBe('Rotation');
    l.threeD = true;
    expect(rotationLabel(l)).toBe('Z Rotation');
    expect(rotationLabel(createCamera({ name: 'C', comp, time: 0 }))).toBe('Roll');
  });
});

describe('cameras and lights', () => {
  it('start with a sensible lens and position', () => {
    const cam = createCamera({ name: 'C', comp, time: 0 });
    const zoom = cam.content.zoom.value as number;
    expect(zoom).toBeCloseTo((1920 * 50) / 36, 6);
    expect(cam.transform.positionZ.value).toBeCloseTo(-zoom, 6);
    expect(cam.transform.position.value).toEqual([960, 540]);
    expect(cam.threeD).toBe(true);
    expect(cam.outPoint).toBe(5);
  });

  it('lights come in four kinds with sensible intensities', () => {
    const kinds = (['parallel', 'spot', 'point', 'ambient'] as const).map((kind) => createLight({ name: kind, comp, time: 0, kind }));
    expect(kinds.map((l) => l.content.lightType.value)).toEqual([0, 1, 2, 3]);
    expect(kinds.map((l) => l.content.intensity.value)).toEqual([100, 100, 100, 40]);
    expect(kinds[0].content.lightType.options).toEqual(['Parallel', 'Spot', 'Point', 'Ambient']);
  });
});

function build(): Project {
  const project = createProject();
  const c = project.comps[project.compOrder[0]];
  const s = solid();
  s.threeD = true;
  s.transform.rotationY.value = 30;
  const rig = createNull({ name: 'rig', comp: c, time: 0 });
  rig.threeD = true;
  c.layers.push(s, createCamera({ name: 'cam', comp: c, time: 0 }), createLight({ name: 'sun', comp: c, time: 0, kind: 'parallel' }), rig);
  return project;
}

const roundTrip = (mutate?: (raw: any) => void) => {
  const raw = JSON.parse(serializeProject(build(), {}));
  mutate?.(raw);
  return parseProject(JSON.stringify(raw)).project;
};
const layers = (raw: any): any[] => Object.values<any>(raw.project.comps)[0].layers;

describe('3D in project files', () => {
  it('round-trips', () => {
    const p = roundTrip();
    const ls = p.comps[p.compOrder[0]].layers;
    expect(ls.map((l) => l.type)).toEqual(['solid', 'camera', 'light', 'null']);
    expect(ls[0].threeD).toBe(true);
    expect(ls[0].transform.rotationY.value).toBe(30);
  });

  it('opens files from before 3D, adding the new properties', () => {
    const p = roundTrip((raw) => {
      for (const l of layers(raw)) {
        delete l.threeD;
        for (const k of ['positionZ', 'rotationX', 'rotationY']) delete l.transform[k];
      }
    });
    for (const l of p.comps[p.compOrder[0]].layers) expect(['positionZ', 'rotationX', 'rotationY'].every((k) => (l.transform as any)[k]?.kind === 'number')).toBe(true);
  });

  it('rejects bad 3D data', () => {
    const bad: ((raw: any) => void)[] = [
      (raw) => (layers(raw)[0].threeD = 'yes'),
      (raw) => (layers(raw)[0].transform.positionZ = { kind: 'color', label: 'x', value: [1, 2, 3], keys: [] }),
      (raw) => (layers(raw)[0].transform.position = { kind: 'number', label: 'x', value: 1, keys: [] }),
      (raw) => (layers(raw)[1].data = { type: 'light' }),
      (raw) => delete layers(raw)[1].content.zoom,
      (raw) => (layers(raw)[1].content.poi = { kind: 'number', label: 'x', value: 1, keys: [] }),
      (raw) => delete layers(raw)[2].content.intensity,
      (raw) => delete layers(raw)[2].content.color,
    ];
    for (const mutate of bad) expect(() => roundTrip(mutate)).toThrow(/Invalid project file/);
  });
});
