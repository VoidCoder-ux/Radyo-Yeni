import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  APP_VERSION,
  LIMITS,
  cleanImageUrl,
  createBackup,
  isUrl,
  mergeImportedBackup,
  normalizeStation,
  trNormalize
} from '../src/lib/core.js';

test('isUrl accepts only http and https URLs', () => {
  assert.equal(isUrl('https://example.com/stream'), true);
  assert.equal(isUrl('http://example.com/stream'), true);
  assert.equal(isUrl('ftp://example.com/stream'), false);
  assert.equal(isUrl('not a url'), false);
});

test('trNormalize supports Turkish search matching', () => {
  assert.equal(trNormalize('İstanbul Şarkı Çocuk'), 'istanbulsarkicocuk');
  assert.equal(trNormalize('  Türkçe FM  '), 'turkcefm');
});

test('normalizeStation validates and trims station data', () => {
  const station = normalizeStation({
    id: 'old',
    n: '  Test FM  ',
    u: 'https://stream.example/live',
    g: 'Pop',
    e: '📻',
    c: '#112233',
    img: 'https://example.com/logo.png',
    br: 128.2
  });

  assert.deepEqual(station, {
    id: 'old',
    n: 'Test FM',
    u: 'https://stream.example/live',
    g: 'Pop',
    e: '📻',
    c: '#112233',
    img: 'https://example.com/logo.png',
    br: 128
  });
  assert.equal(normalizeStation({ n: '', u: 'https://x.test' }), null);
  assert.equal(normalizeStation({ n: 'Bad', u: 'javascript:alert(1)' }), null);
});

test('cleanImageUrl rejects unsafe image origins', () => {
  assert.equal(cleanImageUrl('https://example.com/logo.png'), 'https://example.com/logo.png');
  assert.equal(cleanImageUrl('http://example.com/logo.png'), '');
  assert.equal(cleanImageUrl('https://user:pass@example.com/logo.png'), '');
  assert.equal(cleanImageUrl('https://127.0.0.1/logo.png'), '');
  // WHATWG URL IPv6 hostname'i '[::1]' olarak döndürür — bu biçim de engellenmeli.
  assert.equal(cleanImageUrl('https://[::1]/logo.png'), '');
  assert.equal(cleanImageUrl('https://localhost/logo.png'), '');
  assert.equal(cleanImageUrl('https://0.0.0.0/logo.png'), '');
  assert.equal(cleanImageUrl('https://10.0.0.5/logo.png'), '');
  assert.equal(cleanImageUrl('https://192.168.1.10/logo.png'), '');
  assert.equal(cleanImageUrl('https://172.16.0.1/logo.png'), '');
});

test('version markers and service worker navigation fallback stay aligned', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const app = readFileSync('js/app.js', 'utf8');
  const sw = readFileSync('sw.js', 'utf8');
  assert.equal(APP_VERSION, pkg.version);
  // app.js sürümü artık core.js'ten import eder; yerel bir kopya geri dönmesin.
  assert.match(app, /^import \{\n  APP_VERSION,/m);
  assert.doesNotMatch(app, /APP_VERSION='/);
  assert.match(sw, new RegExp(`pulse-radio-v${pkg.version}`));
  assert.match(sw, /isNavigation/);
  assert.match(sw, /caches\.match\('index\.html'\)/);
});

test('mergeImportedBackup mirrors importData: maps duplicate URLs, skips id-less stations', () => {
  let id = 0;
  const makeId = () => `new-${++id}`;
  const current = {
    ch: [{ id: 'a', n: 'A', u: 'https://a.test', g: 'Pop', e: '📻', c: '#7c5cff', img: '', br: 0 }],
    fv: ['a'],
    rc: [{ id: 'a', t: 10 }]
  };
  const incoming = createBackup({
    ch: [
      { id: 'old-b', n: 'B', u: 'https://b.test', g: 'Rock' },
      { id: 'dup', n: 'A duplicate', u: 'https://a.test' },
      { id: 'bad', n: 'Bad', u: 'nope' },
      { n: 'No id', u: 'https://noid.test' }
    ],
    fv: ['old-b', 'dup', 'missing'],
    rc: [{ id: 'old-b', t: 20 }, { id: 'dup', t: 40 }, { id: 'missing', t: 30 }]
  });

  const merged = mergeImportedBackup({ current, incoming, makeId, colors: ['#123456'] });
  assert.equal(merged.added, 1);
  assert.equal(merged.mapped, 1); // 'dup' URL'si mevcut 'a' istasyonuna eşlendi
  assert.equal(merged.ch.length, 2); // id'siz ve geçersiz URL'li istasyonlar atlandı
  assert.equal(merged.ch[1].id, 'new-1');
  assert.deepEqual(merged.fv, ['a', 'new-1']); // 'dup' favorisi 'a'ya eşlendi (zaten vardı)
  assert.deepEqual(merged.rc, [{ id: 'new-1', t: 20 }, { id: 'a', t: 10 }]);
});

test('mergeImportedBackup enforces the same station limit as importData', () => {
  const incoming = createBackup({
    ch: Array.from({ length: LIMITS.importStations + 1 }, (_, i) => ({
      id: `s${i}`, n: `S${i}`, u: `https://s${i}.test`
    }))
  });
  assert.throws(
    () => mergeImportedBackup({ current: { ch: [], fv: [], rc: [] }, incoming, makeId: () => 'x', colors: ['#123456'] }),
    /too-many-stations/
  );
});
