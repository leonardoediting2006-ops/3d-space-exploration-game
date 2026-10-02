// Editing several selected layers at once in the Inspector.
import { open } from './lib.mjs';

const { page, check, finish } = await open();

const A = (fn, ...args) => page.evaluate(([src, a]) => new Function('ks', 'args', `return (${src})(ks, ...args)`)(window.__ks, a), [fn.toString(), args]);
const byName = (name) => A((ks, n) => { const s = ks.appStore.get(); return JSON.parse(JSON.stringify(s.project.comps[s.activeCompId].layers.find((l) => l.name === n) ?? null)); }, name);
const all = async (names, pick) => Promise.all(names.map(async (n) => pick(await byName(n))));
const NAMES = ['M1', 'M2', 'M3'];
const row = (key) => page.locator(`[data-testid=ins-${key}]`).first();
const typeInto = async (loc, text) => {
  await loc.click();
  const input = page.locator('.num-input').first();
  await input.fill(String(text));
  await input.press('Enter');
  await page.waitForTimeout(80);
};

try {
  // three shapes with different positions and colours, all selected
  await A((ks) => {
    ks.actions.setTime(0);
    const make = (name, x, color) => {
      const id = ks.actions.addShape('rect', [120, 80], [x, 300]);
      ks.actions.setLayerField(id, { name });
      ks.actions.setPropValue(id, 'content', 'fillColor', color);
      return id;
    };
    const ids = [make('M1', 200, [255, 0, 0]), make('M2', 400, [0, 255, 0]), make('M3', 600, [0, 0, 255])];
    ks.actions.selectLayers(ids);
  });
  await page.click('[data-testid=tab-inspector]');
  await page.waitForTimeout(250);

  check('the header says how many layers are selected', /3 layers/.test(await page.textContent('[data-testid=ins-multi-title]')));
  check('the banner offers a chip per layer', (await page.locator('[data-testid=multi-banner] .chip:has-text("M2")').count()) === 1);
  check('rows that differ say Mixed, rows that agree show the value',
    /Mixed/.test(await row('position').innerText()) && !/Mixed/.test(await row('rotation').innerText()) && /0\.0/.test(await row('rotation').innerText()));
  const posCells = await row('position').locator('.num').allInnerTexts();
  check('position: X is Mixed, Y is the shared 300', /Mixed/.test(posCells[0]) && /300/.test(posCells[1]), posCells);

  // typing sets every layer; only the edited component changes
  await typeInto(row('position').locator('.num').nth(1), 500);
  check('typing Y sets every layer\'s Y and leaves each X alone',
    JSON.stringify(await all(NAMES, (l) => l.transform.position.value)) === JSON.stringify([[200, 500], [400, 500], [600, 500]]), await all(NAMES, (l) => l.transform.position.value));
  const undoBefore = await A((ks) => ks.appStore.get().undoCount);
  await typeInto(row('position').locator('.num').nth(0), 800);
  check('typing into a Mixed X sets all of them', JSON.stringify(await all(NAMES, (l) => l.transform.position.value[0])) === JSON.stringify([800, 800, 800]));
  check('one edit is one undo step', (await A((ks) => ks.appStore.get().undoCount)) === undoBefore + 1);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(100);
  check('and one undo takes it back for all three', JSON.stringify(await all(NAMES, (l) => l.transform.position.value[0])) === JSON.stringify([200, 400, 600]), await all(NAMES, (l) => l.transform.position.value[0]));

  // scrubbing moves each layer by the same amount
  const cell = row('position').locator('.num').nth(0);
  const box = await cell.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  const moved = await all(NAMES, (l) => l.transform.position.value[0]);
  const dxs = moved.map((x, i) => x - [200, 400, 600][i]);
  check('dragging a Mixed field moves every layer by the same amount', dxs.every((d) => Math.abs(d - dxs[0]) < 1e-6) && Math.abs(dxs[0]) >= 30, dxs);
  check('…so their differences are kept', moved[1] - moved[0] === 200 && moved[2] - moved[1] === 200, moved);
  await A((ks) => { ks.actions.undo?.(); });
  await page.keyboard.press('Control+z');

  // sliders: opacity agrees, so it shows the value; typing and arrow keys
  await row('opacity').locator('.slider').click();
  await page.locator('.num-input').first().fill('40');
  await page.locator('.num-input').first().press('Enter');
  await page.waitForTimeout(80);
  check('typing an opacity sets all three', JSON.stringify(await all(NAMES, (l) => l.transform.opacity.value)) === JSON.stringify([40, 40, 40]));
  await A((ks) => { ks.actions.setPropValue(ks.appStore.get().selection[1], 'transform', 'opacity', 70); });
  await page.waitForTimeout(100);
  check('opacity now shows Mixed', /Mixed/.test(await row('opacity').innerText()));
  await row('opacity').locator('.slider').focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(80);
  const ops = await all(NAMES, (l) => l.transform.opacity.value);
  check('arrow keys nudge each layer from its own value', ops[0] === 41 && ops[1] === 71 && ops[2] === 41, ops);
  await row('opacity').locator('[data-testid=prop-reset]').click();
  check('reset puts every layer back to its default', JSON.stringify(await all(NAMES, (l) => l.transform.opacity.value)) === JSON.stringify([100, 100, 100]));

  // keyframes across layers
  await row('rotation').locator('[data-testid=prop-animate]').click();
  check('the stopwatch animates every layer', JSON.stringify(await all(NAMES, (l) => l.transform.rotation.keys.length)) === JSON.stringify([1, 1, 1]));
  check('the row shows the keyframe navigator', (await row('rotation').locator('[data-testid=prop-key]').count()) === 1);
  await A((ks) => ks.actions.setTime(1));
  await page.waitForTimeout(150);
  await typeInto(row('rotation').locator('.num').first(), 45);
  const rot = await all(NAMES, (l) => l.transform.rotation.keys.map((k) => [k.t, k.v]));
  check('editing at another time writes a keyframe on each layer', rot.every((k) => k.length === 2 && k[1][0] === 1 && k[1][1] === 45), rot);
  await row('rotation').locator('[data-testid=prop-key]').click();
  check('the ◆ button removes the keyframe from all of them', JSON.stringify(await all(NAMES, (l) => l.transform.rotation.keys.length)) === JSON.stringify([1, 1, 1]));
  // a layer with no keys joins: partly animated rows offer to animate the rest
  await A((ks) => { const s = ks.appStore.get(); ks.actions.toggleStopwatch(s.selection[2], 'transform', 'rotation'); });
  await page.waitForTimeout(100);
  check('a partly animated row shows the "animate the rest" diamond', (await row('rotation').locator('[data-testid=prop-animate].partly').count()) === 1);
  await row('rotation').locator('[data-testid=prop-animate]').click();
  check('and one click animates the rest', JSON.stringify(await all(NAMES, (l) => l.transform.rotation.keys.length > 0)) === JSON.stringify([true, true, true]));
  await A((ks) => ks.actions.setTime(0));

  // source: shapes
  await page.click('[data-testid=stroke-toggle]');
  check('Stroke toggles on every layer', JSON.stringify(await all(NAMES, (l) => l.data.stroke)) === JSON.stringify([true, true, true]));
  check('the differing fill colours show as Mixed', (await page.locator('[data-testid=ins-fillColor] .swatch-btn.mixed').count()) === 1);
  await page.click('[data-testid=stroke-toggle]');

  // effects
  await page.click('[data-testid=add-effect]');
  await page.click('[data-testid=fx-gaussianBlur]');
  await page.waitForTimeout(150);
  check('adding an effect adds it to every layer', JSON.stringify(await all(NAMES, (l) => l.effects.length)) === JSON.stringify([1, 1, 1]));
  check('one card represents it for all of them', (await page.locator('[data-testid=fx-card]').count()) === 1 && /3 layers/.test(await page.locator('[data-testid=fx-card]').innerText()));
  await A((ks) => { const s = ks.appStore.get(); const l = s.project.comps[s.activeCompId].layers.find((x) => x.name === 'M2'); ks.actions.setPropValue(l.id, `fx:${l.effects[0].id}`, 'blurriness', 60); });
  await page.waitForTimeout(100);
  check('an effect setting that differs shows Mixed', /Mixed/.test(await page.locator('[data-testid=ins-blurriness]').innerText()));
  await typeInto(page.locator('[data-testid=ins-blurriness] .slider'), 25);
  check('typing a value sets it on every layer\'s copy', JSON.stringify(await all(NAMES, (l) => l.effects[0].props.blurriness.value)) === JSON.stringify([25, 25, 25]));
  await page.click('[data-testid=fx-enable]');
  check('the eye turns the effect off everywhere', JSON.stringify(await all(NAMES, (l) => l.effects[0].enabled)) === JSON.stringify([false, false, false]));
  await A((ks) => { const s = ks.appStore.get(); const l = s.project.comps[s.activeCompId].layers.find((x) => x.name === 'M3'); ks.actions.addEffect([l.id], 'glow'); });
  await page.waitForTimeout(120);
  check('an effect only some layers have is mentioned, not shown', /only some of these layers/.test(await page.locator('[data-testid=section-effects]').innerText()) && (await page.locator('[data-testid=fx-card]').count()) === 1);
  await page.click('[data-testid=fx-remove]');
  check('removing it removes it from every layer', JSON.stringify(await all(NAMES, (l) => l.effects.map((e) => e.type))) === JSON.stringify([[], [], ['glow']]));

  // animations
  await page.click('[data-testid=add-in]');
  await page.click('[data-testid="pick-motion.slideInLeft"]');
  await page.waitForTimeout(250);
  check('an animation added from the picker lands on every layer', JSON.stringify(await all(NAMES, (l) => l.anims.length)) === JSON.stringify([1, 1, 1]));
  check('one card edits all of them', (await page.locator('[data-testid=anim-card]').count()) === 1 && /× 3/.test(await page.locator('[data-testid=anim-card]').innerText()));
  const card = page.locator('[data-testid=anim-card]');
  await card.locator('.slider').click();
  await page.locator('.num-input').first().fill('150');
  await page.locator('.num-input').first().press('Enter');
  await page.waitForTimeout(100);
  check('Strength is set on every copy', JSON.stringify(await all(NAMES, (l) => l.anims[0].strength)) === JSON.stringify([1.5, 1.5, 1.5]));
  await A((ks) => { const s = ks.appStore.get(); const l = s.project.comps[s.activeCompId].layers.find((x) => x.name === 'M2'); ks.actions.setAnimStart(l.id, l.anims[0].id, 2); });
  await page.waitForTimeout(100);
  check('a Start that differs says Mixed', /Mixed/.test(await card.locator('.ac-pair label').first().innerText()));
  const starts0 = await all(NAMES, (l) => Math.min(...l.transform.position.keys.map((k) => k.t)));
  await typeInto(card.locator('.ac-pair label').first().locator('.num'), 1);
  const starts1 = await all(NAMES, (l) => Math.min(...l.transform.position.keys.map((k) => k.t)));
  check('typing a Start moves every copy to it', starts1.every((t) => Math.abs(t - 1) < 0.04), JSON.stringify({ starts0, starts1 }));
  await card.locator('[data-testid=anim-remove]').click();
  check('removing it removes it from every layer', JSON.stringify(await all(NAMES, (l) => l.anims.length)) === JSON.stringify([0, 0, 0]));
  check('and leaves no keyframes behind', JSON.stringify(await all(NAMES, (l) => l.transform.position.keys.length)) === JSON.stringify([0, 0, 0]));

  // layer settings
  await page.click('[data-testid=section-layer] .sec-toggle');
  await page.selectOption('[data-testid=ins-blend]', 'screen');
  check('blend mode applies to all', JSON.stringify(await all(NAMES, (l) => l.blend)) === JSON.stringify(['screen', 'screen', 'screen']));
  await A((ks) => { const s = ks.appStore.get(); ks.actions.setLayerField(s.selection[1], { blend: 'multiply' }); });
  await page.waitForTimeout(100);
  check('differing blend modes show Mixed', (await page.locator('[data-testid=ins-blend]').inputValue()) === '');
  await page.click('[data-testid=ins-visible]');
  check('the eye in the header hides them all', JSON.stringify(await all(NAMES, (l) => l.visible)) === JSON.stringify([false, false, false]));
  await page.click('[data-testid=ins-visible]');

  // mixed layer types share what they have in common
  await A((ks) => {
    const t = ks.actions.addText('Hello', [300, 700]);
    ks.actions.setLayerField(t, { name: 'M4' });
    const s = ks.appStore.get();
    ks.actions.selectLayers([s.selection[0], ...s.project.comps[s.activeCompId].layers.filter((l) => l.name === 'M1').map((l) => l.id)]);
  });
  await page.waitForTimeout(200);
  check('text and shape together get a Shared section with the common colour', /shared/i.test(await page.locator('[data-testid=section-source]').innerText()) && (await page.locator('[data-testid=ins-fillColor]').count()) === 1);
  check('…but no text box', (await page.locator('[data-testid=text-input]').count()) === 0);

  // text layers together
  await A((ks) => {
    const a = ks.actions.addText('One', [300, 800]);
    const b = ks.actions.addText('Two', [600, 800]);
    ks.actions.selectLayers([a, b]);
  });
  await page.waitForTimeout(200);
  check('several text layers share font and style controls but not the text itself', (await page.locator('[data-testid=font-select]').count()) === 1 && (await page.locator('[data-testid=text-input]').count()) === 0);
  await page.selectOption('[data-testid=font-select]', { index: 2 });
  const fonts = await A((ks) => { const s = ks.appStore.get(); return s.selection.map((id) => s.project.comps[s.activeCompId].layers.find((l) => l.id === id).data.font); });
  check('changing the font changes both', fonts[0] === fonts[1] && fonts[0] !== '', fonts);

  // back to one layer
  await page.click('[data-testid=multi-banner] .chip >> nth=0');
  await page.waitForTimeout(150);
  check('clicking a name in the banner focuses that layer', (await A((ks) => ks.appStore.get().selection.length)) === 1 && (await page.locator('[data-testid=ins-name]').count()) === 1);
  check('and the single-layer Inspector is back with its text box', (await page.locator('[data-testid=text-input]').count()) === 1);
} catch (e) {
  check('suite ran to completion', false, String(e.stack || e.message).split('\n').slice(0, 5).join(' | '));
}
await finish();
