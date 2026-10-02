import type { Ease, Layer, Vec2 } from '../core/types';
import { addFx, anyLayer, autoBezier, dropSource, E, loop, motionBase, tween } from './helpers';
import type { LayerTemplate, TemplateCtx } from './types';

interface Timing {
  still: number;
  length: number;
}

function motion(id: string, name: string, group: string, timing: Timing, build: (layer: Layer, c: TemplateCtx, source: string) => void): LayerTemplate {
  return {
    id: `motion.${id}`,
    name,
    group,
    kind: 'motion',
    accepts: anyLayer,
    previewTime: timing.still,
    previewDuration: timing.length,
    apply(layer, c) {
      dropSource(layer, `motion:${id}`);
      build(layer, c, `motion:${id}`);
    },
  };
}

// the still catches the move part-way through so the thumbnail suggests motion
const inT = (dur: number): Timing => ({ still: dur * 0.3, length: dur + 1 });
const loopT = (len: number): Timing => ({ still: len * 0.4, length: len });

type Dir = 'left' | 'right' | 'top' | 'bottom';
const DIRS: Dir[] = ['left', 'right', 'top', 'bottom'];
const label = (d: Dir) => d[0].toUpperCase() + d.slice(1);

/** Where an element starts when it slides in from `dir`. */
function offscreen(layer: Layer, c: TemplateCtx, dir: Dir): Vec2 {
  const { pos } = motionBase(layer, c);
  const dx = c.comp.width * 0.32;
  const dy = c.comp.height * 0.32;
  return dir === 'left' ? [pos[0] - dx, pos[1]] : dir === 'right' ? [pos[0] + dx, pos[1]] : dir === 'top' ? [pos[0], pos[1] - dy] : [pos[0], pos[1] + dy];
}

// wipe angles that reveal from each side (see the Linear Wipe effect: the wiped side shrinks away)
const WIPE_ANGLE: Record<Dir, number> = { left: 270, right: 90, top: 0, bottom: 180 };

const slideIn = (dir: Dir) =>
  motion(`slideIn${label(dir)}`, `Slide In from ${label(dir)}`, 'Enter', inT(0.8), (l, c) => {
    const b = motionBase(l, c);
    tween(l.transform.position, c, c.t, [[0, offscreen(l, c, dir), E('expoOut')], [0.8, b.pos]]);
    tween(l.transform.opacity, c, c.t, [[0, 0, E('quadOut')], [0.3, b.op]]);
  });

const slideOut = (dir: Dir) =>
  motion(`slideOut${label(dir)}`, `Slide Out to ${label(dir)}`, 'Exit', inT(0.7), (l, c) => {
    const b = motionBase(l, c);
    tween(l.transform.position, c, c.t, [[0, b.pos, E('expoIn')], [0.7, offscreen(l, c, dir)]]);
    tween(l.transform.opacity, c, c.t, [[0.4, b.op, E('quadIn')], [0.7, 0]]);
  });

const wipeIn = (dir: Dir) =>
  motion(`wipeIn${label(dir)}`, `Wipe In from ${label(dir)}`, 'Enter', inT(0.9), (l, c, src) => {
    const fx = addFx(l, c, 'linearWipe', { angle: WIPE_ANGLE[dir], feather: 60 * (c.comp.height / 1080) }, src);
    tween(fx.props.completion, c, c.t, [[0, 100, E('cubicInOut')], [0.9, 0]]);
  });

const wipeOut = (dir: Dir) =>
  motion(`wipeOut${label(dir)}`, `Wipe Out to ${label(dir)}`, 'Exit', inT(0.9), (l, c, src) => {
    const fx = addFx(l, c, 'linearWipe', { angle: WIPE_ANGLE[dir], feather: 60 * (c.comp.height / 1080) }, src);
    tween(fx.props.completion, c, c.t, [[0, 0, E('cubicInOut')], [0.9, 100]]);
  });

export const MOTION: LayerTemplate[] = [
  // ---- enter
  motion('fadeIn', 'Fade In', 'Enter', inT(0.7), (l, c) => tween(l.transform.opacity, c, c.t, [[0, 0, E('cubicOut')], [0.7, motionBase(l, c).op]])),
  ...DIRS.map(slideIn),
  motion('zoomIn', 'Zoom In', 'Enter', inT(0.7), (l, c) => {
    const b = motionBase(l, c);
    tween(l.transform.scale, c, c.t, [[0, [0, 0], E('expoOut')], [0.7, b.scale]]);
    tween(l.transform.opacity, c, c.t, [[0, 0], [0.25, b.op]]);
  }),
  motion('popIn', 'Pop In', 'Enter', inT(0.6), (l, c) => tween(l.transform.scale, c, c.t, [[0, [0, 0], E('backOut')], [0.6, motionBase(l, c).scale]])),
  motion('bounceIn', 'Bounce In', 'Enter', inT(1), (l, c) => tween(l.transform.scale, c, c.t, [[0, [0, 0], 'bounceOut'], [1, motionBase(l, c).scale]])),
  motion('elasticIn', 'Elastic In', 'Enter', inT(1.3), (l, c) => tween(l.transform.scale, c, c.t, [[0, [0, 0], 'elasticOut'], [1.3, motionBase(l, c).scale]])),
  motion('dropIn', 'Drop In', 'Enter', inT(1), (l, c) => {
    const b = motionBase(l, c);
    tween(l.transform.position, c, c.t, [[0, [b.pos[0], b.pos[1] - c.comp.height * 0.4], 'bounceOut'], [1, b.pos]]);
    tween(l.transform.opacity, c, c.t, [[0, 0], [0.15, b.op]]);
  }),
  motion('riseIn', 'Rise In', 'Enter', inT(0.9), (l, c) => {
    const b = motionBase(l, c);
    tween(l.transform.position, c, c.t, [[0, [b.pos[0], b.pos[1] + 90 * b.k], E('cubicOut')], [0.9, b.pos]]);
    tween(l.transform.opacity, c, c.t, [[0, 0, E('quadOut')], [0.6, b.op]]);
  }),
  motion('spinIn', 'Spin In', 'Enter', inT(1), (l, c) => {
    const b = motionBase(l, c);
    tween(l.transform.rotation, c, c.t, [[0, b.rot - 360, E('expoOut')], [1, b.rot]]);
    tween(l.transform.scale, c, c.t, [[0, [0, 0], E('expoOut')], [1, b.scale]]);
  }),
  motion('flipIn', 'Flip In', 'Enter', inT(0.8), (l, c) => {
    const b = motionBase(l, c);
    tween(l.transform.scale, c, c.t, [[0, [0, b.scale[1]], E('backOut')], [0.8, b.scale]]);
    tween(l.transform.opacity, c, c.t, [[0, 0], [0.2, b.op]]);
  }),
  motion('whipIn', 'Whip In', 'Enter', inT(0.5), (l, c) => {
    const b = motionBase(l, c);
    tween(l.transform.position, c, c.t, [[0, offscreen(l, c, 'left'), E('backOut')], [0.5, b.pos]]);
  }),
  motion('blurIn', 'Blur In', 'Enter', inT(0.9), (l, c, src) => {
    const fx = addFx(l, c, 'gaussianBlur', { blurriness: 0 }, src);
    tween(fx.props.blurriness, c, c.t, [[0, 60 * (c.comp.height / 1080), E('cubicOut')], [0.9, 0]]);
    tween(l.transform.opacity, c, c.t, [[0, 0], [0.5, motionBase(l, c).op]]);
  }),
  motion('glitchIn', 'Glitch In', 'Enter', { still: 0.17, length: 1.4 }, (l, c) => {
    const b = motionBase(l, c);
    const [x, y] = b.pos;
    const hold: Ease = 'hold';
    tween(l.transform.opacity, c, c.t, [[0, 0, hold], [0.05, b.op, hold], [0.1, 0, hold], [0.16, b.op, hold], [0.2, b.op * 0.4, hold], [0.26, b.op]]);
    tween(l.transform.position, c, c.t, [[0, [x + 30 * b.k, y - 6 * b.k], hold], [0.05, [x - 36 * b.k, y + 8 * b.k], hold], [0.1, [x + 18 * b.k, y], hold], [0.16, [x - 10 * b.k, y - 5 * b.k], hold], [0.22, [x, y]]]);
  }),
  ...DIRS.map(wipeIn),
  motion('radialIn', 'Radial Reveal', 'Enter', inT(1), (l, c, src) => {
    // the wipe pivots around the layer's own position
    const fx = addFx(l, c, 'radialWipe', { direction: 1, feather: 25, center: motionBase(l, c).pos }, src);
    tween(fx.props.completion, c, c.t, [[0, 100, E('cubicInOut')], [1, 0]]);
  }),

  // ---- exit
  motion('fadeOut', 'Fade Out', 'Exit', inT(0.7), (l, c) => tween(l.transform.opacity, c, c.t, [[0, motionBase(l, c).op, E('cubicIn')], [0.7, 0]])),
  ...DIRS.map(slideOut),
  motion('zoomOut', 'Zoom Out', 'Exit', inT(0.6), (l, c) => {
    const b = motionBase(l, c);
    tween(l.transform.scale, c, c.t, [[0, b.scale, E('backIn')], [0.6, [0, 0]]]);
  }),
  motion('popOut', 'Pop Out', 'Exit', inT(0.6), (l, c) => {
    const b = motionBase(l, c);
    tween(l.transform.scale, c, c.t, [[0, b.scale, E('cubicOut')], [0.2, [b.scale[0] * 1.15, b.scale[1] * 1.15], E('cubicIn')], [0.6, [0, 0]]]);
  }),
  motion('spinOut', 'Spin Out', 'Exit', inT(0.9), (l, c) => {
    const b = motionBase(l, c);
    tween(l.transform.rotation, c, c.t, [[0, b.rot, E('expoIn')], [0.9, b.rot + 360]]);
    tween(l.transform.scale, c, c.t, [[0, b.scale, E('expoIn')], [0.9, [0, 0]]]);
  }),
  motion('dropOut', 'Drop Out', 'Exit', inT(0.8), (l, c) => {
    const b = motionBase(l, c);
    tween(l.transform.position, c, c.t, [[0, b.pos, E('expoIn')], [0.8, [b.pos[0], b.pos[1] + c.comp.height * 0.5]]]);
    tween(l.transform.opacity, c, c.t, [[0.5, b.op], [0.8, 0]]);
  }),
  motion('blurOut', 'Blur Out', 'Exit', inT(0.9), (l, c, src) => {
    const fx = addFx(l, c, 'gaussianBlur', { blurriness: 0 }, src);
    tween(fx.props.blurriness, c, c.t, [[0, 0, E('cubicIn')], [0.9, 60 * (c.comp.height / 1080)]]);
    tween(l.transform.opacity, c, c.t, [[0.3, motionBase(l, c).op], [0.9, 0]]);
  }),
  motion('flipOut', 'Flip Out', 'Exit', inT(0.7), (l, c) => {
    const b = motionBase(l, c);
    tween(l.transform.scale, c, c.t, [[0, b.scale, E('backIn')], [0.7, [0, b.scale[1]]]]);
  }),
  ...DIRS.map(wipeOut),
  motion('glitchOut', 'Glitch Out', 'Exit', { still: 0.13, length: 1.2 }, (l, c) => {
    const b = motionBase(l, c);
    const [x, y] = b.pos;
    const hold: Ease = 'hold';
    tween(l.transform.opacity, c, c.t, [[0, b.op, hold], [0.06, 0, hold], [0.1, b.op, hold], [0.16, 0, hold], [0.2, b.op * 0.5, hold], [0.26, 0]]);
    tween(l.transform.position, c, c.t, [[0, [x, y], hold], [0.06, [x + 34 * b.k, y + 6 * b.k], hold], [0.1, [x - 22 * b.k, y - 4 * b.k], hold], [0.16, [x + 12 * b.k, y], hold], [0.2, [x - 30 * b.k, y + 5 * b.k]]]);
  }),

  // ---- loops
  motion('pulse', 'Pulse', 'Loops', loopT(0.8), (l, c) => {
    const b = motionBase(l, c);
    tween(l.transform.scale, c, c.t, [[0, b.scale, E('sineInOut')], [0.4, [b.scale[0] * 1.08, b.scale[1] * 1.08], E('sineInOut')], [0.8, b.scale]]);
    loop(l.transform.scale);
  }),
  motion('heartbeat', 'Heartbeat', 'Loops', loopT(1.1), (l, c) => {
    const b = motionBase(l, c);
    const s = (f: number): Vec2 => [b.scale[0] * f, b.scale[1] * f];
    tween(l.transform.scale, c, c.t, [[0, s(1), E('cubicOut')], [0.12, s(1.16), E('cubicIn')], [0.24, s(1), E('cubicOut')], [0.36, s(1.1), E('cubicIn')], [0.5, s(1)], [1.1, s(1)]]);
    loop(l.transform.scale);
  }),
  motion('breathe', 'Breathe', 'Loops', loopT(2), (l, c) => {
    const b = motionBase(l, c);
    tween(l.transform.scale, c, c.t, [[0, b.scale, E('sineInOut')], [2, [b.scale[0] * 1.035, b.scale[1] * 1.035]]]);
    loop(l.transform.scale, 'pingpong');
  }),
  motion('float', 'Float', 'Loops', loopT(2.4), (l, c) => {
    const b = motionBase(l, c);
    tween(l.transform.position, c, c.t, [[0, b.pos, E('sineInOut')], [1.2, [b.pos[0], b.pos[1] - 18 * b.k]]]);
    loop(l.transform.position, 'pingpong');
  }),
  motion('sway', 'Sway', 'Loops', loopT(3.2), (l, c) => {
    const b = motionBase(l, c);
    tween(l.transform.rotation, c, c.t, [[0, b.rot - 6, E('sineInOut')], [1.6, b.rot + 6]]);
    loop(l.transform.rotation, 'pingpong');
  }),
  motion('spinLoop', 'Spin', 'Loops', loopT(3), (l, c) => {
    const b = motionBase(l, c);
    tween(l.transform.rotation, c, c.t, [[0, b.rot], [3, b.rot + 360]]);
    loop(l.transform.rotation);
  }),
  motion('blink', 'Blink', 'Loops', loopT(1), (l, c) => {
    const b = motionBase(l, c);
    tween(l.transform.opacity, c, c.t, [[0, b.op, 'hold'], [0.5, 0, 'hold'], [1, b.op]]);
    loop(l.transform.opacity);
  }),
  motion('wiggleSoft', 'Wiggle', 'Loops', loopT(2), (l, c) => {
    l.transform.position.wiggle = { freq: 1.5, amp: 12 * motionBase(l, c).k, seed: 7 };
  }),
  motion('shake', 'Shake', 'Loops', loopT(1), (l, c) => {
    l.transform.position.wiggle = { freq: 14, amp: 10 * motionBase(l, c).k, seed: 3 };
  }),
  motion('tremble', 'Tremble', 'Loops', loopT(1), (l) => {
    l.transform.rotation.wiggle = { freq: 12, amp: 2.2, seed: 5 };
  }),
  motion('flicker', 'Flicker', 'Loops', loopT(1.2), (l) => {
    l.transform.opacity.wiggle = { freq: 9, amp: 28, seed: 9 };
  }),
  motion('wobbleScale', 'Wobble', 'Loops', loopT(1.6), (l, c) => {
    const b = motionBase(l, c);
    tween(l.transform.scale, c, c.t, [[0, [b.scale[0] * 1.06, b.scale[1] * 0.94], E('sineInOut')], [0.8, [b.scale[0] * 0.94, b.scale[1] * 1.06]]]);
    loop(l.transform.scale, 'pingpong');
  }),

  // ---- paths
  motion('orbit', 'Orbit (circle)', 'Paths', loopT(3.6), (l, c) => {
    const b = motionBase(l, c);
    const r = 140 * b.k;
    const kt = r * 0.5523;
    const [cx, cy] = b.pos;
    const pts: { p: Vec2; i: Vec2; o: Vec2 }[] = [
      { p: [cx, cy - r], i: [-kt, 0], o: [kt, 0] },
      { p: [cx + r, cy], i: [0, -kt], o: [0, kt] },
      { p: [cx, cy + r], i: [kt, 0], o: [-kt, 0] },
      { p: [cx - r, cy], i: [0, kt], o: [0, -kt] },
      { p: [cx, cy - r], i: [-kt, 0], o: [kt, 0] },
    ];
    tween(l.transform.position, c, c.t, pts.map((q, i): [number, Vec2] => [i * 0.9, q.p]));
    l.transform.position.keys.forEach((k, i) => {
      k.sIn = pts[i].i;
      k.sOut = pts[i].o;
    });
    loop(l.transform.position);
  }),
  motion('figureEight', 'Figure Eight', 'Paths', loopT(4), (l, c) => {
    const b = motionBase(l, c);
    const a = 190 * b.k;
    const h = 90 * b.k;
    const stops: [number, Vec2][] = [];
    for (let i = 0; i <= 8; i++) {
      const th = (i / 8) * Math.PI * 2;
      stops.push([(i / 8) * 4, [b.pos[0] + a * Math.sin(th), b.pos[1] + h * Math.sin(2 * th)]]);
    }
    tween(l.transform.position, c, c.t, stops);
    autoBezier(l.transform.position);
    loop(l.transform.position);
  }),
  motion('arc', 'Arc Across', 'Paths', inT(1.4), (l, c) => {
    const b = motionBase(l, c);
    const dx = c.comp.width * 0.3;
    const lift = c.comp.height * 0.26;
    tween(l.transform.position, c, c.t, [[0, [b.pos[0] - dx, b.pos[1] + lift * 0.4]], [0.7, [b.pos[0], b.pos[1] - lift], E('sineInOut')], [1.4, [b.pos[0] + dx, b.pos[1] + lift * 0.4]]]);
    autoBezier(l.transform.position);
  }),
  motion('sCurve', 'S Curve', 'Paths', inT(1.6), (l, c) => {
    const b = motionBase(l, c);
    const dx = c.comp.width * 0.28;
    const dy = c.comp.height * 0.2;
    tween(l.transform.position, c, c.t, [[0, [b.pos[0] - dx, b.pos[1] - dy]], [0.55, [b.pos[0] - dx * 0.3, b.pos[1] + dy]], [1.1, [b.pos[0] + dx * 0.3, b.pos[1] - dy]], [1.6, [b.pos[0] + dx, b.pos[1] + dy]]]);
    autoBezier(l.transform.position);
  }),
  motion('zigzag', 'Zigzag', 'Paths', inT(1.4), (l, c) => {
    const b = motionBase(l, c);
    const dx = c.comp.width * 0.28;
    const dy = c.comp.height * 0.16;
    tween(l.transform.position, c, c.t, [[0, [b.pos[0] - dx, b.pos[1]]], [0.35, [b.pos[0] - dx * 0.5, b.pos[1] - dy]], [0.7, [b.pos[0], b.pos[1] + dy]], [1.05, [b.pos[0] + dx * 0.5, b.pos[1] - dy]], [1.4, [b.pos[0] + dx, b.pos[1]]]]);
  }),

  // ---- emphasis (one shot)
  motion('shakeOnce', 'Shake (once)', 'Emphasis', { still: 0.25, length: 1.2 }, (l, c) => {
    const b = motionBase(l, c);
    const [x, y] = b.pos;
    const a = 22 * b.k;
    tween(l.transform.position, c, c.t, [[0, [x, y]], [0.08, [x + a, y]], [0.16, [x - a * 0.8, y]], [0.24, [x + a * 0.6, y]], [0.32, [x - a * 0.4, y]], [0.4, [x + a * 0.2, y]], [0.48, [x, y]]]);
  }),
  motion('rubberBand', 'Rubber Band', 'Emphasis', { still: 0.3, length: 1.4 }, (l, c) => {
    const b = motionBase(l, c);
    const s = (x: number, y: number): Vec2 => [b.scale[0] * x, b.scale[1] * y];
    tween(l.transform.scale, c, c.t, [[0, s(1, 1), E('cubicOut')], [0.2, s(1.25, 0.75), E('cubicOut')], [0.4, s(0.78, 1.22), E('cubicOut')], [0.6, s(1.12, 0.88), E('cubicOut')], [0.8, s(0.95, 1.05), E('cubicOut')], [1, s(1, 1)]]);
  }),
  motion('tada', 'Tada', 'Emphasis', { still: 0.4, length: 1.4 }, (l, c) => {
    const b = motionBase(l, c);
    const s = (f: number): Vec2 => [b.scale[0] * f, b.scale[1] * f];
    tween(l.transform.scale, c, c.t, [[0, s(1)], [0.1, s(0.9)], [0.2, s(0.9)], [0.3, s(1.1)], [0.4, s(1.1)], [0.5, s(1.1)], [0.6, s(1.1)], [0.7, s(1.1)], [0.8, s(1.1)], [0.9, s(1)]]);
    tween(l.transform.rotation, c, c.t, [[0, b.rot], [0.1, b.rot - 4], [0.2, b.rot - 4], [0.3, b.rot + 4], [0.4, b.rot - 4], [0.5, b.rot + 4], [0.6, b.rot - 4], [0.7, b.rot + 4], [0.8, b.rot - 4], [0.9, b.rot]]);
  }),
  motion('jello', 'Jello', 'Emphasis', { still: 0.3, length: 1.3 }, (l, c) => {
    const b = motionBase(l, c);
    const s = (x: number, y: number): Vec2 => [b.scale[0] * x, b.scale[1] * y];
    tween(l.transform.scale, c, c.t, [[0, s(1, 1)], [0.15, s(1.12, 0.88)], [0.3, s(0.92, 1.08)], [0.45, s(1.05, 0.95)], [0.6, s(0.98, 1.02)], [0.8, s(1, 1)]]);
    tween(l.transform.rotation, c, c.t, [[0, b.rot], [0.15, b.rot + 4], [0.3, b.rot - 3], [0.45, b.rot + 1.5], [0.6, b.rot - 0.6], [0.8, b.rot]]);
  }),
  motion('flash', 'Flash', 'Emphasis', { still: 0.1, length: 1 }, (l, c) => {
    const b = motionBase(l, c);
    tween(l.transform.opacity, c, c.t, [[0, b.op, 'hold'], [0.12, 0, 'hold'], [0.24, b.op, 'hold'], [0.36, 0, 'hold'], [0.48, b.op]]);
  }),
  motion('popEmphasis', 'Pop (emphasis)', 'Emphasis', { still: 0.15, length: 1 }, (l, c) => {
    const b = motionBase(l, c);
    tween(l.transform.scale, c, c.t, [[0, b.scale, E('backOut')], [0.2, [b.scale[0] * 1.25, b.scale[1] * 1.25], E('cubicInOut')], [0.5, b.scale]]);
  }),
  motion('swingOnce', 'Swing', 'Emphasis', { still: 0.4, length: 1.5 }, (l, c) => {
    const b = motionBase(l, c);
    tween(l.transform.rotation, c, c.t, [[0, b.rot, E('sineInOut')], [0.2, b.rot + 16, E('sineInOut')], [0.5, b.rot - 11, E('sineInOut')], [0.8, b.rot + 6, E('sineInOut')], [1.1, b.rot - 2, E('sineInOut')], [1.4, b.rot]]);
  }),
  motion('hop', 'Hop', 'Emphasis', { still: 0.3, length: 1.2 }, (l, c) => {
    const b = motionBase(l, c);
    const [x, y] = b.pos;
    const h = 70 * b.k;
    tween(l.transform.position, c, c.t, [[0, [x, y], E('quadOut')], [0.25, [x, y - h], E('quadIn')], [0.5, [x, y], E('quadOut')], [0.65, [x, y - h * 0.35], E('quadIn')], [0.8, [x, y]]]);
  }),
  motion('squashStretch', 'Squash & Stretch', 'Emphasis', { still: 0.25, length: 1.2 }, (l, c) => {
    const b = motionBase(l, c);
    const s = (x: number, y: number): Vec2 => [b.scale[0] * x, b.scale[1] * y];
    tween(l.transform.scale, c, c.t, [[0, s(1, 1), E('cubicOut')], [0.15, s(1.2, 0.8), E('cubicOut')], [0.35, s(0.85, 1.15), E('cubicOut')], [0.6, s(1, 1)]]);
  }),
];
