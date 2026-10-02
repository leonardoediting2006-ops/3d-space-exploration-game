// Video footage: import, frame-accurate rendering at any playhead time, playback, and export.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { makeTestVideo, open, writeTestWav } from './lib.mjs';

const { page, check, finish, OUT } = await open({ downloads: true });
const A = (fn, ...args) => page.evaluate(([src, a]) => new Function('ks', 'args', `return (${src})(ks, ...args)`)(window.__ks, a), [fn.toString(), args]);
const layerOf = (name) => A((ks, n) => { const s = ks.appStore.get(); return JSON.parse(JSON.stringify(s.project.comps[s.activeCompId].layers.find((l) => l.name === n) ?? null)); }, name);
const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

try {
  if (!hasFfmpeg) {
    check('ffmpeg is not installed (video checks skipped)', true);
  } else {
    const tone = path.join(OUT, 'vtone.wav');
    writeTestWav(tone, { seconds: 2, freqs: [330], amp: 0.5 });
    const clip = path.join(OUT, 'clip.webm');
    await makeTestVideo(clip, { frames: 60, sound: tone });
    const silent = path.join(OUT, 'silent.webm');
    await makeTestVideo(silent, { frames: 30 });
    const broken = path.join(OUT, 'broken.mp4');
    fs.writeFileSync(broken, Buffer.from('definitely not a video'));

    // a small comp so the 160×90 clip is shown at its native size
    await A((ks) => ks.actions.updateComp(ks.appStore.get().activeCompId, { width: 320, height: 180, duration: 6, workStart: 0, workEnd: 6, motionBlur: false }));
    await A((ks) => { const s = ks.appStore.get(); ks.actions.deleteLayers(s.project.comps[s.activeCompId].layers.map((l) => l.id)); });

    // ---- import
    await page.setInputFiles('[data-testid=project-panel] input[type=file]', clip);
    await page.waitForTimeout(1500);
    const assets = Object.values(await A((ks) => JSON.parse(JSON.stringify(ks.appStore.get().project.assets))));
    check('importing a WebM creates a video asset', assets.length === 1 && assets[0].kind === 'video', JSON.stringify(assets));
    const a = assets[0];
    check('with its size, length and sound flag', a.width === 160 && a.height === 90 && Math.abs(a.duration - 2) < 0.1 && a.hasAudio === true, JSON.stringify(a));
    check('the Project panel describes it', /160×90 video · 2\.0 s · sound/.test(await page.locator('[data-testid=project-panel] .item', { hasText: 'clip.webm' }).innerText()));
    await page.waitForTimeout(500);
    check('and shows a picture thumbnail', (await page.locator('[data-testid=project-panel] .item img').count()) === 1);

    await page.setInputFiles('[data-testid=project-panel] input[type=file]', broken);
    await page.waitForTimeout(800);
    check('a file that is not a video is refused with a message', /cannot play that video/.test(await page.textContent('[data-testid=toast]')) && Object.keys(await A((ks) => ks.appStore.get().project.assets)).length === 1, await page.textContent('[data-testid=toast]'));

    // ---- the layer
    await A((ks) => ks.actions.setTime(0.5));
    await page.dblclick('[data-testid=project-panel] .item:has-text("clip.webm")');
    await page.waitForTimeout(400);
    const vl = await layerOf('clip');
    check('double-clicking adds a video layer at the playhead', vl && vl.type === 'video' && vl.start === 0.5, vl && JSON.stringify([vl.type, vl.start, vl.inPoint, vl.outPoint]));
    check('it lasts as long as the clip', Math.abs(vl.outPoint - 2.5) < 0.05, vl.outPoint);
    check('it is a normal picture layer with transform, plus volume and pan', !!vl.transform.position && vl.content.volume?.value === 100 && vl.content.pan?.value === 0);
    check('the row has both an eye and a speaker', (await page.locator('[data-testid=layer-row-0] .sw.eye').count()) === 1 && (await page.locator('[data-testid=mute-0]').count()) === 1);
    check('the Inspector shows picture and sound sections', (await page.locator('[data-testid=section-transform]').count()) === 1 && (await page.locator('[data-testid=section-sound]').count()) === 1);
    await A((ks) => { const s = ks.appStore.get(); const l = s.project.comps[s.activeCompId].layers[0]; ks.actions.setPropValue(l.id, 'transform', 'position', [160, 90]); });

    // ---- frame-accurate rendering through the renderer
    const frameAt = (T) => A(async (ks, time) => {
      const r = await import('/src/render/renderer.ts');
      const s = ks.appStore.get();
      const comp = s.project.comps[s.activeCompId];
      await ks.video.prepareFrame(s.project, comp, time);
      const c = document.createElement('canvas');
      r.renderComp(c, s.project, comp, time, { scale: 1, mbSamples: 0 });
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      // the clip is centred: its left edge is at x = 80, and the square's row is y = 45 + 44 - 90/2... (clip y 40–48 -> comp y 85–93)
      const y = 89;
      for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4] > 160) return Math.round((x - 80 - 10) / 2);
      return -1;
    }, T);
    const expected = (T) => Math.floor((T - 0.5) * 30 + 1e-6);
    const sample = [0.5, 0.5 + 10 / 30, 0.5 + 29 / 30, 0.5 + 45 / 30, 0.5 + 59 / 30, 1.2, 1.7];
    const got = [];
    for (const T of sample) got.push(await frameAt(T));
    check('every sampled playhead time shows exactly the right frame', got.every((g, i) => g === expected(sample[i])), `got ${got} expected ${sample.map(expected)}`);
    const before = await frameAt(0.3);
    check('before the layer starts nothing is drawn', before === -1, before);
    check('after it ends nothing is drawn', (await frameAt(2.6)) === -1);
    const seq = [];
    for (const k of [20, 19, 5, 40, 41, 3]) seq.push(await frameAt(0.5 + k / 30));
    check('seeking forwards and back lands on the right frame each time', JSON.stringify(seq) === JSON.stringify([20, 19, 5, 40, 41, 3]), seq.join(','));

    // ---- the viewer follows the playhead
    const viewerFrame = () => page.evaluate(() => {
      const c = document.querySelector('[data-testid=comp-canvas]');
      const sc = c.width / 320;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const y = Math.round(89 * sc);
      for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4] > 160) return Math.round((x / sc - 80 - 10) / 2);
      return -1;
    });
    await A((ks) => ks.actions.setTime(0.5 + 24 / 30));
    await page.waitForTimeout(900);
    const vf = await viewerFrame();
    check('scrubbing the playhead shows that frame in the viewer', Math.abs(vf - 24) <= 1, vf);
    await A((ks) => ks.actions.setTime(0.5 + 3 / 30));
    await page.waitForTimeout(900);
    check('and scrubbing back shows the earlier frame', Math.abs((await viewerFrame()) - 3) <= 1, await viewerFrame());

    // ---- playback
    await A((ks) => ks.actions.setTime(0.5));
    await page.keyboard.press('Space');
    await page.waitForTimeout(700);
    const playing = await A((ks) => ({ t: ks.timeStore.get().t, status: ks.playback.audioStatus() }));
    const during = await viewerFrame();
    check('playing schedules the video\'s sound too', playing.status.sources === 1, JSON.stringify(playing));
    const expectedNow = (playing.t - 0.5) * 30;
    check('the picture advances with the playhead while playing', during >= 0 && Math.abs(during - expectedNow) <= 14, `frame ${during}, playhead frame ${expectedNow.toFixed(1)}`);
    await page.keyboard.press('Space');
    await page.waitForTimeout(700);
    const stopped = await A((ks) => ks.timeStore.get().t);
    const parked = await viewerFrame();
    check('after pausing the viewer shows the frame at the playhead', Math.abs(parked - (stopped - 0.5) * 30) <= 1.5, `${parked} vs ${((stopped - 0.5) * 30).toFixed(1)}`);

    // ---- effects, mask and transforms work on video like on any layer
    await A((ks) => { const s = ks.appStore.get(); const l = s.project.comps[s.activeCompId].layers[0]; ks.actions.addEffect([l.id], 'invert'); });
    const inv = await A(async (ks) => {
      const r = await import('/src/render/renderer.ts');
      const s = ks.appStore.get();
      const comp = s.project.comps[s.activeCompId];
      await ks.video.prepareFrame(s.project, comp, 1);
      const c = document.createElement('canvas');
      r.renderComp(c, s.project, comp, 1, { scale: 1, mbSamples: 0 });
      return Array.from(c.getContext('2d').getImageData(100, 50, 1, 1).data);
    });
    check('effects apply to video (Invert turns the dark picture light)', inv[0] > 200 && inv[1] > 200, inv);
    await A((ks) => { const s = ks.appStore.get(); const l = s.project.comps[s.activeCompId].layers[0]; ks.actions.removeEffect(l.id, l.effects[0].id); });

    // ---- the silent one has no sound controls
    await page.setInputFiles('[data-testid=project-panel] input[type=file]', silent);
    await page.waitForTimeout(1500);
    const sa = Object.values(await A((ks) => JSON.parse(JSON.stringify(ks.appStore.get().project.assets)))).find((x) => x.name === 'silent.webm');
    check('a video without a sound track is flagged silent', sa && sa.hasAudio === false, JSON.stringify(sa));

    // ---- export: frame-accurate and with its sound
    const exportClip = (range) => A(async (ks, r) => {
      const m = await import('/src/render/export.ts');
      const s = ks.appStore.get();
      const comp = s.project.comps[s.activeCompId];
      const blob = await m.exportVideo(s.project, comp, 'webm', 6_000_000, { scale: 1, range: r, audio: true });
      const u8 = new Uint8Array(await blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
      return btoa(bin);
    }, range);
    const out = path.join(OUT, 'video-export.webm');
    fs.writeFileSync(out, Buffer.from(await exportClip({ start: 0.3, end: 1.3 }), 'base64'));
    const streams = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,nb_frames', '-of', 'csv=p=0', out]).toString();
    check('the export has video and sound tracks', /video/.test(streams) && /audio/.test(streams), streams.replace(/\n/g, ' '));
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', out, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { maxBuffer: 1 << 29 });
    const frameSize = 320 * 180 * 3;
    const n = Math.floor(raw.length / frameSize);
    check('exactly 30 frames for one second', n === 30, n);
    const indexOf = (f) => {
      const y = 89;
      for (let x = 0; x < 320; x++) if (raw[f * frameSize + (y * 320 + x) * 3] > 160) return Math.round((x - 80 - 10) / 2);
      return -1;
    };
    const exportedIdx = Array.from({ length: n }, (_, f) => indexOf(f));
    const wantIdx = Array.from({ length: n }, (_, f) => { const T = 0.3 + f / 30; return T < 0.5 - 1e-6 ? -1 : expected(T); });
    const wrong = exportedIdx.map((g, f) => (g === wantIdx[f] ? null : `${f}:${g}!=${wantIdx[f]}`)).filter(Boolean);
    check('every exported frame shows the right source frame (and nothing before the clip starts)', wrong.length === 0, wrong.slice(0, 6).join(' '));
    const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', out, '-af', 'pan=mono|c0=c0', '-f', 'f32le', '-ar', '48000', 'pipe:1'], { maxBuffer: 1 << 28 });
    const f32 = new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 4));
    const rms = (from, to) => { let s = 0; for (let i = Math.round(from * 48000); i < Math.round(to * 48000); i++) s += f32[i] * f32[i]; return Math.sqrt(s / Math.round((to - from) * 48000)); };
    check('the clip\'s sound is in the mix from the moment the layer starts', rms(0.02, 0.15) < 0.01 && Math.abs(rms(0.3, 0.95) - 0.354) < 0.06, `${rms(0.02, 0.15)} ${rms(0.3, 0.95)}`);

    // ---- trimming and moving
    await A((ks) => { const s = ks.appStore.get(); const l = s.project.comps[s.activeCompId].layers.find((x) => x.name === 'clip'); ks.actions.trimLayer(l.id, 'out', 99); });
    check('the out point cannot go past the end of the clip', Math.abs((await layerOf('clip')).outPoint - 2.5) < 0.05, (await layerOf('clip')).outPoint);

    // ---- save and reopen: the video comes back
    const text = await A(async (ks) => (await import('/src/core/serialize.ts')).serializeProject(ks.appStore.get().project, ks.assets.allAssetData()));
    check('the project file embeds the video', /data:video\/webm/.test(text), text.length);
    await A((ks) => ks.actions.newProject());
    await page.waitForTimeout(300);
    const ok = await page.evaluate(async (t) => window.__ks.actions.openProjectText(t, 'with-video.kfs'), text);
    await page.waitForTimeout(1500);
    check('reopening restores the layer', ok && (await layerOf('clip'))?.type === 'video');
    check('and the video is playable again', await A((ks) => Object.values(ks.appStore.get().project.assets).filter((a) => a.kind === 'video').every((a) => ks.video.hasVideo(a.id))));
    check('with its sound decoded', await A((ks) => Object.values(ks.appStore.get().project.assets).filter((a) => a.hasAudio).every((a) => !!ks.assets.getAssetAudio(a.id))));
    const again = await frameAt(0.5 + 17 / 30);
    check('and it still renders frame-accurately', again === 17, again);

    // ---- deleting the footage
    await A((ks) => { const s = ks.appStore.get(); for (const a of Object.values(s.project.assets)) ks.actions.deleteAsset(a.id); });
    check('deleting the footage removes its layers and releases the video', (await layerOf('clip')) === null && !(await A((ks) => ks.video.hasVideo(Object.keys(ks.appStore.get().project.assets)[0] ?? 'x'))));
  }
} catch (e) {
  check('suite ran to completion', false, String(e.stack || e.message).split('\n').slice(0, 5).join(' | '));
}
await finish();
