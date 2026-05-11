import { RADIO_BROWSER_HOSTS, reportError } from './core.js';

const cache = new Map();
const CACHE_TTL_MS = 60 * 1000;

function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  if (typeof AbortController === 'undefined') return undefined;
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

function firstFulfilled(promises) {
  if (Promise.any) return Promise.any(promises);
  return new Promise((resolve, reject) => {
    let pending = promises.length;
    if (!pending) {
      reject(new Error('No promises'));
      return;
    }
    promises.forEach(promise => Promise.resolve(promise).then(resolve, () => {
      pending -= 1;
      if (pending === 0) reject(new Error('All promises rejected'));
    }));
  });
}

export async function fetchRadioBrowserJson(endpoint, options = {}) {
  const hosts = options.hosts || RADIO_BROWSER_HOSTS;
  const timeoutMs = options.timeoutMs || 6000;
  const cacheKey = endpoint;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;

  const requests = hosts.map(host =>
    fetch(`https://${host}.api.radio-browser.info/json/${endpoint}`, {
      signal: timeoutSignal(timeoutMs),
      cache: 'no-store'
    }).then(response => {
      if (!response.ok) throw new Error(`Radio Browser ${response.status}`);
      return response.json();
    })
  );

  try {
    const value = await firstFulfilled(requests);
    cache.set(cacheKey, { value, expires: Date.now() + CACHE_TTL_MS });
    return value;
  } catch (error) {
    reportError('radio-browser-api', error);
    return null;
  }
}
