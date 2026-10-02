// Sound: import, the audio layer, waveform, mute, preview playback, the mix, and export with sound.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { open, writeTestWav } from './lib.mjs';

const { page, check, finish, OUT } = await open({ downloads: true });
const A = (fn, ...args) => page.evaluate(([src, a]) => new Function('ks', 'args', `return (${src})(ks, ...args)`)(window.__ks, a), [fn.toString(), args]);
const layerOf = (name) => A((ks, n) => { const s = ks.appStore.get(); return JSON.parse(JSON.stringify(s.project.comps[s.activeCompId].layers.find((l) => l.name === n) ?? null)); }, name);
const assets = () => A((ks) => JSON.parse(JSON.stringify(ks.appStore.get().project.assets)));
const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

/** Decode a media file's audio to mono float samples with ffmpeg. */
const decode = (file) => {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-af', 'pan=mono|c0=c0', '-f', 'f32le', '-ar', '48000', 'pipe:1'], { maxBuffer: 1 << 28 });
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
};
const rms = (a, from, to) => { let s = 0; const i0 = Math.round(from * 48000); const i1 = Math.min(a.length, Math.round(to * 48000)); for (let i = i0; i < i1; i++) s += a[i] * a[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); };
const crossings = (a, from, to) => { let n = 0; const i0 = Math.round(from * 48000); const i1 = Math.min(a.length, Math.round(to * 48000)); for (let i = i0 + 1; i < i1; i++) if (a[i - 1] <= 0 && a[i] > 0) n++; return n / (to - from); };

try {
  const tone = path.join(OUT, 'tone.wav');
  writeTestWav(tone, { seconds: 2, freqs: [440], amp: 0.5 });
  const stereo = path.join(OUT, 'stereo.wav');
  writeTestWav(stereo, { seconds: 1, freqs: [330, 0], amp: 0.6, sampleRate: 22050 });
  const junk = path.join(OUT, 'broken.mp3');
  fs.writeFileSync(junk, Buffer.from('this is not audio at all'));

  // ---- import through the Project panel
  await page.setInputFiles('[data-testid=project-panel] input[type=file]', tone);
  await page.waitForTimeout(600);
  const imported = Object.values(await assets());
  check('importing a WAV creates an audio asset', imported.length === 1 && imported[0].kind === 'audio', JSON.stringify(imported));
  check('its length is known', Math.abs(imported[0].duration - 2) < 0.01, imported[0].duration);
  check('the Project panel describes it', /sound · 2\.0 s/.test(await page.locator('[data-testid=project-panel] .item', { hasText: 'tone.wav' }).innerText()));
  check('and draws a waveform thumbnail', (await page.locator('[data-testid=project-panel] .item canvas').count()) === 1);

  await page.setInputFiles('[data-testid=project-panel] input[type=file]', junk);
  await page.waitForTimeout(500);
  check('a file that is not audio is refused with a message', /cannot decode/.test(await page.textContent('[data-testid=toast]')) && Object.keys(await assets()).length === 1, await page.textContent('[data-testid=toast]'));

  // ---- add it as a layer
  await A((ks) => { ks.actions.setTime(1); });
  await page.dblclick('[data-testid=project-panel] .item:has-text("tone.wav")');
  await page.waitForTimeout(250);
  const tl = await layerOf('tone');
  check('double-clicking adds an audio layer at the playhead', tl && tl.type === 'audio' && tl.start === 1 && tl.inPoint === 1, tl && JSON.stringify([tl.type, tl.start, tl.inPoint, tl.outPoint]));
  check('it lasts as long as the sound', Math.abs(tl.outPoint - 3) < 0.04, tl.outPoint);
  check('it has volume and pan', tl.content.volume.value === 100 && tl.content.pan.value === 0);
  const idx = await A((ks) => { const s = ks.appStore.get(); return s.project.comps[s.activeCompId].layers.findIndex((l) => l.name === 'tone'); });
  check('the timeline bar shows a waveform', (await page.locator(`[data-testid=layer-bar].audio canvas`).count()) === 1);
  check('the row has a speaker switch instead of an eye', (await page.locator(`[data-testid=mute-${idx}]`).count()) === 1 && (await page.locator(`[data-testid=layer-row-${idx}] .sw.eye`).count()) === 0);
  const inkCols = await page.evaluate(() => {
    const c = document.querySelector('[data-testid=layer-bar].audio canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let cols = 0;
    for (let x = 0; x < c.width; x++) { for (let y = 0; y < c.height; y++) if (d[(y * c.width + x) * 4 + 3] > 0) { cols++; break; } }
    return { cols, w: c.width };
  });
  check('the waveform is actually drawn across the bar', inkCols.cols > inkCols.w * 0.9, JSON.stringify(inkCols));

  // ---- Inspector for a sound layer
  const sel = await A((ks) => ks.appStore.get().selection.length);
  check('the new layer is selected', sel === 1);
  check('its Inspector has Sound controls and no picture sections', (await page.locator('[data-testid=section-sound]').count()) === 1 && (await page.locator('[data-testid=section-transform]').count()) === 0 && (await page.locator('[data-testid=section-effects]').count()) === 0 && (await page.locator('[data-testid=align-bar]').count()) === 0);
  check('it shows the file and its waveform', /tone\.wav/.test(await page.locator('[data-testid=sound-info]').innerText()) && (await page.locator('[data-testid=sound-info] canvas').count()) === 1);
  await page.locator('[data-testid=ins-volume] .slider').click();
  await page.locator('.num-input').first().fill('50');
  await page.locator('.num-input').first().press('Enter');
  check('the Volume slider sets the layer\'s volume', (await layerOf('tone')).content.volume.value === 50);
  check('volume can be keyframed like any property', (await page.locator('[data-testid=ins-volume] [data-testid=prop-animate]').count()) === 1);

  // ---- the mix (what export encodes)
  const mixStats = await A(async () => {
    const mix = await import('/src/core/mix.ts');
    const assetsMod = ks.assets;
    const s = ks.appStore.get();
    const comp = s.project.comps[s.activeCompId];
    const [l] = mix.mixComp(s.project, comp, { start: 0, end: 4, sampleRate: 48000, clip: assetsMod.getAssetClip });
    const peak = (a, b) => { let m = 0; for (let i = Math.round(a * 48000); i < Math.round(b * 48000); i++) m = Math.max(m, Math.abs(l[i])); return m; };
    return { before: peak(0, 0.95), during: peak(1.1, 2.9), after: peak(3.1, 4) };
  });
  check('the mix is silent before the clip, at half volume during it, and silent after', mixStats.before === 0 && Math.abs(mixStats.during - 0.25) < 0.01 && mixStats.after === 0, JSON.stringify(mixStats));

  // ---- playback
  await A((ks) => { ks.actions.setTime(1.2); });
  const status = () => A((ks) => ks.playback.audioStatus());
  await page.keyboard.press('Space');
  await page.waitForTimeout(400);
  const playing = await status();
  check('playing schedules the sound through Web Audio', playing.sources === 1 && playing.state === 'running', JSON.stringify(playing));
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  check('pausing stops it', (await status()).sources === 0);
  await page.click('[data-testid=audio-toggle]');
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  check('with Sound switched off nothing is scheduled', (await status()).sources === 0);
  await page.keyboard.press('Space');
  await page.click('[data-testid=audio-toggle]');
  await A((ks) => ks.actions.setLayerField(ks.appStore.get().selection[0], { muted: true }));
  await A((ks) => { ks.actions.setTime(1.2); });
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  check('a muted layer is not scheduled', (await status()).sources === 0);
  await page.keyboard.press('Space');
  await A((ks) => ks.actions.setLayerField(ks.appStore.get().selection[0], { muted: false }));

  // ---- trim limits
  await A((ks) => { ks.actions.trimLayer(ks.appStore.get().selection[0], 'out', 50); });
  check('the out point cannot go past the end of the sound', Math.abs((await layerOf('tone')).outPoint - 3) < 0.04, (await layerOf('tone')).outPoint);
  await A((ks) => { ks.actions.trimLayer(ks.appStore.get().selection[0], 'in', 0); });
  check('and the in point cannot go before its start', (await layerOf('tone')).inPoint === 1, (await layerOf('tone')).inPoint);

  // ---- export with sound
  await A((ks) => { ks.actions.setLayerField(ks.appStore.get().selection[0], { muted: false }); ks.actions.setPropValue(ks.appStore.get().selection[0], 'content', 'volume', 100); });
  const exportWebm = (opts) => A(async (ks, o) => {
    const m = await import('/src/render/export.ts');
    const s = ks.appStore.get();
    const comp = s.project.comps[s.activeCompId];
    const blob = await m.exportVideo(s.project, comp, 'webm', 2_000_000, { scale: 0.25, range: { start: 0, end: o.end }, audio: o.audio });
    const u8 = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return btoa(bin);
  }, opts);
  if (hasFfmpeg) {
    const file = path.join(OUT, 'with-sound.webm');
    fs.writeFileSync(file, Buffer.from(await exportWebm({ end: 4, audio: true }), 'base64'));
    const streams = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,codec_type,channels,sample_rate', '-of', 'csv=p=0', file]).toString().trim().split('\n');
    check('the WebM has a VP9 video track and an Opus audio track', streams.some((s) => /vp9,video/.test(s)) && streams.some((s) => /^opus,audio,48000,2/.test(s)), streams.join(' | '));
    const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());
    check('and is 4 seconds long', Math.abs(dur - 4) < 0.1, dur);
    const pcm = decode(file);
    const quiet = rms(pcm, 0.1, 0.85);
    const loud = rms(pcm, 1.2, 2.8);
    const tail = rms(pcm, 3.2, 3.9);
    check('it is silent before the clip starts', quiet < 0.01, quiet);
    check('the clip plays at the right level (a 0.5 sine is 0.35 RMS)', Math.abs(loud - 0.354) < 0.05, loud);
    check('and stops when the layer does', tail < 0.01, tail);
    check('at the right pitch (440 Hz)', Math.abs(crossings(pcm, 1.3, 2.7) - 440) < 8, crossings(pcm, 1.3, 2.7));

    // volume and the "Include sound" switch
    await A((ks) => ks.actions.setPropValue(ks.appStore.get().selection[0], 'content', 'volume', 50));
    const half = path.join(OUT, 'half.webm');
    fs.writeFileSync(half, Buffer.from(await exportWebm({ end: 4, audio: true }), 'base64'));
    const halfLoud = rms(decode(half), 1.2, 2.8);
    check('half volume exports at half the level', Math.abs(halfLoud / loud - 0.5) < 0.06, `${halfLoud} vs ${loud}`);
    const silent = path.join(OUT, 'no-sound.webm');
    fs.writeFileSync(silent, Buffer.from(await exportWebm({ end: 4, audio: false }), 'base64'));
    const types = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', silent]).toString().trim().split('\n');
    check('"Include sound" off leaves out the audio track', types.length === 1 && types[0] === 'video', types.join(','));
    await A((ks) => ks.actions.setLayerField(ks.appStore.get().selection[0], { muted: true }));
    const muted = path.join(OUT, 'muted.webm');
    fs.writeFileSync(muted, Buffer.from(await exportWebm({ end: 4, audio: true }), 'base64'));
    const mutedTypes = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', muted]).toString().trim().split('\n');
    check('a muted layer leaves no audio track', mutedTypes.length === 1, mutedTypes.join(','));
    await A((ks) => { ks.actions.setLayerField(ks.appStore.get().selection[0], { muted: false }); ks.actions.setPropValue(ks.appStore.get().selection[0], 'content', 'volume', 100); });
  } else check('ffmpeg is not installed (sound export checks skipped)', true);

  // the export dialog offers the choice
  await page.click('[data-testid=menu-File]');
  await page.click('text=Export…');
  await page.waitForSelector('[data-testid=dialog]');
  check('the Export dialog offers "Include the mix"', (await page.locator('[data-testid=export-sound]').count()) === 1);
  await page.keyboard.press('Escape');

  // ---- a stereo clip at another sample rate
  await page.setInputFiles('[data-testid=project-panel] input[type=file]', stereo);
  await page.waitForTimeout(500);
  const st = Object.values(await assets()).find((a) => a.name === 'stereo.wav');
  check('a 22.05 kHz stereo file imports too', st && Math.abs(st.duration - 1) < 0.01, JSON.stringify(st));
  const chans = await A(async (ks) => { const m = ks.assets; const a = Object.values(ks.appStore.get().project.assets).find((x) => x.name === 'stereo.wav'); const b = m.getAssetAudio(a.id); return { n: b.numberOfChannels, rate: b.sampleRate }; });
  check('it is decoded to 2 channels at 48 kHz', chans.n === 2 && chans.rate === 48000, JSON.stringify(chans));

  // ---- save and reopen
  const text = await A(async (ks) => {
    const ser = await import('/src/core/serialize.ts');
    return ser.serializeProject(ks.appStore.get().project, ks.assets.allAssetData());
  });
  check('the project file embeds the sound', /data:audio\/(wav|x-wav|wave)/.test(text.slice(0, text.length)), text.length);
  await A((ks) => ks.actions.newProject());
  await page.waitForTimeout(200);
  check('a new project has no footage', Object.keys(await assets()).length === 0);
  const ok = await page.evaluate(async (t) => window.__ks.actions.openProjectText(t, 'with-sound.kfs'), text);
  await page.waitForTimeout(600);
  check('reopening restores the layer and decodes the sound again', ok && (await layerOf('tone'))?.type === 'audio' && (await A((ks) => Object.keys(ks.appStore.get().project.assets).every((id) => !!ks.assets.getAssetAudio(id)))));
  check('with its waveform', (await page.locator('[data-testid=layer-bar].audio canvas').count()) === 1);

  // ---- deleting the footage removes its layers
  await A((ks) => { const s = ks.appStore.get(); const a = Object.values(s.project.assets).find((x) => x.name === 'tone.wav'); ks.actions.deleteAsset(a.id); });
  check('deleting the footage removes the layers that use it', (await layerOf('tone')) === null);

  // ---- hostile project files
  const bad = await A(async (ks) => {
    const ser = await import('/src/core/serialize.ts');
    const good = JSON.parse(ser.serializeProject(ks.appStore.get().project, ks.assets.allAssetData()));
    const results = [];
    const tryIt = (mutate) => { const c = structuredClone(good); mutate(c); try { ser.parseProject(JSON.stringify(c)); results.push('accepted'); } catch { results.push('rejected'); } };
    const aid = Object.keys(good.project.assets)[0];
    tryIt((c) => { c.assets[aid] = 'data:text/html;base64,AAAA'; });
    tryIt((c) => { c.project.assets[aid].kind = 'hologram'; });
    tryIt((c) => { c.project.assets[aid].duration = -4; });
    tryIt((c) => { c.project.assets[aid].hasAudio = 'yes'; });
    return results;
  });
  check('project files with bad footage are rejected', bad.every((r) => r === 'rejected'), bad.join(','));
} catch (e) {
  check('suite ran to completion', false, String(e.stack || e.message).split('\n').slice(0, 5).join(' | '));
}
await finish();
