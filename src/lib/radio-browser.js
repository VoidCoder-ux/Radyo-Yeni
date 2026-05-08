import { RADIO_BROWSER_HOSTS, reportError } from './core.js';

const cache = new Map();
const CACHE_TTL_MS = 60 * 1000;

export async function fetchRadioBrowserJson(endpoint, options = {}) {
  const hosts = options.hosts || RADIO_BROWSER_HOSTS;
  const timeoutMs = options.timeoutMs || 6000;
  const cacheKey = endpoint;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;

  const requests = hosts.map(host =>
    fetch(`https://${host}.api.radio-browser.info/json/${endpoint}`, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store'
    }).then(response => {
      if (!response.ok) throw new Error(`Radio Browser ${response.status}`);
      return response.json();
    })
  );

  try {
    const value = await Promise.any(requests);
    cache.set(cacheKey, { value, expires: Date.now() + CACHE_TTL_MS });
    return value;
  } catch (error) {
    reportError('radio-browser-api', error);
    return null;
  }
}
