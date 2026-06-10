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
  'icons/icon.svg',
  'icons/apple-touch-icon-180.png',
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

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const appJs = readFileSync('js/app.js', 'utf8');
const sw = readFileSync('sw.js', 'utf8');
const core = readFileSync('src/lib/core.js', 'utf8');
const appVersion = appJs.match(/const APP_VERSION='([^']+)'/)?.[1];
const coreVersion = core.match(/export const APP_VERSION = '([^']+)'/)?.[1];
const cacheVersion = sw.match(/const CACHE='pulse-radio-v([^']+)'/)?.[1];
for (const [label, version] of [['js/app.js', appVersion], ['src/lib/core.js', coreVersion], ['sw.js', cacheVersion]]) {
  if (version !== pkg.version) failures.push(`${label} version ${version || 'missing'} does not match package.json ${pkg.version}`);
}

// Ayna-sapması bekçileri: src/lib/core.js, js/app.js'teki saf yardımcıların
// test aynasıdır; kritik güvenlik/limit değerleri ikisinde de aynı olmalı.
for (const marker of ["'[::1]'", "'0.0.0.0'", 'localhost']) {
  if (!appJs.includes(marker)) failures.push(`js/app.js private-host check is missing ${marker}`);
  if (!core.includes(marker)) failures.push(`src/lib/core.js private-host mirror is missing ${marker}`);
}
const appImportLimit = appJs.match(/MAX_IMPORT_STATIONS=(\d+)/)?.[1];
const coreImportLimit = core.match(/importStations:\s*(\d+)/)?.[1];
if (appImportLimit !== coreImportLimit) {
  failures.push(`import station limit drift: js/app.js=${appImportLimit} src/lib/core.js=${coreImportLimit}`);
}

const css = readFileSync('css/styles.css', 'utf8');
const open = (css.match(/{/g) || []).length;
const close = (css.match(/}/g) || []).length;
if (open !== close) failures.push(`CSS brace mismatch: ${open} != ${close}`);

for (const file of ['sw.js', 'js/app.js', 'js/storage.js', 'src/lib/core.js', 'scripts/static-server.mjs', 'tests/unit.test.mjs', 'tests/e2e.smoke.mjs']) {
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
