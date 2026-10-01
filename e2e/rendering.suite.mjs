import { open } from './lib.mjs';

const { page, check, finish, OUT } = await open();
const S = OUT;

try {
await page.waitForTimeout(500);

// Everything runs inside the page against the real modules.
const out = await page.evaluate(async () => {
  const { actions, appStore, timeStore } = window.__ks;
  const { renderComp } = await import('/src/render/renderer.ts');
  const R = {};
  const mk = () => document.createElement('canvas');
  const sample = (c, x, y) => Array.from(c.getContext('2d').getImageData(x, y, 1, 1).data);
  const W = 640, H = 360;
  const comp = () => { const s = appStore.get(); return s.project.comps[s.activeCompId]; };
  const draw = (t = 0, extra = {}) => { const c = mk(); renderComp(c, appStore.get().project, comp(), t, { scale: 1, mbSamples: 16, ...extra }); return c; };
  const id = (i) => comp().layers[i].id;

  actions.newComp({ name: 'T', width: W, height: H, fps: 30, duration: 2, bg: [0, 0, 0] });
  const red = actions.addSolid({ name: 'Red', color: [255, 0, 0], width: W, height: H });
  R.redCenter = sample(draw(), 320, 180);

  actions.setPropValue(red, 'transform', 'opacity', 50);
  R.half = sample(draw(), 320, 180);
  actions.setPropValue(red, 'transform', 'opacity', 100);

  const blue = actions.addSolid({ name: 'Blue', color: [0, 0, 255], width: W, height: H });
  actions.setLayerField(blue, { blend: 'multiply' });
  R.multiply = sample(draw(), 320, 180);
  actions.setLayerField(blue, { blend: 'screen' });
  R.screen = sample(draw(), 320, 180);
  actions.setLayerField(blue, { blend: 'add' });
  R.add = sample(draw(), 320, 180);
  actions.deleteLayers([blue]);

  // ---- track mattes: ellipse (layer above) mattes the red solid
  const ell = actions.addShape('ellipse', [200, 200], [320, 180]);
  R.matteLayerOrder = comp().layers.map((l) => l.name).join('>');
  actions.setLayerField(red, { matte: 'alpha' });
  R.alphaCenter = sample(draw(), 320, 180);
  R.alphaCorner = sample(draw(), 10, 10);
  R.alphaOutsideEllipse = sample(draw(), 320 + 150, 180); // inside box? ellipse radius 100 -> 150 is outside
  actions.setLayerField(red, { matte: 'alphaInv' });
  R.invCenter = sample(draw(), 320, 180);
  R.invCorner = sample(draw(), 10, 10);
  // luma: grey shape => 50% matte
  actions.setPropValue(ell, 'content', 'fillColor', [128, 128, 128]);
  actions.setLayerField(red, { matte: 'luma' });
  R.lumaCenter = sample(draw(), 320, 180);
  R.lumaCorner = sample(draw(), 10, 10);
  actions.setLayerField(red, { matte: 'none' });
  R.matteConsumed = sample(draw(), 320, 180); // with matte off the ellipse is visible again (grey over red)
  actions.deleteLayers([ell]);

  // ---- adjustment layer with invert
  const adj = actions.addAdjustment();
  actions.addEffect([adj], 'invert');
  R.adjInvert = sample(draw(), 320, 180);
  actions.deleteLayers([adj]);

  // ---- effect on the layer itself: Fill
  actions.addEffect([red], 'fill');
  const fxLayer = comp().layers.find((l) => l.id === red);
  R.fillDefault = sample(draw(), 320, 180); // fill default is red -> unchanged
  actions.setPropValue(red, 'fx:' + fxLayer.effects[0].id, 'color', [0, 255, 0]);
  R.fillGreen = sample(draw(), 320, 180);
  actions.removeEffect(red, fxLayer.effects[0].id);
  R.afterRemove = sample(draw(), 320, 180);

  // ---- trim paths: ring, right half only (starts at the top and runs clockwise)
  actions.deleteLayers([red]);
  const ring = actions.addShape('ellipse', [200, 200], [320, 180]);
  actions.updateLayerData(ring, { fill: false, stroke: true });
  actions.setPropValue(ring, 'content', 'strokeWidth', 20);
  actions.setPropValue(ring, 'content', 'strokeColor', [255, 255, 255]);
  R.ringFull = [sample(draw(), 320 + 100, 180), sample(draw(), 320 - 100, 180)];
  actions.setPropValue(ring, 'content', 'trimEnd', 50);
  R.ringHalf = [sample(draw(), 320 + 100, 180), sample(draw(), 320 - 100, 180)];
  actions.deleteLayers([ring]);

  // ---- motion blur: a white square sweeps 200px in one frame
  const sq = actions.addShape('rect', [40, 40], [100, 180]);
  actions.setPropValue(sq, 'content', 'fillColor', [255, 255, 255]);
  timeStore.set({ t: 0 });
  const lay = () => comp().layers.find((l) => l.id === sq);
  actions.toggleStopwatch(sq, 'transform', 'position');
  actions.setPropValue(sq, 'transform', 'position', [100, 180], 0);
  actions.setPropValue(sq, 'transform', 'position', [500, 180], 1 / 30);
  R.sweepNoBlur = sample(draw(1 / 60), 300, 180);
  actions.updateComp(comp().id, { motionBlur: true });
  actions.setLayerField(sq, { motionBlur: true });
  const mbC = draw(1 / 60);
  R.sweepBlurMid = sample(mbC, 300, 180);
  R.sweepBlurFar = sample(mbC, 600, 180);
  actions.deleteLayers([sq]);

  // ---- precompose
  const s1 = actions.addSolid({ name: 'A', color: [0, 200, 0], width: W, height: H });
  actions.precompose([s1]);
  R.precompType = comp().layers[0].data.type;
  R.precompCenter = sample(draw(), 320, 180);
  R.compCount = appStore.get().project.compOrder.length;

  // ---- wiggle & loop evaluation through the real path
  const n = actions.addShape('rect', [50, 50], [320, 180]);
  actions.setWiggle(n, 'transform', 'position', { freq: 3, amp: 40, seed: 7 });
  const { evalProp } = await import('/src/core/interp.ts');
  const L = () => comp().layers.find((l) => l.id === n);
  const xs = [0, 0.1, 0.2, 0.3, 0.4, 0.5].map((t) => evalProp(L().transform.position, t)[0]);
  R.wiggleVaries = new Set(xs.map((x) => x.toFixed(3))).size > 3;
  R.wiggleBounded = xs.every((x) => Math.abs(x - 320) <= 40.001);
  return R;
});

const near = (a, b, tol = 6) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol);
check('solid renders red', near(out.redCenter, [255, 0, 0, 255]), out.redCenter);
check('opacity 50% blends with background', near(out.half, [128, 0, 0, 255], 4), out.half);
check('multiply red × blue = black', near(out.multiply, [0, 0, 0, 255]), out.multiply);
check('screen red + blue = magenta', near(out.screen, [255, 0, 255, 255]), out.screen);
check('add red + blue = magenta', near(out.add, [255, 0, 255, 255]), out.add);
check('matte layer sits above its target', out.matteLayerOrder.startsWith('Ellipse'), out.matteLayerOrder);
check('alpha matte: center shows layer', near(out.alphaCenter, [255, 0, 0, 255]), out.alphaCenter);
check('alpha matte: corner is cut away', near(out.alphaCorner, [0, 0, 0, 255]), out.alphaCorner);
check('alpha matte: outside the ellipse is cut', near(out.alphaOutsideEllipse, [0, 0, 0, 255]), out.alphaOutsideEllipse);
check('alpha inverted: center cut, corner shown', near(out.invCenter, [0, 0, 0, 255]) && near(out.invCorner, [255, 0, 0, 255]), `${out.invCenter} ${out.invCorner}`);
check('luma matte 50% grey → 50% opacity', near(out.lumaCenter, [128, 0, 0, 255], 8) && near(out.lumaCorner, [0, 0, 0, 255]), `${out.lumaCenter} ${out.lumaCorner}`);
check('matte off: ex-matte layer draws again', near(out.matteConsumed, [128, 128, 128, 255]), out.matteConsumed);
check('adjustment layer inverts everything below', near(out.adjInvert, [0, 255, 255, 255]), out.adjInvert);
check('Fill effect with default red keeps red', near(out.fillDefault, [255, 0, 0, 255]), out.fillDefault);
check('Fill effect recolours the layer', near(out.fillGreen, [0, 255, 0, 255]), out.fillGreen);
check('removing the effect restores the layer', near(out.afterRemove, [255, 0, 0, 255]), out.afterRemove);
check('stroke ring draws on both sides', out.ringFull[0][0] > 200 && out.ringFull[1][0] > 200, JSON.stringify(out.ringFull));
check('trim end 50% shows only the right half', out.ringHalf[0][0] > 200 && out.ringHalf[1][0] < 30, JSON.stringify(out.ringHalf));
check('without motion blur the sweep is a crisp square', near(out.sweepNoBlur, [255, 255, 255, 255]), out.sweepNoBlur);
check('motion blur smears the sweep (partial coverage mid-path)', out.sweepBlurMid[0] > 40 && out.sweepBlurMid[0] < 255, out.sweepBlurMid);
check('motion blur does not smear past the exposure', out.sweepBlurFar[0] < 20, out.sweepBlurFar);
check('precompose makes a precomp layer', out.precompType === 'precomp' && out.compCount === 3, `${out.precompType} comps=${out.compCount}`);
check('precomp renders its contents', near(out.precompCenter, [0, 200, 0, 255]), out.precompCenter);
check('wiggle varies and stays within amplitude', out.wiggleVaries && out.wiggleBounded);
} catch (e) {
  check('suite ran to completion', false, String(e.message).split('\n').slice(0, 3).join(' | '));
}
await finish();
