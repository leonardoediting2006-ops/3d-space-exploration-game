// Shared harness for the browser end-to-end suites. Each suite drives the real app in headless
// Chromium, asserts on rendered pixels and document state, and fails on any console error.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

export const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
export const OUT = process.env.E2E_OUT ?? fs.mkdtempSync(path.join(os.tmpdir(), 'keyframe-e2e-'));

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  return fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
}

/** Open a fresh app (autosave cleared, demo project loaded) and return helpers for asserting. */
export async function open({ downloads = false } = {}) {
  const browser = await chromium.launch({ executablePath: chromiumPath(), args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1600, height: 950 }, acceptDownloads: downloads });
  const page = await context.newPage();
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
    await browser.close();
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
