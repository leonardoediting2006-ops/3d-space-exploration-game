import { describe, expect, it } from 'vitest';
import { createComp, createProject, createShape, createText } from '../core/factory';
import { parseProject, serializeProject } from '../core/serialize';
import type { Layer, Project } from '../core/types';
import { GRADIENT_PRESETS, LIBRARY, LIBRARY_ORDER, MOTION, LOOKS, SCENES, TEXT_ANIMATIONS, TEXT_STYLES, TEMPLATE_COUNT, EASING_PRESETS } from './index';
import { buildPreview } from './preview';
import type { TemplateCtx } from './types';

function setup(): { project: Project; ctx: TemplateCtx } {
  const project = createProject();
  const comp = createComp({ name: 'T', width: 1920, height: 1080, fps: 30, duration: 10 });
  project.comps = { [comp.id]: comp };
  project.compOrder = [comp.id];
  return { project, ctx: { project, comp, t: 1, fps: 30 } };
}

const textLayer = (ctx: TemplateCtx): Layer => createText({ name: 'Text', comp: ctx.comp, time: 0, text: 'Hello World\nSecond line', position: [960, 540] });
const shapeLayer = (ctx: TemplateCtx): Layer => createShape({ name: 'Shape', comp: ctx.comp, time: 0, shape: 'rect', size: [300, 300], position: [960, 540] });

/** The project must survive a save/load round trip — that is the strictest validity check we have. */
function assertValid(project: Project): void {
  const text = serializeProject(project, {});
  const back = parseProject(text).project;
  expect(JSON.stringify(back)).toBe(JSON.stringify(project));
}

describe('template library', () => {
  it('is big and every id is unique', () => {
    const ids = LIBRARY_ORDER.flatMap((c) => LIBRARY[c].map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(TEXT_STYLES.length).toBeGreaterThanOrEqual(36);
    expect(TEXT_ANIMATIONS.length).toBeGreaterThanOrEqual(36);
    expect(GRADIENT_PRESETS.length).toBeGreaterThanOrEqual(48);
    expect(EASING_PRESETS.length).toBeGreaterThanOrEqual(48);
    expect(MOTION.length).toBeGreaterThanOrEqual(60);
    expect(LOOKS.length).toBeGreaterThanOrEqual(35);
    expect(SCENES.length).toBeGreaterThanOrEqual(30);
    expect(TEMPLATE_COUNT).toBeGreaterThanOrEqual(300);
  });

  it('names are non-empty and groups are set', () => {
    for (const c of LIBRARY_ORDER) for (const i of LIBRARY[c]) {
      expect(i.name.trim().length).toBeGreaterThan(0);
      expect(i.group.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('text templates', () => {
  for (const tpl of [...TEXT_STYLES, ...TEXT_ANIMATIONS]) {
    it(`${tpl.id} applies cleanly, serialises, and re-applying does not stack`, () => {
      const { project, ctx } = setup();
      const layer = textLayer(ctx);
      ctx.comp.layers = [layer];
      expect(tpl.accepts(layer)).toBe(true);
      tpl.apply(layer, ctx);
      assertValid(project);
      const once = { fx: layer.effects.length, an: layer.animators.length };
      tpl.apply(layer, ctx);
      expect({ fx: layer.effects.length, an: layer.animators.length }).toEqual(once);
      assertValid(project);
      expect(tpl.accepts(shapeLayer(ctx))).toBe(false);
    });
  }

  it('a new style replaces the old style\'s effects but keeps the user\'s own', () => {
    const { project, ctx } = setup();
    const layer = textLayer(ctx);
    ctx.comp.layers = [layer];
    const own = TEXT_STYLES[0];
    const neon = TEXT_STYLES.find((s) => s.id === 'style.neonCyan')!;
    const gold = TEXT_STYLES.find((s) => s.id === 'style.goldFoil')!;
    layer.effects.push({ id: 'mine', type: 'invert', enabled: true, props: {}, source: undefined });
    own.apply(layer, ctx);
    neon.apply(layer, ctx);
    const afterNeon = layer.effects.filter((e) => e.source?.startsWith('style:')).length;
    expect(afterNeon).toBeGreaterThan(0);
    gold.apply(layer, ctx);
    expect(layer.effects.some((e) => e.source === 'style:neonCyan')).toBe(false);
    expect(layer.effects.some((e) => e.id === 'mine')).toBe(true);
    void project;
  });

  it('text animations leave text styles alone and vice versa', () => {
    const { ctx } = setup();
    const layer = textLayer(ctx);
    ctx.comp.layers = [layer];
    TEXT_STYLES.find((s) => s.id === 'style.neonCyan')!.apply(layer, ctx);
    const fx = layer.effects.length;
    TEXT_ANIMATIONS.find((a) => a.id === 'textanim.popBack')!.apply(layer, ctx);
    expect(layer.effects.length).toBe(fx);
    expect(layer.animators.length).toBeGreaterThan(0);
    TEXT_STYLES.find((s) => s.id === 'style.goldFoil')!.apply(layer, ctx);
    expect(layer.animators.length).toBeGreaterThan(0);
  });

  it('outline styles turn the fill off; normal ones turn it back on', () => {
    const { ctx } = setup();
    const layer = textLayer(ctx);
    TEXT_STYLES.find((s) => s.id === 'style.outlineWhite')!.apply(layer, ctx);
    expect(layer.data.type === 'text' && layer.data.fill).toBe(false);
    TEXT_STYLES.find((s) => s.id === 'style.cleanWhite')!.apply(layer, ctx);
    expect(layer.data.type === 'text' && layer.data.fill).toBe(true);
  });
});

describe('motion and look templates', () => {
  for (const tpl of [...MOTION, ...LOOKS]) {
    it(`${tpl.id} applies cleanly and serialises`, () => {
      const { project, ctx } = setup();
      const layer = shapeLayer(ctx);
      ctx.comp.layers = [layer];
      expect(tpl.accepts(layer)).toBe(true);
      tpl.apply(layer, ctx);
      assertValid(project);
      // animation templates must actually animate something
      if (tpl.kind === 'motion') {
        const animated =
          Object.values(layer.transform).some((p) => p.keys.length > 0 || p.wiggle) || layer.effects.some((e) => Object.values(e.props).some((p) => p.keys.length > 0));
        expect(animated).toBe(true);
      }
    });
  }

  it('applies to text and to null-free layer types, but never to nulls', () => {
    const { ctx } = setup();
    const t = textLayer(ctx);
    expect(MOTION[0].accepts(t)).toBe(true);
    const nul = { ...t, type: 'null' as const };
    expect(MOTION[0].accepts(nul as Layer)).toBe(false);
  });

  it('looks replace the previous look rather than stacking', () => {
    const { ctx } = setup();
    const layer = shapeLayer(ctx);
    LOOKS[0].apply(layer, ctx);
    const n = layer.effects.length;
    LOOKS[1].apply(layer, ctx);
    expect(layer.effects.every((e) => e.source === `look:${LOOKS[1].id.replace('look.', '')}`)).toBe(true);
    expect(layer.effects.length).toBeGreaterThan(0);
    void n;
  });

  it('keyframes land at the playhead', () => {
    const { ctx } = setup();
    const layer = shapeLayer(ctx);
    ctx.comp.layers = [layer];
    MOTION.find((m) => m.id === 'motion.fadeIn')!.apply(layer, ctx);
    expect(layer.transform.opacity.keys[0].t).toBeCloseTo(1);
  });
});

describe('scenes', () => {
  for (const scene of SCENES) {
    it(`${scene.id} builds valid, uniquely-named-by-id layers`, () => {
      const { project, ctx } = setup();
      const layers = scene.build(ctx);
      expect(layers.length).toBeGreaterThan(0);
      ctx.comp.layers = layers;
      expect(new Set(layers.map((l) => l.id)).size).toBe(layers.length);
      for (const l of layers) expect(l.name.startsWith(scene.name)).toBe(true);
      assertValid(project);
      // a scene must fit the frame it was built for: nothing placed absurdly far away at rest
      for (const l of layers) {
        const p = l.transform.position.value as number[];
        expect(Math.abs(p[0])).toBeLessThan(ctx.comp.width * 2);
        expect(Math.abs(p[1])).toBeLessThan(ctx.comp.height * 2);
      }
    });
  }

  it('scenes scale with the composition size', () => {
    const { ctx } = setup();
    const small = createComp({ name: 'S', width: 640, height: 360, fps: 30, duration: 10 });
    const c2: TemplateCtx = { ...ctx, comp: small };
    const title = SCENES.find((s) => s.id === 'scene.title.card')!;
    const big = title.build(ctx).find((l) => l.type === 'text')!;
    const sm = title.build(c2).find((l) => l.type === 'text')!;
    expect((big.content.fontSize.value as number) / (sm.content.fontSize.value as number)).toBeCloseTo(3, 5);
  });
});

describe('previews', () => {
  it('every template that has a preview builds one', () => {
    for (const c of LIBRARY_ORDER) {
      for (const item of LIBRARY[c]) {
        if (c === 'gradient' || c === 'easing') {
          expect(buildPreview(item)).toBeNull();
          continue;
        }
        const spec = buildPreview(item);
        expect(spec, item.id).not.toBeNull();
        expect(spec!.comp.layers.length).toBeGreaterThan(0);
        expect(spec!.still).toBeGreaterThanOrEqual(0);
        expect(spec!.still).toBeLessThan(spec!.comp.duration);
      }
    }
  });
});
