import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const required = [
  'index.html',
  'manifest.json',
  'sw.js',
  'css/styles.css',
  'js/app.js',
  'js/storage.js',
  'src/lib/core.js',
  'src/lib/radio-browser.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png'
];

const failures = [];
for (const file of required) {
  if (!existsSync(file)) failures.push(`Missing ${file}`);
}

const html = readFileSync('index.html', 'utf8');
for (const ref of ['css/styles.css', 'js/storage.js', 'js/app.js', 'manifest.json']) {
  if (!html.includes(ref)) failures.push(`index.html does not reference ${ref}`);
}
if (!readFileSync('js/app.js', 'utf8').includes("serviceWorker.register('sw.js')")) {
  failures.push('js/app.js does not register sw.js');
}
if (!html.includes('aria-live')) failures.push('index.html is missing aria-live status regions');
if (!html.includes('role="dialog"')) failures.push('index.html is missing dialog roles');

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
for (const icon of ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png']) {
  if (!manifest.icons.some(entry => entry.src === icon)) failures.push(`manifest.json is missing ${icon}`);
}

const css = readFileSync('css/styles.css', 'utf8');
const open = (css.match(/{/g) || []).length;
const close = (css.match(/}/g) || []).length;
if (open !== close) failures.push(`CSS brace mismatch: ${open} != ${close}`);

for (const file of ['sw.js', 'js/app.js', 'js/storage.js', 'src/lib/core.js', 'src/lib/radio-browser.js', 'scripts/static-server.mjs', 'tests/unit.test.mjs', 'tests/e2e.smoke.mjs']) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    failures.push(`Syntax check failed for ${file}: ${error.stderr?.toString() || error.message}`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Lint checks passed');
