import { open } from './lib.mjs';

const { page, check, finish, OUT } = await open();
const S = OUT;

try {
await page.waitForTimeout(600);

const state = () => page.evaluate(() => {
  const s = window.__ks.appStore.get();
  const c = s.project.comps[s.activeCompId];
  return { layers: c.layers.map((l) => ({ id: l.id, name: l.name, pos: l.transform.position.value, posKeys: l.transform.position.keys.length, rot: l.transform.rotation.value, scale: l.transform.scale.value, matte: l.matte })), sel: s.selection, undo: s.undoCount, selKeys: s.selKeys, t: window.__ks.timeStore.get().t };
});
const compToScreen = async (x, y) => page.evaluate(([x, y]) => {
  const r = document.querySelector('.stage').getBoundingClientRect();
  return [r.left + (x / 1920) * r.width, r.top + (y / 1080) * r.height];
}, [x, y]);

// ---- 1. select a layer, twirl open, check property rows
await page.click('[data-testid=layer-row-4] .lname');
await page.click('[data-testid=twirl-4]');
await page.waitForTimeout(150);
check('twirl shows transform properties', (await page.locator('[data-testid=prop-position]').count()) === 1);
await page.screenshot({ path: `${S}/10-twirl.png` });

// ---- 2. stopwatch on position creates a keyframe at the playhead
await page.evaluate(() => window.__ks.actions.setTime(1));
await page.click('[data-testid=sw-position]');
let st = await state();
check('stopwatch adds one keyframe', st.layers[4].posKeys === 1, JSON.stringify(st.layers[4].posKeys));
check('keyframe diamond rendered', (await page.locator('[data-testid=keyframe]').count()) >= 1);

// ---- 3. type a value into the position X field, at t=2 -> second keyframe
await page.evaluate(() => window.__ks.actions.setTime(2));
const posX = page.locator('[data-testid=prop-position] .num').first();
await posX.click();
await page.keyboard.type('1400');
await page.keyboard.press('Enter');
st = await state();
check('typing a value on an animated prop creates a keyframe', st.layers[4].posKeys === 2, `keys=${st.layers[4].posKeys}`);
await page.screenshot({ path: `${S}/11-keyframes.png` });

// ---- 4. undo removes it, redo restores it
await page.keyboard.press('Control+z');
st = await state();
check('undo reverts the keyframe', st.layers[4].posKeys === 1, `keys=${st.layers[4].posKeys}`);
await page.keyboard.press('Control+Shift+z');
st = await state();
check('redo restores the keyframe', st.layers[4].posKeys === 2);

// ---- 5. P/S reveal shortcuts
await page.keyboard.press('s');
await page.waitForTimeout(100);
check('S reveals only Scale', (await page.locator('[data-testid=prop-scale]').count()) === 1 && (await page.locator('[data-testid=prop-position]').count()) === 0);
await page.keyboard.press('u');
await page.waitForTimeout(100);
check('U reveals animated props only', (await page.locator('[data-testid=prop-position]').count()) === 1 && (await page.locator('[data-testid=prop-rotation]').count()) >= 1);
await page.keyboard.press('u');

// ---- 6. viewer drag moves the selected layer (plain layer, not animated): the Ring
await page.evaluate(() => window.__ks.actions.setTime(0));
await page.click('[data-testid=layer-row-5] .lname');
const before = (await state()).layers[5].pos;
const [sx, sy] = await compToScreen(960, 540 - 270);   // top of the ring's box edge region (stroke), inside bounding box
await page.mouse.move(sx, sy + 40);
await page.mouse.down();
await page.mouse.move(sx + 60, sy + 40 + 30, { steps: 6 });
await page.mouse.up();
const after = (await state()).layers[5].pos;
check('dragging in the viewer moves the layer', Math.abs(after[0] - before[0]) > 50, `${before} -> ${after}`);
await page.keyboard.press('Control+z');
const undone = (await state()).layers[5].pos;
check('one drag is one undo step', Math.abs(undone[0] - before[0]) < 0.01, `${undone}`);

// ---- 7. shape tool drag creates a layer
const nBefore = (await state()).layers.length;
await page.keyboard.press('q');
const [ax, ay] = await compToScreen(200, 200);
const [bx, by] = await compToScreen(500, 420);
await page.mouse.move(ax, ay);
await page.mouse.down();
await page.mouse.move(bx, by, { steps: 5 });
await page.mouse.up();
st = await state();
check('shape tool creates a layer', st.layers.length === nBefore + 1, `${nBefore} -> ${st.layers.length}`);
check('new layer is selected & tool resets', st.sel.length === 1);

// ---- 8. text tool
await page.click('[data-testid=tool-text]');
const [tx, ty] = await compToScreen(960, 300);
await page.mouse.click(tx, ty);
await page.waitForSelector('.text-editor');
await page.keyboard.type('Hello AE');
await page.mouse.click(40, 500); // blur by clicking the project panel
await page.waitForTimeout(200);
st = await state();
check('text tool creates a text layer with typed text', st.layers.some((l) => l.name === 'Hello AE'), st.layers.map((l) => l.name).join('|'));

await page.screenshot({ path: `${S}/12-tools.png` });

// ---- 9. effects apply
await page.click('[data-testid=tab-inspector]');
await page.click('[data-testid=add-effect]');
await page.click('[data-testid=fx-gaussianBlur]');
const fxCount = await page.evaluate(() => { const s = window.__ks.appStore.get(); const c = s.project.comps[s.activeCompId]; return c.layers.find((l) => l.id === s.selection[0]).effects.length; });
check('applying an effect adds it to the selected layer', fxCount === 1);
await page.screenshot({ path: `${S}/13-fx.png` });

// ---- 10. save/load round trip
const rt = await page.evaluate(async () => {
  const { appStore } = window.__ks;
  const before = JSON.stringify(appStore.get().project);
  const mod = await import('/src/core/serialize.ts');
  const text = mod.serializeProject(appStore.get().project, {});
  const { project } = mod.parseProject(text);
  return JSON.stringify(project) === before;
});
check('serialize -> parse round-trips exactly', rt);
const bad = await page.evaluate(async () => {
  const mod = await import('/src/core/serialize.ts');
  const out = [];
  for (const t of ['nope', '{}', '{"format":"keyframe-studio","version":1,"project":{"comps":{},"compOrder":[],"assets":{},"assetOrder":[]},"assets":{}}', '{"format":"keyframe-studio","version":99}']) {
    try { mod.parseProject(t); out.push('accepted'); } catch (e) { out.push('rejected'); }
  }
  return out;
});
check('hostile / garbage project files are rejected', bad.every((x) => x === 'rejected'), bad.join(','));

} catch (e) {
  check('suite ran to completion', false, String(e.message).split('\n').slice(0, 3).join(' | '));
}
await finish();
