import type { RGB } from '../core/types';
import { GRADIENT_BY_ID, presetGradient } from './gradients';
import { addFx, dropSource, isText, setVal } from './helpers';
import type { LayerTemplate } from './types';

const SANS = 'Inter, Helvetica, Arial, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';
const MONO = '"SF Mono", Menlo, Consolas, "Courier New", monospace';
const IMPACT = 'Impact, "Arial Black", sans-serif';
const HEAVY = '"Arial Black", Impact, sans-serif';
const ROUND = '"Trebuchet MS", "Segoe UI", sans-serif';
const SCRIPT = '"Brush Script MT", "Comic Sans MS", cursive';
const CONDENSED = '"Arial Narrow", "Helvetica Neue", Arial, sans-serif';

type Add = (type: string, params: Record<string, number | number[]>) => void;

interface Spec {
  font?: string;
  bold?: boolean;
  italic?: boolean;
  /** Fill colour, or false for outline-only text. */
  fill?: RGB | false;
  /** Thumbnail backdrop (defaults to dark). */
  previewBg?: RGB;
  stroke?: { color: RGB; width: number };
  tracking?: number;
  /** Effects in stack order; the callback receives helpers bound to the layer. */
  fx?: (add: Add, gradient: (id: string, angle?: number, extra?: Record<string, number | number[]>) => void) => void;
}

const glow = (add: Add, thr: number, radius: number, intensity: number) => add('glow', { threshold: thr, radius, intensity });
const aura = (add: Add, color: RGB, soft: number, opacity = 90) => add('dropShadow', { color, opacity, direction: 135, distance: 0, softness: soft });
const shadow = (add: Add, o: { color?: RGB; opacity?: number; dir?: number; dist: number; soft: number }) =>
  add('dropShadow', { color: o.color ?? [0, 0, 0], opacity: o.opacity ?? 60, direction: o.dir ?? 135, distance: o.dist, softness: o.soft });

function style(id: string, name: string, group: string, spec: Spec): LayerTemplate {
  return {
    id: `style.${id}`,
    name,
    group,
    kind: 'textStyle',
    accepts: isText,
    previewTime: 0,
    previewDuration: 0.1,
    previewBg: spec.previewBg,
    apply(layer, c) {
      if (layer.data.type !== 'text') return;
      dropSource(layer, 'style:');
      const d = layer.data;
      d.font = spec.font ?? SANS;
      d.bold = spec.bold ?? true;
      d.italic = spec.italic ?? false;
      d.fill = spec.fill !== false;
      if (spec.fill) setVal(layer.content.fillColor, spec.fill);
      d.stroke = !!spec.stroke;
      if (spec.stroke) {
        setVal(layer.content.strokeColor, spec.stroke.color);
        setVal(layer.content.strokeWidth, spec.stroke.width);
      }
      setVal(layer.content.tracking, spec.tracking ?? 0);
      const source = `style:${id}`;
      const add: Add = (type, params) => void addFx(layer, c, type, params, source);
      const gradient = (gid: string, angle = 90, extra: Record<string, number | number[]> = {}) => {
        const g = GRADIENT_BY_ID[gid];
        if (!g) throw new Error(`Unknown gradient "${gid}"`);
        addFx(layer, c, 'gradientFill', { gradient: presetGradient(g), angle, ...extra }, source, true);
      };
      spec.fx?.(add, gradient);
    },
  };
}

const white: RGB = [255, 255, 255];
const WHITE_STROKE = (w: number) => ({ color: white, width: w });

export const TEXT_STYLES: LayerTemplate[] = [
  // ---- clean
  style('cleanWhite', 'Clean White', 'Clean', { fill: white }),
  style('boldBlack', 'Bold Black', 'Clean', { fill: [14, 14, 18], font: HEAVY, previewBg: [226, 229, 236] }),
  style('softGray', 'Soft Gray', 'Clean', { fill: [196, 202, 214], bold: false, tracking: 2 }),
  style('thinWide', 'Thin & Wide', 'Clean', { fill: white, bold: false, font: CONDENSED, tracking: 14 }),
  style('cinematic', 'Cinematic', 'Clean', {
    fill: [236, 236, 242],
    bold: false,
    tracking: 24,
    fx: (add) => shadow(add, { opacity: 45, dist: 6, soft: 14 }),
  }),
  style('elegantSerif', 'Elegant Serif', 'Clean', {
    font: SERIF,
    italic: true,
    bold: false,
    fill: [248, 238, 222],
    tracking: 6,
    fx: (add) => shadow(add, { opacity: 40, dist: 6, soft: 12 }),
  }),

  // ---- neon
  style('neonCyan', 'Neon Cyan', 'Neon', { fill: [190, 255, 255], fx: (add) => { aura(add, [0, 229, 255], 18); glow(add, 30, 46, 2.2); } }),
  style('neonPink', 'Neon Pink', 'Neon', { fill: [255, 190, 235], fx: (add) => { aura(add, [255, 40, 190], 18); glow(add, 30, 46, 2.2); } }),
  style('neonGreen', 'Neon Green', 'Neon', { fill: [210, 255, 200], fx: (add) => { aura(add, [60, 255, 90], 18); glow(add, 30, 46, 2.2); } }),
  style('neonOrange', 'Neon Orange', 'Neon', { fill: [255, 230, 190], fx: (add) => { aura(add, [255, 140, 20], 18); glow(add, 30, 46, 2.2); } }),
  style('neonPurple', 'Neon Purple', 'Neon', { fill: [235, 215, 255], fx: (add) => { aura(add, [150, 70, 255], 20); glow(add, 30, 50, 2.2); } }),
  style('neonOutline', 'Neon Outline', 'Neon', {
    fill: false,
    stroke: { color: [120, 245, 255], width: 5 },
    fx: (add) => { aura(add, [0, 200, 255], 14); glow(add, 20, 40, 2.4); },
  }),
  style('goldOutline', 'Gold Outline', 'Neon', {
    fill: false,
    stroke: { color: [255, 205, 90], width: 5 },
    fx: (add) => { aura(add, [255, 160, 0], 12, 80); glow(add, 20, 34, 1.6); },
  }),

  // ---- outline
  style('outlineWhite', 'Outline', 'Outline', { fill: false, stroke: WHITE_STROKE(6) }),
  style('outlineBold', 'Bold Outline', 'Outline', { fill: false, stroke: WHITE_STROKE(12), fx: (add) => shadow(add, { opacity: 85, dist: 10, soft: 0 }) }),
  style('blueprint', 'Blueprint', 'Outline', { font: MONO, fill: false, bold: false, stroke: { color: [140, 200, 255], width: 3 }, tracking: 4 }),
  style('stickerWhite', 'Sticker', 'Outline', {
    fill: [20, 20, 30],
    stroke: WHITE_STROKE(16),
    fx: (add) => shadow(add, { opacity: 45, dist: 8, soft: 16 }),
  }),

  // ---- shadow & depth
  style('softShadow', 'Soft Shadow', 'Depth', { fill: white, fx: (add) => shadow(add, { opacity: 55, dist: 10, soft: 20 }) }),
  style('hardShadow', 'Hard Shadow', 'Depth', { fill: white, fx: (add) => shadow(add, { opacity: 100, dist: 12, soft: 0 }) }),
  style('longShadow', 'Long Shadow', 'Depth', {
    fill: white,
    fx: (add) => { for (let i = 0; i < 6; i++) shadow(add, { color: [70, 78, 160], opacity: 100, dist: 5, soft: 0 }); },
  }),
  style('extrude3d', '3D Extrude', 'Depth', {
    fill: [255, 220, 120],
    fx: (add) => { for (let i = 0; i < 8; i++) shadow(add, { color: [150, 70, 20], opacity: 100, dist: 3, soft: 0 }); shadow(add, { opacity: 50, dist: 14, soft: 18 }); },
  }),
  style('glitchRGB', 'Glitch', 'Depth', {
    fill: white,
    fx: (add) => {
      shadow(add, { color: [0, 255, 255], opacity: 100, dir: 90, dist: 7, soft: 0 });
      shadow(add, { color: [255, 0, 90], opacity: 100, dir: 270, dist: 7, soft: 0 });
    },
  }),

  // ---- gradients & materials
  style('sunsetText', 'Sunset', 'Gradient', { fill: white, fx: (_a, g) => g('sunset') }),
  style('fireText', 'Fire', 'Gradient', { fill: white, fx: (add, g) => { g('fire'); glow(add, 40, 36, 1.2); } }),
  style('iceText', 'Ice', 'Gradient', { fill: white, stroke: { color: [225, 245, 255], width: 2 }, fx: (add, g) => { g('ice'); glow(add, 40, 30, 1.0); } }),
  style('rainbowText', 'Rainbow', 'Gradient', { fill: white, fx: (_a, g) => g('rainbow', 0) }),
  style('oceanText', 'Ocean', 'Gradient', { fill: white, fx: (_a, g) => g('ocean') }),
  style('auroraText', 'Aurora', 'Gradient', { fill: white, fx: (add, g) => { g('aurora', 20); glow(add, 45, 30, 0.9); } }),
  style('pastelText', 'Pastel', 'Gradient', { fill: white, fx: (add, g) => { g('blush', 0); shadow(add, { opacity: 30, dist: 6, soft: 12 }); } }),
  style('goldFoil', 'Gold Foil', 'Material', { fill: white, fx: (add, g) => { g('gold'); shadow(add, { opacity: 55, dist: 6, soft: 10 }); } }),
  style('chrome', 'Chrome', 'Material', { fill: white, stroke: { color: [40, 44, 52], width: 3 }, fx: (add, g) => { g('chrome'); shadow(add, { opacity: 50, dist: 8, soft: 12 }); } }),
  style('roseGoldText', 'Rose Gold', 'Material', { fill: white, fx: (add, g) => { g('roseGold'); shadow(add, { opacity: 45, dist: 5, soft: 10 }); } }),
  style('hologramText', 'Hologram', 'Material', { fill: white, fx: (add, g) => { g('hologram', 30); glow(add, 50, 24, 1.1); add('noise', { amount: 8 }); } }),
  style('frost', 'Frost', 'Material', { fill: white, stroke: { color: [220, 240, 255], width: 2 }, fx: (add, g) => { g('babyBlue'); aura(add, [180, 225, 255], 14, 80); } }),

  // ---- retro & pop
  style('retro80s', 'Retro 80s', 'Retro', {
    font: HEAVY,
    fill: white,
    stroke: { color: [255, 255, 255], width: 3 },
    fx: (add, g) => { g('miami'); shadow(add, { color: [80, 20, 140], opacity: 100, dist: 10, soft: 0 }); },
  }),
  style('synthwave', 'Synthwave', 'Retro', {
    font: HEAVY,
    italic: true,
    fill: white,
    fx: (add, g) => { g('synthwave'); aura(add, [255, 60, 170], 16, 70); },
  }),
  style('vaporText', 'Vaporwave', 'Retro', { font: ROUND, fill: white, fx: (add, g) => { g('vaporwave', 0); shadow(add, { color: [40, 0, 80], opacity: 70, dist: 6, soft: 0 }); } }),
  style('terminal', 'Terminal', 'Retro', { font: MONO, bold: false, fill: [70, 255, 130], tracking: 2, fx: (add) => glow(add, 30, 22, 1.3) }),
  style('comic', 'Comic', 'Pop', {
    font: IMPACT,
    fill: [255, 214, 0],
    stroke: { color: [10, 10, 14], width: 10 },
    fx: (add) => shadow(add, { opacity: 100, dist: 9, soft: 0 }),
  }),
  style('meme', 'Meme Impact', 'Pop', { font: IMPACT, fill: white, stroke: { color: [0, 0, 0], width: 9 } }),
  style('bubblegum', 'Bubblegum', 'Pop', {
    font: ROUND,
    fill: [255, 120, 190],
    stroke: WHITE_STROKE(9),
    fx: (add) => shadow(add, { color: [180, 40, 110], opacity: 100, dist: 8, soft: 0 }),
  }),
  style('stencilBlock', 'Stencil Block', 'Pop', { font: HEAVY, fill: [255, 184, 0], stroke: { color: [12, 12, 14], width: 7 } }),
  style('script', 'Script', 'Pop', { font: SCRIPT, italic: true, bold: false, fill: [255, 245, 235], fx: (add) => shadow(add, { opacity: 50, dist: 5, soft: 10 }) }),
  style('horror', 'Horror', 'Pop', {
    previewBg: [38, 34, 36],
    font: SERIF,
    fill: [186, 12, 12],
    fx: (add) => { shadow(add, { opacity: 95, dist: 6, soft: 14 }); glow(add, 40, 40, 1.4); },
  }),
];

