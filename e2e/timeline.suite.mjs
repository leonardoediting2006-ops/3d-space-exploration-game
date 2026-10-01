import path from 'node:path';
import { open, writeTestPng } from './lib.mjs';

const { page, check, finish, OUT } = await open();
const S = OUT;
const footage = path.join(OUT, 'footage.png');
await writeTestPng(footage);
const S_ = () => page.evaluate(() => { const s = window.__ks.appStore.get(); const c = s.project.comps[s.activeCompId]; return { c, s, t: window.__ks.timeStore.get().t }; });
try {
  await page.waitForTimeout(500);

  // scrub the ruler
  const ruler = await page.locator('.tl-ruler').boundingBox();
  const pps = await page.evaluate(() => window.__ks.appStore.get().pps);
  await page.mouse.click(ruler.x + 3 * pps, ruler.y + 15);
  let { t } = await S_();
  check('clicking the ruler moves the playhead', Math.abs(t - 3) < 0.05, `t=${t}`);

  // drag a layer bar: Subtitle (row 0) by +1s
  const bar = page.locator('[data-testid=layer-bar]').nth(0);
  const b = await bar.boundingBox();
  const inBefore = (await S_()).c.layers[0].inPoint;
  await page.mouse.move(b.x + 200, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + 200 + pps, b.y + b.height / 2, { steps: 5 });
  await page.mouse.up();
  let c = (await S_()).c;
  check('dragging a bar slides the layer in time', Math.abs(c.layers[0].inPoint - inBefore - 1) < 0.05, `in ${inBefore} -> ${c.layers[0].inPoint}`);
  const kfBefore = c.layers[0].transform.opacity.keys.map((k) => k.t);
  check('keyframes travel with the layer', Math.abs(kfBefore[0] - 1.1 - 1) < 0.05, JSON.stringify(kfBefore));
  await page.keyboard.press('Control+z');
  c = (await S_()).c;
  check('slide is one undo step (layer + keys)', Math.abs(c.layers[0].inPoint - inBefore) < 1e-6 && Math.abs(c.layers[0].transform.opacity.keys[0].t - 1.1) < 1e-6);

  // trim the out-point of Title (row 1) via its right edge
  const tb = await page.locator('[data-testid=layer-bar]').nth(1).boundingBox();
  await page.mouse.move(tb.x + tb.width - 2, tb.y + tb.height / 2);
  await page.mouse.down();
  await page.mouse.move(tb.x + tb.width - 2 - 2 * pps, tb.y + tb.height / 2, { steps: 5 });
  await page.mouse.up();
  c = (await S_()).c;
  check('dragging the right edge trims the out point', Math.abs(c.layers[1].outPoint - 4) < 0.05, `out=${c.layers[1].outPoint}`);

  // keyframes: open Title and drag a keyframe
  await page.click('[data-testid=layer-row-1] .lname');
  await page.keyboard.press('u');
  await page.waitForTimeout(100);
  const kfs = page.locator('[data-testid=keyframe]');
  const nk = await kfs.count();
  check('U shows animated props with keyframes', nk >= 4, `n=${nk}`);
  const k0 = await kfs.nth(0).boundingBox();
  const before = (await S_()).c.layers[1].transform.position.keys.map((k) => k.t);
  await page.mouse.move(k0.x + 5, k0.y + 5);
  await page.mouse.down();
  await page.mouse.move(k0.x + 5 + 0.5 * pps, k0.y + 5, { steps: 4 });
  await page.mouse.up();
  const afterKeys = (await S_()).c.layers[1].transform.position.keys.map((k) => k.t);
  check('dragging a keyframe retimes it', Math.abs(afterKeys[0] - before[0] - 0.5) < 0.1, `${before[0]} -> ${afterKeys[0]}`);

  // context menu → Hold
  await kfs.nth(0).click({ button: 'right' });
  await page.click('.ctx-menu >> text=Hold');
  const ease = (await S_()).c.layers[1].transform.position.keys[0].ease;
  check('right-click keyframe → Hold sets interpolation', ease === 'hold', JSON.stringify(ease));
  // F9 easy ease
  await kfs.nth(0).click();
  await page.keyboard.press('F9');
  const ease2 = (await S_()).c.layers[1].transform.position.keys[0].ease;
  check('F9 applies Easy Ease to the selected keyframes', Array.isArray(ease2) && ease2.length === 4, JSON.stringify(ease2));
  // J / K navigation
  await page.evaluate(() => window.__ks.actions.setTime(0));
  await page.keyboard.press('k');
  const tk = (await S_()).t;
  check('K jumps to the next keyframe', tk > 0, `t=${tk}`);

  // delete selected keyframe
  const nBefore = (await S_()).c.layers[1].transform.position.keys.length;
  await kfs.nth(0).click();
  await page.keyboard.press('Delete');
  const nAfter = (await S_()).c.layers[1].transform.position.keys.length;
  check('Delete removes the selected keyframe', nAfter === nBefore - 1, `${nBefore} -> ${nAfter}`);

  // reorder via the number column (drag layer 1 -> position 3)
  const names0 = (await S_()).c.layers.map((l) => l.name);
  const idx = await page.locator('[data-testid=layer-row-0] .idx').boundingBox();
  const target = await page.locator('[data-testid=layer-row-3]').boundingBox();
  await page.mouse.move(idx.x + 8, idx.y + 8);
  await page.mouse.down();
  await page.mouse.move(idx.x + 8, target.y + target.height / 2, { steps: 6 });
  await page.mouse.up();
  const names1 = (await S_()).c.layers.map((l) => l.name);
  check('dragging the layer number reorders the stack', names1[3] === names0[0] && names1[0] === names0[1], names1.join('|'));

  // parenting cycle guard through the UI action
  const ids = (await S_()).c.layers.map((l) => l.id);
  await page.evaluate(([a, b]) => { window.__ks.actions.setParent(a, b); window.__ks.actions.setParent(b, a); }, [ids[0], ids[1]]);
  const cc = (await S_()).c.layers;
  check('parenting refuses cycles', !(cc[0].parentId === ids[1] && cc[1].parentId === ids[0]));

  // duplicate + delete
  await page.click('[data-testid=layer-row-0] .lname');
  const nL = (await S_()).c.layers.length;
  await page.keyboard.press('Control+d');
  check('Ctrl+D duplicates the layer', (await S_()).c.layers.length === nL + 1);
  await page.keyboard.press('Delete');
  check('Delete removes the selected layer', (await S_()).c.layers.length === nL);

  // playback
  await page.evaluate(() => window.__ks.actions.setTime(0));
  await page.keyboard.press('Space');
  await page.waitForTimeout(1200);
  const tp = (await S_()).t;
  check('Space plays (time advances in real time)', tp > 0.6 && tp < 2.2, `t=${tp.toFixed(2)}`);
  await page.keyboard.press('Space');
  const tstop = (await S_()).t;
  await page.waitForTimeout(300);
  check('Space again pauses', (await S_()).t === tstop);

  // footage import via the project panel's file input
  await page.setInputFiles('.project-panel input[type=file]', footage);
  await page.waitForSelector('.project-panel .item .thumb img');
  const assets = (await S_()).s.project.assetOrder.length;
  check('importing an image adds footage', assets === 1);
  await page.dblclick('.project-panel .item:has(img)');
  const imgLayer = (await S_()).c.layers.find((l) => l.type === 'image');
  check('double-clicking footage adds an image layer', !!imgLayer, imgLayer?.name);
  await page.screenshot({ path: `${S}/20-footage.png` });

  // comp settings dialog creates a second comp & tabs
  await page.click('[data-testid=menu-Composition]');
  await page.click('text=New Composition…');
  await page.fill('[data-testid=comp-name]', 'Second');
  await page.click('[data-testid=dialog-ok]');
  const tabs = await page.locator('[data-testid=comp-tab]').count();
  check('new composition opens in a new tab', tabs === 2, `tabs=${tabs}`);

  // render performance of the demo comp
  await page.click('.comp-tab >> nth=0');
  const perf = await page.evaluate(async () => {
    const { renderComp } = await import('/src/render/renderer.ts');
    const s = window.__ks.appStore.get();
    const comp = s.project.comps[s.compOrder?.[0] ?? s.project.compOrder[0]];
    const c = document.createElement('canvas');
    const run = (scale, mb) => { const t0 = performance.now(); for (let i = 0; i < 20; i++) renderComp(c, s.project, comp, 0.5 + i / 30, { scale, mbSamples: mb }); return (performance.now() - t0) / 20; };
    run(0.4, 6);
    return { preview: run(0.4, 6), half: run(0.5, 6), full: run(1, 0), fullMb: run(1, 16) };
  });
  check('preview render is fast enough for playback', perf.preview < 40, `${JSON.stringify(Object.fromEntries(Object.entries(perf).map(([k, v]) => [k, +v.toFixed(1) + 'ms'])))} (software canvas, no GPU)`);
} catch (e) {
  check('suite ran to completion', false, String(e.message).split('\n').slice(0, 3).join(' | '));
}
await finish();
