// The Inspector, animation cards, command palette, pickers and viewer helpers — driven through the real UI.
import path from 'node:path';
import { open } from './lib.mjs';

const { page, check, finish, OUT } = await open();

const A = (fn, ...args) => page.evaluate(([src, a]) => new Function('ks', 'args', `return (${src})(ks, ...args)`)(window.__ks, a), [fn.toString(), args]);
const layerOf = (name) => A((ks, n) => { const s = ks.appStore.get(); return JSON.parse(JSON.stringify(s.project.comps[s.activeCompId].layers.find((l) => l.name === n) ?? null)); }, name);
const selected = () => A((ks) => { const s = ks.appStore.get(); const l = s.project.comps[s.activeCompId].layers.find((x) => x.id === s.selection[0]); return l ? JSON.parse(JSON.stringify(l)) : null; });
const setTime = (t) => A((ks, v) => ks.actions.setTime(v), t);
const rowIndex = (name) => A((ks, n) => { const s = ks.appStore.get(); return s.project.comps[s.activeCompId].layers.findIndex((l) => l.name === n); }, name);
const pickLayer = async (name) => { await page.click(`[data-testid=layer-row-${await rowIndex(name)}] .lname`); await page.waitForTimeout(150); };

try {
  // ---- nothing selected: the composition's own settings
  check('with nothing selected the Inspector shows the composition', (await page.locator('[data-testid=comp-inspector]').count()) === 1);
  const compNameInput = await page.inputValue('[data-testid=comp-inspector] .ins-name');
  check('composition name is shown', compNameInput === 'Intro', compNameInput);
  await page.click('[data-testid=comp-inspector] .chip:has-text("720p")');
  const size = await A((ks) => { const s = ks.appStore.get(); const c = s.project.comps[s.activeCompId]; return [c.width, c.height]; });
  check('canvas size presets resize the composition', size[0] === 1280 && size[1] === 720, size);
  await A((ks) => ks.actions.updateComp(ks.appStore.get().activeCompId, { width: 1920, height: 1080 }));

  // ---- a fresh solid to experiment on
  await A((ks) => ks.actions.addSolid({ name: 'Lab', color: [200, 40, 40], width: 400, height: 300 }));
  await page.waitForTimeout(200);
  check('selecting a layer shows its name in the Inspector', (await page.inputValue('[data-testid=ins-name]')) === 'Lab');
  await page.fill('[data-testid=ins-name]', 'Lab 2');
  await page.press('[data-testid=ins-name]', 'Enter');
  check('renaming in the Inspector renames the layer', (await selected()).name === 'Lab 2');
  await A((ks) => ks.actions.setLayerField(ks.appStore.get().selection[0], { name: 'Lab' }));

  // ---- typing a value, scrubbing a slider
  await page.click('[data-testid=ins-rotation] .num');
  await page.fill('[data-testid=ins-rotation] .num-input', '45');
  await page.press('[data-testid=ins-rotation] .num-input', 'Enter');
  check('click-to-type sets a value', (await selected()).transform.rotation.value === 45);
  const slider = page.locator('[data-testid=ins-opacity] .slider');
  const sb = await slider.boundingBox();
  await page.mouse.move(sb.x + sb.width - 4, sb.y + sb.height / 2);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2, { steps: 6 });
  await page.mouse.up();
  const op = (await selected()).transform.opacity.value;
  check('dragging the opacity slider sets it from the pointer position', Math.abs(op - 50) <= 6, op);
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  check('arrow keys nudge a focused slider', (await selected()).transform.opacity.value === op + 1);
  check('the reset button appears for a changed value', (await page.locator('[data-testid=ins-opacity] [data-testid=prop-reset]').count()) === 1);
  await page.click('[data-testid=ins-opacity] [data-testid=prop-reset]');
  check('reset puts the default back', (await selected()).transform.opacity.value === 100);

  // ---- keyframes from the Inspector
  await setTime(0);
  await page.click('[data-testid=ins-rotation] [data-testid=prop-animate]');
  check('the diamond turns animation on with a key at the playhead', (await selected()).transform.rotation.keys.length === 1);
  await setTime(1);
  await page.click('[data-testid=ins-rotation] .num');
  await page.fill('[data-testid=ins-rotation] .num-input', '180');
  await page.press('[data-testid=ins-rotation] .num-input', 'Enter');
  const rk = (await selected()).transform.rotation.keys;
  check('editing an animated value at a new time adds a keyframe', rk.length === 2 && rk[1].v === 180, JSON.stringify(rk.map((k) => [k.t, k.v])));
  await setTime(0.5);
  await page.click('[data-testid=ins-rotation] [title="Next keyframe"]');
  check('next-keyframe arrow jumps the playhead', Math.abs((await A((ks) => ks.timeStore.get().t)) - 1) < 1e-6);
  await page.click('[data-testid=ins-rotation] [title="Previous keyframe"]');
  check('previous-keyframe arrow jumps back', (await A((ks) => ks.timeStore.get().t)) === 0);

  // the keyframe list and graph
  await page.click('[data-testid=ins-rotation] .pr-twirl');
  check('expanding shows one row per keyframe', (await page.locator('[data-testid=ins-rotation] [data-testid=key-row]').count()) === 2);
  check('and a value graph', (await page.locator('[data-testid=ins-rotation] [data-testid=prop-graph]').count()) === 1);
  const keyTime = page.locator('[data-testid=ins-rotation] [data-testid=key-row] .kr-t').nth(1);
  await keyTime.click();
  await page.fill('[data-testid=ins-rotation] [data-testid=key-row] .num-input', '2');
  await page.press('[data-testid=ins-rotation] [data-testid=key-row] .num-input', 'Enter');
  check('typing a keyframe time retimes it', (await selected()).transform.rotation.keys[1].t === 2);
  const gk = await page.locator('[data-testid=ins-rotation] [data-testid=graph-key]').nth(1).boundingBox();
  const g0 = await page.locator('[data-testid=ins-rotation] [data-testid=prop-graph]').boundingBox();
  await page.mouse.move(gk.x + gk.width / 2, gk.y + gk.height / 2);
  await page.mouse.down();
  await page.mouse.move(g0.x + g0.width * 0.5, gk.y + gk.height / 2 + 20, { steps: 8 });
  await page.mouse.up();
  const dragged = (await selected()).transform.rotation.keys[1];
  check('dragging a key on the graph changes its time and value', dragged.t < 2 && dragged.v < 180, JSON.stringify([dragged.t, dragged.v]));
  await page.click('[data-testid=ins-rotation] [data-testid=key-row] [data-testid=ease-button]');
  await page.click('[data-testid="ease-bounceOut"]');
  check('picking an easing for a keyframe segment', (await selected()).transform.rotation.keys[0].ease === 'bounceOut');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: path.join(OUT, 'inspector-keys.png') });
  await page.click('[data-testid=ins-rotation] [title="More"]');
  await page.click('.menu-item:has-text("Stop animating")');
  check('stop animating bakes the value and removes the keys', (await selected()).transform.rotation.keys.length === 0);

  // ---- align
  await A((ks) => ks.actions.setPropValue(ks.appStore.get().selection[0], 'transform', 'position', [100, 100]));
  await page.click('[data-testid=align-centerH]');
  await page.click('[data-testid=align-middle]');
  const pos = (await selected()).transform.position.value;
  check('align centres a single layer on the composition', Math.abs(pos[0] - 960) < 1 && Math.abs(pos[1] - 540) < 1, pos);

  // ---- library animation → card → adjust
  await page.click('[data-testid=tab-library]');
  await page.click('.lib-cats >> text=Motion');
  await page.waitForTimeout(500);
  await page.click('[data-testid="tpl-motion.slideInLeft"]');
  await page.click('[data-testid=toast-action]');
  check('the toast offers to customize and opens the Inspector', (await page.locator('[data-testid=inspector]').count()) === 1);
  check('an animation card appears under In', (await page.locator('[data-testid=slot-in] [data-testid=anim-card]').count()) === 1);
  const inst0 = (await selected()).anims[0];
  check('the card names the animation', (await page.locator('[data-testid=anim-card]').first().innerText()).includes('Slide In from Left'));
  const startField = page.locator('[data-testid=anim-card] .ac-pair label').nth(0).locator('.num');
  await startField.click();
  await page.fill('[data-testid=anim-card] .num-input', '2');
  await page.press('[data-testid=anim-card] .num-input', 'Enter');
  let lab = await selected();
  check('Start moves the whole animation', lab.transform.position.keys[0].t === 2, lab.transform.position.keys.map((k) => k.t));
  const lenField = page.locator('[data-testid=anim-card] .ac-pair label').nth(1).locator('.num');
  await lenField.click();
  await page.fill('[data-testid=anim-card] .num-input', '1.6');
  await page.press('[data-testid=anim-card] .num-input', 'Enter');
  lab = await selected();
  const pk = lab.transform.position.keys;
  check('Length stretches it', Math.abs(pk[pk.length - 1].t - pk[0].t - 1.6) < 0.05, pk.map((k) => k.t));
  const slid = page.locator('[data-testid=anim-card] .slider');
  await slid.focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowLeft'); // 100% → 50%
  lab = await selected();
  check('Strength scales the distance', lab.anims[0].strength === 0.5, lab.anims[0].strength);
  const dist = lab.transform.position.value[0] - lab.transform.position.keys[0].v[0];
  check('and the slide really is shorter', dist > 0 && dist < 400, dist);
  await page.click('[data-testid=anim-card] [data-testid=ease-button]');
  await page.click('[data-testid="ease-elasticOut"]');
  lab = await selected();
  check('the card\'s Easing sets every segment', lab.transform.position.keys[0].ease === 'elasticOut' && lab.transform.opacity.keys[0].ease === 'elasticOut');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: path.join(OUT, 'inspector-animate.png') });

  // timeline clip
  await page.click(`[data-testid=twirl-${await rowIndex('Lab')}]`);
  const clip = page.locator('[data-testid=anim-clip]').first();
  check('the animation is a clip on the timeline', (await clip.count()) === 1);
  const cb = await clip.boundingBox();
  const before = (await selected()).transform.position.keys[0].t;
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await page.mouse.down();
  await page.mouse.move(cb.x + cb.width / 2 + 90, cb.y + cb.height / 2, { steps: 6 });
  await page.mouse.up();
  const moved = (await selected()).transform.position.keys[0].t;
  check('dragging the clip moves the animation in time', moved > before + 0.5, `${before} -> ${moved}`);
  const cb2 = await clip.boundingBox();
  await page.mouse.move(cb2.x + cb2.width - 3, cb2.y + cb2.height / 2);
  await page.mouse.down();
  await page.mouse.move(cb2.x + cb2.width - 3 + 60, cb2.y + cb2.height / 2, { steps: 6 });
  await page.mouse.up();
  lab = await selected();
  const k2 = lab.transform.position.keys;
  check('dragging its right edge makes it longer', k2[k2.length - 1].t - k2[0].t > 1.6 + 0.3, k2.map((k) => k.t));
  await page.screenshot({ path: path.join(OUT, 'inspector-clip.png') });

  // replacing the In animation through the picker
  await page.evaluate(() => document.querySelector('[data-testid=section-animate]')?.scrollIntoView());
  await page.click('[data-testid=add-in]');
  await page.waitForSelector('[data-testid=anim-picker]');
  await page.click('[data-testid="pick-motion.zoomIn"]');
  lab = await selected();
  check('picking another In animation replaces the first', lab.anims.length === 1 && lab.anims[0].template === 'motion.zoomIn', lab.anims.map((a) => a.template));
  check('and its keyframes are gone', lab.transform.position.keys.length === 0);
  await page.click('[data-testid=anim-remove]');
  lab = await selected();
  check('the card\'s X removes the animation completely', lab.anims.length === 0 && lab.transform.scale.keys.length === 0 && lab.transform.opacity.keys.length === 0);

  // previewing
  await A((ks) => ks.appStore.set({ previewOnApply: true }));
  await setTime(1);
  await page.click('[data-testid=tab-library]');
  await page.click('.lib-cats >> text=Motion');
  await page.click('[data-testid="tpl-motion.slideInRight"]');
  await page.waitForTimeout(300);
  check('applying from the Library plays it once automatically', (await A((ks) => ks.appStore.get().playing)) === true);
  await page.keyboard.press('Space');
  check('Space stops a preview where it is', (await A((ks) => ks.appStore.get().playing)) === false);
  await A((ks) => ks.appStore.set({ previewOnApply: false }));
  await setTime(1);
  await page.click('[data-testid=tab-inspector]');
  await page.click('[data-testid=anim-preview]');
  await page.waitForTimeout(250);
  check('the card\'s play button previews the animation', (await A((ks) => ks.appStore.get().playing)) === true);
  await page.waitForFunction(() => !window.__ks.appStore.get().playing, null, { timeout: 8000 });
  const back = await A((ks) => ks.timeStore.get().t);
  check('and the playhead returns to where it was', Math.abs(back - 1) < 0.05, back);
  await page.click('[data-testid=anim-remove]');

  // ---- effects: picker, card, params
  await page.click('[data-testid=add-effect]');
  await page.click('[data-testid=fx-glow]');
  check('adding an effect from the picker', (await selected()).effects.length === 1);
  check('its parameters appear as rows', (await page.locator('[data-testid=fx-card] .prop-row').count()) === 3);
  await page.click('[data-testid=fx-card] [data-testid=ins-radius] .num, [data-testid=fx-card] [data-testid=ins-radius] .slider');
  await page.fill('.num-input, .slider-input', '88');
  await page.press('.num-input, .slider-input', 'Enter');
  check('effect parameters edit in place', (await selected()).effects[0].props.radius.value === 88);
  await page.click('[data-testid=fx-card] [data-testid=ins-radius] [data-testid=prop-reset]');
  check('and reset to their default', (await selected()).effects[0].props.radius.value === 20);
  await page.click('[data-testid=fx-enable]');
  check('the eye turns an effect off', (await selected()).effects[0].enabled === false);
  await page.click('[data-testid=fx-remove]');
  check('X removes it', (await selected()).effects.length === 0);

  // ---- colour picker
  await A((ks) => ks.actions.setLayerField(ks.appStore.get().selection[0], { name: 'Lab' }));
  await page.click('[data-testid=ins-color] [data-testid=color-swatch]');
  await page.fill('[data-testid=color-hex]', '#33cc66');
  await page.press('[data-testid=color-hex]', 'Enter');
  check('the colour picker hex field sets the colour', JSON.stringify((await selected()).content.color.value) === JSON.stringify([51, 204, 102]));
  const sv = await page.locator('.cp-sv').boundingBox();
  await page.mouse.click(sv.x + sv.width - 2, sv.y + 2);
  const c2 = (await selected()).content.color.value;
  check('clicking the colour square picks a saturated colour', c2[1] > 190 && c2[0] < 60, c2);
  await page.keyboard.press('Escape');

  // ---- command palette
  await page.keyboard.press('Control+k');
  await page.waitForSelector('[data-testid=palette]');
  await page.keyboard.type('gaussian');
  const first = await page.locator('[data-testid=palette-item]').first().innerText();
  check('the palette ranks the obvious command first', /Gaussian Blur/.test(first), first);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  check('Enter runs it', (await selected()).effects.some((e) => e.type === 'gaussianBlur'));
  check('and closes the palette', (await page.locator('[data-testid=palette]').count()) === 0);
  await page.keyboard.press('Control+k');
  await page.keyboard.type('add text');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  check('Add text creates a text layer', (await selected())?.type === 'text');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('neon cyan');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  check('templates are in the palette too', (await selected()).effects.some((e) => e.source === 'style:neonCyan'));
  await page.keyboard.press('Control+k');
  await page.keyboard.press('Escape');
  check('Escape closes the palette', (await page.locator('[data-testid=palette]').count()) === 0);
  await page.screenshot({ path: path.join(OUT, 'inspector-text.png') });

  // ---- text animations coexist: entrance + exit
  await page.click('[data-testid=tab-library]');
  await page.click('.lib-cats >> text=Text Animations');
  await page.waitForTimeout(400);
  await page.click('[data-testid="tpl-textanim.softReveal"]');
  await setTime(3);
  await page.click('[data-testid="tpl-textanim.fadeOutLetters"]');
  const txt = await selected();
  check('a text entrance and an exit can both be applied', txt.anims.map((a) => a.slot).sort().join() === 'in,out', txt.anims.map((a) => a.template));
  await page.click('[data-testid=tab-inspector]');
  const unitsSel = page.locator('[data-testid=slot-in] [data-testid=anim-card] select').first();
  await unitsSel.selectOption('1');
  const entranceId = txt.anims.find((a) => a.slot === 'in').id;
  const wordMode = (await selected()).animators.filter((a) => a.inst === entranceId).every((a) => a.props.units.value === 1);
  check('"Animate by" switches the entrance to words', wordMode);

  // ---- favourites
  await page.click('[data-testid=tab-library]');
  await page.click('.lib-cats >> text=Text Styles');
  await page.hover('[data-testid="tpl-style.neonCyan"]');
  await page.click('[data-testid="tpl-style.neonCyan"] .tpl-fav');
  check('a starred template adds a Favourites tab', (await page.locator('[data-testid=lib-cat-favorites]').count()) === 1);
  const stored = await page.evaluate(() => localStorage.getItem('keyframe-studio:favorites'));
  check('favourites are remembered', stored?.includes('style.neonCyan'), stored);
  check('an applied template carries a badge', (await page.locator('[data-testid="tpl-style.neonCyan"] .tpl-badge').count()) === 1);

  // ---- multi-select: align, stagger
  await A((ks) => {
    const { actions } = ks;
    actions.selectLayers([]);
    const ids = [1, 2, 3].map((i) => actions.addShape('rect', [120, 120], [300 * i, 200 * i]));
    actions.selectLayers(ids);
  });
  await page.click('[data-testid=tab-inspector]');
  check('several selected layers show the multi-selection banner', (await page.locator('[data-testid=multi-banner]').count()) === 1);
  await page.click('[data-testid=align-left]');
  const lefts = await A((ks) => {
    const s = ks.appStore.get();
    return s.selection.map((id) => s.project.comps[s.activeCompId].layers.find((l) => l.id === id).transform.position.value[0] - 60);
  });
  check('Align left lines them up on the selection\'s left edge', lefts.every((x) => Math.abs(x - lefts[0]) < 0.01), lefts);
  await page.click('[data-testid=distribute-h]');
  await page.click('[data-testid=tab-library]');
  await page.click('.lib-cats >> text=Motion');
  await page.click('[data-testid="tpl-motion.fadeIn"]');
  await page.click('[data-testid=tab-inspector]');
  await page.click('[data-testid=stagger]');
  const starts = await A((ks) => {
    const s = ks.appStore.get();
    return s.selection.map((id) => s.project.comps[s.activeCompId].layers.find((l) => l.id === id).transform.opacity.keys[0].t).sort((a, b) => a - b);
  });
  check('Stagger offsets each layer\'s entrance', starts[1] > starts[0] && starts[2] > starts[1], starts);

  // ---- viewer: smart guides and the right-click menu
  const one = await A((ks) => {
    const { actions } = ks;
    actions.selectLayers([]);
    const id = actions.addShape('rect', [200, 200], [300, 300]);
    actions.selectLayers([id]);
    return id;
  });
  const stage = await page.locator('.stage').boundingBox();
  const zoom = stage.width / 1920;
  const at = (x, y) => [stage.x + x * zoom, stage.y + y * zoom];
  const [sx, sy] = at(300, 300);
  const [ex, ey] = at(955, 536); // 5px short of the centre
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(ex, ey, { steps: 10 });
  await page.waitForTimeout(120);
  const guideShown = await page.evaluate(() => {
    const c = document.querySelector('.overlay-canvas');
    const g = c.getContext('2d');
    const w = c.width, h = c.height;
    const px = g.getImageData(0, 0, w, h).data;
    let pink = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i] > 230 && px[i + 1] < 120 && px[i + 2] > 130 && px[i + 3] > 60) pink++;
    return pink;
  });
  await page.mouse.up();
  const sp = await A((ks, id) => { const s = ks.appStore.get(); return s.project.comps[s.activeCompId].layers.find((l) => l.id === id).transform.position.value; }, one);
  check('dragging near the centre snaps the layer to it', Math.abs(sp[0] - 960) < 0.01 && Math.abs(sp[1] - 540) < 0.01, sp);
  check('and a guide line is drawn while it snaps', guideShown > 50, guideShown);
  await page.mouse.move(sx + 10, sy + 10);
  await page.mouse.down();
  await page.mouse.move(sx + 220, sy + 140, { steps: 8 });
  await page.keyboard.down('Alt');
  await page.mouse.move(at(962, 543)[0], at(962, 543)[1], { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Alt');

  const countBefore = await A((ks) => { const s = ks.appStore.get(); return s.project.comps[s.activeCompId].layers.length; });
  await page.mouse.click(...at(sp[0] + 0, sp[1] + 0), { button: 'right' });
  await page.waitForSelector('.menu-pop');
  await page.click('.menu-item:has-text("Duplicate")');
  const countAfter = await A((ks) => { const s = ks.appStore.get(); return s.project.comps[s.activeCompId].layers.length; });
  check('right-click → Duplicate works', countAfter === countBefore + 1, `${countBefore} -> ${countAfter}`);

  // ---- my presets: save a tuned animation, reuse it, rename, delete, persist
  await A((ks) => { ks.actions.selectLayers([]); const a = ks.actions.addShape('rect', [200, 200], [400, 400]); ks.actions.setLayerField(a, { name: 'PresetSrc' }); const b = ks.actions.addShape('rect', [200, 200], [1400, 700]); ks.actions.setLayerField(b, { name: 'PresetDst' }); ks.actions.selectLayers([a]); });
  await setTime(0);
  await page.click('[data-testid=tab-library]');
  await page.click('.lib-cats >> text=Motion');
  await page.click('[data-testid="tpl-motion.slideInLeft"]');
  await page.click('[data-testid=toast-action]');
  const srcCard = page.locator('[data-testid=slot-in] [data-testid=anim-card]');
  const strengthSlider = srcCard.locator('.slider');
  await strengthSlider.focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowLeft'); // 100% -> 50%
  const srcLayer = await selected();
  const srcDist = srcLayer.transform.position.value[0] - srcLayer.transform.position.keys[0].v[0];
  await srcCard.locator('[title="More"]').click();
  await page.click('.menu-item:has-text("Save as preset")');
  await page.waitForSelector('[data-testid=name-prompt]');
  await page.fill('[data-testid=name-input]', 'Gentle slide');
  await page.click('[data-testid=name-save]');
  await page.waitForTimeout(150);
  check('saving shows a toast with a shortcut to My presets', /Gentle slide/.test(await page.textContent('[data-testid=toast]')));
  await page.click('[data-testid=toast-action]');
  check('the Library gets a My presets tab with the preset', (await page.locator('[data-testid="lib-cat-mine"]').count()) === 1 && (await page.locator('.tpl-card:has-text("Gentle slide")').count()) === 1);
  await A((ks) => { const s = ks.appStore.get(); const l = s.project.comps[s.activeCompId].layers.find((x) => x.name === 'PresetDst'); ks.actions.selectLayers([l.id]); });
  await page.click('.tpl-card:has-text("Gentle slide")');
  const dst = await layerOf('PresetDst');
  const dstDist = dst.transform.position.value[0] - dst.transform.position.keys[0].v[0];
  check('applying it elsewhere reproduces the tuned distance', dst.anims.length === 1 && Math.abs(dstDist - srcDist) < 1, `${dstDist} vs ${srcDist}`);
  check('and lands on the layer\'s own position', dst.transform.position.value[0] === 1400 && dst.transform.position.value[1] === 700);
  const storedPresets = await page.evaluate(() => localStorage.getItem('keyframe-studio:presets'));
  check('presets are stored in the browser', storedPresets?.includes('Gentle slide'), String(storedPresets).slice(0, 60));
  await page.keyboard.press('Control+k');
  await page.keyboard.type('gentle');
  check('the palette offers saved presets first', /Gentle slide/.test(await page.locator('[data-testid=palette-item]').first().innerText()));
  await page.keyboard.press('Escape');
  await page.hover('.tpl-card:has-text("Gentle slide")');
  await page.click('.tpl-card:has-text("Gentle slide") [title="Rename"]');
  await page.fill('[data-testid=name-input]', 'Soft entrance');
  await page.press('[data-testid=name-input]', 'Enter');
  check('presets can be renamed', (await page.locator('.tpl-card:has-text("Soft entrance")').count()) === 1);
  // looks: save an effect stack
  await A((ks) => { const s = ks.appStore.get(); const l = s.project.comps[s.activeCompId].layers.find((x) => x.name === 'PresetSrc'); ks.actions.selectLayers([l.id]); ks.actions.addEffect([l.id], 'glow'); const fx = ks.appStore.get().project.comps[s.activeCompId].layers.find((x) => x.name === 'PresetSrc').effects[0]; ks.actions.setPropValue(l.id, `fx:${fx.id}`, 'radius', 66); });
  await page.click('[data-testid=tab-inspector]');
  await page.click('[data-testid=save-look]');
  await page.fill('[data-testid=name-input]', 'Big glow');
  await page.press('[data-testid=name-input]', 'Enter');
  await A((ks) => { const s = ks.appStore.get(); const l = s.project.comps[s.activeCompId].layers.find((x) => x.name === 'PresetDst'); ks.actions.selectLayers([l.id]); });
  await page.click('[data-testid=add-effect]');
  await page.click('.picker-pop .seg button:has-text("Looks")');
  await page.click('.picker-pop .pick-card:has-text("Big glow")');
  const lookDst = await layerOf('PresetDst');
  check('a saved look is offered in the effect picker and keeps its settings', lookDst.effects.some((e) => e.type === 'glow' && e.props.radius.value === 66), JSON.stringify(lookDst.effects.map((e) => e.type)));
  await page.reload();
  await page.waitForSelector('[data-testid=comp-canvas]');
  await page.evaluate(() => window.__ks.appStore.set({ previewOnApply: false }));
  await page.click('[data-testid=tab-library]');
  check('and they are still there after a reload', (await page.locator('[data-testid="lib-cat-mine"]').count()) === 1);
  await page.click('[data-testid="lib-cat-mine"]');
  await page.hover('.tpl-card:has-text("Soft entrance")');
  await page.click('.tpl-card:has-text("Soft entrance") [data-testid=preset-delete]');
  check('deleting removes the preset', (await page.locator('.tpl-card:has-text("Soft entrance")').count()) === 0 && (await page.locator('.tpl-card:has-text("Big glow")').count()) === 1);
  await page.hover('.tpl-card:has-text("Big glow")');
  await page.click('.tpl-card:has-text("Big glow") [data-testid=preset-delete]');
  check('the tab stays when the last one is deleted, with an empty state and the import / export bar', (await page.locator('[data-testid="lib-cat-mine"]').count()) === 1 && (await page.locator('.tpl-card').count()) === 0 && (await page.locator('[data-testid=preset-bar]').count()) === 1 && (await page.locator('[data-testid=presets-export]').isDisabled()));
  await page.evaluate(() => window.__ks.appStore.set({ previewOnApply: false }));

  await page.evaluate(() => { const l = JSON.parse(localStorage.getItem('keyframe-studio:presets') ?? '[]'); localStorage.setItem('keyframe-studio:presets', JSON.stringify([...l, { id: 'user.evil', name: 'x', kind: 'motion', props: [{ target: { group: 'transform', key: 'position' }, keys: [{ t: 0, v: [1e999, 2], ease: 'linear' }] }] }, 'junk'])); });
  await page.reload();
  await page.waitForSelector('[data-testid=comp-canvas]');
  check('a corrupted preset in storage is ignored without breaking the app', (await page.locator('[data-testid=comp-canvas]').count()) === 1);
  await page.evaluate(() => window.__ks.appStore.set({ previewOnApply: false }));

  // ---- drag a template from the Library onto a layer
  await A((ks) => { ks.actions.selectLayers([]); const id = ks.actions.addShape('ellipse', [260, 260], [960, 540]); ks.actions.setLayerField(id, { name: 'DropMe' }); ks.actions.selectLayers([]); });
  await page.click('[data-testid=tab-library]');
  await page.click('.lib-cats >> text=Motion');
  await page.waitForTimeout(400);
  await setTime(2);
  const dropRow = await rowIndex('DropMe');
  await page.dragAndDrop('[data-testid="tpl-motion.popIn"]', `[data-testid=layer-row-${dropRow}]`);
  let dm = await layerOf('DropMe');
  check('dropping an entrance on a timeline row applies it at the layer\'s start', dm.anims.length === 1 && dm.anims[0].template === 'motion.popIn' && dm.transform.scale.keys[0].t === dm.inPoint, JSON.stringify(dm.anims.map((a) => a.template)));
  await page.dragAndDrop('[data-testid="tpl-motion.fadeOut"]', `[data-testid=layer-row-${dropRow}]`);
  dm = await layerOf('DropMe');
  const fo = dm.transform.opacity.keys;
  check('and an exit so that it ends as the layer ends', dm.anims.some((a) => a.slot === 'out') && Math.abs(fo[fo.length - 1].t - dm.outPoint) < 0.05, JSON.stringify(fo.map((k) => k.t)));
  await A((ks) => ks.actions.removeAnim(ks.appStore.get().project.comps[ks.appStore.get().activeCompId].layers.find((l) => l.name === 'DropMe').id, ks.appStore.get().project.comps[ks.appStore.get().activeCompId].layers.find((l) => l.name === 'DropMe').anims[0].id));
  await setTime(4); // the layer starts at 3s, so it must be on screen to be hit
  const stage2 = await page.locator('.stage').boundingBox();
  const vp2 = await page.locator('[data-testid=viewport]').boundingBox();
  const z2 = stage2.width / 1920;
  await page.dragAndDrop('[data-testid="tpl-motion.zoomIn"]', '[data-testid=viewport]', { targetPosition: { x: stage2.x - vp2.x + 960 * z2, y: stage2.y - vp2.y + 540 * z2 } });
  dm = await layerOf('DropMe');
  check('dropping on a layer in the viewer applies it to that layer', dm.anims.some((a) => a.template === 'motion.zoomIn'), JSON.stringify(dm.anims.map((a) => a.template)));

  // ---- empty composition and the first-run tip
  await A((ks) => ks.actions.newComp({ name: 'Blank' }));
  await page.waitForSelector('[data-testid=viewer-empty]');
  check('an empty composition shows the "start" card', (await page.locator('[data-testid=viewer-empty]').count()) === 1);
  await page.click('[data-testid=empty-text]');
  await page.waitForTimeout(200);
  check('its Text button adds a text layer', (await selected())?.type === 'text');
  check('and the card goes away', (await page.locator('[data-testid=viewer-empty]').count()) === 0);
  await page.evaluate(() => localStorage.removeItem('keyframe-studio:tip-dismissed'));
  await page.reload();
  await page.waitForSelector('[data-testid=first-tip]');
  check('the first-run tip shows once', (await page.locator('[data-testid=first-tip]').count()) === 1);
  await page.click('[data-testid=tip-close]');
  await page.reload();
  await page.waitForSelector('[data-testid=comp-canvas]');
  await page.waitForTimeout(300);
  check('and stays dismissed', (await page.locator('[data-testid=first-tip]').count()) === 0);
} catch (e) {
  check('suite ran to completion', false, e.message.split('\n').slice(0, 3).join(' | '));
  console.error(e.stack);
}
await finish();
