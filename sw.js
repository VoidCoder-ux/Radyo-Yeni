const CACHE='turkradyo-v12.1';
const PRECACHE=['./','index.html','manifest.json','icons/icon.svg'];
const FONT_CACHE='turkradyo-fonts-v2';

self.addEventListener('install',e=>{
  e.waitUntil(
    caches.open(CACHE).then(c=>c.addAll(PRECACHE)).then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k!==CACHE&&k!==FONT_CACHE).map(k=>caches.delete(k))
    )).then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);

  // Never cache audio streams or API calls
  if(url.hostname.includes('radio-browser.info')||
     e.request.url.match(/\.(mp3|aac|m3u8|ogg|opus|flac|wav)(\?|$)/i)||
     e.request.headers.get('range')){
    return;
  }

  // Cache Google Fonts separately with long TTL
  if(url.hostname.includes('fonts.googleapis.com')||url.hostname.includes('fonts.gstatic.com')){
    e.respondWith(
      caches.open(FONT_CACHE).then(c=>
        c.match(e.request).then(r=>{
          if(r)return r;
          return fetch(e.request).then(res=>{
            if(res.ok)c.put(e.request,res.clone());
            return res;
          }).catch(()=>new Response('',{status:408}));
        })
      )
    );
    return;
  }

  // App shell: network-first, fallback to cache
  if(url.origin===location.origin){
    e.respondWith(
      fetch(e.request).then(res=>{
        if(res.ok){
          const clone=res.clone();
          caches.open(CACHE).then(c=>c.put(e.request,clone));
        }
        return res;
      }).catch(()=>caches.match(e.request).then(r=>r||new Response('<h1>Çevrimdışı</h1><p>İnternet bağlantınızı kontrol edin.</p>',{headers:{'Content-Type':'text/html;charset=utf-8'}})))
    );
  }
});
