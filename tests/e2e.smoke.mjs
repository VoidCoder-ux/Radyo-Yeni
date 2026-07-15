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
  // PW_CHROMIUM: sistemde kurulu bir Chromium ikilisi ile çalıştırma imkânı
  // (Playwright'ın kendi indirdiği sürüm yoksa, örn. paylaşımlı CI imajları).
  const browser = await chromium.launch(
    process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}
  );
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
      errors.push(message.text());
    }
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  assert.equal(await page.title(), 'Pulse Radio - Canlı Radyo');
  await page.waitForFunction(() => document.querySelector('#spl')?.classList.contains('h'), { timeout: 3500 });
  await assertVisible(page, '#navF');
  await assertVisible(page, '#navA');
  await assertVisible(page, '#navR');
  await assertVisible(page, '#navS');

  await page.click('#btnAdd');
  await page.waitForSelector('#addMod.s');
  await page.click('[data-add-tab="manual"]');
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

  await page.goto(`${baseUrl}/?page=fav`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#navF[aria-current="page"]');
  await assertVisible(page, '#pF.a');

  await page.goto(`${baseUrl}/?page=add`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#navA[aria-current="page"]');
  await page.waitForSelector('#addMod.s');
  await assertVisible(page, '[data-add-tab="tr"].a');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#addMod')?.classList.contains('s'));

  // Kaydın gerçekten başarılı olduğunu doğrula (eski kontrol her zaman geçen
  // bir totolojiydi): localhost'ta SW'ye izin verilir, aktif worker beklenir.
  const swState = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'unsupported';
    try {
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000))
      ]);
      return reg && reg.active ? 'active' : 'no-active-worker';
    } catch (err) {
      return 'not-ready: ' + err.message;
    }
  });
  assert.equal(swState, 'active');
  assert.deepEqual(errors, []);

  await browser.close();
});

async function assertVisible(page, selector) {
  const visible = await page.locator(selector).first().isVisible();
  assert.equal(visible, true, `${selector} should be visible`);
}

console.log('E2E smoke checks passed');
