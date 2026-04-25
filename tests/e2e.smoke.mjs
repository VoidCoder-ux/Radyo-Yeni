import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { createRequire } from 'node:module';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const roots = (process.env.NODE_PATH || '').split(/[;:]/).filter(Boolean);
    for (const root of roots) {
      try {
        return createRequire(import.meta.url)(join(root, 'playwright'));
      } catch {
        // Try the next NODE_PATH root.
      }
    }
    throw new Error('Playwright is not installed. Run npm install first.');
  }
}

const root = resolve(process.cwd());
const mime = {
  '.html': 'text/html;charset=utf-8',
  '.js': 'text/javascript;charset=utf-8',
  '.css': 'text/css;charset=utf-8',
  '.json': 'application/json;charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

function fileFor(url, port) {
  const parsed = new URL(url, `http://localhost:${port}`);
  const safe = normalize(parsed.pathname).replace(/^(\.\.[/\\])+/, '');
  const target = resolve(join(root, safe));
  if (!target.startsWith(root) || !existsSync(target)) return null;
  if (statSync(target).isDirectory()) return join(target, 'index.html');
  return target;
}

async function withServer(callback) {
  const server = createServer((request, response) => {
    const file = fileFor(request.url, server.address().port);
    if (!file || !existsSync(file)) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' });
    createReadStream(file).pipe(response);
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

const { chromium } = await loadPlaywright();

await withServer(async baseUrl => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#spl.h', { timeout: 3500 });
  await assertVisible(page, '#navF');
  await assertVisible(page, '#navA');
  await assertVisible(page, '#navR');
  await assertVisible(page, '#navS');

  await page.click('#btnAdd');
  await page.waitForSelector('#addMod.s');
  await page.click('#btnMAdd');
  await assertVisible(page, '#fgN.bad');
  await assertVisible(page, '#fgU.bad');

  await page.fill('#inN', 'Smoke FM');
  await page.fill('#inU', 'https://example.com/stream.mp3');
  await page.click('#btnMAdd');
  await page.waitForFunction(() => !document.querySelector('#addMod')?.classList.contains('s'));
  await page.click('#navA');
  await page.waitForSelector('.card[data-id]');
  await page.click('.card [data-action="fav"]');
  await page.click('#navF');
  await page.waitForSelector('.card[data-id]');
  await page.click('#navS');
  await assertVisible(page, '#btnExport');
  await assertVisible(page, '#btnImport');

  await page.click('#btnAdd');
  await page.waitForSelector('#addMod.s');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#addMod')?.classList.contains('s'));

  const swRegistered = await page.evaluate(() => 'serviceWorker' in navigator);
  assert.equal(typeof swRegistered, 'boolean');
  assert.deepEqual(errors, []);

  await browser.close();
});

async function assertVisible(page, selector) {
  const visible = await page.locator(selector).first().isVisible();
  assert.equal(visible, true, `${selector} should be visible`);
}

console.log('E2E smoke checks passed');
