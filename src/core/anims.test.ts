import { describe, expect, it } from 'vitest';
import { LIBRARY } from '../templates';
import { templateSlot, type LayerTemplate, type TemplateCtx } from '../templates/types';
import { applyTemplateToLayer } from '../state/templateActions';
import {
  alignInstanceEnd,
  instanceEase,
  instanceKeys,
  instanceSpan,
  removeInstance,
  setInstanceEase,
  setInstanceLength,
  setInstanceStart,
  setInstanceStrength,
} from './anims';
import { createComp, createProject, createShape, createText } from './factory';
import { evalNum, evalVec } from './interp';
import { parseProject, serializeProject } from './serialize';
import type { Layer, Project } from './types';

// templateActions pulls in the store, which only needs a frame scheduler to import
globalThis.requestAnimationFrame ??= (() => 0) as typeof requestAnimationFrame;
globalThis.cancelAnimationFrame ??= (() => undefined) as typeof cancelAnimationFrame;

const tpl = (id: string): LayerTemplate => {
  for (const c of ['motion', 'textAnim', 'effect'] as const) {
    const hit = LIBRARY[c].find((i) => i.id === id);
    if (hit && 'template' in hit) return hit.template;
  }
  throw new Error(`no template ${id}`);
};

function setup(t = 1): { project: Project; ctx: TemplateCtx; shape: Layer; text: Layer } {
  const project = createProject();
  const comp = createComp({ name: 'T', width: 1920, height: 1080, fps: 30, duration: 10 });
  project.comps = { [comp.id]: comp };
  project.compOrder = [comp.id];
  const shape = createShape({ name: 'Shape', comp, time: 0, shape: 'rect', size: [300, 300], position: [960, 540] });
  const text = createText({ name: 'Text', comp, time: 0, text: 'Hello World', position: [960, 540] });
  comp.layers = [shape, text];
  return { project, ctx: { project, comp, t, fps: 30 }, shape, text };
}

const roundTrips = (project: Project): void => {
  const back = parseProject(serializeProject(project, {})).project;
  expect(JSON.stringify(back)).toBe(JSON.stringify(project));
};

describe('applying an animation', () => {
  it('records an instance and tags everything the template made', () => {
    const { ctx, shape } = setup();
    applyTemplateToLayer(shape, tpl('motion.slideInLeft'), ctx);
    expect(shape.anims).toHaveLength(1);
    const inst = shape.anims[0];
    expect(inst).toMatchObject({ template: 'motion.slideInLeft', slot: 'in', kind: 'motion', strength: 1 });
    const keys = instanceKeys(shape, inst.id);
    expect(keys.length).toBe(shape.transform.position.keys.length + shape.transform.opacity.keys.length);
    expect(keys.length).toBeGreaterThan(2);
    expect(instanceSpan(shape, inst.id)).toEqual({ start: 1, end: 1.8 });
  });

  it('an In animation replaces the previous In animation, not the Out one', () => {
    const { ctx, shape } = setup(0);
    applyTemplateToLayer(shape, tpl('motion.slideInLeft'), ctx);
    applyTemplateToLayer(shape, { ...tpl('motion.slideOutRight') }, { ...ctx, t: 5 });
    applyTemplateToLayer(shape, tpl('motion.zoomIn'), ctx);
    expect(shape.anims.map((a) => a.template).sort()).toEqual(['motion.slideOutRight', 'motion.zoomIn']);
    // the slide-in keyframes are gone, the slide-out ones remain
    expect(shape.transform.position.keys.every((k) => k.src === shape.anims.find((a) => a.template === 'motion.slideOutRight')!.id)).toBe(true);
  });

  it('re-applying the same animation moves it instead of stacking keyframes', () => {
    const { ctx, shape } = setup(1);
    applyTemplateToLayer(shape, tpl('motion.slideInLeft'), ctx);
    const n = shape.transform.position.keys.length;
    applyTemplateToLayer(shape, tpl('motion.slideInLeft'), { ...ctx, t: 3 });
    expect(shape.anims).toHaveLength(1);
    expect(shape.transform.position.keys).toHaveLength(n);
    expect(shape.transform.position.keys[0].t).toBe(3);
  });

  it('text entrance, loop and exit coexist', () => {
    const { ctx, text } = setup(0);
    applyTemplateToLayer(text, tpl('textanim.softReveal'), ctx);
    applyTemplateToLayer(text, tpl('textanim.fadeOutLetters'), { ...ctx, t: 6 });
    applyTemplateToLayer(text, tpl('textanim.wave'), ctx);
    expect(text.anims.map((a) => a.slot).sort()).toEqual(['in', 'loop', 'out']);
    expect(text.animators.length).toBeGreaterThanOrEqual(5);
    // a second entrance swaps only the entrance's animators
    const loopAnimators = text.animators.filter((a) => a.inst === text.anims.find((x) => x.slot === 'loop')!.id).length;
    applyTemplateToLayer(text, tpl('textanim.typewriter'), ctx);
    expect(text.anims.map((a) => a.template).sort()).toEqual(['textanim.fadeOutLetters', 'textanim.typewriter', 'textanim.wave']);
    expect(text.animators.filter((a) => a.inst === text.anims.find((x) => x.slot === 'loop')!.id)).toHaveLength(loopAnimators);
  });

  it('static looks do not become animations', () => {
    const { ctx, shape } = setup();
    applyTemplateToLayer(shape, tpl('look.softGlow'), ctx);
    expect(shape.anims).toHaveLength(0);
    expect(shape.effects).toHaveLength(1);
  });

  it('animated looks do, and their effect is owned by the instance', () => {
    const { ctx, shape } = setup(0);
    applyTemplateToLayer(shape, tpl('look.blurFocusIn'), ctx);
    expect(shape.anims[0]).toMatchObject({ slot: 'in', kind: 'effect' });
    expect(shape.effects[0].inst).toBe(shape.anims[0].id);
    // replacing the look removes the old effect and its now-empty instance
    applyTemplateToLayer(shape, tpl('look.softGlow'), ctx);
    expect(shape.anims).toHaveLength(0);
  });

  it('every library animation applies, survives save/load and can be removed cleanly', () => {
    for (const cat of ['motion', 'textAnim', 'effect'] as const) {
      for (const item of LIBRARY[cat]) {
        if (!('template' in item) || !templateSlot(item.template)) continue;
        const { project, ctx, shape, text } = setup(1);
        const layer = item.template.accepts(text) ? text : shape;
        const before = JSON.stringify({ t: layer.transform, e: layer.effects.length, a: layer.animators.length });
        applyTemplateToLayer(layer, item.template, ctx);
        expect(layer.anims.length, item.id).toBe(1);
        roundTrips(project);
        removeInstance(layer, layer.anims[0]?.id ?? '');
        expect(layer.anims, item.id).toHaveLength(0);
        expect(layer.effects.filter((e) => e.inst), item.id).toHaveLength(0);
        expect(layer.animators.filter((a) => a.inst), item.id).toHaveLength(0);
        // nothing of the animation is left behind
        expect(JSON.stringify({ t: layer.transform, e: layer.effects.length, a: layer.animators.length }), item.id).toBe(before);
      }
    }
  });
});

describe('editing an applied animation', () => {
  it('start moves every keyframe together', () => {
    const { ctx, shape } = setup(1);
    applyTemplateToLayer(shape, tpl('motion.slideInLeft'), ctx);
    const id = shape.anims[0].id;
    const before = instanceKeys(shape, id).map((k) => k.key.t);
    setInstanceStart(shape, id, 4);
    expect(instanceSpan(shape, id)).toEqual({ start: 4, end: 4.8 });
    const after = instanceKeys(shape, id).map((k) => k.key.t);
    after.forEach((t, i) => expect(t - 3).toBeCloseTo(before[i], 9));
  });

  it('length stretches around the start and keeps the shape of the motion', () => {
    const { ctx, shape } = setup(1);
    applyTemplateToLayer(shape, tpl('motion.slideInLeft'), ctx);
    const id = shape.anims[0].id;
    const mid = evalVec(shape.transform.position, 1.4)[0];
    setInstanceLength(shape, id, 1.6);
    const span = instanceSpan(shape, id)!;
    expect(span.start).toBeCloseTo(1, 9);
    expect(span.end).toBeCloseTo(2.6, 9);
    // the value that used to be reached at 0.4s is now reached at 0.8s
    expect(evalVec(shape.transform.position, 1.8)[0]).toBeCloseTo(mid, 6);
  });

  it('strength scales the distance travelled, and scaling back restores the original', () => {
    const { ctx, shape } = setup(1);
    const rest = [...(shape.transform.position.value as number[])];
    applyTemplateToLayer(shape, tpl('motion.slideInLeft'), ctx);
    const id = shape.anims[0].id;
    const start = evalVec(shape.transform.position, 1);
    const dist = rest[0] - start[0];
    expect(dist).toBeGreaterThan(100);
    setInstanceStrength(shape, id, 0.5);
    expect(rest[0] - evalVec(shape.transform.position, 1)[0]).toBeCloseTo(dist / 2, 6);
    expect(evalVec(shape.transform.position, 5)).toEqual([rest[0], rest[1]]); // it still lands where it should
    setInstanceStrength(shape, id, 2);
    expect(rest[0] - evalVec(shape.transform.position, 1)[0]).toBeCloseTo(dist * 2, 6);
    setInstanceStrength(shape, id, 1);
    expect(rest[0] - evalVec(shape.transform.position, 1)[0]).toBeCloseTo(dist, 6);
    expect(shape.anims[0].strength).toBe(1);
  });

  it('strength is clamped and keeps opacity inside its range', () => {
    const { ctx, shape } = setup(1);
    applyTemplateToLayer(shape, tpl('motion.fadeIn'), ctx);
    const id = shape.anims[0].id;
    setInstanceStrength(shape, id, 99);
    expect(shape.anims[0].strength).toBe(3);
    for (const k of shape.transform.opacity.keys) expect(k.v as number).toBeGreaterThanOrEqual(0);
    expect(evalNum(shape.transform.opacity, 1)).toBe(0);
  });

  it('strength leaves text range selectors alone but scales the letters\' style', () => {
    const { ctx, text } = setup(0);
    applyTemplateToLayer(text, tpl('textanim.slideUp'), ctx);
    const inst = text.anims[0];
    const band = text.animators.find((a) => a.inst === inst.id && a.name.includes('Band'))!;
    const startKeys = band.props.start.keys.map((k) => k.v);
    const posBefore = [...(band.props.position.value as number[])];
    setInstanceStrength(text, inst.id, 2);
    expect(band.props.start.keys.map((k) => k.v)).toEqual(startKeys);
    expect(band.props.position.value as number[]).toEqual([posBefore[0] * 2, posBefore[1] * 2]);
  });

  it('ease overrides every segment but the last key of each property', () => {
    const { ctx, shape } = setup(1);
    applyTemplateToLayer(shape, tpl('motion.slideInLeft'), ctx);
    const id = shape.anims[0].id;
    setInstanceEase(shape, id, 'bounceOut');
    expect(shape.transform.position.keys[0].ease).toBe('bounceOut');
    expect(instanceEase(shape, id)).toBe('bounceOut');
    setInstanceEase(shape, id, [0.3, 0, 0.7, 1]);
    expect(shape.transform.position.keys[0].ease).toEqual([0.3, 0, 0.7, 1]);
  });

  it('can be aligned to the end of the layer', () => {
    const { ctx, shape } = setup(1);
    applyTemplateToLayer(shape, tpl('motion.slideOutRight'), ctx);
    const id = shape.anims[0].id;
    alignInstanceEnd(shape, id, shape.outPoint);
    expect(instanceSpan(shape, id)!.end).toBeCloseTo(shape.outPoint, 9);
  });

  it('a loop keeps its period when retimed', () => {
    const { ctx, shape } = setup(0);
    applyTemplateToLayer(shape, tpl('motion.pulse'), ctx);
    const id = shape.anims[0].id;
    const span = instanceSpan(shape, id)!;
    setInstanceLength(shape, id, (span.end - span.start) * 2);
    expect(shape.transform.scale.loop).toBeDefined();
    expect(instanceSpan(shape, id)!.end).toBeCloseTo(span.start + (span.end - span.start) * 2, 9);
  });
});

describe('save files', () => {
  it('older files without animations still open', () => {
    const { project } = setup();
    const text = serializeProject(project, {});
    const raw = JSON.parse(text);
    for (const l of Object.values(raw.project.comps)[0] ? (Object.values(raw.project.comps)[0] as { layers: Record<string, unknown>[] }).layers : []) delete l.anims;
    const back = parseProject(JSON.stringify(raw)).project;
    expect(Object.values(back.comps)[0].layers.every((l) => Array.isArray(l.anims))).toBe(true);
  });

  it('rejects malformed animation records', () => {
    const { project, ctx, shape } = setup();
    applyTemplateToLayer(shape, tpl('motion.fadeIn'), ctx);
    const raw = JSON.parse(serializeProject(project, {}));
    (Object.values(raw.project.comps)[0] as { layers: { anims: { slot: string }[] }[] }).layers[0].anims[0].slot = 'sideways';
    expect(() => parseProject(JSON.stringify(raw))).toThrow(/animation slot/);
  });
});
