import { describe, expect, it } from 'vitest';
import { instanceSpan, setInstanceEase, setInstanceLength, setInstanceStrength } from '../core/anims';
import { createComp, createProject, createShape, createText } from '../core/factory';
import { evalNum, evalVec, setKeyAt } from '../core/interp';
import { parseProject, serializeProject } from '../core/serialize';
import type { Layer, Project } from '../core/types';
import { applyTemplateToLayer } from '../state/templateActions';
import { LIBRARY } from './index';
import { captureAnimation, captureLook, presetTemplate, sanitizePreset } from './userPresets';
import type { LayerTemplate, TemplateCtx } from './types';
import { templateSlot } from './types';

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

function setup(t = 0): { project: Project; ctx: TemplateCtx; a: Layer; b: Layer; text: Layer; text2: Layer } {
  const project = createProject();
  const comp = createComp({ name: 'T', width: 1920, height: 1080, fps: 30, duration: 10 });
  project.comps = { [comp.id]: comp };
  project.compOrder = [comp.id];
  const a = createShape({ name: 'A', comp, time: 0, shape: 'rect', size: [300, 300], position: [960, 540] });
  const b = createShape({ name: 'B', comp, time: 0, shape: 'rect', size: [200, 200], position: [300, 300] });
  const text = createText({ name: 'T1', comp, time: 0, text: 'Hello World', position: [960, 540] });
  const text2 = createText({ name: 'T2', comp, time: 0, text: 'Second', position: [500, 700] });
  comp.layers = [a, b, text, text2];
  return { project, ctx: { project, comp, t, fps: 30 }, a, b, text, text2 };
}

describe('saving an animation as a preset', () => {
  it('keeps the tuning and replays relative to the layer it is applied to', () => {
    const { ctx, a, b } = setup(1);
    applyTemplateToLayer(a, tpl('motion.slideInLeft'), ctx);
    const inst = a.anims[0];
    setInstanceStrength(a, inst.id, 0.5);
    setInstanceLength(a, inst.id, 1.2);
    setInstanceEase(a, inst.id, 'bounceOut');
    const startOffset = 960 - evalVec(a.transform.position, 1)[0];
    const preset = captureAnimation(a, inst, 'My slide')!;
    expect(preset.name).toBe('My slide');
    expect(preset.kind).toBe('motion');
    expect(preset.slot).toBe('in');
    expect(preset.length).toBeCloseTo(1.2, 5);

    const t = presetTemplate(preset);
    expect(templateSlot(t)).toBe('in');
    applyTemplateToLayer(b, t, { ...ctx, t: 2 });
    expect(b.anims).toHaveLength(1);
    expect(b.anims[0].template).toBe(preset.id);
    // B sits at (300, 300): it starts the same distance to the left and lands exactly there
    expect(300 - evalVec(b.transform.position, 2)[0]).toBeCloseTo(startOffset, 4);
    expect(evalVec(b.transform.position, 2)[1]).toBeCloseTo(300, 6);
    expect(evalVec(b.transform.position, 3.2)).toEqual([300, 300]);
    expect(b.transform.position.value).toEqual([300, 300]);
    expect(b.transform.position.keys[0].ease).toBe('bounceOut');
    expect(instanceSpan(b, b.anims[0].id)).toEqual({ start: 2, end: 3.2 });
  });

  it('captures relative to where the layer really rests when it has its own keyframes', () => {
    const { ctx, a, b } = setup(3);
    setKeyAt(a.transform.position, 0, [100, 100], 0.01, 'linear');
    setKeyAt(a.transform.position, 2, [900, 600], 0.01, 'linear'); // stored value stays (960, 540)
    applyTemplateToLayer(a, tpl('motion.slideInLeft'), ctx);
    const preset = captureAnimation(a, a.anims[0], 'Slide')!;
    const first = preset.props.find((p) => p.target.group === 'transform' && p.target.key === 'position')!.keys[0].v as number[];
    expect(first[1]).toBeCloseTo(0, 6); // purely horizontal
    expect(first[0]).toBeLessThan(-100);
    applyTemplateToLayer(b, presetTemplate(preset), { ...ctx, t: 0 });
    expect(evalVec(b.transform.position, 0)[1]).toBeCloseTo(300, 6);
    expect(evalVec(b.transform.position, 5)).toEqual([300, 300]);
  });

  it('scales and fades relative to the target\'s own scale and opacity', () => {
    const { ctx, a, b } = setup(0);
    applyTemplateToLayer(a, tpl('motion.popIn'), ctx);
    const preset = captureAnimation(a, a.anims[0], 'Pop')!;
    b.transform.scale.value = [50, 50];
    b.transform.opacity.value = 40;
    applyTemplateToLayer(b, presetTemplate(preset), ctx);
    expect(evalVec(b.transform.scale, 0)).toEqual([0, 0]);
    const end = evalVec(b.transform.scale, 5);
    expect(end[0]).toBeCloseTo(50, 6);
    expect(evalNum(b.transform.opacity, 5)).toBe(40);
  });

  it('survives a trip through JSON and a project save', () => {
    const { project, ctx, a, b } = setup(1);
    applyTemplateToLayer(a, tpl('motion.slideInBottom'), ctx);
    const preset = captureAnimation(a, a.anims[0], 'Up')!;
    const again = sanitizePreset(JSON.parse(JSON.stringify(preset)))!;
    expect(JSON.stringify(again.props)).toBe(JSON.stringify(preset.props));
    applyTemplateToLayer(b, presetTemplate(again), ctx);
    const back = parseProject(serializeProject(project, {})).project;
    expect(JSON.stringify(back)).toBe(JSON.stringify(project));
  });

  it('carries effects, their animation, loops and wiggles', () => {
    const { ctx, a, b } = setup(0);
    applyTemplateToLayer(a, tpl('look.pulseGlow'), ctx);
    const inst = a.anims[0];
    expect(a.effects[0].props.intensity.loop).toBe('pingpong');
    const preset = captureAnimation(a, inst, 'Pulse')!;
    expect(preset.effects).toHaveLength(1);
    expect(preset.effects[0].props.intensity.keys).toHaveLength(0);
    applyTemplateToLayer(b, presetTemplate(preset), { ...ctx, t: 3 });
    expect(b.effects).toHaveLength(1);
    expect(b.effects[0].type).toBe('glow');
    expect(b.effects[0].props.intensity.keys.map((k) => k.t)).toEqual([3, 3.9]);
    expect(b.effects[0].props.intensity.loop).toBe('pingpong');

    applyTemplateToLayer(a, tpl('motion.wiggleSoft'), ctx);
    const w = captureAnimation(a, a.anims.find((x) => x.template === 'motion.wiggleSoft')!, 'Shake')!;
    applyTemplateToLayer(b, presetTemplate(w), ctx);
    expect(b.transform.position.wiggle?.amp).toBe(a.transform.position.wiggle?.amp);
  });

  it('saves a whole effect stack as a look and applies it without stacking', () => {
    const { ctx, a, b } = setup(0);
    applyTemplateToLayer(a, tpl('look.dreamy'), ctx);
    a.effects[1].props.radius.value = 77;
    const look = captureLook(a, 'Mine')!;
    expect(look.kind).toBe('effect');
    expect(look.slot).toBeNull();
    const t = presetTemplate(look);
    expect(templateSlot(t)).toBeNull();
    applyTemplateToLayer(b, t, ctx);
    applyTemplateToLayer(b, t, ctx);
    expect(b.effects.map((e) => e.type)).toEqual(a.effects.map((e) => e.type));
    expect(b.effects[1].props.radius.value).toBe(77);
    expect(b.anims).toHaveLength(0);
  });

  it('text animations keep their letter animators, and only apply to text', () => {
    const { ctx, text, text2, a } = setup(0);
    applyTemplateToLayer(text, tpl('textanim.softReveal'), ctx);
    const inst = text.anims[0];
    const preset = captureAnimation(text, inst, 'Reveal')!;
    expect(preset.kind).toBe('textAnim');
    expect(preset.animators).toHaveLength(2);
    const t = presetTemplate(preset);
    expect(t.accepts(text2)).toBe(true);
    expect(t.accepts(a)).toBe(false);
    applyTemplateToLayer(text2, t, { ...ctx, t: 1 });
    expect(text2.animators).toHaveLength(2);
    expect(text2.anims[0].slot).toBe('in');
    const band = text2.animators[0];
    expect(band.props.start.keys[0].t).toBe(1);
    expect(band.props.opacity.value).toBe(0);
    // another entrance replaces it cleanly
    applyTemplateToLayer(text2, tpl('textanim.typewriter'), ctx);
    expect(text2.anims.map((x) => x.template)).toEqual(['textanim.typewriter']);
  });

  it('a saved In animation replaces the layer\'s built-in In animation', () => {
    const { ctx, a, b } = setup(0);
    applyTemplateToLayer(a, tpl('motion.zoomIn'), ctx);
    const preset = captureAnimation(a, a.anims[0], 'Zoom')!;
    applyTemplateToLayer(b, tpl('motion.slideInLeft'), ctx);
    applyTemplateToLayer(b, presetTemplate(preset), ctx);
    expect(b.anims.map((x) => x.template)).toEqual([preset.id]);
    expect(b.transform.position.keys).toHaveLength(0);
  });

  it('refuses to save nothing', () => {
    const { a } = setup();
    expect(captureLook(a, 'x')).toBeNull();
    expect(captureAnimation(a, { id: 'inst_x', template: 't', name: 'n', kind: 'motion', slot: 'in', strength: 1 }, 'x')).toBeNull();
  });
});

describe('loading stored presets', () => {
  const good = () => {
    const { ctx, a } = setup(1);
    applyTemplateToLayer(a, tpl('motion.slideInLeft'), ctx);
    return JSON.parse(JSON.stringify(captureAnimation(a, a.anims[0], 'Good')!));
  };

  it('accepts a well-formed preset', () => {
    expect(sanitizePreset(good())?.name).toBe('Good');
  });

  it('drops malformed keys and unknown effects instead of failing', () => {
    const raw = good();
    raw.props[0].keys.push({ t: Number.NaN, v: 1, ease: 'linear' }, { t: 1, v: 'x', ease: 'linear' }, { t: 1, v: 1, ease: 'wobble' }, { t: -4, v: 1, ease: 'linear' });
    raw.effects = [{ type: 'rm -rf', props: {} }, { type: 'glow', props: { radius: { kind: 'number', value: 33 }, bogus: { kind: 'number', value: 1 } } }];
    const p = sanitizePreset(raw)!;
    expect(p.props[0].keys.every((k) => Number.isFinite(k.t) && k.t >= 0)).toBe(true);
    expect(p.props[0].keys).toHaveLength(good().props[0].keys.length);
    expect(p.effects).toHaveLength(1);
    expect(p.effects[0].props.radius.value).toBe(33);
    expect(p.effects[0].props.bogus).toBeUndefined();
  });

  it('rejects things that are not presets', () => {
    for (const bad of [null, 5, 'x', [], {}, { id: 'abc', name: 'n', kind: 'motion', props: [] }, { id: 'user.1', name: 'n', kind: 'nonsense', props: [] }, { id: 'user.1', name: 'n', kind: 'motion', props: [] }]) {
      expect(sanitizePreset(bad)).toBeNull();
    }
  });

  it('applies safely even if values do not fit the property', () => {
    const raw = good();
    raw.props.push({ target: { group: 'transform', key: 'opacity' }, keys: [{ t: 0, v: [1, 2, 3], ease: 'linear' }] });
    raw.props.push({ target: { group: 'fx', index: 9, key: 'x' }, keys: [{ t: 0, v: 1, ease: 'linear' }] });
    const p = sanitizePreset(raw)!;
    const { project, ctx, b } = setup(0);
    applyTemplateToLayer(b, presetTemplate(p), ctx);
    expect(b.transform.opacity.keys.length).toBeLessThanOrEqual(2);
    const back = parseProject(serializeProject(project, {})).project;
    expect(JSON.stringify(back)).toBe(JSON.stringify(project));
  });
});
