// The Graph Editor: value and speed graphs, keyframe and handle dragging, selection and navigation.
import { open } from './lib.mjs';

const { page, check, finish } = await open();

const A = (fn, ...args) => page.evaluate(([src, a]) => new Function('ks', 'args', `return (${src})(ks, ...args)`)(window.__ks, a), [fn.toString(), args]);
const layer = (name) => A((ks, n) => { const s = ks.appStore.get(); return JSON.parse(JSON.stringify(s.project.comps[s.activeCompId].layers.find((l) => l.name === n))); }, name);
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const center = async (loc) => { const b = await loc.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
// a vec2's two components can sit on top of each other; the later one is on top
const keyDot = (id) => page.locator(`[data-testid=graph-key][data-id="${id}"]`).last();
const drag = async (from, to, { shift = false, steps = 8 } = {}) => {
  await page.mouse.move(from.x, from.y);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
  await page.waitForTimeout(80);
};
const selKeys = () => A((ks) => ks.appStore.get().selKeys);
const undo = async () => { await page.keyboard.press('Control+z'); await page.waitForTimeout(150); };

try {
  // Star: Scale (3 keys, a vec2) and Rotation (2 keys)
  await A((ks) => {
    const s = ks.appStore.get();
    ks.actions.selectLayers([s.project.comps[s.activeCompId].layers.find((l) => l.name === 'Star').id]);
    ks.appStore.set({ tlHeight: 560 });
  });
  check('the timeline has a Graph button', (await page.locator('[data-testid=graph-toggle]').count()) === 1);
  await page.click('[data-testid=graph-toggle]');
  await page.waitForSelector('[data-testid=graph-editor]');
  check('the Graph Editor replaces the layer bars', (await page.locator('[data-testid=graph-editor]').isVisible()) && !(await page.locator('[data-testid=tl-body]').isVisible()));
  check('it lists the animated properties of the selected layer', (await page.locator('[data-testid=graph-channel]').count()) === 2, await page.locator('[data-testid=graph-channels]').innerText());

  // ---- value graph
  check('value mode: a curve per component (x and y for scale, one for rotation)', (await page.locator('[data-testid=graph-curve]').count()) === 3);
  check('…and a dot per keyframe component (3×2 + 2)', (await page.locator('[data-testid=graph-key]').count()) === 8);
  const star = await layer('Star');
  const rot = star.transform.rotation.keys;
  const rotKeyDot = keyDot(rot[0].id);
  const before = await center(rotKeyDot);
  await rotKeyDot.click();
  check('clicking a keyframe selects it', JSON.stringify(await selKeys()) === JSON.stringify([rot[0].id]));
  check('the readout describes it', /Rotation/.test(await page.textContent('[data-testid=graph-readout]')) && /0\.00 s/.test(await page.textContent('[data-testid=graph-readout]')), await page.textContent('[data-testid=graph-readout]'));
  check('its bezier handle appears', (await page.locator('[data-testid=graph-handle-out]').count()) === 1 && (await page.locator('[data-testid=graph-handle-in]').count()) === 0);

  // drag the key straight up: only its value changes, and the dot follows the pointer while dragging
  const undoBefore = await A((ks) => ks.appStore.get().undoCount);
  await page.mouse.move(before.x, before.y);
  await page.keyboard.down('Shift');
  await page.mouse.down();
  await page.mouse.move(before.x, before.y - 60, { steps: 8 });
  await page.waitForTimeout(80);
  const during = await center(keyDot(rot[0].id));
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.waitForTimeout(80);
  const star2 = await layer('Star');
  check('Shift+drag up changes only the value', star2.transform.rotation.keys[0].t === rot[0].t && star2.transform.rotation.keys[0].v !== rot[0].v, `${rot[0].v} -> ${star2.transform.rotation.keys[0].v}`);
  check('the dot follows the pointer', near(during.y, before.y - 60, 2) && near(during.x, before.x, 1), JSON.stringify({ before, during }));
  check('the whole drag is one undo step', (await A((ks) => ks.appStore.get().undoCount)) === undoBefore + 1);
  await undo();
  check('undo puts the value back', (await layer('Star')).transform.rotation.keys[0].v === rot[0].v);

  // drag the second key sideways: it moves in time, snapped to a frame
  const k1 = await center(keyDot(rot[1].id));
  await drag(k1, { x: k1.x - 120, y: k1.y }, { shift: true });
  const moved = (await layer('Star')).transform.rotation.keys;
  check('dragging sideways retimes the key', moved[1].t < rot[1].t && moved[1].v === rot[1].v, `${rot[1].t} -> ${moved[1].t}`);
  check('on a whole frame', near(moved[1].t * 30, Math.round(moved[1].t * 30), 1e-6));
  await undo();

  // ---- bezier handle in value mode
  const scaleKeys = star.transform.scale.keys;
  await keyDot(scaleKeys[0].id).click();
  const handle = page.locator('[data-testid=graph-handle-out]').first();
  const h0 = await center(handle);
  const easeBefore = JSON.stringify((await layer('Star')).transform.scale.keys[0].ease);
  await drag(h0, { x: h0.x + 30, y: h0.y - 50 });
  const easeAfter = (await layer('Star')).transform.scale.keys[0].ease;
  check('dragging a handle reshapes that segment\'s easing', Array.isArray(easeAfter) && JSON.stringify(easeAfter) !== easeBefore, `${easeBefore} -> ${JSON.stringify(easeAfter)}`);
  const h1 = await center(page.locator('[data-testid=graph-handle-out]').first());
  check('the handle follows the pointer', near(h1.x, h0.x + 30, 2) && near(h1.y, h0.y - 50, 2), JSON.stringify({ h0, h1 }));
  check('influence stays between 0 and 1', easeAfter[0] >= 0 && easeAfter[0] <= 1);
  await undo();

  // ---- ease buttons act on the selection
  await rotKeyDot.click();
  await page.click('[data-testid=graph-hold]');
  check('Hold makes the selected key jump', (await layer('Star')).transform.rotation.keys[0].ease === 'hold');
  await page.click('[data-testid=graph-linear]');
  check('Linear straightens it', (await layer('Star')).transform.rotation.keys[0].ease === 'linear');
  await page.click('[data-testid=graph-easy]');
  const easy = (await layer('Star')).transform.rotation.keys[0].ease;
  check('Easy ease makes a bezier with a flat start', Array.isArray(easy) && easy[1] === 0, JSON.stringify(easy));

  // ---- speed graph
  await page.click('[data-testid=graph-mode-speed]');
  await page.waitForTimeout(150);
  check('speed mode: one curve per property', (await page.locator('[data-testid=graph-curve]').count()) === 2);
  check('…and one marker per keyframe (3 + 2)', (await page.locator('[data-testid=graph-key]').count()) === 5);
  check('the link option appears', (await page.locator('[data-testid=graph-link]').count()) === 1);

  // set the middle scale key's leaving speed to zero by dragging its handle to the baseline; speeds stay continuous
  await keyDot(scaleKeys[1].id).click();
  const outH = page.locator('[data-testid=graph-handle-out]').first();
  const inH = page.locator('[data-testid=graph-handle-in]').first();
  check('a middle key shows both speed handles', (await outH.count()) === 1 && (await inH.count()) === 1);
  const o = await center(outH);
  const zeroY = await page.evaluate(() => {
    // the zero grid line of the active channel
    const z = document.querySelector('.g-grid.zero');
    return z ? Number(z.getAttribute('y1')) + document.querySelector('[data-testid=graph-svg]').getBoundingClientRect().top : null;
  });
  check('the zero line is drawn', zeroY !== null, zeroY);
  await drag(o, { x: o.x + 20, y: zeroY });
  const speeds = await A(async (ks) => {
    const g = await import('/src/core/graph.ts');
    const s = ks.appStore.get();
    const star = s.project.comps[s.activeCompId].layers.find((l) => l.name === 'Star');
    const p = star.transform.scale;
    return { out: g.outSpeed(p, 1), inn: g.inSpeed(p, 0) };
  });
  check('the leaving speed is now ~0', near(speeds.out.speed, 0, 1.5), JSON.stringify(speeds));
  check('Link speeds carried it to the arriving side too', near(speeds.inn.speed, speeds.out.speed, 1e-6), JSON.stringify(speeds));
  await page.click('[data-testid=graph-link]');
  await undo();
  await keyDot(scaleKeys[1].id).click();
  const readSpeeds = () => A(async (ks) => {
    const g = await import('/src/core/graph.ts');
    const s = ks.appStore.get();
    const p = s.project.comps[s.activeCompId].layers.find((l) => l.name === 'Star').transform.scale;
    return { out: g.outSpeed(p, 1).speed, inn: g.inSpeed(p, 0).speed };
  });
  const was = await readSpeeds();
  const o2 = await center(page.locator('[data-testid=graph-handle-out]').first());
  await drag(o2, { x: o2.x, y: zeroY - 40 });
  const speeds2 = await readSpeeds();
  check('without Link only the dragged side changes', !near(speeds2.out, was.out, 1) && near(speeds2.inn, was.inn, 1e-6), JSON.stringify({ was, speeds2 }));
  await page.click('[data-testid=graph-link]');
  await undo();

  // ---- marquee and background clicks
  await page.click('[data-testid=graph-mode-value]');
  await page.waitForTimeout(100);
  const box = await page.locator('[data-testid=graph-svg]').boundingBox();
  await page.mouse.click(box.x + box.width - 60, box.y + 200);
  check('clicking empty graph deselects', (await selKeys()).length === 0);
  await drag({ x: box.x + 60, y: box.y + 40 }, { x: box.x + box.width - 20, y: box.y + box.height - 20 });
  check('dragging a box selects the keyframes inside it', (await selKeys()).length >= 5, (await selKeys()).length);
  await page.mouse.click(box.x + box.width - 60, box.y + 200);

  // ---- zoom, pan, fit
  const labels0 = await page.locator('.g-label').allInnerTexts();
  await page.mouse.move(box.x + 300, box.y + 200);
  await page.mouse.wheel(0, -600);
  await page.waitForTimeout(120);
  const labels1 = await page.locator('.g-label').allInnerTexts();
  check('the wheel zooms the time axis', JSON.stringify(labels0) !== JSON.stringify(labels1), `${labels0.slice(0, 4)} -> ${labels1.slice(0, 4)}`);
  await page.dblclick('[data-testid=graph-bg]', { position: { x: 200, y: 120 } });
  await page.waitForTimeout(120);
  check('double-clicking fits everything again', JSON.stringify(await page.locator('.g-label').allInnerTexts()) === JSON.stringify(labels0));

  // ---- scrub on the ruler
  const rb = await page.locator('[data-testid=graph-ruler]').boundingBox();
  await page.mouse.click(rb.x + rb.width / 2, rb.y + 10);
  const t = await A((ks) => ks.appStore.get() && window.__ks.timeStore.get().t);
  check('clicking the ruler moves the playhead', t > 0.2, t);

  // ---- channels
  await page.locator('[data-testid=graph-channel-toggle]').first().click();
  check('the dot hides a curve', (await page.locator('[data-testid=graph-curve]').count()) === 1);
  await page.locator('[data-testid=graph-channel-toggle]').first().click();
  await page.selectOption('[data-testid=graph-scope]', 'all');
  check('All layers shows every animated property', (await page.locator('[data-testid=graph-channel]').count()) >= 7, await page.locator('[data-testid=graph-channel]').count());
  await page.selectOption('[data-testid=graph-scope]', 'selected');

  // ---- add a key at the playhead
  await A((ks) => ks.actions.setTime(1));
  const nBefore = (await layer('Star')).transform.rotation.keys.length;
  await page.click('[data-testid=graph-add-key]');
  const afterAdd = await layer('Star');
  check('Key adds a keyframe at the playhead on the shown properties', afterAdd.transform.rotation.keys.length === nBefore + 1 && afterAdd.transform.scale.keys.some((k) => Math.abs(k.t - 1) < 0.02), `${nBefore} -> ${afterAdd.transform.rotation.keys.length}`);

  // ---- shared axis mode
  await page.click('[data-testid=graph-normalize]');
  check('Fill height can be turned off (one shared axis)', !(await A((ks) => ks.appStore.get().graphNormalize)));
  await page.click('[data-testid=graph-normalize]');

  // ---- shortcut, menu and palette
  await page.keyboard.press('Shift+F3');
  check('Shift+F3 closes the Graph Editor', (await page.locator('[data-testid=graph-editor]').count()) === 0 && (await page.locator('[data-testid=tl-body]').isVisible()));
  await page.keyboard.press('Shift+F3');
  check('…and opens it again', (await page.locator('[data-testid=graph-editor]').count()) === 1);
  await page.keyboard.press('Control+k');
  await page.keyboard.type('speed graph');
  check('the palette finds the speed graph', /speed graph/i.test(await page.locator('[data-testid=palette-item]').first().innerText()));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  check('and opens it in speed mode', (await A((ks) => ks.appStore.get().graphMode)) === 'speed');
} catch (e) {
  check('suite ran to completion', false, String(e.stack || e.message).split('\n').slice(0, 5).join(' | '));
}
await finish();
