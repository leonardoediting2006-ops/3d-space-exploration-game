// Starts the dev server, runs every suite in e2e/, and exits non-zero if any fail.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const port = process.env.E2E_PORT ?? '5199';
const base = `http://localhost:${port}`;
const only = process.argv.slice(2);

const server = spawn('npx', ['vite', '--port', port, '--strictPort'], { cwd: path.join(dir, '..'), stdio: 'ignore' });
const stop = () => server.kill();
process.on('exit', stop);

async function ready() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('dev server did not start');
}

function run(file) {
  return new Promise((resolve) => {
    const p = spawn('node', [path.join(dir, file)], { env: { ...process.env, BASE_URL: base }, stdio: 'inherit' });
    p.on('exit', (code) => resolve(code ?? 1));
  });
}

await ready();
const suites = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.suite.mjs'))
  .filter((f) => !only.length || only.some((o) => f.includes(o)))
  .sort();
let failed = 0;
for (const f of suites) {
  console.log(`\n=== ${f.replace('.suite.mjs', '')} ===`);
  if ((await run(f)) !== 0) failed++;
}
stop();
console.log(`\n${suites.length - failed}/${suites.length} suites passed`);
process.exit(failed ? 1 : 0);
