import { describe, expect, it } from 'vitest';
import { createComp, createPrecompLayer, createProject, createVideoLayer } from '../core/factory';
import { framesNeeded } from './video';

function setup() {
  const project = createProject();
  const inner = createComp({ name: 'In', width: 100, height: 100, fps: 25, duration: 3 });
  const outer = createComp({ name: 'Out', width: 100, height: 100, fps: 25, duration: 10 });
  project.comps = { [inner.id]: inner, [outer.id]: outer };
  project.compOrder = [outer.id, inner.id];
  const vid = (comp: typeof outer, name: string, assetId: string, time: number, duration = 2) => {
    const l = createVideoLayer({ name, comp, time, assetId, width: 10, height: 10, duration, hasAudio: false });
    comp.layers.unshift(l);
    return l;
  };
  return { project, inner, outer, vid };
}

describe('which video frames a composition needs', () => {
  it('lists each visible video layer with its time inside the file', () => {
    const { project, outer, vid } = setup();
    vid(outer, 'a', 'A', 1);
    vid(outer, 'b', 'B', 0);
    expect(framesNeeded(project, outer, 1.5)).toEqual([
      { assetId: 'B', srcTime: 1.5 },
      { assetId: 'A', srcTime: 0.5 },
    ]);
    // outside a layer's in/out range nothing is needed from it
    expect(framesNeeded(project, outer, 2.5)).toEqual([{ assetId: 'A', srcTime: 1.5 }]);
    expect(framesNeeded(project, outer, 3.1)).toEqual([]);
  });

  it('skips hidden layers, and layers that solo hides', () => {
    const { project, outer, vid } = setup();
    const a = vid(outer, 'a', 'A', 0);
    const b = vid(outer, 'b', 'B', 0);
    a.visible = false;
    expect(framesNeeded(project, outer, 0.5).map((n) => n.assetId)).toEqual(['B']);
    a.visible = true;
    b.solo = true;
    expect(framesNeeded(project, outer, 0.5).map((n) => n.assetId)).toEqual(['B']);
  });

  it('follows precomps, in the precomp\'s own time', () => {
    const { project, inner, outer, vid } = setup();
    vid(inner, 'x', 'X', 0.5, 1.5); // visible in the inner comp from 0.5 to 2.0
    const pre = createPrecompLayer({ name: 'P', comp: outer, time: 0, compId: inner.id, sub: inner });
    pre.start = 4;
    pre.inPoint = 4;
    pre.outPoint = 7;
    outer.layers.unshift(pre);
    expect(framesNeeded(project, outer, 4.2)).toEqual([]);
    expect(framesNeeded(project, outer, 5)).toEqual([{ assetId: 'X', srcTime: 0.5 }]);
    expect(framesNeeded(project, outer, 6.5)).toEqual([]);
  });

  it('survives a composition that contains itself', () => {
    const { project, outer } = setup();
    outer.layers.unshift(createPrecompLayer({ name: 'self', comp: outer, time: 0, compId: outer.id, sub: outer }));
    expect(framesNeeded(project, outer, 1)).toEqual([]);
  });
});
