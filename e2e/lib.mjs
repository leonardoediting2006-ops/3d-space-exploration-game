// Shared harness for the browser end-to-end suites. Each suite drives the real app in headless
// Chromium, asserts on rendered pixels and document state, and fails on any console error.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

export const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
export const OUT = process.env.E2E_OUT ?? fs.mkdtempSync(path.join(os.tmpdir(), 'keyframe-e2e-'));

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  return fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
}

/**
 * Start an Electron build (Chromium with H.264 encoding) and attach over CDP. Set E2E_ELECTRON to the
 * electron binary; it runs under xvfb-run when there is no display.
 */
async function launchElectron(exe) {
  const port = 9300 + Math.floor(Math.random() * 500);
  const host = path.join(path.dirname(fileURLToPath(import.meta.url)), 'electron-host.cjs');
  const args = ['--no-sandbox', `--remote-debugging-port=${port}`, host];
  const [cmd, argv] = process.env.DISPLAY ? [exe, args] : ['xvfb-run', ['-a', exe, ...args]];
  const child = spawn(cmd, argv, { stdio: 'ignore', detached: true });
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break;
    } catch {
      /* not up yet */
    }
    if (i > 60) throw new Error('Electron did not start');
    await new Promise((r) => setTimeout(r, 500));
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? (await context.newPage());
  const close = async () => {
    await browser.close().catch(() => {});
    try {
      process.kill(-child.pid);
    } catch {
      /* already gone */
    }
  };
  return { page, close };
}

/** Open a fresh app (autosave cleared, demo project loaded) and return helpers for asserting. */
export async function open({ downloads = false, electron = false } = {}) {
  let page;
  let close;
  if (electron && process.env.E2E_ELECTRON) {
    ({ page, close } = await launchElectron(process.env.E2E_ELECTRON));
  } else {
    const browser = await chromium.launch({ executablePath: chromiumPath(), args: ['--no-sandbox'] });
    const context = await browser.newContext({ viewport: { width: 1600, height: 950 }, acceptDownloads: downloads });
    page = await context.newPage();
    close = () => browser.close();
  }
  const problems = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console error: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  await page.goto(`${BASE}/?debug`);
  await page.evaluate(() => {
    localStorage.clear();
    // the one-time tip would sit over the viewer in every run
    localStorage.setItem('keyframe-studio:tip-dismissed', '1');
  });
  await page.reload();
  await page.waitForSelector('[data-testid=comp-canvas]');
  // applying a library animation would otherwise start a preview that moves the playhead under the test
  await page.evaluate(() => window.__ks.appStore.set({ previewOnApply: false }));
  await page.waitForTimeout(400);

  const results = [];
  const check = (name, ok, extra = '') => results.push({ ok: !!ok, line: `${ok ? 'PASS' : 'FAIL'}  ${name}${extra === '' ? '' : ' — ' + (typeof extra === 'string' ? extra : JSON.stringify(extra))}` });

  async function finish() {
    console.log(results.map((r) => r.line).join('\n'));
    const failed = results.filter((r) => !r.ok).length;
    if (problems.length) console.log('--- problems ---\n' + problems.join('\n'));
    console.log(`${results.length - failed}/${results.length} passed${problems.length ? `, ${problems.length} console problem(s)` : ''}`);
    await close();
    if (failed || problems.length) process.exitCode = 1;
  }
  return { page, check, finish, OUT };
}

/** Write a small gradient PNG (no dependencies) for footage-import tests. */
export async function writeTestPng(file, w = 320, h = 200) {
  const zlib = await import('node:zlib');
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 4);
    for (let x = 0; x < w; x++) row.set([Math.floor((255 * x) / w), Math.floor((255 * y) / h), 160, 255], 1 + x * 4);
    rows.push(row);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  fs.writeFileSync(
    file,
    Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]),
  );
}

/** Write a PCM16 WAV file: a sine tone per channel (a frequency of 0 leaves that channel silent). */
export function writeTestWav(file, { seconds = 2, freqs = [440], amp = 0.5, sampleRate = 44100 } = {}) {
  const channels = freqs.length;
  const frames = Math.round(seconds * sampleRate);
  const data = Buffer.alloc(frames * channels * 2);
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const v = freqs[c] ? Math.sin((2 * Math.PI * freqs[c] * i) / sampleRate) * amp : 0;
      data.writeInt16LE(Math.round(v * 32767), (i * channels + c) * 2);
    }
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(channels, 22);
  head.writeUInt32LE(sampleRate, 24);
  head.writeUInt32LE(sampleRate * channels * 2, 28);
  head.writeUInt16LE(channels * 2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([head, data]));
}
