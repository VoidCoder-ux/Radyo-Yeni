// Uygulamanın saf yardımcı fonksiyonları — TEK KAYNAK. js/app.js bu modülü
// doğrudan import eder; birim testler de aynı modülü test eder
// (bkz. tests/unit.test.mjs). Burada yapılan her değişiklik uygulamada da,
// testlerde de aynı anda geçerli olur.
export const APP_VERSION = '16.1.3';
export const EXPORT_VERSION = APP_VERSION;

export const LIMITS = {
  name: 120,
  genre: 60,
  history: 30,
  emoji: 4,
  importBytes: 1024 * 1024,
  importStations: 1000
};

// app.js COLORS paletinin ilk rengi — aynadaki varsayılan da paletten olmalı.
const DEFAULT_COLOR = '#7c5cff';
const DEFAULT_GENRE = 'Diğer';
const DEFAULT_EMOJI = '📻';

export function reportError(scope, error) {
  if (typeof console !== 'undefined' && console.warn) {
    console.warn(`[PulseRadio] ${scope}`, error);
  }
}

export function isUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

// js/app.js:isPrivateHost aynası. Not: WHATWG URL, IPv6 hostname'i köşeli
// parantezle ('[::1]') döndürür; her iki biçim de kontrol edilir.
export function isPrivateHost(host) {
  const h = String(host || '').toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '::1' || h === '[::1]' ||
    h.startsWith('10.') || h.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[0-1])\./.test(h);
}

export function cleanImageUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return '';
    if (url.username || url.password || isPrivateHost(url.hostname)) return '';
    return url.href;
  } catch {
    return '';
  }
}

export function trNormalize(value) {
  if (value == null) return '';
  let text = String(value).toLocaleLowerCase('tr-TR');
  const map = {
    ı: 'i',
    İ: 'i',
    ş: 's',
    Ş: 's',
    ğ: 'g',
    Ğ: 'g',
    ü: 'u',
    Ü: 'u',
    ö: 'o',
    Ö: 'o',
    ç: 'c',
    Ç: 'c',
    â: 'a',
    Â: 'a',
    î: 'i',
    Î: 'i',
    û: 'u',
    Û: 'u',
    ô: 'o',
    Ô: 'o',
    ê: 'e',
    Ê: 'e'
  };
  text = text.replace(/[ıİşŞğĞüÜöÖçÇâÂîÎûÛôÔêÊ]/g, char => map[char] || char);
  try {
    text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch {
    // Older embedded WebViews may not support normalize; the explicit map above still helps.
  }
  return text.replace(/[^\p{L}\p{N}]+/gu, '').trim();
}

export function normalizeStation(input, options = {}) {
  const colors = options.colors?.length ? options.colors : [DEFAULT_COLOR];
  const makeId = options.makeId || (() => input?.id || '');
  if (!input || typeof input !== 'object') return null;

  const name = typeof input.n === 'string' ? input.n.trim() : '';
  const url = typeof input.u === 'string' ? input.u.trim() : '';
  if (!name || !isUrl(url)) return null;

  const color = typeof input.c === 'string' && /^#[0-9a-f]{6}$/i.test(input.c)
    ? input.c
    : colors[Math.floor(Math.random() * colors.length)];

  return {
    id: typeof input.id === 'string' && input.id ? input.id : makeId(),
    n: name.slice(0, LIMITS.name),
    g: (typeof input.g === 'string' && input.g.trim() ? input.g.trim() : DEFAULT_GENRE).slice(0, LIMITS.genre),
    u: url,
    e: (typeof input.e === 'string' && input.e ? input.e : DEFAULT_EMOJI).slice(0, LIMITS.emoji),
    c: color,
    img: typeof input.img === 'string' ? cleanImageUrl(input.img) : '',
    br: Number.isFinite(input.br) && input.br > 0 ? Math.round(input.br) : 0
  };
}

export function createBackup({ ch = [], fv = [], rc = [] }) {
  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    ch,
    fv,
    rc
  };
}

// js/app.js:importData aynası. Davranış birebir aynıdır:
// - importStations sınırı aşılırsa hata atar,
// - id'si olmayan istasyonlar atlanır (id üretilmez),
// - URL'si zaten var olan istasyonlar eklenmez; eski id mevcut istasyonun
//   id'sine eşlenir (idMap) ve favori/geçmiş kayıtları ona taşınır,
// - geçmiş yeniden sıralanıp history sınırına kırpılır.
export function mergeImportedBackup({ current, incoming, makeId, colors }) {
  if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.ch)) {
    throw new Error('Invalid backup format');
  }
  if (incoming.ch.length > LIMITS.importStations) {
    throw new Error('too-many-stations');
  }

  const ch = Array.isArray(current.ch) ? [...current.ch] : [];
  const fv = Array.isArray(current.fv) ? [...current.fv] : [];
  let rc = Array.isArray(current.rc) ? [...current.rc] : [];
  const idMap = new Map();
  let added = 0;
  let mapped = 0;

  for (const candidate of incoming.ch) {
    if (!candidate || typeof candidate.id !== 'string' || !candidate.id) continue;
    if (typeof candidate.n !== 'string' || !candidate.n.trim()) continue;
    if (typeof candidate.u !== 'string' || !isUrl(candidate.u)) continue;
    const existing = ch.find(station => station.u === candidate.u);
    if (existing) {
      idMap.set(candidate.id, existing.id);
      mapped += 1;
      continue;
    }
    const station = normalizeStation(candidate, { makeId, colors });
    if (!station) continue;
    station.id = makeId();
    idMap.set(candidate.id, station.id);
    ch.push(station);
    added += 1;
  }

  const ids = new Set(ch.map(station => station.id));
  if (Array.isArray(incoming.fv)) {
    for (const id of incoming.fv) {
      if (typeof id !== 'string') continue;
      const target = idMap.get(id) || id;
      if (ids.has(target) && !fv.includes(target)) fv.push(target);
    }
  }

  if (Array.isArray(incoming.rc)) {
    for (const item of incoming.rc) {
      if (!item || typeof item.id !== 'string' || typeof item.t !== 'number') continue;
      const target = idMap.get(item.id) || item.id;
      if (ids.has(target) && !rc.find(entry => entry.id === target)) rc.push({ id: target, t: item.t });
    }
    rc.sort((a, b) => b.t - a.t);
    rc = rc.slice(0, LIMITS.history);
  }

  return { ch, fv, rc, added, mapped };
}
