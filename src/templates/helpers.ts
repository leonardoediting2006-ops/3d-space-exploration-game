import { createEffect } from '../core/effectDefs';
import { createAnimator, type AnimatorKind } from '../core/factory';
import { hexToRgb } from '../core/gradient';
import { evalNum, evalVec, setKeyAt } from '../core/interp';
import type { Ease, Effect, Layer, Prop, PropValue, RGB, TextAnimator, Vec2 } from '../core/types';
import type { TemplateCtx } from './types';

export { hexToRgb as rgb };
export { easing as E } from './easing';

export const isText = (l: Layer): boolean => l.type === 'text';
export const anyLayer = (l: Layer): boolean => l.type !== 'null';
export const visual = (l: Layer): boolean => l.type !== 'null';

const copy = (v: PropValue): PropValue => (Array.isArray(v) ? [...v] : v);

export function setVal(prop: Prop, v: PropValue): void {
  prop.value = copy(v);
}

/** Keyframe `prop` through [seconds-from-t0, value, ease-leaving-this-key] stops. */
export function tween(prop: Prop, c: TemplateCtx, t0: number, stops: [number, PropValue, Ease?][]): void {
  const tol = 0.25 / c.fps;
  for (const [dt, v, ease] of stops) setKeyAt(prop, t0 + dt, copy(v), tol, ease ?? 'linear');
}

export const loop = (prop: Prop, mode: 'cycle' | 'pingpong' = 'cycle'): void => {
  prop.loop = mode;
};

/** Remove effects / animators a previous template added, identified by their `source` prefix. */
export function dropSource(layer: Layer, prefix: string): void {
  layer.effects = layer.effects.filter((e) => !e.source?.startsWith(prefix));
  layer.animators = layer.animators.filter((a) => !a.source?.startsWith(prefix));
}

/** Add an effect with parameter overrides. Returns it so callers can keyframe its properties. */
export function addFx(layer: Layer, c: TemplateCtx, type: string, params: Record<string, PropValue>, source: string, atStart = false): Effect {
  const fx = createEffect(type, c.comp);
  if (!fx) throw new Error(`Unknown effect "${type}"`);
  fx.source = source;
  for (const [k, v] of Object.entries(params)) {
    if (!fx.props[k]) throw new Error(`Effect "${type}" has no parameter "${k}"`);
    fx.props[k].value = copy(v);
  }
  if (atStart) layer.effects.unshift(fx);
  else layer.effects.push(fx);
  return fx;
}

export interface AnimatorProps {
  position?: Vec2;
  scale?: Vec2;
  rotation?: number;
  opacity?: number;
  tracking?: number;
  color?: RGB;
  colorMix?: number;
}

export function addAnimator(layer: Layer, name: string, source: string, props: AnimatorProps & Record<string, PropValue | undefined> = {}, kind: AnimatorKind = 'blank'): TextAnimator {
  const a = createAnimator(name, kind);
  a.source = source;
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue;
    if (!a.props[k]) throw new Error(`Animator has no property "${k}"`);
    a.props[k].value = copy(v);
  }
  layer.animators.push(a);
  return a;
}

export interface StaggerOptions {
  dir: 'in' | 'out';
  dur: number;
  /** Width of the soft transition band, as a percentage of the text. */
  band?: number;
  ease?: Ease;
  units?: 0 | 1 | 2;
  random?: boolean;
  seed?: number;
  delay?: number;
  /** Per-letter easing: 0 linear, 1 ease out, 2 ease in, 3 in-out, 4 back, 5 elastic, 6 bounce. */
  letterEase?: number;
  props: AnimatorProps;
}

/**
 * The classic per-letter entrance / exit: a soft band sweeps across the text, and everything
 * beyond it is held at the "away" state. Built from two animators so the edge is a smooth ramp
 * rather than a hard cut. `props` describe the away state (for example opacity 0, position y 40).
 */
export function stagger(layer: Layer, c: TemplateCtx, source: string, o: StaggerOptions): void {
  const band = o.band ?? 35;
  const t0 = c.t + (o.delay ?? 0);
  const common = { units: o.units ?? 0, random: o.random ? 1 : 0, seed: o.seed ?? 3, smooth: 0, ease: o.letterEase ?? 0, ...o.props };
  const ramp = addAnimator(layer, o.dir === 'in' ? 'Entrance Band' : 'Exit Band', source, { ...common, shape: o.dir === 'in' ? 1 : 2 });
  const rest = addAnimator(layer, o.dir === 'in' ? 'Entrance Hold' : 'Exit Hold', source, { ...common, shape: 0 });
  const e = o.ease ?? 'linear';
  if (o.dir === 'in') {
    tween(ramp.props.start, c, t0, [[0, -band, e], [o.dur, 100]]);
    tween(ramp.props.end, c, t0, [[0, 0, e], [o.dur, 100 + band]]);
    tween(rest.props.start, c, t0, [[0, 0, e], [o.dur, 100 + band]]);
    setVal(rest.props.end, 300);
  } else {
    tween(ramp.props.start, c, t0, [[0, -band, e], [o.dur, 100]]);
    tween(ramp.props.end, c, t0, [[0, 0, e], [o.dur, 100 + band]]);
    setVal(rest.props.start, -300);
    tween(rest.props.end, c, t0, [[0, -band, e], [o.dur, 100]]);
  }
}

export const posOf = (layer: Layer, c: TemplateCtx): Vec2 => evalVec(layer.transform.position, c.t);

/** Curve a motion path through its keyframes (Catmull-Rom). `closed` treats the last key as a repeat of the first. */
export function autoBezier(prop: Prop): void {
  const ks = prop.keys;
  const n = ks.length;
  if (n < 3) return;
  const closed = (() => {
    const a = ks[0].v as number[];
    const b = ks[n - 1].v as number[];
    return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
  })();
  ks.forEach((k, i) => {
    let prev: number[] | null = ks[i - 1]?.v as number[] | null ?? null;
    let next: number[] | null = ks[i + 1]?.v as number[] | null ?? null;
    if (closed && i === 0) prev = ks[n - 2].v as number[];
    if (closed && i === n - 1) next = ks[1].v as number[];
    if (!prev || !next) return;
    const tx = (next[0] - prev[0]) / 6;
    const ty = (next[1] - prev[1]) / 6;
    k.sIn = [-tx, -ty];
    k.sOut = [tx, ty];
  });
}

export const motionBase = (layer: Layer, c: TemplateCtx) => ({
  pos: evalVec(layer.transform.position, c.t),
  scale: evalVec(layer.transform.scale, c.t),
  rot: evalNum(layer.transform.rotation, c.t),
  op: evalNum(layer.transform.opacity, c.t),
  k: c.comp.height / 1080,
});
