import { describe, expect, it } from 'vitest';
import { createCamera, createComp, createLight, createNull, createSolid } from './factory';
import { mul4, point4, rotX4, rotY4, rotZ4, translate4, scale4, norm3, type Vec3 } from './math3';
import { applyH, depthOf, type Light, localModel, lookView, orthoView, planeHomography, planeNormal, projectLayerPoint, sceneAt, screenToWorldAtZ, shade, unprojectToLayer, worldModel } from './scene3d';
import type { Comp, Layer } from './types';

const close = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
const closeV = (a: ArrayLike<number>, b: ArrayLike<number>, tol = 1e-6) => b.length && Array.from(b).forEach((x, i) => close(a[i], x, tol));

const W = 1920;
const H = 1080;
const mk = () => createComp({ name: 'T', width: W, height: H, fps: 30, duration: 10 });
const solid = (comp: Comp, name = 'S') => {
  const l = createSolid({ name, comp, time: 0, color: [255, 0, 0], width: 400, height: 200 });
  comp.layers.unshift(l);
  return l;
};
const byId = (comp: Comp) => new Map(comp.layers.map((l) => [l.id, l]));

describe('3D matrices', () => {
  it('rotate in the documented directions', () => {
    closeV(point4(rotZ4(90), [1, 0, 0]), [0, 1, 0]); // clockwise on screen
    closeV(point4(rotX4(90), [0, -1, 0]), [0, 0, 1]); // the top goes away
    closeV(point4(rotY4(90), [1, 0, 0]), [0, 0, 1]); // the right edge goes away
    closeV(point4(mul4(translate4(5, 6, 7), scale4(2, 2, 2)), [1, 1, 1]), [7, 8, 9]);
  });

  it('normalises with a fallback', () => {
    closeV(norm3([0, 3, 4]), [0, 0.6, 0.8]);
    expect(norm3([0, 0, 0], [1, 0, 0])).toEqual([1, 0, 0]);
  });
});

describe('where layers sit', () => {
  it('a 2D layer ignores Z and tilt; a 3D layer uses them', () => {
    const comp = mk();
    const l = solid(comp);
    l.transform.positionZ.value = 500;
    l.transform.rotationY.value = 40;
    closeV(point4(localModel(l, 0), [200, 100, 0]), [960, 540, 0]); // anchor is the centre: it lands on the position
    l.threeD = true;
    closeV(point4(localModel(l, 0), [200, 100, 0]), [960, 540, 500]);
    expect(Math.abs(point4(localModel(l, 0), [400, 100, 0])[2])).toBeGreaterThan(100); // the right edge swung back
  });

  it('parents carry their children', () => {
    const comp = mk();
    const rig = createNull({ name: 'rig', comp, time: 0 });
    rig.threeD = true;
    rig.transform.position.value = [0, 0];
    rig.transform.anchor.value = [0, 0];
    rig.transform.rotationY.value = 90;
    const child = solid(comp);
    child.threeD = true;
    child.parentId = rig.id;
    child.transform.position.value = [100, 0];
    child.transform.anchor.value = [0, 0];
    comp.layers.push(rig);
    // the rig turns 90° about Y, so the child's local +x runs along +z
    closeV(point4(worldModel(child, 0, byId(comp)), [0, 0, 0]), [0, 0, 100]);
  });
});

describe('the view', () => {
  it('without a camera 3D layers are flat: no perspective, only the tilt', () => {
    const v = orthoView(W, H);
    expect(v.perspective).toBe(false);
    const flat = planeHomography(v, translate4(100, 50, 300));
    closeV(projectLayerPoint(flat, 10, 20)!, [110, 70]); // Z does nothing to size or position
    const tilted = planeHomography(v, mul4(translate4(0, 0, 0), rotY4(60)));
    closeV(projectLayerPoint(tilted, 100, 0)!, [50, 0], 1e-6); // cos 60° = 0.5
  });

  it('the default camera leaves layers at Z = 0 exactly where they are in 2D', () => {
    const comp = mk();
    const cam = createCamera({ name: 'Camera', comp, time: 0 });
    comp.layers.unshift(cam);
    const { view } = sceneAt(comp, 0);
    expect(view.perspective).toBe(true);
    const h = planeHomography(view, translate4(0, 0, 0));
    closeV(projectLayerPoint(h, 321, 654)!, [321, 654], 1e-6);
    closeV(projectLayerPoint(h, 0, 0)!, [0, 0], 1e-6);
  });

  it('moving a layer away shrinks it towards the centre of the view, and closer grows it', () => {
    const comp = mk();
    const cam = createCamera({ name: 'Camera', comp, time: 0 });
    comp.layers.unshift(cam);
    const zoom = cam.content.zoom.value as number;
    const { view } = sceneAt(comp, 0);
    const far = planeHomography(view, translate4(0, 0, zoom)); // twice as far from the eye
    closeV(projectLayerPoint(far, 1920, 1080)!, [960 + 480, 540 + 270], 1e-6);
    const near = planeHomography(view, translate4(0, 0, -zoom / 2)); // half the distance: twice the size
    closeV(projectLayerPoint(near, 1920, 1080)!, [960 + 960 * 2, 540 + 540 * 2], 1e-6);
    expect(depthOf(view, [0, 0, zoom])).toBeGreaterThan(depthOf(view, [0, 0, 0]));
  });

  it('turning a layer about Y gives perspective: the near edge is taller than the far edge', () => {
    const comp = mk();
    const cam = createCamera({ name: 'Camera', comp, time: 0 });
    comp.layers.unshift(cam);
    const { view } = sceneAt(comp, 0);
    const model = mul4(translate4(960, 540, 0), mul4(rotY4(50), translate4(-200, -100, 0)));
    const h = planeHomography(view, model);
    const nearEdge = projectLayerPoint(h, 0, 200)![1] - projectLayerPoint(h, 0, 0)![1]; // left edge is nearer
    const farEdge = projectLayerPoint(h, 400, 200)![1] - projectLayerPoint(h, 400, 0)![1];
    expect(nearEdge).toBeGreaterThan(farEdge);
    expect(nearEdge).toBeLessThan(200 * 1.5);
  });

  it('screen points map back onto the plane', () => {
    const comp = mk();
    const cam = createCamera({ name: 'Camera', comp, time: 0 });
    cam.transform.position.value = [1500, 300];
    cam.content.poi.value = [900, 500];
    comp.layers.unshift(cam);
    const { view } = sceneAt(comp, 0);
    const model = mul4(translate4(800, 400, 200), mul4(rotX4(25), rotY4(-35)));
    const h = planeHomography(view, model);
    for (const [u, v] of [[0, 0], [150, -80], [-300, 220]]) {
      const s = projectLayerPoint(h, u, v)!;
      closeV(unprojectToLayer(h, s[0], s[1])!, [u, v], 1e-4);
      // and the same point on the plane Z = its world z
      const world = point4(model, [u, v, 0]);
      closeV(screenToWorldAtZ(view, s[0], s[1], world[2])!, world, 1e-3);
    }
  });

  it('points behind the camera do not project', () => {
    const comp = mk();
    const cam = createCamera({ name: 'Camera', comp, time: 0 });
    comp.layers.unshift(cam);
    const { view } = sceneAt(comp, 0);
    const behind = planeHomography(view, translate4(0, 0, -(cam.content.zoom.value as number) - 100));
    expect(projectLayerPoint(behind, 10, 10)).toBeNull();
    expect(applyH(behind, 10, 10)[2]).toBeLessThan(0);
  });

  it('a camera orbiting to the side sees the layer edge-on, still centred', () => {
    const view = lookView(W, H, [W / 2 + 2000, H / 2, 0], [W / 2, H / 2, 0], 2667);
    const h = planeHomography(view, translate4(0, 0, 0));
    const c = projectLayerPoint(h, W / 2, H / 2)!;
    closeV(c, [W / 2, H / 2], 1e-6);
    // the plane is edge-on, with the camera inside it: points along the view axis all land on the centre
    closeV(projectLayerPoint(h, W / 2 + 500, H / 2)!, [W / 2, H / 2], 1e-6);
    // while vertical offsets still show, scaled by perspective (2000 px away: 2667/2000)
    close(projectLayerPoint(h, W / 2, H / 2 + 300)![1], H / 2 + (300 * 2667) / 2000, 1e-6);
  });

  it('rolling the camera clockwise turns the picture the other way', () => {
    const view = lookView(W, H, [W / 2, H / 2, -2667], [W / 2, H / 2, 0], 2667, 90);
    const h = planeHomography(view, translate4(0, 0, 0));
    // a point to the right of centre now appears above it
    closeV(projectLayerPoint(h, W / 2 + 100, H / 2)!, [W / 2, H / 2 - 100], 1e-6);
  });

  it('looking straight down the vertical does not break the basis', () => {
    const view = lookView(W, H, [W / 2, -1000, 0], [W / 2, H / 2, 0], 2000);
    expect(Number.isFinite(view.right[0] + view.down[0] + view.fwd[0])).toBe(true);
    expect(Math.hypot(...view.right)).toBeCloseTo(1);
  });
});

describe('cameras and lights in a composition', () => {
  it('uses the topmost camera that is on', () => {
    const comp = mk();
    const a = createCamera({ name: 'A', comp, time: 0 });
    const b = createCamera({ name: 'B', comp, time: 0 });
    a.transform.positionZ.value = -4000;
    b.transform.positionZ.value = -1000;
    comp.layers.push(b);
    comp.layers.unshift(a);
    expect(sceneAt(comp, 0).view.eye[2]).toBe(-4000);
    a.visible = false;
    expect(sceneAt(comp, 0).view.eye[2]).toBe(-1000);
    b.outPoint = 1;
    expect(sceneAt(comp, 2).view.perspective).toBe(false);
    expect(sceneAt(comp, 0.5).view.perspective).toBe(true);
  });

  it('a camera parented to a rotating null orbits', () => {
    const comp = mk();
    const rig = createNull({ name: 'rig', comp, time: 0 });
    rig.threeD = true;
    rig.transform.position.value = [W / 2, H / 2];
    rig.transform.anchor.value = [0, 0];
    const cam = createCamera({ name: 'Camera', comp, time: 0 });
    cam.parentId = rig.id;
    cam.transform.position.value = [0, 0];
    cam.transform.positionZ.value = -2000;
    comp.layers.push(rig);
    comp.layers.unshift(cam);
    closeV(sceneAt(comp, 0).view.eye, [W / 2, H / 2, -2000], 1e-6);
    rig.transform.rotationY.value = 90;
    closeV(sceneAt(comp, 0).view.eye, [W / 2 - 2000 * 1, H / 2, 0].map((v, i) => (i === 0 ? W / 2 - 0 : v)) as Vec3, 3000); // coarse: moved off the Z axis
    const eye = sceneAt(comp, 0).view.eye;
    expect(Math.abs(eye[2])).toBeLessThan(1e-6);
    expect(Math.abs(eye[0] - W / 2)).toBeCloseTo(2000, 3);
  });

  it('reads lights: none means unshaded', () => {
    const comp = mk();
    expect(sceneAt(comp, 0).lights).toBeNull();
    const amb = createLight({ name: 'amb', comp, time: 0, kind: 'ambient' });
    const spot = createLight({ name: 'spot', comp, time: 0, kind: 'spot' });
    comp.layers.push(amb, spot);
    const { lights } = sceneAt(comp, 0);
    expect(lights).toHaveLength(2);
    expect(lights![0].kind).toBe('ambient');
    closeV(lights![0].color, [0.4, 0.4, 0.4]);
    expect(lights![1].kind).toBe('spot');
    close(lights![1].cosOuter, Math.cos(Math.PI / 4));
    spot.visible = false;
    expect(sceneAt(comp, 0).lights).toHaveLength(1);
  });
});

describe('shading', () => {
  const facing: Vec3 = [0, 0, 1];
  const light = (over: Partial<Light>): Light => ({ ...base(), ...over });
  const base = (): Light => ({ kind: 'parallel', color: [1, 1, 1] as Vec3, pos: [0, 0, -1000] as Vec3, dir: [0, 0, 1] as Vec3, cosOuter: Math.cos(Math.PI / 4), cosInner: Math.cos(Math.PI / 8) });

  it('ambient light adds evenly', () => {
    closeV(shade([light({ kind: 'ambient', color: [0.4, 0.2, 0.1] })], [0, 0, 0], facing), [0.4, 0.2, 0.1]);
  });

  it('a parallel light scales with how squarely the layer faces it, on both faces', () => {
    closeV(shade([light({})], [0, 0, 0], facing), [1, 1, 1]);
    const slanted = norm3([Math.sin(Math.PI / 3), 0, Math.cos(Math.PI / 3)]);
    close(shade([light({})], [0, 0, 0], slanted)[0], 0.5);
    closeV(shade([light({})], [0, 0, 0], [0, 0, -1]), [1, 1, 1]);
    close(shade([light({})], [0, 0, 0], [1, 0, 0])[0], 0);
  });

  it('a point light depends on where the surface is', () => {
    const point = light({ kind: 'point', pos: [0, 0, -500] });
    close(shade([point], [0, 0, 0], facing)[0], 1);
    const off = shade([point], [500, 0, 0], facing)[0];
    close(off, 500 / Math.hypot(500, 500), 1e-6);
  });

  it('a spot light fades to nothing outside its cone', () => {
    const spot = light({ kind: 'spot', pos: [0, 0, -1000] });
    close(shade([spot], [0, 0, 0], facing)[0], 1);
    expect(shade([spot], [3000, 0, 0], facing)[0]).toBe(0);
    const edge = shade([spot], [1000 * Math.tan(Math.PI / 6), 0, 0], facing)[0]; // 30° off axis, between inner 22.5° and outer 45°
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(1);
  });

  it('adds lights together and caps at full brightness', () => {
    const out = shade([light({ kind: 'ambient', color: [0.7, 0.7, 0.7] }), light({})], [0, 0, 0], facing);
    closeV(out, [1, 1, 1]);
    closeV(shade([light({ color: [0.2, 0.4, 0.6] })], [0, 0, 0], facing), [0.2, 0.4, 0.6]);
  });

  it('knows a plane\'s normal', () => {
    closeV(planeNormal(translate4(1, 2, 3)), [0, 0, 1]);
    closeV(planeNormal(rotY4(90)), [Math.sin(Math.PI / 2) * -1 || 0, 0, 0].map((_, i) => [-1, 0, 0][i]) as Vec3, 1e-9);
  });
});

describe('layers keep their own flags', () => {
  it('3D toggles per layer', () => {
    const comp = mk();
    const a: Layer = solid(comp, 'A');
    const b: Layer = solid(comp, 'B');
    a.threeD = true;
    expect(!!a.threeD).toBe(true);
    expect(!!b.threeD).toBe(false);
  });
});
