const APP_VERSION = '13.1.0';
const CACHE_PREFIX = 'turkradyo';
const CACHE = `${CACHE_PREFIX}-app-${APP_VERSION}`;
const FONT_CACHE = `${CACHE_PREFIX}-fonts-v2`;
const PRECACHE = [
  './',
  'index.html',
  'manifest.json',
  'src/styles.css',
  'src/app.js',
  'src/lib/core.js',
  'src/lib/radio-browser.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

const OFFLINE_HTML = `<!doctype html>
<html lang="tr">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TürkRadyo çevrimdışı</title>
<body style="margin:0;font-family:system-ui,sans-serif;background:#06060b;color:#f0eeff;display:grid;min-height:100vh;place-items:center;text-align:center;padding:24px">
  <main>
    <h1>Çevrimdışı</h1>
    <p>İnternet bağlantınızı kontrol edin ve tekrar deneyin.</p>
  </main>
</body>
</html>`;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE && key !== FONT_CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (
    url.hostname.includes('radio-browser.info') ||
    event.request.url.match(/\.(mp3|aac|m3u8|ogg|opus|flac|wav)(\?|$)/i) ||
    event.request.headers.get('range')
  ) {
    return;
  }

  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(FONT_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => new Response('', { status: 408 }))
        })
      )
    );
    return;
  }

  if (url.origin === location.origin) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() =>
        caches.match(event.request)
          .then(cached => cached || caches.match('index.html'))
          .then(cached => cached || new Response(OFFLINE_HTML, {
            headers: { 'Content-Type': 'text/html;charset=utf-8' }
          }))
      )
    );
  }
});
