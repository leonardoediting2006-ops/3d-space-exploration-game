import type { Layer, RGB } from '../core/types';
import { addAnimator, dropSource, isText, loop, setVal, stagger, tween, type AnimatorProps, type StaggerOptions } from './helpers';
import type { LayerTemplate, TemplateCtx } from './types';

interface Timing {
  /** Seconds into the preview for the still thumbnail. */
  still: number;
  /** Looping preview length. */
  length: number;
}

function anim(id: string, name: string, group: string, timing: Timing, build: (layer: Layer, c: TemplateCtx, source: string) => void): LayerTemplate {
  return {
    id: `textanim.${id}`,
    name,
    group,
    kind: 'textAnim',
    accepts: isText,
    previewTime: timing.still,
    previewDuration: timing.length,
    apply(layer, c) {
      dropSource(layer, `anim:${id}`);
      build(layer, c, `anim:${id}`);
    },
  };
}

/** A per-letter entrance or exit. */
function letters(id: string, name: string, group: string, o: Omit<StaggerOptions, 'props'> & { props: AnimatorProps }): LayerTemplate {
  const timing: Timing = o.dir === 'in' ? { still: o.dur * 0.55, length: o.dur + 0.9 } : { still: o.dur * 0.5, length: o.dur + 0.9 };
  return anim(id, name, group, timing, (layer, c, source) => stagger(layer, c, source, o));
}

/** A soft window that sweeps across the text forever, nudging whatever it passes over. */
function wave(id: string, name: string, props: AnimatorProps, o: { shape?: number; width?: number; dur?: number; units?: 0 | 1 | 2 } = {}): LayerTemplate {
  const width = o.width ?? 38;
  const dur = o.dur ?? 1.8;
  return anim(id, name, 'Loops', { still: dur * 0.45, length: dur }, (layer, c, source) => {
    const a = addAnimator(layer, 'Wave', source, { ...props, shape: o.shape ?? 4, start: 0, end: width, units: o.units ?? 0, smooth: 100 });
    tween(a.props.offset, c, c.t, [[0, -width], [dur, 100]]);
    loop(a.props.offset, 'cycle');
  });
}

const YELLOW: RGB = [255, 214, 0];

export const TEXT_ANIMATIONS: LayerTemplate[] = [
  // ---- reveal
  anim('typewriter', 'Typewriter', 'Reveal', { still: 0.9, length: 2.4 }, (layer, c, source) => {
    const a = addAnimator(layer, 'Typewriter', source, { opacity: 0, smooth: 0 });
    tween(a.props.start, c, c.t, [[0, 0], [1.6, 100]]);
  }),
  anim('typewriterFast', 'Typewriter (fast)', 'Reveal', { still: 0.4, length: 1.6 }, (layer, c, source) => {
    const a = addAnimator(layer, 'Typewriter', source, { opacity: 0, smooth: 0 });
    tween(a.props.start, c, c.t, [[0, 0], [0.8, 100]]);
  }),
  letters('softReveal', 'Soft Reveal', 'Reveal', { dir: 'in', dur: 1.5, band: 25, props: { opacity: 0 } }),
  letters('wordReveal', 'Word by Word', 'Reveal', { dir: 'in', dur: 1.3, band: 20, units: 1, props: { opacity: 0 } }),
  letters('lineReveal', 'Line by Line', 'Reveal', { dir: 'in', dur: 1.3, band: 40, units: 2, props: { opacity: 0 } }),
  letters('scatterReveal', 'Scatter Reveal', 'Reveal', { dir: 'in', dur: 1.5, band: 70, random: true, props: { opacity: 0 } }),
  letters('fadeLetters', 'Fade In Letters', 'Reveal', { dir: 'in', dur: 1.2, band: 45, letterEase: 1, props: { opacity: 0 } }),

  // ---- entrances
  letters('slideUp', 'Slide Up', 'Entrance', { dir: 'in', dur: 1.1, band: 40, letterEase: 1, props: { position: [0, 70], opacity: 0 } }),
  letters('slideDown', 'Slide Down', 'Entrance', { dir: 'in', dur: 1.1, band: 40, letterEase: 1, props: { position: [0, -70], opacity: 0 } }),
  letters('slideLeft', 'Slide Left', 'Entrance', { dir: 'in', dur: 1.1, band: 40, letterEase: 1, props: { position: [90, 0], opacity: 0 } }),
  letters('slideRight', 'Slide Right', 'Entrance', { dir: 'in', dur: 1.1, band: 40, letterEase: 1, props: { position: [-90, 0], opacity: 0 } }),
  letters('rise', 'Gentle Rise', 'Entrance', { dir: 'in', dur: 1.6, band: 60, letterEase: 3, props: { position: [0, 28], opacity: 0 } }),
  letters('dropBounce', 'Drop & Bounce', 'Entrance', { dir: 'in', dur: 1.5, band: 40, letterEase: 6, props: { position: [0, -170], opacity: 0 } }),
  letters('popBack', 'Pop', 'Entrance', { dir: 'in', dur: 1.1, band: 35, letterEase: 4, props: { scale: [0, 0] } }),
  letters('elasticPop', 'Elastic Pop', 'Entrance', { dir: 'in', dur: 1.6, band: 35, letterEase: 5, props: { scale: [0, 0] } }),
  letters('bouncePop', 'Bounce Pop', 'Entrance', { dir: 'in', dur: 1.4, band: 40, letterEase: 6, props: { scale: [0, 0] } }),
  letters('spinIn', 'Spin In', 'Entrance', { dir: 'in', dur: 1.2, band: 40, letterEase: 4, props: { rotation: -180, scale: [0, 0], opacity: 0 } }),
  letters('flipIn', 'Flip In', 'Entrance', { dir: 'in', dur: 1.1, band: 40, letterEase: 4, props: { scale: [100, 0], opacity: 0 } }),
  letters('zoomIn', 'Zoom In', 'Entrance', { dir: 'in', dur: 1.2, band: 40, letterEase: 1, props: { scale: [320, 320], opacity: 0 } }),
  letters('trackingIn', 'Spread Together', 'Entrance', { dir: 'in', dur: 1.7, band: 100, letterEase: 1, props: { tracking: 70, opacity: 0 } }),
  letters('tumbleIn', 'Tumble In', 'Entrance', { dir: 'in', dur: 1.5, band: 80, random: true, seed: 5, letterEase: 4, props: { rotation: 90, position: [0, -90], opacity: 0 } }),
  letters('randomPop', 'Random Pop', 'Entrance', { dir: 'in', dur: 1.3, band: 70, random: true, seed: 11, letterEase: 4, props: { scale: [0, 0] } }),
  letters('wordSlide', 'Word Slide', 'Entrance', { dir: 'in', dur: 1.3, band: 50, units: 1, letterEase: 1, props: { position: [0, 60], opacity: 0 } }),
  letters('wordPop', 'Word Pop', 'Entrance', { dir: 'in', dur: 1.3, band: 50, units: 1, letterEase: 4, props: { scale: [0, 0] } }),
  letters('lineSlide', 'Line Slide', 'Entrance', { dir: 'in', dur: 1.2, band: 80, units: 2, letterEase: 1, props: { position: [0, 50], opacity: 0 } }),

  // ---- exits
  letters('fadeOutLetters', 'Fade Out Letters', 'Exit', { dir: 'out', dur: 1.2, band: 45, letterEase: 1, props: { opacity: 0 } }),
  letters('slideUpOut', 'Slide Up Out', 'Exit', { dir: 'out', dur: 1.1, band: 40, letterEase: 2, props: { position: [0, -70], opacity: 0 } }),
  letters('dropOut', 'Drop Out', 'Exit', { dir: 'out', dur: 1.2, band: 40, letterEase: 2, props: { position: [0, 170], opacity: 0 } }),
  letters('shrinkOut', 'Shrink Out', 'Exit', { dir: 'out', dur: 1.0, band: 40, letterEase: 2, props: { scale: [0, 0] } }),
  letters('spinOut', 'Spin Out', 'Exit', { dir: 'out', dur: 1.2, band: 40, letterEase: 2, props: { rotation: 180, scale: [0, 0], opacity: 0 } }),
  letters('scatterOut', 'Scatter Out', 'Exit', { dir: 'out', dur: 1.4, band: 70, random: true, props: { opacity: 0 } }),
  letters('zoomOutBig', 'Zoom Out', 'Exit', { dir: 'out', dur: 1.1, band: 40, letterEase: 2, props: { scale: [320, 320], opacity: 0 } }),
  letters('trackingOut', 'Spread Apart', 'Exit', { dir: 'out', dur: 1.6, band: 100, letterEase: 2, props: { tracking: 70, opacity: 0 } }),
  letters('wordFadeOut', 'Word Fade Out', 'Exit', { dir: 'out', dur: 1.2, band: 30, units: 1, props: { opacity: 0 } }),

  // ---- loops
  wave('wave', 'Wave', { position: [0, -26] }),
  wave('waveScale', 'Pulse Wave', { scale: [140, 140] }, { dur: 1.6 }),
  wave('waveTilt', 'Tilt Wave', { rotation: 18 }),
  wave('waveFade', 'Dip Wave', { opacity: 25 }),
  wave('jumpWave', 'Jumping Letters', { position: [0, -52] }, { width: 24, shape: 3, dur: 1.3 }),
  wave('highlightSweep', 'Highlight Sweep', { colorMix: 100, color: YELLOW }, { shape: 5, width: 30, dur: 1.8 }),
  wave('shimmer', 'Cool Shimmer', { colorMix: 95, color: [110, 225, 255] }, { shape: 5, width: 18, dur: 1.4 }),
  wave('wordWave', 'Word Wave', { position: [0, -34] }, { units: 1, width: 45, dur: 2 }),
  anim('breathing', 'Breathing', 'Loops', { still: 0.7, length: 1.4 }, (layer, c, source) => {
    const a = addAnimator(layer, 'Breathing', source, {});
    setVal(a.props.tracking, 0);
    tween(a.props.tracking, c, c.t, [[0, 0, [0.37, 0, 0.63, 1]], [1.4, 16]]);
    loop(a.props.tracking, 'pingpong');
  }),
  anim('colorPulse', 'Color Pulse', 'Loops', { still: 0.4, length: 0.8 }, (layer, c, source) => {
    const a = addAnimator(layer, 'Color Pulse', source, { color: [255, 70, 120] });
    tween(a.props.colorMix, c, c.t, [[0, 0, [0.37, 0, 0.63, 1]], [0.8, 100]]);
    loop(a.props.colorMix, 'pingpong');
  }),
];
