import { createAdjustment, createShape, createSolid, createText } from '../core/factory';
import { hexToRgb } from '../core/gradient';
import type { Layer, RGB, Vec2 } from '../core/types';
import { GRADIENT_BY_ID, presetGradient } from './gradients';
import { addFx, E, loop, setVal, tween } from './helpers';
import { LOOKS } from './effectPresets';
import { MOTION } from './motion';
import { TEXT_ANIMATIONS } from './textAnimations';
import { TEXT_STYLES } from './textStyles';
import type { LayerTemplate, SceneTemplate, TemplateCtx } from './types';

const TEMPLATE_BY_ID: Record<string, LayerTemplate> = Object.fromEntries([...TEXT_STYLES, ...TEXT_ANIMATIONS, ...MOTION, ...LOOKS].map((t) => [t.id, t]));

/** Apply another template to a layer a scene created, optionally delayed. */
function use(layer: Layer, c: TemplateCtx, id: string, delay = 0): void {
  const t = TEMPLATE_BY_ID[id];
  if (!t) throw new Error(`Scene refers to unknown template "${id}"`);
  t.apply(layer, { ...c, t: c.t + delay });
}

const base = (c: TemplateCtx) => ({ comp: c.comp, time: c.t });
const kOf = (c: TemplateCtx) => c.comp.height / 1080;
const hex = hexToRgb;

function gradientBg(c: TemplateCtx, name: string, gradientId: string, angle = 90, extra: Record<string, number | number[]> = {}): Layer {
  const layer = createSolid({ ...base(c), name, color: [255, 255, 255], width: c.comp.width, height: c.comp.height });
  const g = GRADIENT_BY_ID[gradientId];
  if (!g) throw new Error(`Unknown gradient "${gradientId}"`);
  addFx(layer, c, 'gradientFill', { gradient: presetGradient(g), angle, ...extra }, 'scene:bg');
  layer.label = 5;
  return layer;
}

function box(c: TemplateCtx, name: string, o: { x: number; y: number; w: number; h: number; color: RGB; round?: number }): Layer {
  const k = kOf(c);
  const l = createShape({ ...base(c), name, shape: 'rect', size: [o.w * k, o.h * k], position: [(o.x * c.comp.width) / 1920, o.y * k], fill: o.color });
  if (o.round) setVal(l.content.roundness, o.round * k);
  return l;
}

/** A text layer positioned in a 1920×1080 design space and scaled to the comp. */
function label(c: TemplateCtx, str: string, o: { x: number; y: number; size: number; color?: RGB; bold?: boolean; align?: 'left' | 'center' | 'right'; tracking?: number; name?: string }): Layer {
  const k = kOf(c);
  const l = createText({ ...base(c), name: o.name ?? str, text: str, position: [(o.x * c.comp.width) / 1920, o.y * k] });
  setVal(l.content.fontSize, o.size * k);
  if (o.color) setVal(l.content.fillColor, o.color);
  if (o.tracking) setVal(l.content.tracking, o.tracking * k);
  if (l.data.type === 'text') {
    if (o.bold !== undefined) l.data.bold = o.bold;
    if (o.align) l.data.align = o.align;
  }
  return l;
}

/** Layers are authored bottom → top; the library inserts them top → bottom. */
const stack = (...layers: Layer[]): Layer[] => layers.reverse();

function scene(id: string, name: string, group: string, build: (c: TemplateCtx) => Layer[], timing = { still: 1.4, length: 3.2 }): SceneTemplate {
  return {
    id: `scene.${id}`,
    name,
    group,
    previewTime: timing.still,
    previewDuration: timing.length,
    build(c) {
      const layers = build(c);
      for (const l of layers) l.name = `${name} · ${l.name}`;
      return layers;
    },
  };
}

const staticBg = (id: string, name: string, gradient: string, angle = 90) => scene(`bg.${id}`, name, 'Backgrounds', (c) => [gradientBg(c, 'Gradient', gradient, angle)], { still: 0, length: 0.1 });

/** Deterministic pseudo-random numbers so a burst looks the same every time it is inserted. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const SCENES: SceneTemplate[] = [
  // ---- gradient backgrounds
  staticBg('sunset', 'Sunset', 'sunset', 120),
  staticBg('ocean', 'Ocean', 'deepSea', 100),
  staticBg('aurora', 'Aurora', 'aurora', 135),
  staticBg('midnight', 'Midnight', 'midnight', 90),
  staticBg('neon', 'Cyberpunk', 'cyberpunk', 135),
  staticBg('lavender', 'Lavender', 'lavender', 120),
  staticBg('fire', 'Fire', 'fire', 100),
  staticBg('forest', 'Forest', 'forest', 100),
  staticBg('synth', 'Synthwave', 'synthwave', 90),
  staticBg('peach', 'Peach', 'peach', 120),

  // ---- animated backgrounds
  scene('bg.flow', 'Flowing Aurora', 'Animated Backgrounds', (c) => {
    const l = gradientBg(c, 'Flowing gradient', 'aurora', 135, { repeats: 2, mode: 2 });
    const fx = l.effects[0];
    tween(fx.props.offset, c, c.t, [[0, 0], [6, 100]]);
    loop(fx.props.offset);
    return [l];
  }, { still: 1.5, length: 6 }),
  scene('bg.rainbow', 'Color Cycle', 'Animated Backgrounds', (c) => {
    const l = gradientBg(c, 'Cycling gradient', 'rainbowLoop', 120, { mode: 1 });
    const fx = l.effects[0];
    tween(fx.props.offset, c, c.t, [[0, 0], [8, 100]]);
    loop(fx.props.offset);
    return [l];
  }, { still: 2, length: 8 }),
  scene('bg.pulse', 'Pulsing Glow', 'Animated Backgrounds', (c) => {
    const l = gradientBg(c, 'Pulsing radial', 'plasma', 90, { type: 1 });
    const fx = l.effects[0];
    tween(fx.props.scale, c, c.t, [[0, 70, E('sineInOut')], [3, 115]]);
    loop(fx.props.scale, 'pingpong');
    return [l];
  }, { still: 1.5, length: 3 }),
  scene('bg.spotlight', 'Spotlight', 'Animated Backgrounds', (c) => {
    const l = gradientBg(c, 'Spotlight', 'graphite', 90, { type: 1, scale: 85 });
    const g = l.effects[0].props.gradient;
    setVal(g, [0, 78, 86, 120, 1, 6, 7, 12]);
    return [l];
  }, { still: 0, length: 0.1 }),
  scene('bg.clouds', 'Drifting Clouds', 'Animated Backgrounds', (c) => {
    const k = kOf(c);
    const sky = gradientBg(c, 'Sky', 'sky', 90);
    const clouds = createSolid({ ...base(c), name: 'Clouds', color: [255, 255, 255], width: c.comp.width, height: c.comp.height });
    const fx = addFx(clouds, c, 'fractalNoise', { scale: 420 * k, complexity: 5, contrast: 170, brightness: 4 }, 'scene:bg');
    tween(fx.props.evolution, c, c.t, [[0, 0], [12, 360]]);
    loop(fx.props.evolution);
    clouds.blend = 'soft-light';
    return stack(sky, clouds);
  }, { still: 3, length: 6 }),
  scene('bg.checker', 'Checkerboard', 'Animated Backgrounds', (c) => {
    const l = createSolid({ ...base(c), name: 'Checkerboard', color: [255, 255, 255], width: c.comp.width, height: c.comp.height });
    addFx(l, c, 'checkerboard', { size: 90 * kOf(c), colorA: [34, 36, 46], colorB: [24, 25, 32] }, 'scene:bg');
    return [l];
  }, { still: 0, length: 0.1 }),
  scene('bg.grain', 'Grainy Gradient', 'Animated Backgrounds', (c) => {
    const l = gradientBg(c, 'Grain gradient', 'canyon', 120);
    addFx(l, c, 'noise', { amount: 12 }, 'scene:bg');
    return [l];
  }, { still: 0, length: 0.1 }),
  scene('bg.bokeh', 'Bokeh Lights', 'Animated Backgrounds', (c) => {
    const k = kOf(c);
    const r = rng(7);
    const palette = ['#ffd6a5', '#ffadad', '#caffbf', '#9bf6ff', '#bdb2ff', '#fdffb6'];
    const bg = gradientBg(c, 'Backdrop', 'midnight', 120);
    const dots: Layer[] = [];
    for (let i = 0; i < 14; i++) {
      const size = (90 + r() * 200) * k;
      const x = r() * c.comp.width;
      const y = r() * c.comp.height;
      const d = createShape({ ...base(c), name: `Light ${i + 1}`, shape: 'ellipse', size: [size, size], position: [x, y], fill: hex(palette[i % palette.length]) });
      addFx(d, c, 'gaussianBlur', { blurriness: 14 * k }, 'scene:bg');
      d.blend = 'screen';
      setVal(d.transform.opacity, 25 + r() * 45);
      tween(d.transform.position, c, c.t, [[0, [x, y], E('sineInOut')], [3 + r() * 3, [x + (r() - 0.5) * 160 * k, y - (40 + r() * 120) * k]]]);
      loop(d.transform.position, 'pingpong');
      dots.push(d);
    }
    return stack(bg, ...dots);
  }, { still: 1.5, length: 5 }),

  // ---- titles
  scene('title.card', 'Title Card', 'Titles', (c) => {
    const bg = gradientBg(c, 'Background', 'midnight', 120);
    const t = label(c, 'TITLE', { x: 960, y: 590, size: 240, name: 'Title' });
    use(t, c, 'style.cleanWhite');
    use(t, c, 'textanim.popBack');
    return stack(bg, t);
  }),
  scene('title.subtitle', 'Title + Subtitle', 'Titles', (c) => {
    const bg = gradientBg(c, 'Background', 'deepSea', 100);
    const t = label(c, 'Your Title Here', { x: 960, y: 520, size: 150, name: 'Title' });
    const s = label(c, 'a short subtitle goes here', { x: 960, y: 640, size: 60, bold: false, color: [190, 210, 240], name: 'Subtitle' });
    use(t, c, 'style.softShadow');
    use(t, c, 'textanim.slideUp');
    use(s, c, 'style.softGray');
    use(s, c, 'textanim.softReveal', 0.5);
    return stack(bg, t, s);
  }),
  scene('title.cinematic', 'Cinematic Title', 'Titles', (c) => {
    const bg = createSolid({ ...base(c), name: 'Background', color: [8, 9, 12], width: c.comp.width, height: c.comp.height });
    const t = label(c, 'THE LONG ROAD', { x: 960, y: 560, size: 150, name: 'Title' });
    use(t, c, 'style.cinematic');
    use(t, c, 'textanim.trackingIn');
    const s = label(c, 'A FILM BY SOMEONE', { x: 960, y: 650, size: 44, tracking: 14, bold: false, color: [150, 154, 166], name: 'Credit' });
    use(s, c, 'textanim.fadeLetters', 1);
    const vig = createAdjustment({ ...base(c), name: 'Vignette' });
    addFx(vig, c, 'vignette', { amount: 80, size: 60, feather: 70 }, 'scene:vignette');
    return stack(bg, t, s, vig);
  }, { still: 1.6, length: 3.6 }),
  scene('title.neon', 'Neon Sign', 'Titles', (c) => {
    const bg = createSolid({ ...base(c), name: 'Wall', color: [12, 8, 20], width: c.comp.width, height: c.comp.height });
    const t = label(c, 'OPEN', { x: 960, y: 610, size: 300, name: 'Sign' });
    use(t, c, 'style.neonPink');
    use(t, c, 'motion.flicker');
    return stack(bg, t);
  }, { still: 0.5, length: 2 }),
  scene('title.gold', 'Gold Title', 'Titles', (c) => {
    const bg = gradientBg(c, 'Background', 'graphite', 90);
    const t = label(c, 'GRAND OPENING', { x: 960, y: 570, size: 190, name: 'Title' });
    use(t, c, 'style.goldFoil');
    use(t, c, 'textanim.softReveal');
    use(t, c, 'textanim.shimmer', 1.6);
    return stack(bg, t);
  }, { still: 2.4, length: 4.2 }),
  scene('title.quote', 'Quote Card', 'Titles', (c) => {
    const bg = gradientBg(c, 'Background', 'lavender', 120);
    const q = label(c, '“Simplicity is the\nultimate sophistication.”', { x: 960, y: 470, size: 110, color: [40, 30, 70], name: 'Quote' });
    use(q, c, 'style.elegantSerif');
    setVal(q.content.fillColor, [40, 30, 70]);
    use(q, c, 'textanim.lineSlide');
    const a = label(c, '— LEONARDO DA VINCI', { x: 960, y: 800, size: 44, tracking: 10, bold: false, color: [90, 70, 130], name: 'Attribution' });
    use(a, c, 'textanim.fadeLetters', 1.2);
    return stack(bg, q, a);
  }, { still: 2, length: 4 }),
  scene('title.number', 'Big Number', 'Titles', (c) => {
    const bg = gradientBg(c, 'Background', 'neonPink', 135);
    const n = label(c, '100K', { x: 960, y: 650, size: 420, name: 'Number' });
    use(n, c, 'style.sunsetText');
    use(n, c, 'textanim.elasticPop');
    const s = label(c, 'SUBSCRIBERS', { x: 960, y: 780, size: 70, tracking: 18, bold: false, name: 'Label' });
    use(s, c, 'textanim.softReveal', 0.9);
    return stack(bg, n, s);
  }, { still: 1.8, length: 3.6 }),

  // ---- lower thirds
  scene('lt.bar', 'Lower Third · Bar', 'Lower Thirds', (c) => {
    const k = kOf(c);
    const bar = box(c, 'Bar', { x: 560, y: 900, w: 840, h: 150, color: [74, 144, 226] });
    const x0 = bar.transform.position.value as Vec2;
    tween(bar.transform.position, c, c.t, [[0, [x0[0] - 900 * k, x0[1]], E('expoOut')], [0.7, x0]]);
    const name = label(c, 'Alex Morgan', { x: 200, y: 900, size: 66, align: 'left', name: 'Name' });
    const role = label(c, 'Creative Director', { x: 200, y: 960, size: 40, align: 'left', bold: false, color: [225, 238, 255], name: 'Role' });
    for (const [l, d] of [[name, 0.35], [role, 0.5]] as const) {
      const p = l.transform.position.value as Vec2;
      tween(l.transform.position, c, c.t, [[d, [p[0] - 200 * k, p[1]], E('expoOut')], [d + 0.6, p]]);
      tween(l.transform.opacity, c, c.t, [[d, 0], [d + 0.4, 100]]);
    }
    return stack(bar, name, role);
  }, { still: 1.3, length: 3 }),
  scene('lt.minimal', 'Lower Third · Minimal', 'Lower Thirds', (c) => {
    const k = kOf(c);
    const line = box(c, 'Line', { x: 480, y: 872, w: 560, h: 5, color: [255, 255, 255] });
    line.transform.anchor.value = [-280 * k, 0];
    line.transform.position.value = [200 * (c.comp.width / 1920), 872 * k];
    tween(line.transform.scale, c, c.t, [[0, [0, 100], E('expoOut')], [0.7, [100, 100]]]);
    const name = label(c, 'ALEX MORGAN', { x: 200, y: 845, size: 56, align: 'left', tracking: 6, name: 'Name' });
    const role = label(c, 'Creative Director', { x: 200, y: 935, size: 38, align: 'left', bold: false, color: [200, 205, 215], name: 'Role' });
    use(name, c, 'textanim.slideUp', 0.2);
    use(role, c, 'textanim.softReveal', 0.5);
    return stack(line, name, role);
  }, { still: 1.4, length: 3 }),
  scene('lt.pill', 'Lower Third · Pill', 'Lower Thirds', (c) => {
    const pill = box(c, 'Pill', { x: 520, y: 900, w: 720, h: 120, color: [255, 255, 255], round: 60 });
    tween(pill.transform.scale, c, c.t, [[0, [0, 0], E('backOut')], [0.6, [100, 100]]]);
    const t = label(c, 'Alex Morgan · Director', { x: 520, y: 925, size: 52, color: [24, 26, 40], name: 'Caption' });
    tween(t.transform.opacity, c, c.t, [[0.25, 0], [0.55, 100]]);
    return stack(pill, t);
  }, { still: 1.1, length: 2.6 }),
  scene('lt.boxes', 'Lower Third · Stacked', 'Lower Thirds', (c) => {
    const k = kOf(c);
    const top = box(c, 'Name box', { x: 470, y: 868, w: 560, h: 96, color: [255, 255, 255] });
    const bot = box(c, 'Role box', { x: 470, y: 952, w: 560, h: 72, color: [20, 24, 36] });
    const n = label(c, 'ALEX MORGAN', { x: 470, y: 898, size: 52, color: [20, 24, 36], name: 'Name' });
    const r = label(c, 'Creative Director', { x: 470, y: 972, size: 36, bold: false, name: 'Role' });
    for (const [l, d] of [[top, 0], [bot, 0.15]] as const) {
      l.transform.anchor.value = [-280 * k, 0];
      l.transform.position.value = [190 * (c.comp.width / 1920), (l.transform.position.value as Vec2)[1]];
      tween(l.transform.scale, c, c.t, [[d, [0, 100], E('expoOut')], [d + 0.6, [100, 100]]]);
    }
    use(n, c, 'textanim.softReveal', 0.45);
    use(r, c, 'textanim.softReveal', 0.65);
    return stack(top, bot, n, r);
  }, { still: 1.3, length: 3 }),

  // ---- elements
  scene('el.callout', 'Callout Label', 'Elements', (c) => {
    const pill = box(c, 'Pill', { x: 960, y: 540, w: 560, h: 130, color: [255, 214, 0], round: 65 });
    const t = label(c, 'NEW!', { x: 960, y: 580, size: 84, color: [30, 24, 0], name: 'Label' });
    use(pill, c, 'motion.popIn');
    use(t, c, 'motion.popIn', 0.1);
    use(pill, c, 'motion.float', 0.8);
    use(t, c, 'motion.float', 0.8);
    return stack(pill, t);
  }, { still: 0.9, length: 3 }),
  scene('el.loader', 'Loading Ring', 'Elements', (c) => {
    const k = kOf(c);
    const track = createShape({ ...base(c), name: 'Track', shape: 'ellipse', size: [300 * k, 300 * k], position: [c.comp.width / 2, c.comp.height / 2], fill: [255, 255, 255], stroke: [255, 255, 255], strokeWidth: 18 * k });
    if (track.data.type === 'shape') {
      track.data.fill = false;
      track.data.stroke = true;
    }
    setVal(track.transform.opacity, 18);
    const ring = createShape({ ...base(c), name: 'Spinner', shape: 'ellipse', size: [300 * k, 300 * k], position: [c.comp.width / 2, c.comp.height / 2], fill: [74, 144, 226], stroke: [74, 144, 226], strokeWidth: 18 * k });
    if (ring.data.type === 'shape') {
      ring.data.fill = false;
      ring.data.stroke = true;
    }
    setVal(ring.content.trimEnd, 28);
    tween(ring.transform.rotation, c, c.t, [[0, 0], [1.1, 360]]);
    loop(ring.transform.rotation);
    return stack(track, ring);
  }, { still: 0.5, length: 1.1 }),
  scene('el.progress', 'Progress Bar', 'Elements', (c) => {
    const k = kOf(c);
    const w = 900;
    const track = box(c, 'Track', { x: 960, y: 540, w, h: 28, color: [60, 64, 82], round: 14 });
    const fill = box(c, 'Fill', { x: 960, y: 540, w, h: 28, color: [90, 200, 120], round: 14 });
    fill.transform.anchor.value = [(-w / 2) * k, 0];
    fill.transform.position.value = [c.comp.width / 2 - (w / 2) * k, 540 * k];
    tween(fill.transform.scale, c, c.t, [[0, [0, 100]], [3, [100, 100], E('cubicInOut')]]);
    return stack(track, fill);
  }, { still: 1.5, length: 3.4 }),
  scene('el.confetti', 'Confetti Burst', 'Elements', (c) => {
    const k = kOf(c);
    const r = rng(21);
    const palette = ['#ff5d8f', '#ffd166', '#06d6a0', '#4cc9f0', '#b388ff', '#ff9f1c'];
    const out: Layer[] = [];
    for (let i = 0; i < 28; i++) {
      const ang = r() * Math.PI * 2;
      const dist = (260 + r() * 520) * k;
      const w = (14 + r() * 18) * k;
      const piece = createShape({ ...base(c), name: `Piece ${i + 1}`, shape: 'rect', size: [w, w * (0.4 + r() * 0.6)], position: [c.comp.width / 2, c.comp.height / 2], fill: hex(palette[i % palette.length]) });
      const x = c.comp.width / 2;
      const y = c.comp.height / 2;
      const life = 1.4 + r() * 0.8;
      tween(piece.transform.position, c, c.t, [[0, [x, y], E('cubicOut')], [life, [x + Math.cos(ang) * dist, y + Math.sin(ang) * dist + 160 * k]]]);
      tween(piece.transform.rotation, c, c.t, [[0, 0], [life, (r() - 0.5) * 900]]);
      tween(piece.transform.scale, c, c.t, [[0, [0, 0], E('backOut')], [0.12, [100, 100]]]);
      tween(piece.transform.opacity, c, c.t, [[life * 0.6, 100], [life, 0]]);
      out.push(piece);
    }
    return stack(...out);
  }, { still: 0.7, length: 2.6 }),
  scene('el.ripples', 'Ripples', 'Elements', (c) => {
    const k = kOf(c);
    const out: Layer[] = [];
    for (let i = 0; i < 3; i++) {
      const ring = createShape({ ...base(c), name: `Ripple ${i + 1}`, shape: 'ellipse', size: [600 * k, 600 * k], position: [c.comp.width / 2, c.comp.height / 2], fill: [120, 200, 255], stroke: [120, 200, 255], strokeWidth: 8 * k });
      if (ring.data.type === 'shape') {
        ring.data.fill = false;
        ring.data.stroke = true;
      }
      const d = i * 0.7;
      tween(ring.transform.scale, c, c.t, [[d, [0, 0], E('cubicOut')], [d + 2.1, [100, 100]]]);
      tween(ring.transform.opacity, c, c.t, [[d, 100], [d + 2.1, 0]]);
      loop(ring.transform.scale);
      loop(ring.transform.opacity);
      out.push(ring);
    }
    return stack(...out);
  }, { still: 1.2, length: 2.1 }),
  scene('el.stars', 'Twinkling Stars', 'Elements', (c) => {
    const k = kOf(c);
    const r = rng(5);
    const out: Layer[] = [];
    for (let i = 0; i < 9; i++) {
      const size = (36 + r() * 60) * k;
      const star = createShape({ ...base(c), name: `Star ${i + 1}`, shape: 'star', size: [size, size], position: [(0.1 + r() * 0.8) * c.comp.width, (0.1 + r() * 0.8) * c.comp.height], fill: [255, 226, 130] });
      const d = r() * 1.2;
      tween(star.transform.scale, c, c.t, [[d, [30, 30], E('sineInOut')], [d + 0.9, [110, 110]]]);
      loop(star.transform.scale, 'pingpong');
      tween(star.transform.rotation, c, c.t, [[0, 0], [4, 90]]);
      loop(star.transform.rotation, 'pingpong');
      addFx(star, c, 'glow', { threshold: 40, radius: 22 * k, intensity: 1.4 }, 'scene:stars');
      out.push(star);
    }
    return stack(...out);
  }, { still: 1.1, length: 2.4 }),
];

