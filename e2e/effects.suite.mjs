import { open } from './lib.mjs';

const { page, check, finish, OUT } = await open();
const S = OUT;

try {
  await page.waitForTimeout(400);
  const out = await page.evaluate(async () => {
    const { actions, appStore } = window.__ks;
    const { renderComp } = await import('/src/render/renderer.ts');
    const W = 640, H = 360;
    const comp = () => { const s = appStore.get(); return s.project.comps[s.activeCompId]; };
    const draw = (t = 0) => { const c = document.createElement('canvas'); renderComp(c, appStore.get().project, comp(), t, { scale: 1, mbSamples: 1 }); return c; };
    const px = (c, x, y) => Array.from(c.getContext('2d').getImageData(x, y, 1, 1).data);
    actions.newComp({ name: 'T', width: W, height: H, fps: 30, duration: 2, bg: [0, 0, 0] });
    const R = {};
    const fresh = (color) => { const l = comp().layers[0]; if (l) actions.deleteLayers(comp().layers.map((x) => x.id)); return actions.addSolid({ color, width: W, height: H }); };
    const withFx = (id, type, vals = {}) => {
      actions.addEffect([id], type);
      const fx = comp().layers.find((l) => l.id === id).effects.at(-1);
      for (const [k, v] of Object.entries(vals)) actions.setPropValue(id, 'fx:' + fx.id, k, v);
      return fx;
    };
    let id = fresh([100, 100, 100]);
    withFx(id, 'levels', { inBlack: 50, inWhite: 150 });
    R.levels = px(draw(), 320, 180);
    id = fresh([100, 100, 100]);
    withFx(id, 'levels', { gamma: 2 });
    R.gamma = px(draw(), 320, 180); // 255*(100/255)^(1/2)=159.7
    id = fresh([100, 100, 100]);
    withFx(id, 'threshold', { level: 128 });
    R.thrLow = px(draw(), 320, 180);
    id = fresh([200, 200, 200]);
    withFx(id, 'threshold', { level: 128 });
    R.thrHigh = px(draw(), 320, 180);
    id = fresh([200, 100, 40]);
    withFx(id, 'posterize', { levels: 2 });
    R.poster = px(draw(), 320, 180);
    id = fresh([255, 0, 0]);
    withFx(id, 'linearWipe', { completion: 50, angle: 90 });
    const lw = draw();
    R.wipeLeft = px(lw, 100, 180); R.wipeRight = px(lw, 540, 180);
    R.wipeNone = (() => { actions.deleteLayers([id]); const i2 = fresh([255, 0, 0]); withFx(i2, 'linearWipe', { completion: 0 }); return px(draw(), 10, 10); })();
    id = fresh([255, 0, 0]);
    withFx(id, 'linearWipe', { completion: 100 });
    R.wipeAll = px(draw(), 320, 180);
    id = fresh([0, 255, 0]);
    withFx(id, 'radialWipe', { completion: 25, start: 0 });
    const rw = draw();
    R.radialTopRight = px(rw, 480, 90); R.radialTopLeft = px(rw, 160, 90); R.radialBottom = px(rw, 320, 300);
    id = fresh([200, 200, 200]);
    withFx(id, 'vignette', { amount: 100, size: 60, feather: 60 });
    const vg = draw();
    R.vigCenter = px(vg, 320, 180); R.vigCorner = px(vg, 4, 4);
    id = fresh([128, 128, 128]);
    withFx(id, 'checkerboard', { size: 40 });
    const cb = draw();
    R.cbA = px(cb, 10, 10); R.cbB = px(cb, 50, 10); R.cbA2 = px(cb, 50, 50);
    id = fresh([128, 128, 128]);
    const fn = withFx(id, 'fractalNoise', { scale: 80 });
    const f1 = draw();
    const samples = [[50, 50], [200, 120], [400, 300], [600, 40], [320, 180]].map(([x, y]) => px(f1, x, y));
    R.noiseGrey = samples.every((s) => s[0] === s[1] && s[1] === s[2]);
    R.noiseVaries = new Set(samples.map((s) => s[0])).size >= 3;
    actions.setPropValue(id, 'fx:' + fn.id, 'evolution', 180);
    R.noiseEvolves = px(draw(), 200, 120)[0] !== samples[1][0];
    return R;
  });
  const near = (a, b, tol = 4) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
  check('levels remaps input range', near(out.levels, [128, 128, 128, 255], 3), out.levels);
  check('levels gamma brightens midtones', near(out.gamma, [160, 160, 160, 255], 3), out.gamma);
  check('threshold: dark → black', near(out.thrLow, [0, 0, 0, 255]), out.thrLow);
  check('threshold: light → white', near(out.thrHigh, [255, 255, 255, 255]), out.thrHigh);
  check('posterize 2 levels', near(out.poster, [255, 0, 0, 255]), out.poster);
  check('linear wipe 50%: left side wiped', out.wipeLeft[0] < 10 && out.wipeLeft[3] === 255, out.wipeLeft);
  check('linear wipe 50%: right side kept', near(out.wipeRight, [255, 0, 0, 255]), out.wipeRight);
  check('linear wipe 0% changes nothing', near(out.wipeNone, [255, 0, 0, 255]), out.wipeNone);
  check('linear wipe 100% hides everything', out.wipeAll[0] < 10, out.wipeAll);
  check('radial wipe 25% hides the top-right quadrant', out.radialTopRight[1] < 10, out.radialTopRight);
  check('radial wipe keeps the other quadrants', out.radialTopLeft[1] > 245 && out.radialBottom[1] > 245, `${out.radialTopLeft} ${out.radialBottom}`);
  check('vignette keeps the center and darkens the corner', out.vigCenter[0] > 190 && out.vigCorner[0] < 60, `${out.vigCenter} ${out.vigCorner}`);
  check('checkerboard alternates colors', near(out.cbA, [255, 255, 255, 255]) && near(out.cbB, [0, 0, 0, 255]) && near(out.cbA2, [255, 255, 255, 255]), `${out.cbA} ${out.cbB} ${out.cbA2}`);
  check('fractal noise is grayscale and varies', out.noiseGrey && out.noiseVaries);
  check('fractal noise evolves with the evolution angle', out.noiseEvolves);
} catch (e) {
  check('suite ran to completion', false, String(e.message).split('\n').slice(0, 3).join(' | '));
}
await finish();
