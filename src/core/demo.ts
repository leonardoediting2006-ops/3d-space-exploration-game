import { createEffect } from './effectDefs';
import { createNull, createProject, createShape, createSolid, createText } from './factory';
import { EASY_EASE, setKeyAt } from './interp';
import type { Layer, Project, Prop } from './types';

/** A small showcase composition so a first launch shows something alive instead of an empty comp. */
export function createDemoProject(): Project {
  const project = createProject();
  const comp = project.comps[project.compOrder[0]];
  comp.name = 'Intro';
  comp.duration = 6;
  comp.workEnd = 6;
  comp.motionBlur = true;
  const { fps } = comp;
  const tol = 0.25 / fps;
  const base = { comp, time: 0 };
  const fx = (layer: Layer, type: string, set?: (p: Record<string, Prop>) => void) => {
    const e = createEffect(type, comp)!;
    set?.(e.props);
    layer.effects.push(e);
  };

  const bg = createSolid({ ...base, name: 'Background', color: [14, 16, 34], width: comp.width, height: comp.height });
  bg.label = 5;
  fx(bg, 'gradientRamp', (p) => {
    p.start.value = [960, 540];
    p.end.value = [960, 1500];
    p.startColor.value = [58, 48, 128];
    p.endColor.value = [8, 9, 20];
    p.shape.value = 1;
  });

  const ring = createShape({ ...base, name: 'Ring', shape: 'ellipse', size: [560, 560], stroke: [255, 170, 64], strokeWidth: 16 });
  if (ring.data.type === 'shape') {
    ring.data.fill = false;
    ring.data.stroke = true;
  }
  setKeyAt(ring.content.trimEnd, 0, 0, tol, EASY_EASE);
  setKeyAt(ring.content.trimEnd, 1.6, 100, tol);
  setKeyAt(ring.transform.rotation, 0, 0, tol);
  setKeyAt(ring.transform.rotation, 6, 180, tol);

  const star = createShape({ ...base, name: 'Star', shape: 'star', size: [300, 300], fill: [255, 214, 102] });
  setKeyAt(star.transform.scale, 0, [0, 0], tol, EASY_EASE);
  setKeyAt(star.transform.scale, 0.45, [112, 112], tol, EASY_EASE);
  setKeyAt(star.transform.scale, 0.7, [100, 100], tol);
  setKeyAt(star.transform.rotation, 0, 0, tol);
  setKeyAt(star.transform.rotation, 6, -360, tol);
  fx(star, 'glow', (p) => {
    p.threshold.value = 50;
    p.radius.value = 40;
    p.intensity.value = 1.4;
  });

  const orbit = createNull({ ...base, name: 'Orbit Null', position: [960, 540] });
  setKeyAt(orbit.transform.rotation, 0, 0, tol);
  setKeyAt(orbit.transform.rotation, 3, 360, tol);
  orbit.transform.rotation.loop = 'cycle';

  const moon = createShape({ ...base, name: 'Moon', shape: 'ellipse', size: [74, 74], fill: [120, 220, 255], position: [50, 50 - 380] });
  moon.parentId = orbit.id;
  moon.motionBlur = true;
  fx(moon, 'dropShadow', (p) => {
    p.distance.value = 14;
    p.softness.value = 18;
  });

  const title = createText({ ...base, name: 'Title', text: 'KEYFRAME STUDIO', position: [960, 900] });
  title.content.fontSize.value = 132;
  title.content.tracking.value = 6;
  setKeyAt(title.transform.opacity, 0.5, 0, tol, EASY_EASE);
  setKeyAt(title.transform.opacity, 1.3, 100, tol);
  setKeyAt(title.transform.position, 0.5, [960, 960], tol, EASY_EASE);
  setKeyAt(title.transform.position, 1.3, [960, 900], tol);
  fx(title, 'dropShadow', (p) => {
    p.opacity.value = 65;
    p.distance.value = 8;
    p.softness.value = 14;
  });

  const sub = createText({ ...base, name: 'Subtitle', text: 'motion graphics, in your browser', position: [960, 985] });
  sub.content.fontSize.value = 46;
  sub.content.fillColor.value = [168, 178, 224];
  if (sub.data.type === 'text') sub.data.bold = false;
  setKeyAt(sub.transform.opacity, 1.1, 0, tol, EASY_EASE);
  setKeyAt(sub.transform.opacity, 1.9, 100, tol);

  comp.layers = [sub, title, moon, orbit, star, ring, bg];
  return project;
}

