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

/* ── js/utils.js ── */
import {
  trMatchRange,
  initialRoute,
  formatBytes,
  formatListenTime,
  relTime,
  darken,
  isHttpUrl
} from '../js/utils.js';
import { genreFromTags, normalizeHosts, FALLBACK_HOSTS, apiCall, apiCallSafe } from '../js/api.js';

test('trMatchRange finds Turkish-normalized match ranges in original text', () => {
  // 'İ'.toLocaleLowerCase('tr') tek karaktere iner; indeks kayması olmamalı
  assert.deepEqual(trMatchRange('İstanbul FM', 'ist'), [0, 3]);
  assert.deepEqual(trMatchRange('Radyo Şarkı', 'sarki'), [6, 11]);
  // Noktalama/boşluk normalize edilir: 'power fm' sorgusu 'Power-FM' ile eşleşir
  assert.deepEqual(trMatchRange('Power-FM', 'powerfm'), [0, 8]);
  assert.equal(trMatchRange('Metro FM', 'jazz'), null);
  assert.equal(trMatchRange('Metro FM', ''), null);
});

test('initialRoute maps page aliases and defaults to home', () => {
  assert.deepEqual(initialRoute('?page=fav'), { page: 'f' });
  assert.deepEqual(initialRoute('?page=favorites'), { page: 'f' });
  assert.deepEqual(initialRoute('?page=add'), { page: 'a', openAdd: true });
  assert.deepEqual(initialRoute('?page=channels'), { page: 'a' });
  assert.deepEqual(initialRoute('?page=recent'), { page: 'r' });
  assert.deepEqual(initialRoute('?page=settings'), { page: 's' });
  assert.deepEqual(initialRoute('?page=unknown'), { page: 'h' });
  assert.deepEqual(initialRoute(''), { page: 'h' });
});

test('formatBytes and formatListenTime produce human-readable Turkish output', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
  assert.equal(formatBytes(2.5 * 1024 * 1024 * 1024), '2.50 GB');
  assert.equal(formatListenTime(30), '<1 dk');
  assert.equal(formatListenTime(300), '5 dk');
  assert.equal(formatListenTime(3600), '1 sa');
  assert.equal(formatListenTime(4260), '1 sa 11 dk');
});

test('relTime buckets relative timestamps', () => {
  const now = 1_000_000_000_000;
  assert.equal(relTime(now - 30_000, now), 'Az önce');
  assert.equal(relTime(now - 5 * 60_000, now), '5dk');
  assert.equal(relTime(now - 3 * 3_600_000, now), '3sa');
  assert.equal(relTime(now - 2 * 86_400_000, now), '2g');
});

test('darken shifts hex colors toward night-purple and falls back safely', () => {
  assert.equal(darken('#7c5cff'), 'rgb(74,62,255)');
  assert.equal(darken(null), '#4a3ab5');
});

test('isHttpUrl flags only plain http URLs', () => {
  assert.equal(isHttpUrl('http://example.com/s'), true);
  assert.equal(isHttpUrl('https://example.com/s'), false);
  assert.equal(isHttpUrl('not a url'), false);
});

test('genreFromTags maps Radio Browser tags to app genres', () => {
  assert.equal(genreFromTags('pop,dance'), 'Pop');
  assert.equal(genreFromTags('indie rock'), 'Rock');
  assert.equal(genreFromTags('smooth jazz'), 'Caz');
  assert.equal(genreFromTags('news,talk'), 'Haber');
  assert.equal(genreFromTags('turkish folk'), 'THM');
  assert.equal(genreFromTags('quran'), 'Dini');
  assert.equal(genreFromTags('techno,house'), 'Elektronik');
  assert.equal(genreFromTags('classical'), 'TSM');
  assert.equal(genreFromTags('sports'), 'Spor');
  assert.equal(genreFromTags('kids'), 'Çocuk');
  assert.equal(genreFromTags(''), 'Diğer');
  assert.equal(genreFromTags(null), 'Diğer');
});

test('FALLBACK_HOSTS only lists reachable radio-browser mirrors', () => {
  assert.ok(FALLBACK_HOSTS.length > 0);
  for (const host of FALLBACK_HOSTS) assert.match(host, /\.api\.radio-browser\.info$/);
  // nl1 ve at1 kapandı (DNS'te çözülmüyor); listeye geri sızmamalı
  assert.ok(!FALLBACK_HOSTS.some(h => h.startsWith('nl1.') || h.startsWith('at1.')));
});

test('normalizeHosts keeps only radio-browser mirrors and dedupes', () => {
  assert.deepEqual(
    normalizeHosts([{ name: 'de1.api.radio-browser.info' }, 'DE2.api.radio-browser.info ', { name: 'de1.api.radio-browser.info' }]),
    ['de1.api.radio-browser.info', 'de2.api.radio-browser.info']
  );
  // Ele geçmiş/bozuk bir sunucu listesi istekleri başka bir alan adına taşıyamaz
  assert.deepEqual(normalizeHosts([{ name: 'evil.example.com' }, { name: 'radio-browser.info.evil.com' }, 'de1.api.radio-browser.info.evil']), []);
  assert.deepEqual(normalizeHosts(null), []);
  assert.deepEqual(normalizeHosts([null, 42, {}]), []);
});

test('apiCall rejects when every mirror fails so callers can tell it from "no results"', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.reject(new Error('offline'));
  try {
    await assert.rejects(() => apiCall('stations/search?name=x'));
    assert.equal(await apiCallSafe('stations/search?name=x'), null);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('apiCall resolves with the first successful mirror response', async () => {
  const realFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = url => {
    const href = String(url);
    if (href.includes('/json/servers')) return Promise.reject(new Error('no server list'));
    seen.push(href);
    return Promise.resolve({ ok: true, json: async () => [{ name: 'Test FM' }] });
  };
  try {
    assert.deepEqual(await apiCall('stations/byurl?url=x'), [{ name: 'Test FM' }]);
    assert.ok(seen.length > 0);
    for (const href of seen) assert.match(href, /^https:\/\/[a-z0-9.-]+\.api\.radio-browser\.info\/json\//);
  } finally {
    globalThis.fetch = realFetch;
  }
});

/* ── js/storage.js (yedek/paylaşım token'ları) ── */
import {
  encodeBackup,
  decodeBackup,
  extractBackupToken,
  encodeStation,
  decodeStation
} from '../js/storage.js';

test('backup token roundtrips through base64url encoding', () => {
  const data = { version: '1', ch: [{ id: 'a', n: 'Ünlü Radyo 📻', u: 'https://a.test' }], fv: ['a'], rc: [] };
  const token = encodeBackup(data);
  assert.match(token, /^[A-Za-z0-9_-]+$/); // padding'siz base64url
  assert.deepEqual(decodeBackup(token), data);
});

test('extractBackupToken handles URLs, hashes and raw tokens', () => {
  assert.equal(extractBackupToken('https://x.test/app#backup=abc123'), 'abc123');
  assert.equal(extractBackupToken('https://x.test/app?backup=q1'), 'q1');
  assert.equal(extractBackupToken('#backup=zzz'), 'zzz');
  assert.equal(extractBackupToken('rawtoken'), 'rawtoken');
  assert.equal(extractBackupToken(''), '');
});

test('decodeBackup accepts raw JSON but enforces the 1MB limit', () => {
  assert.deepEqual(decodeBackup('{"ch":[]}'), { ch: [] });
  const big = '{"pad":"' + 'x'.repeat(1048576) + '"}';
  assert.throws(() => decodeBackup(big), /backup-too-large/);
});

test('station share token roundtrips and validates shape', () => {
  const s = { n: 'Çağrı FM', u: 'https://cagri.test/live', g: 'THM', e: '📻', c: '#7c5cff', img: '', br: 128 };
  const d = decodeStation(encodeStation(s));
  assert.deepEqual(d, s);
  const viaUrl = decodeStation('https://x.test/app#add=' + encodeURIComponent(encodeStation(s)));
  assert.equal(viaUrl.n, 'Çağrı FM');
  assert.throws(() => decodeStation(''), /empty-station/);
});
