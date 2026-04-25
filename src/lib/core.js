export const APP_VERSION = '13.1.0';
export const EXPORT_VERSION = APP_VERSION;
export const RADIO_BROWSER_HOSTS = ['de1', 'nl1', 'at1', 'de2'];

export const LIMITS = {
  name: 120,
  genre: 60,
  history: 30,
  emoji: 4,
  importBytes: 1024 * 1024
};

const DEFAULT_COLOR = '#7c6cf0';
const DEFAULT_GENRE = 'Diğer';
const DEFAULT_EMOJI = '📻';

export function reportError(scope, error) {
  if (typeof console !== 'undefined' && console.warn) {
    console.warn(`[TurkRadyo] ${scope}`, error);
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
    img: typeof input.img === 'string' && isUrl(input.img) ? input.img : '',
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

export function mergeImportedBackup({ current, incoming, makeId, colors }) {
  if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.ch)) {
    throw new Error('Invalid backup format');
  }

  const ch = Array.isArray(current.ch) ? [...current.ch] : [];
  const fv = Array.isArray(current.fv) ? [...current.fv] : [];
  const rc = Array.isArray(current.rc) ? [...current.rc] : [];
  const urls = new Set(ch.map(station => station.u));
  const idMap = new Map();
  let added = 0;

  for (const candidate of incoming.ch) {
    const station = normalizeStation(candidate, { makeId, colors });
    if (!station || urls.has(station.u)) continue;
    const oldId = station.id;
    station.id = makeId();
    idMap.set(oldId, station.id);
    ch.push(station);
    urls.add(station.u);
    added += 1;
  }

  const ids = new Set(ch.map(station => station.id));
  if (Array.isArray(incoming.fv)) {
    for (const id of incoming.fv) {
      const mapped = typeof id === 'string' ? idMap.get(id) || id : null;
      if (mapped && ids.has(mapped) && !fv.includes(mapped)) fv.push(mapped);
    }
  }

  if (Array.isArray(incoming.rc)) {
    for (const item of incoming.rc) {
      if (!item || typeof item.id !== 'string' || typeof item.t !== 'number') continue;
      const mapped = idMap.get(item.id) || item.id;
      if (ids.has(mapped) && !rc.find(entry => entry.id === mapped)) rc.push({ id: mapped, t: item.t });
    }
  }

  return {
    ch,
    fv: fv.filter(id => ids.has(id)),
    rc: rc
      .filter(item => item && ids.has(item.id) && typeof item.t === 'number')
      .sort((a, b) => b.t - a.t)
      .slice(0, LIMITS.history),
    added
  };
}

export function normalizeRadioBrowserStation(input) {
  if (!input || typeof input !== 'object') return null;
  const url = input.url_resolved || input.url;
  if (!isUrl(url)) return null;
  return {
    name: String(input.name || '').trim(),
    url,
    favicon: isUrl(input.favicon) ? input.favicon : '',
    tags: String(input.tags || ''),
    country: String(input.country || ''),
    bitrate: Number.isFinite(input.bitrate) ? input.bitrate : 0,
    stationuuid: String(input.stationuuid || url)
  };
}
