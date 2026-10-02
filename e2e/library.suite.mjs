import path from 'node:path';
import { open } from './lib.mjs';

const { page, check, finish, OUT } = await open();

try {
  // ---- every template renders through the real renderer without throwing, and shows something
  const R = await page.evaluate(async () => {
    const { LIBRARY, LIBRARY_ORDER } = await import('/src/templates/index.ts');
    const { buildPreview } = await import('/src/templates/preview.ts');
    const { renderComp } = await import('/src/render/renderer.ts');
    const canvas = document.createElement('canvas');
    const failures = [];
    const blank = [];
    let rendered = 0;
    const lit = (c) => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      const bg = [d[0], d[1], d[2]];
      for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 30) n++;
      return n;
    };
    for (const cat of LIBRARY_ORDER) {
      if (cat === 'gradient' || cat === 'easing') continue;
      for (const item of LIBRARY[cat]) {
        const spec = buildPreview(item);
        if (!spec) { failures.push(`${item.id}: no preview`); continue; }
        try {
          let maxLit = 0;
          for (const t of [spec.still, 0, spec.length * 0.5, spec.length * 0.9]) {
            renderComp(canvas, spec.project, spec.comp, Math.min(t, spec.comp.duration - 1 / 30), { scale: 160 / spec.comp.width, mbSamples: 0 });
            maxLit = Math.max(maxLit, lit(canvas));
            rendered++;
          }
          // the sample content should be visible at some point of the preview (static looks may be blank at t=0 only)
          if (maxLit < 30) blank.push(item.id);
        } catch (e) { failures.push(`${item.id}: ${e.message}`); }
      }
    }
    return { failures, blank, rendered };
  });
  check('every template preview renders at several times without errors', R.failures.length === 0, R.failures.slice(0, 5).join(' | ') || `${R.rendered} frames`);
  check('every template preview shows visible content at some point', R.blank.length === 0, R.blank.slice(0, 8).join(', '));

  // ---- the Library panel
  await page.click('.tabs >> text=Library');
  await page.waitForSelector('[data-testid=library]');
  const cats = await page.locator('.lib-cats button').count();
  check('library lists all seven categories plus My presets', cats === 8, cats);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, 'library-text-styles.png') });
  const thumbsDrawn = await page.evaluate(() => [...document.querySelectorAll('.tpl-thumb')].filter((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 40) if (d[i + 3] > 0 && d[i] > 60) return true; return false; }).length);
  check('visible thumbnails are really rendered', thumbsDrawn >= 4, thumbsDrawn);

  // search spans every category
  await page.fill('[data-testid=library-search]', 'gold');
  await page.waitForTimeout(300);
  const hits = await page.locator('.tpl-card').count();
  check('search finds templates across categories', hits >= 3, hits);
  await page.fill('[data-testid=library-search]', '');

  // text style with nothing selected creates a text layer
  const before = await page.evaluate(() => { const s = window.__ks.appStore.get(); return s.project.comps[s.activeCompId].layers.length; });
  await page.evaluate(() => window.__ks.appStore.set({ selection: [] }));
  await page.click('[data-testid="tpl-style.neonCyan"]');
  const after = await page.evaluate(() => { const s = window.__ks.appStore.get(); const c = s.project.comps[s.activeCompId]; const l = c.layers.find((x) => x.id === s.selection[0]); return { n: c.layers.length, type: l?.type, fx: l?.effects.map((e) => e.type) }; });
  check('applying a text style with no selection creates a styled text layer', after.n === before + 1 && after.type === 'text' && after.fx.includes('glow'), after);

  // a text animation on the selected text layer
  await page.click('.lib-cats >> text=Text Animations');
  await page.click('[data-testid="tpl-textanim.popBack"]');
  const anim = await page.evaluate(() => { const s = window.__ks.appStore.get(); const l = s.project.comps[s.activeCompId].layers.find((x) => x.id === s.selection[0]); return l.animators.length; });
  check('applying a text animation adds animators to the selected layer', anim === 2, anim);

  // gradient onto the selected text layer
  await page.click('.lib-cats >> text=Gradients');
  await page.click('[data-testid="tpl-gradient.sunset"]');
  const gfx = await page.evaluate(() => { const s = window.__ks.appStore.get(); const l = s.project.comps[s.activeCompId].layers.find((x) => x.id === s.selection[0]); return l.effects[0].type; });
  check('applying a gradient adds a Gradient Fill (first in the stack)', gfx === 'gradientFill', gfx);
  await page.click('[data-testid="tpl-gradient.ocean"]');
  const gcount = await page.evaluate(() => { const s = window.__ks.appStore.get(); const l = s.project.comps[s.activeCompId].layers.find((x) => x.id === s.selection[0]); return l.effects.filter((e) => e.type === 'gradientFill').length; });
  check('applying another gradient replaces rather than duplicates', gcount === 1, gcount);

  // gradient background button
  await page.hover('[data-testid="tpl-gradient.aurora"]');
  await page.click('[data-testid="tpl-gradient.aurora"] .bg-btn');
  const bgLayer = await page.evaluate(() => { const s = window.__ks.appStore.get(); const c = s.project.comps[s.activeCompId]; const l = c.layers[c.layers.length - 1]; return { name: l.name, fx: l.effects[0]?.type }; });
  check('the BG button adds a gradient background at the bottom of the stack', /Aurora Background/.test(bgLayer.name) && bgLayer.fx === 'gradientFill', bgLayer);

  // motion preset on a shape
  await page.evaluate(() => { const { actions } = window.__ks; actions.addShape('ellipse', [200, 200], [960, 540]); });
  await page.click('.lib-cats >> text=Motion');
  await page.click('[data-testid="tpl-motion.bounceIn"]');
  const bounce = await page.evaluate(() => { const s = window.__ks.appStore.get(); const l = s.project.comps[s.activeCompId].layers.find((x) => x.id === s.selection[0]); return l.transform.scale.keys[0].ease; });
  check('a motion template keyframes the selected layer with a named easing', bounce === 'bounceOut', bounce);

  // easing onto those keyframes
  await page.click('.lib-cats >> text=Easing');
  await page.click('[data-testid="tpl-easing.elasticOut"]');
  const eased = await page.evaluate(() => { const s = window.__ks.appStore.get(); const l = s.project.comps[s.activeCompId].layers.find((x) => x.id === s.selection[0]); return l.transform.scale.keys[0].ease; });
  check('an easing template re-eases every keyframe on the selected layer', eased === 'elasticOut', eased);

  // look
  await page.click('.lib-cats >> text=Looks');
  await page.click('[data-testid="tpl-look.softGlow"]');
  const look = await page.evaluate(() => { const s = window.__ks.appStore.get(); const l = s.project.comps[s.activeCompId].layers.find((x) => x.id === s.selection[0]); return l.effects.map((e) => e.source); });
  check('a look adds its effects tagged with their template', look.includes('look:softGlow'), look);

  // scene
  const nBefore = await page.evaluate(() => { const s = window.__ks.appStore.get(); return s.project.comps[s.activeCompId].layers.length; });
  await page.click('.lib-cats >> text=Scenes');
  await page.click('[data-testid="tpl-scene.lt.bar"]');
  const nAfter = await page.evaluate(() => { const s = window.__ks.appStore.get(); return { n: s.project.comps[s.activeCompId].layers.length, sel: s.selection.length }; });
  check('inserting a scene adds its layers and selects them', nAfter.n === nBefore + 3 && nAfter.sel === 3, nAfter);

  // undo reverts a whole template in one step
  await page.keyboard.press('Control+z');
  const undone = await page.evaluate(() => { const s = window.__ks.appStore.get(); return s.project.comps[s.activeCompId].layers.length; });
  check('one undo reverts an entire scene', undone === nBefore, undone);

  // selecting a non-text layer and using a text style gives a helpful message and changes nothing
  await page.click('.lib-cats >> text=Text Styles');
  await page.evaluate(() => { const s = window.__ks.appStore.get(); const c = s.project.comps[s.activeCompId]; window.__ks.actions.selectLayers([c.layers.find((l) => l.type === 'shape').id]); });
  const nShape = await page.evaluate(() => { const s = window.__ks.appStore.get(); return s.project.comps[s.activeCompId].layers.length; });
  await page.click('[data-testid="tpl-style.comic"]');
  const toast = await page.textContent('[data-testid=toast]');
  const nShape2 = await page.evaluate(() => { const s = window.__ks.appStore.get(); return s.project.comps[s.activeCompId].layers.length; });
  check('text styles refuse non-text layers with a hint', /text layer/i.test(toast) && nShape2 === nShape, toast);

  // hover plays an animation preview: pixels change between frames
  await page.click('.lib-cats >> text=Text Animations');
  await page.waitForTimeout(400);
  const card = page.locator('[data-testid="tpl-textanim.typewriter"] canvas');
  // centre it: the search / category header is sticky and would otherwise cover a card at the very top
  await card.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const frame = () => card.evaluate((c) => c.toDataURL());
  const still = await frame();
  await card.hover();
  await page.waitForTimeout(350);
  const playing = await frame();
  await page.mouse.move(5, 5);
  await page.waitForTimeout(150);
  const back = await frame();
  check('hovering a card plays its animation, and leaving restores the still', playing !== still && back === still);
  await page.screenshot({ path: path.join(OUT, 'library-text-anims.png') });
} catch (e) {
  check('suite ran to completion', false, String(e.message).split('\n').slice(0, 4).join(' | '));
}
await finish();
