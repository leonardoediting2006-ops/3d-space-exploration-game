// Presets: export to a file, import (with hostile input), and keeping them in sync with a file.
import fs from 'node:fs';
import path from 'node:path';
import { open } from './lib.mjs';

const { page, check, finish, OUT } = await open({ downloads: true });
const A = (fn, ...args) => page.evaluate(fn, ...args);

const state = () => A(() => window.__ks.presets.presetStore.get().presets.map((p) => p.name));
const toast = async () => (await page.locator('[data-testid=toast]').textContent())?.trim() ?? '';

try {
  // two presets, saved the way the app does it
  await A(async () => {
    const ks = window.__ks;
    const s = ks.appStore.get();
    const comp = s.project.comps[s.activeCompId];
    const layer = comp.layers.find((l) => l.name === 'Ring') ?? comp.layers[0];
    ks.actions.selectLayers([layer.id]);
    ks.actions.setTime(1);
    ks.templateActions.applyLibraryItemById('motion.slideInLeft');
    let cur = ks.appStore.get().project.comps[s.activeCompId].layers.find((l) => l.id === layer.id);
    ks.presets.saveAnimationPreset(cur, cur.anims[0], 'Alpha slide');
    ks.templateActions.applyLibraryItemById('motion.popIn');
    cur = ks.appStore.get().project.comps[s.activeCompId].layers.find((l) => l.id === layer.id);
    ks.presets.saveAnimationPreset(cur, cur.anims.find((a) => a.template === 'motion.popIn'), 'Beta pop');
  });
  check('two presets saved', JSON.stringify(await state()) === JSON.stringify(['Beta pop', 'Alpha slide']), await state());
  const stamped = await A(() => window.__ks.presets.presetStore.get().presets.every((p) => typeof p.updatedAt === 'number'));
  check('each preset is time-stamped', stamped);

  await page.click('[data-testid=tab-library]');
  await page.click('[data-testid=lib-cat-mine]');
  check('My presets shows import / export / sync controls', (await page.locator('[data-testid=presets-import]').count()) === 1 && (await page.locator('[data-testid=presets-export]').count()) === 1 && (await page.locator('[data-testid=presets-sync]').count()) === 1);

  // ---- export
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid=presets-export]')]);
  check('export downloads my-presets.kfspresets', dl.suggestedFilename() === 'my-presets.kfspresets', dl.suggestedFilename());
  const file = path.join(OUT, 'my-presets.kfspresets');
  await dl.saveAs(file);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  check('the file is a versioned presets file with both presets', json.format === 'keyframe-studio-presets' && json.version === 1 && json.presets.length === 2, `${json.format} v${json.version} ${json.presets.length}`);
  check('the toast confirms the export', /Exported 2 presets/.test(await toast()), await toast());

  await page.hover('.tpl-card:has-text("Alpha slide")');
  const [dl1] = await Promise.all([page.waitForEvent('download'), page.click('.tpl-card:has-text("Alpha slide") [data-testid=preset-export]')]);
  check('a single preset exports under its own name', dl1.suggestedFilename() === 'alpha-slide.kfspresets', dl1.suggestedFilename());
  const single = path.join(OUT, dl1.suggestedFilename());
  await dl1.saveAs(single);
  check('…and the file holds just that one', JSON.parse(fs.readFileSync(single, 'utf8')).presets.length === 1);

  // ---- import
  const importFile = async (f) => {
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-testid=presets-import]')]);
    await fc.setFiles(f);
    await page.waitForTimeout(250);
  };
  await A(() => { const p = window.__ks.presets; for (const x of [...p.presetStore.get().presets]) p.deletePreset(x.id); });
  check('library emptied', (await state()).length === 0);
  check('the empty library says so and disables Export', /Nothing saved yet/.test(await page.locator('.lib-hint').first().innerText()) && (await page.locator('[data-testid=presets-export]').isDisabled()));
  await importFile(file);
  check('importing the file brings both back', JSON.stringify((await state()).sort()) === JSON.stringify(['Alpha slide', 'Beta pop']), await state());
  check('the toast says what happened', /Imported 2 presets/.test(await toast()), await toast());
  check('imported presets show as cards', (await page.locator('.tpl-card:has-text("Beta pop")').count()) === 1);
  await importFile(file);
  check('importing the same file again adds nothing', (await state()).length === 2 && /Nothing new.*2 presets already/.test(await toast()), await toast());

  // imported presets really apply
  const applied = await A(async () => {
    const ks = window.__ks;
    const s = ks.appStore.get();
    const comp = s.project.comps[s.activeCompId];
    const target = comp.layers.find((l) => l.name === 'Star') ?? comp.layers[1];
    ks.actions.selectLayers([target.id]);
    ks.actions.setTime(2);
    const p = ks.presets.presetStore.get().presets.find((x) => x.name === 'Alpha slide');
    ks.templateActions.applyLibraryItemById(p.id);
    const l = ks.appStore.get().project.comps[s.activeCompId].layers.find((x) => x.id === target.id);
    return { anims: l.anims.length, keys: l.transform.position.keys.length };
  });
  check('an imported preset applies to a layer', applied.anims >= 1 && applied.keys >= 2, applied);

  // ---- hostile files
  const bad = (name, content) => {
    const f = path.join(OUT, name);
    fs.writeFileSync(f, content);
    return f;
  };
  const before = JSON.stringify(await A(() => window.__ks.presets.presetStore.get().presets.map((p) => p.id)));
  for (const [name, content, expect] of [
    ['notjson.kfspresets', 'hello', /not a valid presets file/],
    ['wrong.kfspresets', JSON.stringify({ hello: 1 }), /not a Keyframe Studio presets file/],
    ['newer.kfspresets', JSON.stringify({ format: 'keyframe-studio-presets', version: 9, presets: [] }), /newer version/],
  ]) {
    await importFile(bad(name, content));
    check(`rejects ${name}`, expect.test(await toast()), await toast());
  }
  await importFile(bad('mixed.kfspresets', JSON.stringify({ format: 'keyframe-studio-presets', version: 1, presets: ['junk', { id: 'user.x', name: '<img src=x onerror=alert(1)>', kind: 'motion', props: [{ target: { group: 'transform', key: 'position' }, keys: [{ t: 0, v: [1e999, 1], ease: 'linear' }] }] }] })));
  check('junk entries are skipped, nothing is added', JSON.stringify(await A(() => window.__ks.presets.presetStore.get().presets.map((p) => p.id))) === before, await toast());

  // ---- sync with a file (an origin-private file stands in for the picker, which headless cannot show)
  const opfs = (fn, ...args) => A(fn, ...args);
  await opfs(async () => {
    const root = await navigator.storage.getDirectory();
    const h = await root.getFileHandle('sync.kfspresets', { create: true });
    await window.__ks.presetSync.linkPresetFile(h);
  });
  const readFile = () => opfs(async () => {
    const root = await navigator.storage.getDirectory();
    const f = await (await root.getFileHandle('sync.kfspresets')).getFile();
    return f.text();
  });
  const writeFile = (text) => opfs(async (t) => {
    const root = await navigator.storage.getDirectory();
    const w = await (await root.getFileHandle('sync.kfspresets')).createWritable();
    await w.write(t);
    await w.close();
  }, text);
  const syncState = () => A(() => window.__ks.presetSync.syncStore.get());
  let st = await syncState();
  check('linking writes the presets to the file and reports ok', st.state === 'ok' && st.name === 'sync.kfspresets', st);
  const first = JSON.parse(await readFile());
  check('the file now holds both presets', first.presets.length === 2, first.presets.length);
  check('the status line shows the file name', /sync\.kfspresets/.test(await page.locator('[data-testid=sync-status]').innerText()));

  // a local edit reaches the file by itself
  await A(() => { const p = window.__ks.presets; p.renamePreset(p.presetStore.get().presets.find((x) => x.name === 'Beta pop').id, 'Beta bounce'); });
  await page.waitForTimeout(1500);
  check('a rename is written to the file automatically', JSON.parse(await readFile()).presets.some((p) => p.name === 'Beta bounce'));

  // "another computer" changes the file: one new preset, one deletion, and a stale copy of the rename
  const remote = JSON.parse(await readFile());
  const alpha = remote.presets.find((p) => p.name === 'Alpha slide');
  const beta = remote.presets.find((p) => p.name === 'Beta bounce');
  const fresh = { ...alpha, id: 'user.fromelsewhere', name: 'From elsewhere', updatedAt: Date.now() + 5000 };
  remote.presets = [fresh, { ...beta, name: 'Beta stale', updatedAt: 1 }];
  remote.deleted = { [alpha.id]: Date.now() + 1000 };
  await writeFile(JSON.stringify(remote));
  await A(() => window.__ks.presetSync.syncNow());
  const names = (await state()).sort();
  check('a preset added elsewhere arrives', names.includes('From elsewhere'), names);
  check('a deletion made elsewhere is applied', !names.includes('Alpha slide'), names);
  check('an older copy does not undo a newer local edit', names.includes('Beta bounce') && !names.includes('Beta stale'), names);
  check('the library UI follows', (await page.locator('.tpl-card:has-text("From elsewhere")').count()) === 1 && (await page.locator('.tpl-card:has-text("Alpha slide")').count()) === 0);

  // a file that is not a presets file is left alone
  await writeFile('{"precious": "data"}');
  await A(() => window.__ks.presetSync.syncNow());
  st = await syncState();
  check('a foreign file is refused and not overwritten', st.state === 'error' && (await readFile()) === '{"precious": "data"}', st);
  check('the error is shown', /not a presets file/.test(await page.locator('[data-testid=sync-status]').innerText()));
  await writeFile('');
  await A(() => window.__ks.presetSync.syncNow());
  check('an empty file is fine and gets filled', (await syncState()).state === 'ok' && JSON.parse(await readFile()).presets.length === 2);

  // survives a reload
  await page.reload();
  await page.waitForSelector('[data-testid=comp-canvas]');
  await page.waitForTimeout(800);
  st = await syncState();
  check('the link is restored after a reload', st.state === 'ok' && st.name === 'sync.kfspresets', st);

  // stop syncing
  await A(() => window.__ks.presetSync.unlinkSync());
  await A(() => window.__ks.presets.renamePreset(window.__ks.presets.presetStore.get().presets[0].id, 'Edited after unlink'));
  await page.waitForTimeout(1200);
  check('after unlinking, edits no longer reach the file', !(await readFile()).includes('Edited after unlink') && (await syncState()).state === 'off');
  await page.reload();
  await page.waitForSelector('[data-testid=comp-canvas]');
  await page.waitForTimeout(500);
  check('and the link is gone after a reload', (await syncState()).state === 'off');

  // palette + menu entries
  await page.keyboard.press('Control+k');
  await page.keyboard.type('presets');
  const items = await page.locator('[data-testid=palette-item]').allInnerTexts();
  check('the palette offers import, export and sync', ['Import presets', 'Export my presets', 'Sync presets'].every((t) => items.some((i) => i.includes(t))), items.slice(0, 6));
  await page.keyboard.press('Escape');
} catch (e) {
  check('suite ran to completion', false, String(e.stack || e.message).split('\n').slice(0, 4).join(' | '));
}
await finish();
