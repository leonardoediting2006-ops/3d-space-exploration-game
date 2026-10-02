import { open } from './lib.mjs';

const { page, check, finish, OUT } = await open();
const S = OUT;
const keys = () => page.evaluate(() => { const s = window.__ks.appStore.get(); const c = s.project.comps[s.activeCompId]; return c.layers[0].transform.position.keys.map((k) => ({ id: k.id, t: k.t, v: k.v, sIn: k.sIn, sOut: k.sOut })); });
const toScreen = (x, y) => page.evaluate(([x, y]) => { const r = document.querySelector('.stage').getBoundingClientRect(); return [r.left + (x / 1920) * r.width, r.top + (y / 1080) * r.height]; }, [x, y]);
try {
  await page.evaluate(() => {
    const { actions } = window.__ks;
    actions.newComp({ name: 'Motion', width: 1920, height: 1080, fps: 30, duration: 3, bg: [20, 20, 28] });
    const id = actions.addShape('ellipse', [120, 120], [200, 700]);
    actions.toggleStopwatch(id, 'transform', 'position');
    actions.setPropValue(id, 'transform', 'position', [200, 700], 0);
    window.__ks.timeStore.set({ t: 1 }); actions.setPropValue(id, 'transform', 'position', [960, 250], 1);
    window.__ks.timeStore.set({ t: 2 }); actions.setPropValue(id, 'transform', 'position', [1700, 700], 2);
    window.__ks.timeStore.set({ t: 0 });
  });
  await page.waitForTimeout(300);
  let k = await keys();
  check('three position keyframes exist', k.length === 3);
  // linear (straight) motion first: midpoint of first segment
  const straight = await page.evaluate(async () => { const { baseValue } = await import('/src/core/interp.ts'); const s = window.__ks.appStore.get(); const l = s.project.comps[s.activeCompId].layers[0]; return baseValue(l.transform.position, 0.5); });
  check('straight motion before smoothing', Math.abs(straight[0] - 580) < 1 && Math.abs(straight[1] - 475) < 1, straight);
  await page.screenshot({ path: `${S}/50-motion-straight.png`, clip: { x: 260, y: 66, width: 1030, height: 530 } });
  // select the middle keyframe and smooth through the Animation menu
  await page.evaluate((id) => window.__ks.actions.selectKeys([id]), k[1].id);
  await page.click('[data-testid=menu-Animation]');
  await page.click('text=Smooth Motion Path (Auto Bezier)');
  k = await keys();
  check('auto bezier sets tangents on the middle keyframe', k[1].sOut && k[1].sIn && Math.abs(k[1].sOut[0] - 250) < 1 && Math.abs(k[1].sIn[0] + 250) < 1, JSON.stringify([k[1].sIn, k[1].sOut]));
  check('end keyframes stay untangented', !k[0].sOut && !k[2].sIn);
  const curved = await page.evaluate(async () => { const { baseValue } = await import('/src/core/interp.ts'); const s = window.__ks.appStore.get(); const l = s.project.comps[s.activeCompId].layers[0]; return baseValue(l.transform.position, 0.5); });
  check('the motion path now curves (midpoint leaves the straight line)', Math.abs(curved[1] - 475) > 3 || Math.abs(curved[0] - 580) > 3, curved);
  await page.screenshot({ path: `${S}/51-motion-smoothed.png`, clip: { x: 260, y: 66, width: 1030, height: 530 } });

  // drag the middle key in the viewer: layer must be selected, then drag the vertex
  await page.evaluate(() => { const s = window.__ks.appStore.get(); const c = s.project.comps[s.activeCompId]; window.__ks.actions.selectLayers([c.layers[0].id]); });
  const [kx, ky] = await toScreen(960, 250);
  await page.mouse.move(kx, ky); await page.mouse.down();
  await page.mouse.move(kx + 30, ky + 60, { steps: 5 }); await page.mouse.up();
  k = await keys();
  check('dragging a motion-path keyframe moves its value, not its time', k[1].t === 1 && Math.abs(k[1].v[0] - 960) > 20 && Math.abs(k[1].v[1] - 250) > 40, `${k[1].v} t=${k[1].t}`);
  await page.keyboard.press('Control+z');
  k = await keys();
  check('keyframe drag is one undo step', Math.abs(k[1].v[0] - 960) < 0.01 && Math.abs(k[1].v[1] - 250) < 0.01);

  // drag a tangent handle: the middle key must be selected for its handles to be grabbable
  await page.evaluate((id) => { const s = window.__ks.appStore.get(); const c = s.project.comps[s.activeCompId]; window.__ks.actions.selectLayers([c.layers[0].id]); window.__ks.actions.selectKeys([id]); }, k[1].id);
  const out0 = k[1].sOut;
  const [hx, hy] = await toScreen(960 + out0[0], 250 + out0[1]);
  await page.mouse.move(hx, hy); await page.mouse.down();
  await page.mouse.move(hx + 40, hy - 40, { steps: 5 }); await page.mouse.up();
  k = await keys();
  check('dragging a tangent handle reshapes the curve', Math.abs(k[1].sOut[0] - out0[0]) > 20, `${out0} -> ${k[1].sOut}`);
  check('handles mirror by default (smooth)', Math.abs(k[1].sIn[0] + k[1].sOut[0]) < 0.1 && Math.abs(k[1].sIn[1] + k[1].sOut[1]) < 0.1, JSON.stringify([k[1].sIn, k[1].sOut]));

  // Alt-drag on an end key pulls out a curve
  await page.evaluate(() => { const s = window.__ks.appStore.get(); const c = s.project.comps[s.activeCompId]; window.__ks.actions.selectLayers([c.layers[0].id]); });
  const [ex, ey] = await toScreen(200, 700);
  await page.keyboard.down('Alt');
  await page.mouse.move(ex, ey); await page.mouse.down();
  await page.mouse.move(ex + 60, ey - 60, { steps: 5 }); await page.mouse.up();
  await page.keyboard.up('Alt');
  k = await keys();
  check('Alt-drag on a keyframe pulls out tangents', k[0].sOut && Math.hypot(k[0].sOut[0], k[0].sOut[1]) > 40 && Math.abs(k[0].v[0] - 200) < 0.01, JSON.stringify(k[0]));

  // Straighten
  await page.evaluate((ids) => window.__ks.actions.selectKeys(ids), k.map((x) => x.id));
  await page.click('[data-testid=menu-Animation]');
  await page.click('text=Straighten Motion Path');
  k = await keys();
  check('Straighten removes every tangent', k.every((x) => !x.sIn && !x.sOut));
  // time-reverse swaps tangents
  await page.evaluate(() => { const s = window.__ks.appStore.get(); const c = s.project.comps[s.activeCompId]; window.__ks.actions.selectKeys(c.layers[0].transform.position.keys.map((x) => x.id)); window.__ks.actions.smoothMotionPath(c.layers[0].transform.position.keys.map((x) => x.id)); });
  const before = await keys();
  await page.evaluate(() => { const s = window.__ks.appStore.get(); const c = s.project.comps[s.activeCompId]; window.__ks.actions.timeReverseKeys(c.layers[0].transform.position.keys.map((x) => x.id)); });
  const after = await keys();
  check('time-reverse mirrors the values', after[0].v[0] === before[2].v[0] && after[2].v[0] === before[0].v[0]);
  // save/load round trip with spatial tangents
  const rt = await page.evaluate(async () => { const m = await import('/src/core/serialize.ts'); const s = window.__ks.appStore.get(); return JSON.stringify(m.parseProject(m.serializeProject(s.project, {})).project) === JSON.stringify(s.project); });
  check('tangents survive save / load', rt);
} catch (e) {
  check('suite ran to completion', false, String(e.message).split('\n').slice(0, 3).join(' | '));
}
await finish();
