import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const required = [
  'index.html',
  'manifest.json',
  'sw.js',
  'css/styles.css',
  'js/app.js',
  'js/storage.js',
  'js/vendor/hls.light.min.js',
  'src/lib/core.js',
  'icons/icon.svg',
  'icons/apple-touch-icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'fonts/plus-jakarta-sans-latin-wght-normal.woff2',
  'fonts/plus-jakarta-sans-latin-ext-wght-normal.woff2',
  'fonts/outfit-latin-wght-normal.woff2',
  'fonts/outfit-latin-ext-wght-normal.woff2',
  'screenshots/home.png',
  'screenshots/channels.png'
];

const failures = [];
for (const file of required) {
  if (!existsSync(file)) failures.push(`Missing ${file}`);
}

const html = readFileSync('index.html', 'utf8');
for (const ref of ['css/styles.css', 'js/app.js', 'manifest.json']) {
  if (!html.includes(ref)) failures.push(`index.html does not reference ${ref}`);
}
if (!html.includes('type="module"')) failures.push('index.html should load js/app.js as an ES module');
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
const coreVersion = core.match(/export const APP_VERSION = '([^']+)'/)?.[1];
const cacheVersion = sw.match(/const CACHE='pulse-radio-v([^']+)'/)?.[1];
for (const [label, version] of [['src/lib/core.js', coreVersion], ['sw.js', cacheVersion]]) {
  if (version !== pkg.version) failures.push(`${label} version ${version || 'missing'} does not match package.json ${pkg.version}`);
}

// app.js yardımcıları src/lib/core.js'ten import etmeli; yerel kopya geri dönmesin.
if (!appJs.includes("from '../src/lib/core.js'")) {
  failures.push('js/app.js must import shared helpers from src/lib/core.js');
}
for (const marker of ["'[::1]'", "'0.0.0.0'", 'localhost']) {
  if (!core.includes(marker)) failures.push(`src/lib/core.js private-host check is missing ${marker}`);
}

// SW precache, uygulamanın modül grafiğindeki tüm dosyaları içermeli.
for (const file of ['js/app.js', 'js/storage.js', 'src/lib/core.js']) {
  if (!sw.includes(`'${file}'`)) failures.push(`sw.js PRECACHE is missing ${file}`);
}

const css = readFileSync('css/styles.css', 'utf8');
const open = (css.match(/{/g) || []).length;
const close = (css.match(/}/g) || []).length;
if (open !== close) failures.push(`CSS brace mismatch: ${open} != ${close}`);

const moduleFiles = new Set(['js/app.js', 'js/storage.js', 'src/lib/core.js']);
for (const file of ['sw.js', 'js/app.js', 'js/storage.js', 'src/lib/core.js', 'scripts/static-server.mjs', 'tests/unit.test.mjs', 'tests/e2e.smoke.mjs']) {
  try {
    if (moduleFiles.has(file)) {
      // .js uzantılı ES modülleri stdin + --input-type=module ile denetle;
      // dosya yolu verilirse Node bunları CommonJS sayabilir.
      execFileSync(process.execPath, ['--input-type=module', '--check'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        input: readFileSync(file)
      });
    } else {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    }
  } catch (error) {
    failures.push(`Syntax check failed for ${file}: ${error.stderr?.toString() || error.message}`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Lint checks passed');
