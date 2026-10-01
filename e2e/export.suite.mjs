import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { open } from './lib.mjs';

const { page, check, finish, OUT } = await open({ downloads: true });

/** Drive the real Export dialog and save the download. */
async function runExport(format, resolutionLabel) {
  await page.click('[data-testid=menu-File]');
  await page.click('text=Export…');
  await page.waitForSelector('[data-testid=dialog]');
  await page.selectOption('[data-testid=export-format]', format);
  if (resolutionLabel) await page.locator('.modal select').filter({ hasText: 'Quarter' }).selectOption({ label: resolutionLabel });
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.click('[data-testid=export-run]')]);
  const file = path.join(OUT, dl.suggestedFilename());
  await dl.saveAs(file);
  const message = await page.textContent('[data-testid=export-message]');
  await page.keyboard.press('Escape');
  return { file, message };
}

const hasFfprobe = (() => {
  try {
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

try {
  // one second of the demo => 30 frames
  await page.evaluate(() => window.__ks.actions.setWorkArea(0, 1));

  const seq = await runExport('seq', 'Quarter — 480×270');
  check('PNG sequence export reports success', /finished/.test(seq.message), seq.message);
  const zip = fs.readFileSync(seq.file);
  const eocd = zip.length - 22;
  check('zip has a valid end-of-central-directory record', zip.readUInt32LE(eocd) === 0x06054b50);
  check('zip holds one PNG per frame (30)', zip.readUInt16LE(eocd + 10) === 30, zip.readUInt16LE(eocd + 10));
  check('first entry is a PNG', zip.readUInt32LE(0) === 0x04034b50 && zip.subarray(30 + 'Intro_0000.png'.length, 30 + 'Intro_0000.png'.length + 4).toString('latin1') === '\x89PNG');

  const png = await runExport('png', 'Quarter — 480×270');
  const buf = fs.readFileSync(png.file);
  check('single-frame PNG export is a PNG', buf.subarray(1, 4).toString() === 'PNG');
  check('single-frame PNG has the quarter-resolution size', buf.readUInt32BE(16) === 480 && buf.readUInt32BE(20) === 270, `${buf.readUInt32BE(16)}×${buf.readUInt32BE(20)}`);

  const support = await page.evaluate(async () => {
    const m = await import('/src/render/export.ts');
    const s = window.__ks.appStore.get();
    return m.videoSupport(s.project.comps[s.activeCompId], 0.5);
  });
  if (support.webm) {
    const webm = await runExport('webm', 'Half — 960×540');
    check('WebM export reports success', /finished/.test(webm.message), webm.message);
    check('WebM file is non-trivial', fs.statSync(webm.file).size > 10_000, fs.statSync(webm.file).size);
    if (hasFfprobe) {
      const info = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=codec_name,width,height,nb_read_frames', '-of', 'default=nw=1', webm.file]).toString();
      check('WebM is VP9, 960×540 with exactly 30 frames', /codec_name=vp9/.test(info) && /width=960/.test(info) && /height=540/.test(info) && /nb_read_frames=30/.test(info), info.replace(/\n/g, ' '));
    }
  } else {
    check('WebM encoding unavailable in this browser (skipped)', true);
  }
} catch (e) {
  check('suite ran to completion', false, String(e.message).split('\n').slice(0, 3).join(' | '));
}
await finish();
