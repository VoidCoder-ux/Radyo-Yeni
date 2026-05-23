const CACHE='pulse-radio-v15.0.4';
const PRECACHE=['./','index.html','css/styles.css','js/storage.js','js/app.js','manifest.json','icons/icon.svg','icons/apple-touch-icon-180.png','icons/icon-192.png','icons/icon-512.png','icons/icon-maskable-512.png'];
const FONT_CACHE='pulse-radio-fonts-v3';

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
  const accept=e.request.headers.get('accept')||'';
  const isNavigation=e.request.mode==='navigate'||accept.includes('text/html');
  const isAudioRequest=e.request.destination==='audio'||
     accept.includes('audio')||
     e.request.headers.get('icy-metadata')||
     e.request.url.match(/\.(mp3|aac|m3u8|ogg|opus|flac|wav)(\?|$)/i)||
     e.request.headers.get('range');

  // Never cache audio streams or API calls.
  if(url.hostname.includes('radio-browser.info')||
     isAudioRequest){
    return;
  }

  // Cache Google Fonts separately with long TTL.
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

  // App shell: network-first, query-safe fallback for PWA shortcuts.
  if(url.origin===location.origin){
    e.respondWith(
      fetch(e.request).then(res=>{
        if(res.ok){
          const clone=res.clone();
          caches.open(CACHE).then(c=>c.put(e.request,clone));
        }
        return res;
      }).catch(async()=>{
        const cached=await caches.match(e.request);
        if(cached)return cached;
        if(isNavigation){
          return (await caches.match('index.html'))||
            (await caches.match('./'))||
            new Response('<h1>Çevrimdışı</h1><p>İnternet bağlantınızı kontrol edin.</p>',{headers:{'Content-Type':'text/html;charset=utf-8'}});
        }
        return new Response('',{status:504,statusText:'Offline'});
      })
    );
  }
});
