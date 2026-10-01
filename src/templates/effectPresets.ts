import type { RGB } from '../core/types';
import { GRADIENT_BY_ID, presetGradient } from './gradients';
import { addFx, dropSource, E, tween, visual } from './helpers';
import type { LayerTemplate, TemplateCtx } from './types';

type Add = (type: string, params: Record<string, number | number[]>) => ReturnType<typeof addFx>;

function look(id: string, name: string, group: string, build: (add: Add, c: TemplateCtx) => void, timing = { still: 0.4, length: 1.4 }): LayerTemplate {
  return {
    id: `look.${id}`,
    name,
    group,
    kind: 'effect',
    accepts: visual,
    previewTime: timing.still,
    previewDuration: timing.length,
    // grades and whole-image stylisations read best over the whole frame; shadows, glows and RGB splits need each layer's edges
    previewOn: ['Grade', 'Stylize', 'Animated'].includes(group) && !['glitchRGB', 'vhs'].includes(id) ? 'adjustment' : undefined,
    apply(layer, c) {
      dropSource(layer, 'look:');
      const add: Add = (type, params) => addFx(layer, c, type, params, `look:${id}`);
      build(add, c);
    },
  };
}

const shadow = (add: Add, color: RGB, opacity: number, dir: number, dist: number, soft: number) => add('dropShadow', { color, opacity, direction: dir, distance: dist, softness: soft });

export const LOOKS: LayerTemplate[] = [
  // ---- glow & light
  look('softGlow', 'Soft Glow', 'Glow', (add) => add('glow', { threshold: 55, radius: 30, intensity: 1 })),
  look('strongBloom', 'Strong Bloom', 'Glow', (add) => add('glow', { threshold: 35, radius: 70, intensity: 2.2 })),
  look('dreamy', 'Dreamy', 'Glow', (add) => {
    add('gaussianBlur', { blurriness: 5 });
    add('glow', { threshold: 40, radius: 50, intensity: 1.4 });
    add('brightnessContrast', { brightness: 8, contrast: -10 });
  }),
  look('whiteAura', 'White Aura', 'Glow', (add) => {
    shadow(add, [255, 255, 255], 100, 135, 0, 26);
    shadow(add, [255, 255, 255], 70, 135, 0, 50);
  }),
  look('softFocus', 'Soft Focus', 'Glow', (add) => {
    add('gaussianBlur', { blurriness: 8 });
    add('glow', { threshold: 60, radius: 24, intensity: 0.6 });
  }),

  // ---- shadows
  look('softShadow', 'Soft Shadow', 'Shadow', (add) => shadow(add, [0, 0, 0], 50, 135, 14, 26)),
  look('hardShadow', 'Hard Shadow', 'Shadow', (add) => shadow(add, [0, 0, 0], 90, 135, 10, 0)),
  look('longShadow', 'Long Shadow', 'Shadow', (add) => {
    for (let i = 0; i < 7; i++) shadow(add, [10, 12, 30], 100, 135, 6, 0);
  }),
  look('floatingShadow', 'Floating Shadow', 'Shadow', (add) => shadow(add, [0, 0, 0], 38, 180, 46, 34)),

  // ---- colour grades
  look('noir', 'Noir', 'Grade', (add) => {
    add('blackWhite', { amount: 100 });
    add('levels', { inBlack: 30, inWhite: 220, gamma: 0.9 });
    add('vignette', { amount: 80, size: 65, feather: 70 });
  }),
  look('sepia', 'Sepia', 'Grade', (add) => add('tint', { black: [44, 26, 10], white: [255, 240, 214], amount: 100 })),
  look('duotoneBlueOrange', 'Duotone Blue / Orange', 'Grade', (add) => add('tint', { black: [15, 40, 110], white: [255, 150, 60], amount: 100 })),
  look('duotonePink', 'Duotone Pink / Purple', 'Grade', (add) => add('tint', { black: [40, 10, 70], white: [255, 120, 200], amount: 100 })),
  look('duotoneGreen', 'Duotone Teal / Lime', 'Grade', (add) => add('tint', { black: [0, 50, 60], white: [190, 255, 90], amount: 100 })),
  look('coldTint', 'Cold Tint', 'Grade', (add) => add('tint', { black: [0, 20, 60], white: [205, 232, 255], amount: 35 })),
  look('warmTint', 'Warm Tint', 'Grade', (add) => add('tint', { black: [60, 20, 0], white: [255, 236, 204], amount: 35 })),
  look('neonPop', 'Neon Pop', 'Grade', (add) => {
    add('hueSaturation', { saturation: 50 });
    add('brightnessContrast', { contrast: 20 });
    add('glow', { threshold: 60, radius: 25, intensity: 0.8 });
  }),
  look('fadedFilm', 'Faded Film', 'Grade', (add) => {
    add('levels', { outBlack: 30, outWhite: 235 });
    add('hueSaturation', { saturation: -25 });
    add('noise', { amount: 8 });
  }),
  look('highContrast', 'High Contrast', 'Grade', (add) => add('brightnessContrast', { brightness: -4, contrast: 45 })),
  look('muted', 'Muted', 'Grade', (add) => add('hueSaturation', { saturation: -45, lightness: 4 })),
  look('vivid', 'Vivid', 'Grade', (add) => {
    add('hueSaturation', { saturation: 40 });
    add('brightnessContrast', { contrast: 12 });
  }),
  look('sunsetOverlay', 'Sunset Overlay', 'Grade', (add) => add('gradientFill', { gradient: presetGradient(GRADIENT_BY_ID.sunset), angle: 90, amount: 38 })),
  look('oceanOverlay', 'Ocean Overlay', 'Grade', (add) => add('gradientFill', { gradient: presetGradient(GRADIENT_BY_ID.ocean), angle: 90, amount: 38 })),
  look('neonOverlay', 'Neon Overlay', 'Grade', (add) => add('gradientFill', { gradient: presetGradient(GRADIENT_BY_ID.cyberpunk), angle: 45, amount: 42 })),
  look('invert', 'Invert', 'Grade', (add) => add('invert', { amount: 100 })),

  // ---- stylize
  look('posterPop', 'Poster Pop', 'Stylize', (add) => {
    add('posterize', { levels: 5 });
    add('hueSaturation', { saturation: 30 });
  }),
  look('pixelate', 'Pixelate', 'Stylize', (add) => add('mosaic', { blocks: 36 })),
  look('stark', 'Stark Black & White', 'Stylize', (add) => add('threshold', { level: 128 })),
  look('dramaticVignette', 'Dramatic Vignette', 'Stylize', (add) => add('vignette', { amount: 85, size: 55, feather: 70 })),
  look('filmGrain', 'Film Grain', 'Stylize', (add) => add('noise', { amount: 14 })),
  look('vhs', 'VHS', 'Stylize', (add) => {
    add('directionalBlur', { direction: 0, length: 10 });
    shadow(add, [0, 255, 255], 70, 90, 5, 0);
    shadow(add, [255, 0, 100], 70, 270, 5, 0);
    add('hueSaturation', { saturation: 20 });
    add('noise', { amount: 16 });
  }),
  look('glitchRGB', 'RGB Split', 'Stylize', (add) => {
    shadow(add, [0, 255, 255], 100, 90, 9, 0);
    shadow(add, [255, 0, 90], 100, 270, 9, 0);
  }),
  look('motionSmear', 'Motion Smear', 'Stylize', (add) => add('directionalBlur', { direction: 0, length: 40 })),
  look('bleach', 'Bleach Bypass', 'Stylize', (add) => {
    add('hueSaturation', { saturation: -55 });
    add('brightnessContrast', { contrast: 35 });
  }),

  // ---- animated
  look('blurFocusIn', 'Focus In', 'Animated', (add, c) => {
    const fx = add('gaussianBlur', { blurriness: 0 });
    tween(fx.props.blurriness, c, c.t, [[0, 50, E('cubicOut')], [0.9, 0]]);
  }, { still: 0.35, length: 1.8 }),
  look('blurDefocusOut', 'Defocus Out', 'Animated', (add, c) => {
    const fx = add('gaussianBlur', { blurriness: 0 });
    tween(fx.props.blurriness, c, c.t, [[0, 0, E('cubicIn')], [0.9, 50]]);
  }, { still: 0.6, length: 1.8 }),
  look('flashWhite', 'White Flash', 'Animated', (add, c) => {
    const fx = add('brightnessContrast', { brightness: 0 });
    tween(fx.props.brightness, c, c.t, [[0, 0, E('cubicOut')], [0.08, 100, E('cubicIn')], [0.5, 0]]);
  }, { still: 0.08, length: 1.2 }),
  look('pulseGlow', 'Pulsing Glow', 'Animated', (add, c) => {
    const fx = add('glow', { threshold: 40, radius: 40, intensity: 0.4 });
    tween(fx.props.intensity, c, c.t, [[0, 0.4, E('sineInOut')], [0.9, 2.2]]);
    fx.props.intensity.loop = 'pingpong';
  }, { still: 0.9, length: 1.8 }),
  look('hueCycle', 'Hue Cycle', 'Animated', (add, c) => {
    const fx = add('hueSaturation', { hue: 0 });
    tween(fx.props.hue, c, c.t, [[0, 0], [3, 360]]);
    fx.props.hue.loop = 'cycle';
  }, { still: 1, length: 3 }),
  look('scanDissolve', 'Pixelate In', 'Animated', (add, c) => {
    const fx = add('mosaic', { blocks: 4 });
    tween(fx.props.blocks, c, c.t, [[0, 3, E('cubicIn')], [0.9, 400]]);
  }, { still: 0.4, length: 1.8 }),
];
