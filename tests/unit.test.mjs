import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBackup,
  isUrl,
  mergeImportedBackup,
  normalizeRadioBrowserStation,
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

test('mergeImportedBackup adds unique stations and keeps related ids valid', () => {
  let id = 0;
  const makeId = () => `new-${++id}`;
  const current = {
    ch: [{ id: 'a', n: 'A', u: 'https://a.test', g: 'Pop', e: '📻', c: '#7c6cf0', img: '', br: 0 }],
    fv: ['a'],
    rc: [{ id: 'a', t: 10 }]
  };
  const incoming = createBackup({
    ch: [
      { id: 'old-b', n: 'B', u: 'https://b.test', g: 'Rock' },
      { id: 'dup', n: 'A duplicate', u: 'https://a.test' },
      { id: 'bad', n: 'Bad', u: 'nope' }
    ],
    fv: ['old-b', 'missing'],
    rc: [{ id: 'old-b', t: 20 }, { id: 'missing', t: 30 }]
  });

  const merged = mergeImportedBackup({ current, incoming, makeId, colors: ['#123456'] });
  assert.equal(merged.added, 1);
  assert.equal(merged.ch.length, 2);
  assert.equal(merged.ch[1].id, 'new-1');
  assert.deepEqual(merged.fv, ['a', 'new-1']);
  assert.deepEqual(merged.rc, [{ id: 'new-1', t: 20 }, { id: 'a', t: 10 }]);
});

test('normalizeRadioBrowserStation returns safe stream records', () => {
  assert.deepEqual(normalizeRadioBrowserStation({
    name: 'Radio',
    url_resolved: 'https://stream.example/radio',
    favicon: 'https://example.com/icon.png',
    tags: 'pop,news',
    country: 'Turkey',
    bitrate: 96,
    stationuuid: 'abc'
  }), {
    name: 'Radio',
    url: 'https://stream.example/radio',
    favicon: 'https://example.com/icon.png',
    tags: 'pop,news',
    country: 'Turkey',
    bitrate: 96,
    stationuuid: 'abc'
  });
  assert.equal(normalizeRadioBrowserStation({ name: 'Bad', url: 'notaurl' }), null);
});
