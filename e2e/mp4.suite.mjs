// MP4 (H.264) export, verified with a real encoder. The stock headless Chromium has none, so this
// suite needs a build that does: set E2E_ELECTRON=/path/to/electron (Electron >= 30 works; the suite
// starts it under xvfb when there is no display). Without one it reports itself as skipped.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { makeTestVideo, open, writeTestWav } from './lib.mjs';

const { page, check, finish, OUT } = await open({ electron: true });

const toBuffer = async (fn, ...args) => {
  const b64 = await page.evaluate(fn, ...args);
  return Buffer.from(b64, 'base64');
};

try {
  const support = await page.evaluate(async () => {
    const m = await import('/src/render/export.ts');
    const s = window.__ks.appStore.get();
    return m.videoSupport(s.project.comps[s.activeCompId], 0.25);
  });
  if (!support.mp4) {
    check('MP4 encoding unavailable in this browser — suite skipped (set E2E_ELECTRON to run it)', true);
  } else {
    // 1) straight through the exporter: one second at quarter size = 30 frames
    const file = path.join(OUT, 'direct.mp4');
    const bytes = await toBuffer(async () => {
      const m = await import('/src/render/export.ts');
      const s = window.__ks.appStore.get();
      const comp = s.project.comps[s.activeCompId];
      const blob = await m.exportVideo(s.project, comp, 'mp4', 4_000_000, { scale: 0.25, range: { start: 0, end: 1 } });
      const u8 = new Uint8Array(await blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
      return btoa(bin);
    });
    fs.writeFileSync(file, bytes);
    check('MP4 export produced a file', bytes.length > 5_000, bytes.length);
    check('file starts with an ftyp box', bytes.subarray(4, 8).toString() === 'ftyp', bytes.subarray(4, 12).toString());
    check('moov is before mdat (fast-start)', bytes.indexOf('moov') > 0 && bytes.indexOf('moov') < bytes.indexOf('mdat'));

    const probe = (args) => execFileSync('ffprobe', ['-v', 'error', ...args, file]).toString();
    const info = probe(['-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=codec_name,profile,width,height,pix_fmt,nb_read_frames,r_frame_rate', '-of', 'default=nw=1']);
    check('stream is H.264 480×270, yuv420p, 30 fps', /codec_name=h264/.test(info) && /width=480/.test(info) && /height=270/.test(info) && /pix_fmt=yuv420p/.test(info) && /r_frame_rate=30\/1/.test(info), info.replace(/\n/g, ' '));
    check('exactly 30 frames', /nb_read_frames=30/.test(info), info.match(/nb_read_frames=\d+/)?.[0]);
    const dur = parseFloat(probe(['-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1']));
    check('duration is one second', Math.abs(dur - 1) < 0.05, dur);

    let decodeErrors = '';
    try {
      execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      decodeErrors = String(e.stderr || e.message);
    }
    check('the whole stream decodes without errors', decodeErrors === '', decodeErrors.slice(0, 200));

    // 2) the decoded frame matches what the renderer draws at that time (and not another time)
    const w = 480;
    const h = 270;
    const decoded = (n) =>
      execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `select=eq(n\\,${n})`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { maxBuffer: 1 << 26 });
    const rendered = (t) =>
      toBuffer(async (time) => {
        const m = await import('/src/render/renderer.ts');
        const s = window.__ks.appStore.get();
        const c = document.createElement('canvas');
        m.renderComp(c, s.project, s.project.comps[s.activeCompId], time, { scale: 0.25, mbSamples: 16 });
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let bin = '';
        for (let i = 0; i < d.length; i += 0x8000) bin += String.fromCharCode(...d.subarray(i, i + 0x8000));
        return btoa(bin);
      }, t);
    const diff = (rgb, rgba) => {
      let sum = 0;
      for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) sum += Math.abs(rgb[i] - rgba[j]) + Math.abs(rgb[i + 1] - rgba[j + 1]) + Math.abs(rgb[i + 2] - rgba[j + 2]);
      return sum / rgb.length;
    };
    const frame = decoded(15);
    check('decoded frame has the expected pixel count', frame.length === w * h * 3, frame.length);
    const same = diff(frame, await rendered(15 / 30));
    const other = diff(frame, await rendered(27 / 30));
    check('frame 15 matches the render at 0.5 s', same < 10, `mean abs diff ${same.toFixed(2)}`);
    check('…and clearly differs from the render at 0.9 s', other > same * 1.5, `${other.toFixed(2)} vs ${same.toFixed(2)}`);

    // 3) the real Export dialog path (download saved by the Electron host)
    await page.evaluate(() => window.__ks.actions.setWorkArea(0, 0.5));
    await page.click('[data-testid=menu-File]');
    await page.click('text=Export…');
    await page.waitForSelector('[data-testid=dialog]');
    const opt = await page.locator('[data-testid=export-format] option[value=mp4]').getAttribute('disabled');
    check('MP4 is offered (not disabled) in the Export dialog', opt === null, opt);
    await page.selectOption('[data-testid=export-format]', 'mp4');
    await page.locator('.modal select').filter({ hasText: 'Quarter' }).selectOption({ label: 'Quarter — 480×270' });
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.click('[data-testid=export-run]')]);
    const saved = path.join(OUT, dl.suggestedFilename());
    await dl.saveAs(saved);
    await page.keyboard.press('Escape');
    check('dialog export downloads Intro.mp4', dl.suggestedFilename() === 'Intro.mp4', dl.suggestedFilename());
    const n = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=codec_name,nb_read_frames', '-of', 'default=nw=1:nk=1', saved]).toString().trim().split('\n');
    check('dialog export is H.264 with 15 frames (half a second)', n[0] === 'h264' && n[1] === '15', n.join(' '));

    // 4) sound in an MP4: AAC where the browser can encode it, Opus otherwise
    const tone = path.join(OUT, 'tone.wav');
    writeTestWav(tone, { seconds: 1, freqs: [440], amp: 0.5 });
    await page.setInputFiles('[data-testid=project-panel] input[type=file]', tone);
    await page.waitForTimeout(900);
    await page.evaluate(() => {
      const ks = window.__ks;
      ks.actions.setTime(0);
      const id = Object.values(ks.appStore.get().project.assets).find((a) => a.kind === 'audio').id;
      ks.actions.addFootageLayer(id);
      ks.actions.setWorkArea(0, 1);
    });
    const withSound = path.join(OUT, 'with-sound.mp4');
    fs.writeFileSync(
      withSound,
      await toBuffer(async () => {
        const m = await import('/src/render/export.ts');
        const s = window.__ks.appStore.get();
        const blob = await m.exportVideo(s.project, s.project.comps[s.activeCompId], 'mp4', 3_000_000, { scale: 0.25, range: { start: 0, end: 1 } });
        const u8 = new Uint8Array(await blob.arrayBuffer());
        let bin = '';
        for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
        return btoa(bin);
      }),
    );
    const streams = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,codec_type', '-of', 'csv=p=0', withSound]).toString().trim().split('\n');
    check('the MP4 has an H.264 video track and an audio track (AAC or Opus)', streams.some((x) => /^h264,video/.test(x)) && streams.some((x) => /^(aac|opus),audio/.test(x)), streams.join(' | '));
    const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', withSound, '-af', 'pan=mono|c0=c0', '-f', 'f32le', '-ar', '48000', 'pipe:1'], { maxBuffer: 1 << 28 });
    const f = new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 4));
    let sum = 0;
    for (let i = 4800; i < 43200; i++) sum += f[i] * f[i];
    const level = Math.sqrt(sum / (43200 - 4800));
    check('its sound decodes at the right level (0.5 sine = 0.35 RMS)', Math.abs(level - 0.354) < 0.06, level);
    const soundDur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', withSound]).toString());
    check('and the file is one second long', Math.abs(soundDur - 1) < 0.1, soundDur);

    // 5) importing an H.264 MP4 (with AAC sound) and rendering it frame-accurately
    const h264 = path.join(OUT, 'clip.mp4');
    const longTone = path.join(OUT, 'long-tone.wav');
    writeTestWav(longTone, { seconds: 3, freqs: [440], amp: 0.5 });
    await makeTestVideo(h264, { frames: 45, codec: 'h264', sound: longTone });
    await page.evaluate(() => {
      const ks = window.__ks;
      const s = ks.appStore.get();
      ks.actions.updateComp(s.activeCompId, { width: 320, height: 180, duration: 6, workStart: 0, workEnd: 6 });
      ks.actions.deleteLayers(ks.appStore.get().project.comps[s.activeCompId].layers.map((l) => l.id));
    });
    await page.setInputFiles('[data-testid=project-panel] input[type=file]', h264);
    await page.waitForTimeout(2500);
    const vid = await page.evaluate(() => Object.values(window.__ks.appStore.get().project.assets).find((a) => a.kind === 'video') ?? null);
    check('an H.264 MP4 imports as video, with its sound', vid && vid.width === 160 && vid.height === 90 && vid.hasAudio === true && Math.abs(vid.duration - 1.5) < 0.1, JSON.stringify(vid));
    if (vid) {
      await page.evaluate((id) => {
        const ks = window.__ks;
        ks.actions.setTime(0.5);
        const lid = ks.actions.addFootageLayer(id);
        ks.actions.setPropValue(lid, 'transform', 'position', [160, 90]);
      }, vid.id);
      const idxAt = (T) =>
        page.evaluate(async (time) => {
          const r = await import('/src/render/renderer.ts');
          const ks = window.__ks;
          const s = ks.appStore.get();
          const comp = s.project.comps[s.activeCompId];
          await ks.video.prepareFrame(s.project, comp, time);
          const c = document.createElement('canvas');
          r.renderComp(c, s.project, comp, time, { scale: 1, mbSamples: 0 });
          const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          for (let x = 0; x < c.width; x++) if (d[(89 * c.width + x) * 4] > 160) return Math.round((x - 80 - 10) / 2);
          return -1;
        }, T);
      const got = [];
      for (const k of [0, 7, 22, 40, 12]) got.push(await idxAt(0.5 + k / 30));
      check('the H.264 clip renders the exact frame at each time', JSON.stringify(got) === JSON.stringify([0, 7, 22, 40, 12]), got.join(','));
    }
  }
} catch (e) {
  check('suite ran to completion', false, String(e.stack || e.message).split('\n').slice(0, 4).join(' | '));
}
await finish();
