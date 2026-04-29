(function(){
'use strict';

const LS={CH:'trch8',FV:'trfv8',RC:'trrc8',INT:'trint9',CAR:'trcar1',DS:'trds1',DU:'trdu1',SYNC:'trsync1'};
const APP_VERSION='13.1';
const COLORS=['#7c6cf0','#ff6b9d','#3dd68c','#ffc857','#4834d4','#1abc9c','#ff5c6c','#00bcd4','#e91e63','#ff9a76','#6c5ce7','#00b894'];
const GENRES=['Tümü','Pop','Rock','Haber','THM','TSM','Arabesk','Caz','Elektronik','Karma','Dini','Çocuk','Spor','Diğer'];
const APIS=['de1','nl1','at1','de2'];
const MAX_N=120,MAX_G=60,MAX_H=30;

function esc(s){const d=document.createElement('div');d.textContent=(s==null)?'':String(s);return d.innerHTML;}
function mkId(){return 'r'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
function isUrl(u){try{const p=new URL(u);return p.protocol==='https:'||p.protocol==='http:';}catch{return false;}}
function isHttpUrl(u){try{return new URL(u).protocol==='http:';}catch{return false;}}
function timeoutSignal(ms){
  if(typeof AbortSignal!=='undefined'&&typeof AbortSignal.timeout==='function')return AbortSignal.timeout(ms);
  if(typeof AbortController==='undefined')return undefined;
  const ctrl=new AbortController();
  setTimeout(()=>ctrl.abort(),ms);
  return ctrl.signal;
}
function fetchWithTimeout(url,opts={},ms=6000){return fetch(url,{...opts,signal:opts.signal||timeoutSignal(ms)});}
function firstFulfilled(promises){
  if(Promise.any)return Promise.any(promises);
  return new Promise((resolve,reject)=>{
    let left=promises.length;
    const errors=[];
    if(!left){reject(new Error('No promises'));return;}
    promises.forEach((p,i)=>Promise.resolve(p).then(resolve,err=>{
      errors[i]=err;
      if(--left===0)reject(new Error('All promises rejected'));
    }));
  });
}
function lsSave(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){if(e?.name==='QuotaExceededError')toast('Depolama dolu!','warn');else toast('Kayıt hatası','err');}}
function lsLoad(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d;}catch{return d;}}
function g(id){return document.getElementById(id);}
function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};}
/* Türkçe toleranslı arama: şapkalı harf, ı/i, büyük/küçük, boşluk/noktalama normalize */
function trNormalize(s){
  if(s==null)return'';
  let x=String(s).toLocaleLowerCase('tr-TR');
  const map={'ı':'i','İ':'i','ş':'s','Ş':'s','ğ':'g','Ğ':'g','ü':'u','Ü':'u','ö':'o','Ö':'o','ç':'c','Ç':'c','â':'a','Â':'a','î':'i','Î':'i','û':'u','Û':'u','ô':'o','Ô':'o','ê':'e','Ê':'e'};
  x=x.replace(/[ıİşŞğĞüÜöÖçÇâÂîÎûÛôÔêÊ]/g,c=>map[c]||c);
  try{x=x.normalize('NFD').replace(/[\u0300-\u036f]/g,'');}catch{}
  return x.replace(/[^\p{L}\p{N}]+/gu,'').trim();
}

/* ── TOAST v2 ── */
let _toastT=null;
function toast(msg,type){
  const el=g('tst');el.textContent=msg;
  el.className='tst s'+(type==='ok'?' t-ok':type==='err'?' t-err':type==='warn'?' t-warn':'');
  clearTimeout(_toastT);_toastT=setTimeout(()=>el.classList.remove('s'),2600);
}
let _activeDialog=null,_prevFocus=null;
function setDialogOpen(id,open){
  const ov=g(id);if(!ov)return;
  const box=ov.querySelector('[tabindex="-1"],.modal-c,.cfm-box,.ios-box');
  if(open){
    _prevFocus=document.activeElement;
    ov.classList.add('s');_activeDialog=ov;
    setTimeout(()=>{const first=ov.querySelector('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');(first||box||ov).focus?.();},30);
  }else{
    ov.classList.remove('s');
    if(_activeDialog===ov)_activeDialog=null;
    if(_prevFocus&&document.contains(_prevFocus))setTimeout(()=>_prevFocus.focus?.(),30);
    _prevFocus=null;
  }
}
function trapDialogFocus(e){
  if(!_activeDialog||e.key!=='Tab')return false;
  const focusables=[..._activeDialog.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(x=>!x.disabled&&x.offsetParent!==null);
  if(!focusables.length)return false;
  const first=focusables[0],last=focusables[focusables.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();return true;}
  if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();return true;}
  return false;
}
function relTime(ts){const m=Math.floor((Date.now()-ts)/60000);if(m<1)return'Az önce';if(m<60)return m+'dk';const h=Math.floor(m/60);if(h<24)return h+'sa';return Math.floor(h/24)+'g';}
function darken(h){try{return`rgb(${Math.max(0,parseInt(h.slice(1,3),16)-50)},${Math.max(0,parseInt(h.slice(3,5),16)-30)},${Math.min(255,parseInt(h.slice(5,7),16)+40)})`;}catch{return'#4a3ab5';}}

/* ── RIPPLE EFFECT ── */
function addRipple(e,el){
  const r=document.createElement('span');r.className='ripple';
  const rect=el.getBoundingClientRect();
  const size=Math.max(rect.width,rect.height)*2;
  r.style.cssText=`width:${size}px;height:${size}px;left:${e.clientX-rect.left-size/2}px;top:${e.clientY-rect.top-size/2}px;`;
  el.appendChild(r);setTimeout(()=>r.remove(),500);
}

/* ── CONFIRM ── */
let _cfmRes=null;
function confirm2(title,msg,okLbl='Sil'){
  return new Promise(resolve=>{
    _cfmRes=resolve;g('cfmTitle').textContent=title;g('cfmMsg').textContent=msg;g('cfmYes').textContent=okLbl;setDialogOpen('cfmOv',true);
  });
}
function _cfmClose(val){setDialogOpen('cfmOv',false);if(_cfmRes){_cfmRes(val);_cfmRes=null;}}

/* ── DATA ── */
let ch=[],fv=[],rc=[];
let _filterGenre='Tümü',_searchQ='',_sortMode='default',_shuffle=false;

function dataLoad(){
  const rCh=lsLoad(LS.CH,[]),rFv=lsLoad(LS.FV,[]),rRc=lsLoad(LS.RC,[]);
  ch=Array.isArray(rCh)?rCh.filter(x=>x&&typeof x==='object'&&typeof x.id==='string'&&x.id&&typeof x.n==='string'&&x.n.trim()&&typeof x.u==='string'&&isUrl(x.u)).map(x=>({id:x.id,n:String(x.n).slice(0,MAX_N),g:typeof x.g==='string'?x.g.slice(0,MAX_G):'Diğer',u:x.u,e:typeof x.e==='string'?x.e.slice(0,4):'📻',c:typeof x.c==='string'&&/^#[0-9a-f]{6}$/i.test(x.c)?x.c:COLORS[0],img:typeof x.img==='string'&&isUrl(x.img)?x.img:'',br:typeof x.br==='number'?x.br:0})):[];
  const ids=new Set(ch.map(x=>x.id));
  fv=Array.isArray(rFv)?[...new Set(rFv.filter(f=>typeof f==='string'&&ids.has(f)))]:[];
  const seen=new Set();
  rc=Array.isArray(rRc)?rRc.filter(r=>r&&typeof r==='object'&&typeof r.id==='string'&&ids.has(r.id)&&typeof r.t==='number'&&!seen.has(r.id)&&seen.add(r.id)).slice(0,MAX_H):[];
}
function dataSave(){const ids=new Set(ch.map(x=>x.id));fv=fv.filter(f=>ids.has(f));rc=rc.filter(r=>ids.has(r.id));lsSave(LS.CH,ch);lsSave(LS.FV,fv);lsSave(LS.RC,rc);}
function backupData(){return{version:APP_VERSION,exportedAt:new Date().toISOString(),ch,fv,rc};}

function getFiltered(list){
  let out=list;
  if(_filterGenre!=='Tümü') out=out.filter(x=>(x.g||'Diğer')===_filterGenre);
  if(_searchQ){
    const q=trNormalize(_searchQ);
    if(q)out=out.filter(x=>trNormalize(x.n).includes(q)||trNormalize(x.g||'').includes(q));
  }
  if(_sortMode==='az') out=[...out].sort((a,b)=>a.n.localeCompare(b.n,'tr'));
  else if(_sortMode==='za') out=[...out].sort((a,b)=>b.n.localeCompare(a.n,'tr'));
  return out;
}

/* ═══ DATA SAVER + DATA USAGE ═══ */
const DS={enabled:false,warnedThisSession:false};
const DU={
  _tickT:null,_lastTick:0,_monthKey(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');},
  load(){const raw=lsLoad(LS.DU,null);if(!raw||typeof raw!=='object'||raw.month!==this._monthKey())return{month:this._monthKey(),bytes:0};return{month:raw.month,bytes:typeof raw.bytes==='number'?raw.bytes:0};},
  save(o){lsSave(LS.DU,o);},
  add(bytes){const o=this.load();o.bytes+=bytes;this.save(o);this.render();},
  startTick(){
    if(this._tickT)return;
    this._lastTick=Date.now();
    this._tickT=setInterval(()=>{
      if(!S.cur||!S.playing){this.stopTick();return;}
      const now=Date.now();const dt=(now-this._lastTick)/1000;this._lastTick=now;
      const br=(S.cur.br&&S.cur.br>0)?S.cur.br:96; // varsayılan 96 kbps tahmin
      const bytes=Math.round(dt*br*125); // kbps / 8 * 1000
      this.add(bytes);
    },5000);
  },
  stopTick(){if(this._tickT){clearInterval(this._tickT);this._tickT=null;}},
  reset(){this.save({month:this._monthKey(),bytes:0});this.render();toast('Veri sayacı sıfırlandı','ok');},
  format(bytes){
    if(bytes<1024)return bytes+' B';
    if(bytes<1024*1024)return(bytes/1024).toFixed(1)+' KB';
    if(bytes<1024*1024*1024)return(bytes/1024/1024).toFixed(1)+' MB';
    return(bytes/1024/1024/1024).toFixed(2)+' GB';
  },
  render(){
    const el=g('dataUsageTxt');if(!el)return;
    const o=this.load();
    const [y,m]=o.month.split('-');
    const names=['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
    el.textContent=`${names[parseInt(m,10)-1]} ${y}: ${this.format(o.bytes)} (tahmini)`;
  }
};
function isCellular(){
  const c=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  if(!c)return false;
  if(c.saveData)return true;
  const t=(c.type||'').toLowerCase();
  if(t==='cellular')return true;
  const et=(c.effectiveType||'').toLowerCase();
  return et==='2g'||et==='slow-2g'||et==='3g';
}
function dsWarnMaybe(station){
  if(!DS.enabled||!station)return;
  if(DS.warnedThisSession)return;
  const br=station.br||0;
  const cell=isCellular();
  if(cell&&br>96){
    toast(`📶 Ekonomi modu: ${br}kbps yayın, mobil veri hızlı biter`,'warn');
    DS.warnedThisSession=true;
  }else if(cell){
    DS.warnedThisSession=true;
  }
}
function loadDS(){DS.enabled=!!lsLoad(LS.DS,false);g('dsPill').style.display=DS.enabled?'inline-flex':'none';g('swDataSaver').checked=DS.enabled;}
function saveDS(){lsSave(LS.DS,DS.enabled);g('dsPill').style.display=DS.enabled?'inline-flex':'none';}

/* ═══ CLOUD / ANONYMOUS BACKUP ═══ */
function loadSyncCfg(){
  const cfg=lsLoad(LS.SYNC,{endpoint:''});
  return cfg&&typeof cfg==='object'?{endpoint:typeof cfg.endpoint==='string'?cfg.endpoint:''}:{endpoint:''};
}
function saveSyncCfg(cfg){lsSave(LS.SYNC,{endpoint:cfg.endpoint||''});renderSyncStatus();}
function renderSyncStatus(){
  const el=g('syncStatusTxt');if(!el)return;
  const ep=loadSyncCfg().endpoint;
  if(!ep){el.textContent='Endpoint ayarlı değil';return;}
  try{el.textContent='Endpoint: '+new URL(ep).host;}catch{el.textContent='Endpoint ayarlı';}
}
function validateSyncEndpoint(url){
  try{
    const u=new URL(url);
    return u.protocol==='https:'||(u.protocol==='http:'&&/^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname));
  }catch{return false;}
}
function askSyncEndpoint(){
  const current=loadSyncCfg().endpoint;
  const next=prompt('HTTPS sync endpoint URL girin. POST yedekler, GET geri yükler.',current);
  if(next===null)return null;
  const clean=next.trim();
  if(!clean){saveSyncCfg({endpoint:''});toast('Sync endpoint temizlendi');return null;}
  if(!validateSyncEndpoint(clean)){toast('Endpoint HTTPS olmalı veya localhost olmalı','err');return null;}
  saveSyncCfg({endpoint:clean});toast('Sync endpoint kaydedildi','ok');return clean;
}
function getSyncEndpoint(){const ep=loadSyncCfg().endpoint;return ep||askSyncEndpoint();}
async function doCloudBackup(){
  const storage=window.TurkRadyoStorage;
  if(!storage){toast('Yedek modülü yüklenemedi','err');return;}
  const token=storage.encodeBackup(backupData());
  const link=location.origin+location.pathname+'#backup='+encodeURIComponent(token);
  if(link.length>60000){toast('Yedek link için büyük; JSON dosyası indiriliyor','warn');doExport();return;}
  if(navigator.share){
    try{await navigator.share({title:'TürkRadyo yedeği',text:'TürkRadyo anonim yedek linki',url:link});toast('Yedek linki paylaşıldı','ok');return;}catch{}
  }
  try{
    const copied=await storage.copyText(link);
    if(copied){toast('Yedek linki kopyalandı','ok');return;}
  }catch{}
  prompt('Yedek linki:',link);
}
async function doCloudRestore(input){
  const storage=window.TurkRadyoStorage;
  if(!storage){toast('Yedek modülü yüklenemedi','err');return;}
  const raw=input||prompt('Anonim yedek linki veya kodu yapıştırın:','');
  if(!raw)return;
  try{
    const d=storage.decodeBackup(raw);
    const ok=await confirm2('Yedeği geri yükle','Linkteki kanallar mevcut listeye eklenecek; aynı URL’ler eşlenecek.','Yükle');
    if(!ok)return;
    const res=importData(d);
    toast(res.mapped?`${res.added} yeni, ${res.mapped} mevcut kanal eşlendi`:`${res.added} kanal yüklendi`,'ok');
    if(location.hash.includes('backup='))history.replaceState(null,'',location.pathname+location.search);
  }catch{toast('Yedek linki okunamadı','err');}
}
async function syncPush(){
  const ep=getSyncEndpoint();if(!ep)return;
  const ok=await confirm2('Buluta yedekle','Kanal, favori ve geçmiş yedeği ayarlı endpoint’e JSON olarak gönderilecek.','Gönder');
  if(!ok)return;
  try{
    const r=await fetchWithTimeout(ep,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(backupData()),cache:'no-store'},15000);
    if(!r.ok)throw new Error(r.status);
    toast('Bulut yedeği gönderildi','ok');
  }catch{toast('Bulut yedeği gönderilemedi','err');}
}
async function syncPull(){
  const ep=getSyncEndpoint();if(!ep)return;
  const ok=await confirm2('Buluttan geri yükle','Endpoint’ten gelen yedek mevcut listeye eklenecek; aynı URL’ler eşlenecek.','Yükle');
  if(!ok)return;
  try{
    const r=await fetchWithTimeout(ep,{cache:'no-store'},15000);
    if(!r.ok)throw new Error(r.status);
    const res=importData(await r.json());
    toast(res.mapped?`${res.added} yeni, ${res.mapped} mevcut kanal eşlendi`:`${res.added} kanal yüklendi`,'ok');
  }catch{toast('Bulut yedeği alınamadı','err');}
}
function maybeRestoreHashBackup(){if(location.hash.includes('backup='))setTimeout(()=>doCloudRestore(location.href),800);}

/* ═══ NOW PLAYING (Icecast/Shoutcast metadata best-effort) ═══ */
const NP={
  _timer:null,_curId:null,_curTitle:'',_cooldown:new Map(),
  _parseIcecast(d,streamUrl){
    try{
      const src=d?.icestats?.source;
      const list=Array.isArray(src)?src:src?[src]:[];
      if(!list.length)return null;
      let best=null;
      try{
        const u=new URL(streamUrl);
        best=list.find(s=>{
          const lu=s?.listenurl||'';
          if(!lu)return false;
          try{return new URL(lu).pathname===u.pathname;}catch{return lu.endsWith(u.pathname);}
        });
      }catch{}
      const src1=best||list[0];
      return (src1?.title||src1?.yp_currently_playing||'').trim()||null;
    }catch{return null;}
  },
  _parseShoutcast7(txt){
    try{
      const m=txt.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if(!m)return null;
      const parts=m[1].split(',');
      if(parts.length>=7)return parts.slice(6).join(',').trim()||null;
    }catch{}
    return null;
  },
  async _fetchFor(stream){
    const now=Date.now();
    const cd=this._cooldown.get(stream)||0;
    if(cd>now)return null;
    let origin,path;
    try{const u=new URL(stream);origin=u.origin;path=u.pathname;}catch{return null;}
    const originKey='origin:'+origin;
    const originCd=this._cooldown.get(originKey)||0;
    if(originCd>now)return null;
    const fetchNP=url=>fetchWithTimeout(url,{cache:'no-store'},3500);
    // 1) Icecast status-json
    try{
      const r=await fetchNP(origin+'/status-json.xsl');
      if(r.ok){const d=await r.json();const t=this._parseIcecast(d,stream);if(t)return t;}
    }catch{}
    // 2) Shoutcast v2 stats
    try{
      const r=await fetchNP(origin+'/stats?json=1');
      if(r.ok){const d=await r.json();const t=(d?.songtitle||'').trim();if(t)return t;}
    }catch{}
    // 3) Shoutcast v1 7.html
    try{
      const r=await fetchNP(origin+'/7.html');
      if(r.ok){const t=this._parseShoutcast7(await r.text());if(t)return t;}
    }catch{}
    // 4) Icecast v2 nometadata JSON at path /status.json
    try{
      const r=await fetchNP(origin+path.replace(/\/?$/,'')+'.json');
      if(r.ok){const d=await r.json();const t=(d?.title||d?.now_playing||d?.song||'').trim();if(t)return t;}
    }catch{}
    // All failed — cooldown 10 min to avoid CORS spam
    this._cooldown.set(stream,now+10*60*1000);
    this._cooldown.set(originKey,now+10*60*1000);
    return null;
  },
  _setTitle(t){
    const clean=(t||'').replace(/\s+/g,' ').trim();
    this._curTitle=clean;
    const np=g('npPill'),npTxt=g('npTxt'),mNow=g('mNow'),mName=g('mName'),carNp=g('carNp');
    if(clean){
      npTxt.textContent=clean;np.classList.add('s');
      mNow.textContent=clean;mNow.classList.add('s');
      mName?.classList.add('has-np');
      if(carNp)carNp.textContent=clean;
      if('mediaSession' in navigator&&navigator.mediaSession.metadata&&S.cur){
        try{navigator.mediaSession.metadata=new MediaMetadata({
          title:clean,
          artist:S.cur.n,
          album:'TürkRadyo',
          artwork:navigator.mediaSession.metadata.artwork||[]
        });}catch{}
      }
    }else{
      np.classList.remove('s');mNow.classList.remove('s');mName?.classList.remove('has-np');
      if(carNp)carNp.textContent='';
    }
  },
  stop(){clearInterval(this._timer);this._timer=null;this._curId=null;this._setTitle('');},
  start(station){
    this.stop();
    if(!station)return;
    this._curId=station.id;
    const run=async()=>{
      if(!S.cur||S.cur.id!==this._curId)return;
      const t=await this._fetchFor(station.u);
      if(S.cur&&S.cur.id===this._curId&&t&&t!==this._curTitle)this._setTitle(t);
    };
    run();
    this._timer=setInterval(run,20000);
  }
};

/* ═══ INTERRUPT MANAGER v3 ═══ */
const IM={
  opts:{call:true,notif:true,resumeDelay:800,notifVol:20},
  _baseVol:0.8,_curVol:0.8,_type:null,_interrupted:false,_resumeTimer:null,_fadeTimer:null,_notifAutoTimer:null,_uStop:false,_actx:null,_actxState:null,

  _showBanner(type,extraTxt){
    const el=g('itr');el.className='itr';
    const map={call:{cls:'type-call',txt:'📞 Telefon araması'},notif:{cls:'type-notif',txt:'🔔 Bildirim'},resume:{cls:'type-resume',txt:'▶ Devam ediliyor...'}};
    const info=map[type]||map.resume;el.classList.add(info.cls);g('itrTxt').textContent=info.txt+(extraTxt?' '+extraTxt:'');g('itrVol').textContent='';el.classList.add('s');
  },
  _hideBanner(){const el=g('itr');el.classList.remove('s');setTimeout(()=>{el.className='itr';},500);},

  _clearTimers(){clearTimeout(this._resumeTimer);clearTimeout(this._notifAutoTimer);clearInterval(this._fadeTimer);},

  _fadeOut(targetVol,durationMs){
    clearInterval(this._fadeTimer);const steps=20,stepMs=durationMs/steps,delta=(this._curVol-targetVol)/steps;
    if(delta<=0){this._setVol(targetVol);return;}
    this._fadeTimer=setInterval(()=>{this._curVol=Math.max(targetVol,this._curVol-delta);if(aud&&!aud.paused)aud.volume=this._curVol;if(this._curVol<=targetVol+0.001){clearInterval(this._fadeTimer);this._curVol=targetVol;if(aud&&!aud.paused)aud.volume=targetVol;}},stepMs);
  },
  _fadeIn(fromVol,durationMs,cb){
    clearInterval(this._fadeTimer);if(aud)aud.volume=fromVol;this._curVol=fromVol;
    const steps=24,stepMs=durationMs/steps,target=this._baseVol,delta=(target-fromVol)/steps;
    if(delta<=0){this._setVol(target);if(cb)cb();return;}
    this._fadeTimer=setInterval(()=>{this._curVol=Math.min(target,this._curVol+delta);if(aud)aud.volume=this._curVol;if(this._curVol>=target-0.001){clearInterval(this._fadeTimer);this._curVol=target;if(aud)aud.volume=target;if(cb)cb();}},stepMs);
  },
  _setVol(v){this._curVol=v;if(aud&&!aud.paused)aud.volume=v;},
  setBaseVol(v){this._baseVol=v;if(!this._interrupted)this._curVol=v;},

  /* ── Bildirim: sesi kıs, durma ── */
  interruptNotif(){
    if(this._uStop||!S.cur||!S.playing)return;
    if(this._interrupted&&this._type==='call')return;
    if(!this.opts.notif){return;}
    this._clearTimers();
    this._interrupted=true;this._type='notif';
    const tv=this.opts.notifVol/100;
    this._fadeOut(tv,150);
    this._showBanner('notif',`(${this.opts.notifVol}%)`);
    g('itrVol').textContent=`🔉 ${this.opts.notifVol}%`;
    this._notifAutoTimer=setTimeout(()=>{if(this._interrupted&&this._type==='notif')this.resumeFromNotif();},6000);
  },
  resumeFromNotif(){
    if(!this._interrupted||this._type!=='notif')return;
    this._clearTimers();
    this._interrupted=false;this._type=null;
    if(!S.cur||this._uStop){this._hideBanner();return;}
    this._showBanner('resume');
    if(aud&&!aud.paused){
      this._fadeIn(this._curVol,500,()=>this._hideBanner());
    }else if(S.should){
      this._reload(()=>{this._fadeIn(0.05,600,()=>this._hideBanner());});
    }else{this._hideBanner();}
  },

  /* ── Arama: sesi durdur ── */
  interruptCall(){
    if(this._uStop||!S.cur||(!S.playing&&!S.should))return;
    if(!this.opts.call){return;}
    this._clearTimers();
    this._interrupted=true;this._type='call';
    this._fadeOut(0,200);
    setTimeout(()=>{
      if(this._type==='call'&&aud&&!aud.paused){aud.pause();}
    },250);
    this._showBanner('call');
  },
  resumeFromCall(){
    if(!this._interrupted||this._type!=='call')return;
    this._clearTimers();
    if(!S.cur||this._uStop){this._interrupted=false;this._type=null;this._hideBanner();return;}
    this._showBanner('resume');
    this._resumeTimer=setTimeout(()=>{
      if(!S.cur||this._uStop){this._interrupted=false;this._type=null;this._hideBanner();return;}
      this._interrupted=false;this._type=null;
      S.should=true;
      this._reload(()=>{this._fadeIn(0.05,800,()=>this._hideBanner());});
    },this.opts.resumeDelay);
  },

  resume(){
    if(!this._interrupted)return;
    if(this._type==='call')this.resumeFromCall();
    else if(this._type==='notif')this.resumeFromNotif();
    else{this._interrupted=false;this._type=null;this._hideBanner();}
  },

  _reload(cb){
    if(!S.cur)return;
    if(this._actx&&this._actx.state==='suspended'){try{this._actx.resume().catch(()=>{});}catch(e){}}
    aud.volume=0.01;aud.src=S.cur.u;aud.load();
    const attempt=(n)=>{
      if(!S.cur||this._uStop)return;
      aud.play().then(()=>{setPlaying(true);S.retries=0;setStatus('live');renderCards();IOS._startRecovery();if(cb)cb();}).catch(()=>{
        if(n<3){setTimeout(()=>{if(S.cur&&S.should&&!this._uStop){aud.src=S.cur.u;aud.load();aud.volume=0.01;attempt(n+1);}},1000*(n+1));}
        else{setStatus('retry');toast('Bağlantı yeniden deneniyor...','warn');if(cb)cb();}
      });
    };
    attempt(0);
  },
  initAudioContext(){
    try{this._actx=new(window.AudioContext||window.webkitAudioContext)();
    this._actx.addEventListener('statechange',()=>{
      const st=this._actx.state;
      if(st==='interrupted'){
        this._actxState='interrupted';
        this.interruptCall();
      }
      else if(st==='suspended'&&this._actxState!=='suspended'){
        this._actxState='suspended';
        if(!document.hidden&&!this._interrupted)this.interruptNotif();
      }
      else if(st==='running'&&this._actxState){
        const prev=this._actxState;
        this._actxState=null;
        if(this._interrupted){
          if(prev==='interrupted'||this._type==='call')this.resumeFromCall();
          else this.resumeFromNotif();
        }
      }
    });}catch(e){}
  },
  resumeAudioContext(){
    if(this._actx&&this._actx.state!=='running'){try{this._actx.resume().catch(()=>{});}catch(e){}}
  },
  setUStop(v){this._uStop=v;if(v){this._clearTimers();this._interrupted=false;this._type=null;this._hideBanner();}},
  init(a){
    this.aud=a;
    a.addEventListener('webkitInterruptBegin',()=>{if(!this._uStop&&(S.playing||S.should))this.interruptCall();});
    a.addEventListener('webkitInterruptEnd',()=>{if(this._interrupted&&this._type==='call')this.resumeFromCall();});
    this.initAudioContext();
  }
};

/* ── iOS RECOVERY ── */
const IOS={
  _rt:null,_rel:false,_recoveryTimer:null,
  init(a){
    this.a=a;
    a.addEventListener('stalled',()=>{
      if(!S.cur||!S.should||IM._uStop||IM._interrupted)return;
      setTimeout(()=>{if(S.cur&&S.should&&(a.paused||a.readyState<2)&&!IM._interrupted&&!IM._uStop)this.reload();},4000);
    });
    a.addEventListener('ended',()=>{if(S.cur&&S.should&&!IM._uStop)this.reload();});
    window.addEventListener('pageshow',e=>{if(e.persisted){IM.resumeAudioContext();if(S.cur&&S.should&&a.paused&&!IM._uStop&&!IM._interrupted)this.resume(600);}});
    document.addEventListener('visibilitychange',()=>{
      if(!document.hidden){
        IM.resumeAudioContext();
        // Ekran açıldığında: interrupt varsa resume, yoksa durmuşsa tekrar başlat
        if(IM._interrupted)IM.resume();
        else if(S.cur&&S.should&&a.paused&&!IM._uStop)this.resume(800);
        this._startRecovery();
        if(S.cur&&S.playing&&'mediaSession' in navigator)updateMeta(S.cur);
      }else{
        this._stopRecovery();
      }
    });
    window.addEventListener('focus',()=>{
      IM.resumeAudioContext();
      if(IM._interrupted)IM.resume();
      else if(S.cur&&S.should&&a.paused&&!IM._uStop)this.resume(600);
    });
    if(navigator.mediaDevices?.addEventListener)navigator.mediaDevices.addEventListener('devicechange',()=>{if(S.cur&&S.should&&a.paused&&!IM._uStop&&!IM._interrupted)this.resume(1200);});
  },
  _startRecovery(){if(this._recoveryTimer)return;this._recoveryTimer=setInterval(()=>{if(S.cur&&S.should&&this.a.paused&&!IM._uStop&&!IM._interrupted&&!this._rel)this.resume(0);},12000);},
  _stopRecovery(){if(this._recoveryTimer){clearInterval(this._recoveryTimer);this._recoveryTimer=null;}},
  resume(delay){clearTimeout(this._rt);this._rt=setTimeout(()=>{if(!S.cur||IM._uStop||!S.should||IM._interrupted)return;aud.volume=IM._baseVol;aud.play().then(()=>{setPlaying(true);S.retries=0;setStatus('live');IM._hideBanner();renderCards();}).catch(()=>this.reload());},Math.max(0,delay));},
  reload(){if(!S.cur||this._rel||IM._uStop)return;this._rel=true;aud.src=S.cur.u;aud.load();aud.volume=IM._baseVol;aud.play().then(()=>{setPlaying(true);S.retries=0;this._rel=false;setStatus('live');renderCards();}).catch(()=>{this._rel=false;});}
};

/* ── MEDIA SESSION ──
   BT kulaklık/kilit ekranı kontrolleri. Double-tap (nexttrack) = sonraki favori,
   previoustrack = önceki favori. Favori yoksa tüm kanallar arasında gezer. */
function msNext(){
  const favStations=ch.filter(x=>fv.includes(x.id));
  if(favStations.length>=2&&S.cur&&fv.includes(S.cur.id)){
    const i=favStations.findIndex(x=>x.id===S.cur.id);
    const next=favStations[(i+1)%favStations.length];play(next.id);return;
  }
  nextSt();
}
function msPrev(){
  const favStations=ch.filter(x=>fv.includes(x.id));
  if(favStations.length>=2&&S.cur&&fv.includes(S.cur.id)){
    const i=favStations.findIndex(x=>x.id===S.cur.id);
    const prev=favStations[(i-1+favStations.length)%favStations.length];play(prev.id);return;
  }
  prevSt();
}
function setupMS(){
  if(!('mediaSession' in navigator))return;
  const set=(a,h)=>{try{navigator.mediaSession.setActionHandler(a,h);}catch{}};
  set('play',()=>{if(S.cur){IM.setUStop(false);S.should=true;aud.play().catch(()=>IOS.reload());navigator.mediaSession.playbackState='playing';}});
  set('pause',()=>{if(S.cur){userPause();navigator.mediaSession.playbackState='paused';}});
  set('previoustrack',msPrev);
  set('nexttrack',msNext);
  set('stop',()=>{if(S.cur){userPause();navigator.mediaSession.playbackState='none';}});
  // Canlı yayında seek bar gözükmesin
  set('seekto',null);set('seekbackward',null);set('seekforward',null);
}
let _metaArtCache=new Map();
function _makeArtwork(s){
  const cacheKey=s.id+'_'+s.c+'_'+s.e+'_'+s.n;
  if(_metaArtCache.has(cacheKey))return _metaArtCache.get(cacheKey);
  try{
    const sz=512,cvs=document.createElement('canvas');cvs.width=sz;cvs.height=sz;
    const ctx=cvs.getContext('2d');
    // Gradient background
    const grd=ctx.createLinearGradient(0,0,sz,sz);
    grd.addColorStop(0,s.c||'#7c6cf0');grd.addColorStop(1,darken(s.c||'#7c6cf0'));
    ctx.fillStyle=grd;ctx.beginPath();if(ctx.roundRect){ctx.roundRect(0,0,sz,sz,64);}else{ctx.rect(0,0,sz,sz);}ctx.fill();
    // Subtle inner glow
    const igrd=ctx.createRadialGradient(sz/2,sz*0.38,0,sz/2,sz*0.38,sz*0.45);
    igrd.addColorStop(0,'rgba(255,255,255,0.08)');igrd.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=igrd;ctx.fillRect(0,0,sz,sz);
    // Emoji icon - compact size
    ctx.font='120px serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(s.e,sz/2,sz*0.38);
    // Station name
    ctx.fillStyle='rgba(255,255,255,0.95)';
    ctx.font='bold 36px -apple-system,system-ui,sans-serif';
    const name=s.n.length>18?s.n.slice(0,17)+'…':s.n;
    ctx.fillText(name,sz/2,sz*0.62);
    // Genre subtitle
    ctx.fillStyle='rgba(255,255,255,0.5)';
    ctx.font='24px -apple-system,system-ui,sans-serif';
    ctx.fillText(s.g||'Radyo',sz/2,sz*0.72);
    // Thin bottom accent line
    ctx.strokeStyle='rgba(255,255,255,0.12)';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(sz*0.25,sz*0.80);ctx.lineTo(sz*0.75,sz*0.80);ctx.stroke();
    const dataUrl=cvs.toDataURL('image/png');
    _metaArtCache.set(cacheKey,dataUrl);
    if(_metaArtCache.size>20){const first=_metaArtCache.keys().next().value;_metaArtCache.delete(first);}
    return dataUrl;
  }catch{return null;}
}
function updateMeta(s){
  if(!('mediaSession' in navigator))return;
  const artwork=[];
  if(s.img){
    // Station logo - primary artwork for lock screen
    artwork.push({src:s.img,sizes:'96x96',type:'image/png'});
    artwork.push({src:s.img,sizes:'192x192',type:'image/png'});
    artwork.push({src:s.img,sizes:'512x512',type:'image/png'});
  }
  // Canvas fallback with station branding
  const fallback=_makeArtwork(s);
  if(fallback&&!s.img)artwork.push({src:fallback,sizes:'512x512',type:'image/png'});
  try{
    navigator.mediaSession.metadata=new MediaMetadata({
      title:s.n,
      artist:(s.g&&s.g!=='Diğer')?s.g:'Canlı Radyo',
      album:'TürkRadyo',
      artwork
    });
  }catch{}
  navigator.mediaSession.playbackState='playing';
  // Canlı yayın - seek bar gösterme
  try{navigator.mediaSession.setPositionState({duration:0,position:0,playbackRate:1});}catch{}
}

/* ── PLAY STATE ── */
const S={cur:null,playing:false,should:false,retries:0};
const aud=g('aud');
const _httpWarned=new Set();
function warnHttpStream(s){
  if(!s||!isHttpUrl(s.u)||_httpWarned.has(s.id))return;
  _httpWarned.add(s.id);
  toast(location.protocol==='https:'?'HTTP yayın tarayıcı tarafından HTTPS altında engellenebilir':'HTTP yayın güvenli değildir','warn');
}

function setPlaying(v){
  S.playing=v;S.should=v;updatePlayUI();
  if('mediaSession' in navigator)navigator.mediaSession.playbackState=v?'playing':'paused';
  g('ambient').classList.toggle('playing',v);
  g('mplay').classList.toggle('playing',v);
  g('fplay').classList.toggle('playing',v);
  if(v)DU.startTick();else DU.stopTick();
  updateCarNow();
}
function updatePlayUI(){const ic=S.playing?'⏸':'▶';g('btnPP').textContent=ic;g('btnFpPlay').textContent=ic;g('fpVis').classList.toggle('paused',!S.playing);}
function setStatus(t){
  const el=g('mStat');
  if(t==='live')el.innerHTML='<span class="cdot"></span>Canlı Yayın';
  else if(t==='conn')el.innerHTML='<span class="cdot" style="background:orange;box-shadow:0 0 6px rgba(255,165,0,.5)"></span>Bağlanıyor...';
  else if(t==='load')el.innerHTML='<span class="cdot" style="background:orange;box-shadow:0 0 6px rgba(255,165,0,.5)"></span>Yükleniyor...';
  else if(t==='retry')el.innerHTML='<span class="cdot" style="background:orange;box-shadow:0 0 6px rgba(255,165,0,.5)"></span>Yeniden bağlanıyor...';
}

/* ── PLAY ── */
function play(id){
  const s=ch.find(x=>x.id===id);if(!s)return;
  warnHttpStream(s);
  S.cur=s;S.retries=0;S.should=true;IM.setUStop(false);
  g('mplay').classList.add('s');g('scr').classList.add('mp-on');
  // Mini player icon
  const mIco=g('mIco');mIco.innerHTML='';mIco.style.background=s.c||'var(--ac)';
  if(s.img){const mi=document.createElement('img');mi.src=s.img;mi.alt='';mi.loading='lazy';mi.onerror=function(){this.replaceWith(document.createTextNode(s.e));};mIco.appendChild(mi);}
  else{mIco.textContent=s.e;}
  g('mName').textContent=s.n;
  // Full player art
  const fpArt=g('fpArt');fpArt.innerHTML='';fpArt.style.background=`linear-gradient(135deg,${s.c||'var(--ac)'},${darken(s.c||'#7c6cf0')})`;
  if(s.img){const fi=document.createElement('img');fi.src=s.img;fi.alt='';fi.onerror=function(){this.replaceWith(document.createTextNode(s.e));};fpArt.appendChild(fi);}
  else{fpArt.textContent=s.e;}
  g('fpOrb1').style.background=s.c||'var(--ac)';
  g('fpOrb2').style.background=darken(s.c||'#7c6cf0');
  g('fpName').textContent=s.n;g('fpGenre').textContent=s.g||'Radyo';
  // Bitrate
  if(s.br>0){g('fpBitrate').textContent=`${s.br} kbps`;g('fpBitrate').style.display='';}else{g('fpBitrate').style.display='none';}
  setStatus('conn');updateFavBtn();addHist(s);updateMeta(s);NP.start(s);updateCarNow();dsWarnMaybe(s);
  aud.src=s.u;aud.load();aud.volume=IM._baseVol;
  aud.play().then(()=>setPlaying(true)).catch(()=>setTimeout(()=>{if(S.cur?.id===id&&S.should)aud.play().then(()=>setPlaying(true)).catch(()=>setTimeout(()=>{if(S.cur?.id===id&&S.should){aud.src=s.u;aud.load();aud.volume=IM._baseVol;aud.play().then(()=>setPlaying(true)).catch(()=>{toast('Yanıt yok','err');S.should=false;S.playing=false;updatePlayUI();});}},2000));},1500));
  renderCards();
}
function togglePlay(){if(!S.cur)return;S.playing?userPause():userResume();}
function userPause(){IM.setUStop(true);S.should=false;aud.pause();S.playing=false;updatePlayUI();g('ambient').classList.remove('playing');g('mplay').classList.remove('playing');g('fplay').classList.remove('playing');IOS._stopRecovery();DU.stopTick();NP.stop();}
function userResume(){IM.setUStop(false);S.should=true;if(IM._actx&&IM._actx.state==='suspended'){try{IM._actx.resume().catch(()=>{});}catch(e){}}aud.play().then(()=>{IOS._startRecovery();}).catch(()=>{if(!S.cur)return;aud.src=S.cur.u;aud.load();aud.volume=IM._baseVol;aud.play().then(()=>{IOS._startRecovery();}).catch(()=>toast('Tekrar deneyin','warn'));});}
function prevSt(){
  if(!S.cur||ch.length<2)return;
  if(_shuffle){shufflePlay();return;}
  const i=ch.findIndex(x=>x.id===S.cur.id);play((i>0?ch[i-1]:ch[ch.length-1]).id);
}
function nextSt(){
  if(!S.cur||ch.length<2)return;
  if(_shuffle){shufflePlay();return;}
  const i=ch.findIndex(x=>x.id===S.cur.id);play((i<ch.length-1?ch[i+1]:ch[0]).id);
}
function shufflePlay(){
  if(ch.length<2)return;
  let idx;do{idx=Math.floor(Math.random()*ch.length);}while(ch[idx].id===S.cur?.id&&ch.length>1);
  play(ch[idx].id);
}
function toggleShuffle(){
  _shuffle=!_shuffle;
  g('btnFpShuffle').classList.toggle('shuffle-on',_shuffle);
  toast(_shuffle?'🔀 Karışık mod açık':'🔀 Karışık mod kapalı');
}
function setVol(v){const vol=v/100;aud.volume=vol;IM.setBaseVol(vol);g('volM').value=v;g('volF').value=v;}
function syncSliders(){const v=Math.round(IM._baseVol*100);g('volM').value=v;g('volF').value=v;}

/* ── SHARE ── */
function shareStation(){
  if(!S.cur)return;
  const text=`${S.cur.n} - ${S.cur.g||'Radyo'} dinliyorum! 📻\n${S.cur.u}`;
  if(navigator.share){navigator.share({title:S.cur.n,text}).catch(()=>{});}
  else{navigator.clipboard?.writeText(text).then(()=>toast('Link kopyalandı','ok')).catch(()=>{});}
}

/* ── INT OPTS ── */
function loadIntOpts(){const saved=lsLoad(LS.INT,null);if(saved&&typeof saved==='object'){if(typeof saved.call==='boolean')IM.opts.call=saved.call;if(typeof saved.notif==='boolean')IM.opts.notif=saved.notif;if(typeof saved.resumeDelay==='number')IM.opts.resumeDelay=saved.resumeDelay;if(typeof saved.notifVol==='number')IM.opts.notifVol=saved.notifVol;}}
function saveIntOpts(){lsSave(LS.INT,IM.opts);}
function syncIntUI(){g('swCall').checked=IM.opts.call;g('swNotif').checked=IM.opts.notif;g('resumeDelay').value=IM.opts.resumeDelay;g('resumeDelayVal').textContent=(IM.opts.resumeDelay/1000).toFixed(2).replace(/\.?0+$/,'')+'s';g('notifVol').value=IM.opts.notifVol;g('notifVolVal').textContent=IM.opts.notifVol+'%';}

/* ── FAV & HIST ── */
function toggleFav(id){const i=fv.indexOf(id);if(i>=0){fv.splice(i,1);toast('Favoriden çıkarıldı');}else{fv.push(id);toast('Favorilere eklendi','ok');}dataSave();renderCards();updateFavBtn();updateNavBadge();if(_carOpen)renderCarFavs();}
function updateFavBtn(){if(S.cur)g('btnFpFav').textContent=fv.includes(S.cur.id)?'❤️':'🤍';}
function addHist(s){rc=rc.filter(r=>r.id!==s.id);rc.unshift({id:s.id,t:Date.now()});if(rc.length>MAX_H)rc=rc.slice(0,MAX_H);dataSave();}
function updateNavBadge(){const badge=g('favBadge');if(fv.length>0){badge.textContent=fv.length;badge.style.display='';}else{badge.style.display='none';}}

/* ── LAZY IMAGE LOADING ── */
const _imgObserver=('IntersectionObserver' in window)?new IntersectionObserver((entries)=>{
  entries.forEach(e=>{
    if(e.isIntersecting){
      const img=e.target;
      if(img.dataset.src){img.src=img.dataset.src;delete img.dataset.src;}
      _imgObserver.unobserve(img);
    }
  });
},{rootMargin:'100px'}):null;

/* ── CARD ── */
function makeCard(s,idx,showDrag){
  const isOn=S.cur?.id===s.id,isFav=fv.includes(s.id);
  const div=document.createElement('div');div.className='card'+(isOn?' on':'');div.dataset.action='play';div.dataset.id=s.id;
  if(showDrag){
    const dh=document.createElement('div');dh.className='drag-handle';dh.textContent='⠿';dh.dataset.action='drag';
    div.draggable=true;div.appendChild(dh);
  }
  const ico=document.createElement('div');ico.className='cico';ico.style.background=s.c||'var(--ac)';
  if(isOn&&S.playing){ico.innerHTML='<div class="ceq"><i></i><i></i><i></i><i></i></div>';}
  else if(s.img){
    const img=document.createElement('img');img.alt='';
    if(_imgObserver){img.dataset.src=s.img;img.style.cssText='opacity:0;transition:opacity .3s';img.onload=function(){this.style.opacity='1';};_imgObserver.observe(img);}
    else{img.src=s.img;}
    img.onerror=function(){this.replaceWith(document.createTextNode(s.e));};ico.appendChild(img);
  }
  else{ico.textContent=s.e;}
  const inf=document.createElement('div');inf.className='cinf';
  const nm=document.createElement('div');nm.className='cnam';
  // Highlight search match
  if(_searchQ){
    const q=_searchQ.toLowerCase(),n=s.n,li=n.toLowerCase().indexOf(q);
    if(li>=0){nm.innerHTML=esc(n.slice(0,li))+'<b style="color:var(--ac2)">'+esc(n.slice(li,li+q.length))+'</b>'+esc(n.slice(li+q.length));}
    else{nm.textContent=n;}
  }else{nm.textContent=s.n;}
  const gn=document.createElement('div');gn.className='cgen';
  if(isOn){const dot=document.createElement('span');dot.className='cdot';gn.appendChild(dot);}
  gn.appendChild(document.createTextNode(s.g||'Radyo'));
  if(s.br>0){const br=document.createElement('span');br.className='cbits';br.textContent=s.br+'kbps';gn.appendChild(br);}
  if(isHttpUrl(s.u)){const http=document.createElement('span');http.className='cbits http';http.textContent='HTTP';http.title='HTTPS altında engellenebilir';gn.appendChild(http);}
  inf.appendChild(nm);inf.appendChild(gn);
  const acts=document.createElement('div');acts.className='cacts';
  const fb=document.createElement('button');fb.className='cfav';fb.dataset.action='fav';fb.dataset.id=s.id;fb.textContent=isFav?'❤️':'🤍';fb.setAttribute('aria-label',isFav?'Favoriden çıkar':'Favorilere ekle');
  acts.appendChild(fb);
  div.appendChild(ico);div.appendChild(inf);div.appendChild(acts);return div;
}
const _delegated=new WeakSet();
function attachDel(container){
  if(_delegated.has(container))return;
  _delegated.add(container);
  container.addEventListener('click',e=>{
    const fb=e.target.closest('[data-action="fav"]'),pb=e.target.closest('[data-action="play"]');
    if(fb){e.stopPropagation();toggleFav(fb.dataset.id);return;}if(pb){addRipple(e,pb);play(pb.dataset.id);}
  });
}

/* ── RENDER ── */
let _renderPending=false;
function renderCards(){
  if(_renderPending)return;
  _renderPending=true;
  requestAnimationFrame(()=>{
    _renderPending=false;
    if(_curPage==='f')renderFavs();
    else if(_curPage==='a')renderAll();
    else if(_curPage==='r')renderRecent();
    else if(_curPage==='s')renderSettings();
  });
}
function renderAll(){
  const w=g('allList');w.innerHTML='';
  const filtered=getFiltered(ch);
  if(!ch.length){w.innerHTML=`<div class="empty"><span class="empty-ic">📡</span><h3>Henüz kanal yok</h3><p>Radyo arayıp ekleyin veya Türk radyolarını keşfedin</p><button class="empty-btn" id="eaA">📻 Radyo Ekle</button></div>`;g('eaA')?.addEventListener('click',openMod);return;}
  if(!filtered.length){w.innerHTML=`<div class="empty"><span class="empty-ic">🔍</span><h3>Sonuç bulunamadı</h3><p>Farklı bir filtre veya arama deneyin</p></div>`;return;}
  // Sort bar
  const sortBar=document.createElement('div');sortBar.className='sort-bar';
  ['default','az','za'].forEach(mode=>{
    const btn=document.createElement('button');btn.className='sort-btn'+(mode===_sortMode?' a':'');
    btn.textContent={default:'Varsayılan',az:'A → Z',za:'Z → A'}[mode];
    btn.addEventListener('click',()=>{_sortMode=mode;renderAll();});
    sortBar.appendChild(btn);
  });
  const ttl=document.createElement('div');ttl.className='ttl';ttl.innerHTML=`Kanallarım <span class="count-badge">${filtered.length}</span>`;
  w.appendChild(sortBar);w.appendChild(ttl);
  const f=document.createDocumentFragment();filtered.forEach((s,i)=>f.appendChild(makeCard(s,i)));w.appendChild(f);attachDel(w);
}
function renderFavs(){
  const w=g('favList');w.innerHTML='';
  const favStations=ch.filter(x=>fv.includes(x.id));
  favStations.sort((a,b)=>fv.indexOf(a.id)-fv.indexOf(b.id));
  const list=getFiltered(favStations);
  if(!favStations.length){w.innerHTML=`<div class="empty"><span class="empty-ic">💜</span><h3>Favori yok</h3><p>Kanallarım'dan ❤️ ile ekleyin<br>veya yeni radyo arayın</p><button class="empty-btn" id="eaF">📻 Radyo Ekle</button></div>`;g('eaF')?.addEventListener('click',openMod);return;}
  if(!list.length){w.innerHTML=`<div class="empty"><span class="empty-ic">🔍</span><h3>Filtre sonucu boş</h3><p>Farklı bir kategori deneyin</p></div>`;return;}
  w.classList.add('fav-mode');
  const ttl=document.createElement('div');ttl.className='ttl';ttl.innerHTML=`Favorilerim <span class="count-badge">${list.length}</span>`;w.appendChild(ttl);
  const f=document.createDocumentFragment();list.forEach((s,i)=>f.appendChild(makeCard(s,i,true)));w.appendChild(f);attachDel(w);initFavDrag(w);
}
/* ── DRAG & DROP (favoriler) ── */
const _dragReady=new WeakSet();
function initFavDrag(container){
  if(_dragReady.has(container))return;
  _dragReady.add(container);
  let dragId=null;
  container.addEventListener('dragstart',e=>{
    const card=e.target.closest('.card');if(!card)return;
    dragId=card.dataset.id;card.classList.add('dragging');
    e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',dragId);
  });
  container.addEventListener('dragend',e=>{
    const card=e.target.closest('.card');if(card)card.classList.remove('dragging');
    container.querySelectorAll('.drag-over').forEach(c=>c.classList.remove('drag-over'));dragId=null;
  });
  container.addEventListener('dragover',e=>{
    e.preventDefault();e.dataTransfer.dropEffect='move';
    const card=e.target.closest('.card');
    container.querySelectorAll('.drag-over').forEach(c=>c.classList.remove('drag-over'));
    if(card&&card.dataset.id!==dragId)card.classList.add('drag-over');
  });
  container.addEventListener('drop',e=>{
    e.preventDefault();
    const card=e.target.closest('.card');if(!card||!dragId)return;
    const targetId=card.dataset.id;if(targetId===dragId)return;
    const fromIdx=fv.indexOf(dragId),toIdx=fv.indexOf(targetId);
    if(fromIdx<0||toIdx<0)return;
    fv.splice(fromIdx,1);fv.splice(toIdx,0,dragId);
    dataSave();renderFavs();toast('Sıralama güncellendi','ok');
  });
  let touchDragId=null,touchStartY=0,touchMoved=false;
  container.addEventListener('touchstart',e=>{
    const handle=e.target.closest('.drag-handle');if(!handle)return;
    const card=handle.closest('.card');if(!card)return;
    touchDragId=card.dataset.id;touchStartY=e.touches[0].clientY;touchMoved=false;
    card.classList.add('dragging');
  },{passive:true});
  container.addEventListener('touchmove',e=>{
    if(!touchDragId)return;touchMoved=true;
    const touch=e.touches[0];
    const el=document.elementFromPoint(touch.clientX,touch.clientY);
    container.querySelectorAll('.drag-over').forEach(c=>c.classList.remove('drag-over'));
    const card=el?.closest('.card');
    if(card&&card.dataset.id!==touchDragId)card.classList.add('drag-over');
    if(Math.abs(touch.clientY-touchStartY)>10)e.preventDefault();
  },{passive:false});
  container.addEventListener('touchend',e=>{
    if(!touchDragId)return;
    container.querySelectorAll('.dragging').forEach(c=>c.classList.remove('dragging'));
    const overCard=container.querySelector('.drag-over');
    if(overCard&&touchMoved){
      const targetId=overCard.dataset.id;
      const fromIdx=fv.indexOf(touchDragId),toIdx=fv.indexOf(targetId);
      if(fromIdx>=0&&toIdx>=0){fv.splice(fromIdx,1);fv.splice(toIdx,0,touchDragId);dataSave();renderFavs();toast('Sıralama güncellendi','ok');}
    }
    container.querySelectorAll('.drag-over').forEach(c=>c.classList.remove('drag-over'));
    touchDragId=null;touchMoved=false;
  });
}
function renderRecent(){
  const w=g('recList');w.innerHTML='';const chMap=new Map(ch.map(x=>[x.id,x]));const valid=rc.filter(r=>chMap.has(r.id));
  if(!valid.length){w.innerHTML=`<div class="empty"><span class="empty-ic">🕐</span><h3>Geçmiş yok</h3><p>Dinlediğiniz radyolar burada görünür</p></div>`;return;}
  const ttl=document.createElement('div');ttl.className='ttl';ttl.innerHTML=`Son Dinlenenler <span class="count-badge">${valid.length}</span>`;w.appendChild(ttl);
  const f=document.createDocumentFragment();
  valid.forEach((r,i)=>{
    const s=chMap.get(r.id);
    const div=document.createElement('div');div.className='card'+(S.cur?.id===s.id?' on':'');div.dataset.action='play';div.dataset.id=s.id;
    const ico=document.createElement('div');ico.className='cico';ico.style.background=s.c||'var(--ac)';
    if(s.img){const img=document.createElement('img');img.alt='';img.loading='lazy';img.src=s.img;img.onerror=function(){this.replaceWith(document.createTextNode(s.e));};ico.appendChild(img);}
    else{ico.textContent=s.e;}
    const inf=document.createElement('div');inf.className='cinf';
    const nm=document.createElement('div');nm.className='cnam';nm.textContent=s.n;
    const gn=document.createElement('div');gn.className='cgen';
    if(S.cur?.id===s.id){const dot=document.createElement('span');dot.className='cdot';gn.appendChild(dot);}
    gn.appendChild(document.createTextNode(relTime(r.t)));
    inf.appendChild(nm);inf.appendChild(gn);div.appendChild(ico);div.appendChild(inf);f.appendChild(div);
  });
  w.appendChild(f);attachDel(w);
}
function renderSettings(){
  const w=g('chList');g('chCount').textContent=ch.length;w.innerHTML='';
  g('statCh').textContent=ch.length;g('statFav').textContent=fv.length;g('statRec').textContent=rc.length;
  if(!ch.length){const r=document.createElement('div');r.className='set-row';r.style.cursor='default';r.innerHTML=`<div class="set-ic" style="background:rgba(255,255,255,.02)">📡</div><div class="set-lb"><h4>Kanal yok</h4><p>Radyo arayıp ekleyin</p></div>`;w.appendChild(r);return;}
  const f=document.createDocumentFragment();
  ch.forEach(s=>{
    const r=document.createElement('div');r.className='set-row';r.style.cursor='default';
    const ic=document.createElement('div');ic.className='set-ic';ic.style.background=s.c;
    if(s.img){const img=document.createElement('img');img.src=s.img;img.alt='';img.loading='lazy';img.style.cssText='width:100%;height:100%;object-fit:cover;border-radius:inherit;';img.onerror=function(){this.replaceWith(document.createTextNode(s.e));};ic.appendChild(img);}
    else{ic.textContent=s.e;}
    const lb=document.createElement('div');lb.className='set-lb';
    const h4=document.createElement('h4');h4.textContent=s.n;const p=document.createElement('p');p.textContent=(s.g||'Radyo')+(s.br?' · '+s.br+'kbps':'');
    lb.appendChild(h4);lb.appendChild(p);
    const btn=document.createElement('button');btn.className='del-b';btn.dataset.action='del';btn.dataset.id=s.id;btn.textContent='🗑️';btn.setAttribute('aria-label',`${s.n} kanalını sil`);
    r.appendChild(ic);r.appendChild(lb);r.appendChild(btn);f.appendChild(r);
  });
  w.appendChild(f);
  if(!_delegated.has(w)){_delegated.add(w);w.addEventListener('click',e=>{const b=e.target.closest('[data-action="del"]');if(b){e.stopPropagation();delCh(b.dataset.id);}});}
}

/* ── CHIPS (genre filter) ── */
function renderChips(){
  const c=g('chips');c.innerHTML='';
  GENRES.forEach(genre=>{
    const chip=document.createElement('div');chip.className='chip'+(genre===_filterGenre?' a':'');chip.textContent=genre;
    chip.dataset.genre=genre;
    c.appendChild(chip);
  });
  if(!_delegated.has(c)){_delegated.add(c);c.addEventListener('click',e=>{const chip=e.target.closest('.chip');if(!chip||!chip.dataset.genre)return;_filterGenre=chip.dataset.genre;renderChips();renderCards();});}
}

/* ── NAV ── */
let _curPage='f';
function goPage(p){
  _curPage=p;
  document.querySelectorAll('.pg').forEach(x=>x.classList.remove('a'));
  document.querySelectorAll('.bnav button').forEach(x=>x.classList.remove('a'));
  g({f:'pF',a:'pA',r:'pR',s:'pS'}[p]).classList.add('a');
  g({f:'navF',a:'navA',r:'navR',s:'navS'}[p]).classList.add('a');
  const showSearch=(p==='f'||p==='a')&&ch.length>0;
  g('searchBar').style.display=showSearch?'block':'none';
  g('chips').style.display=showSearch?'flex':'none';
  if(p==='f')renderFavs();if(p==='a')renderAll();if(p==='r')renderRecent();if(p==='s')renderSettings();
  g('scr').scrollTop=0;
}

/* ── FULL PLAYER ── */
function openFP(){g('fplay').classList.add('s');syncSliders();syncIntUI();g('btnFpShuffle').classList.toggle('shuffle-on',_shuffle);}
function closeFP(){g('fplay').classList.remove('s');}

/* ── CAR MODE ── */
let _carOpen=false,_wakeLock=null;
async function requestCarWakeLock(){
  if(!_carOpen||!navigator.wakeLock||_wakeLock)return;
  try{
    _wakeLock=await navigator.wakeLock.request('screen');
    _wakeLock.addEventListener('release',()=>{_wakeLock=null;});
  }catch{}
}
async function releaseCarWakeLock(){
  const lock=_wakeLock;_wakeLock=null;
  try{await lock?.release();}catch{}
}
function openCar(){
  _carOpen=true;
  g('carMode').classList.add('s');
  renderCarFavs();updateCarNow();
  try{if(screen.orientation?.lock)screen.orientation.lock('landscape').catch(()=>{});}catch{}
  requestCarWakeLock();
}
function closeCar(){
  _carOpen=false;
  g('carMode').classList.remove('s');
  releaseCarWakeLock();
  try{if(screen.orientation?.unlock)screen.orientation.unlock();}catch{}
}
function updateCarNow(){
  if(!_carOpen)return;
  const nm=g('carNm'),np=g('carNp'),gn=g('carGn'),pb=g('carPlay');
  if(S.cur){nm.textContent=S.cur.n;gn.textContent=S.cur.g||'Radyo';np.textContent=NP._curTitle||'';}
  else{nm.textContent='Radyo seç';gn.textContent='';np.textContent='';}
  pb.textContent=S.playing?'⏸':'▶';
  renderCarFavs();
}
function renderCarFavs(){
  const w=g('carFavs');if(!w)return;
  w.innerHTML='';
  const list=ch.filter(x=>fv.includes(x.id));
  list.sort((a,b)=>fv.indexOf(a.id)-fv.indexOf(b.id));
  if(!list.length){w.innerHTML='<div class="car-fav-empty">Henüz favori yok.<br>Favoriler ana ekrandan ❤️ ile eklenir.</div>';return;}
  const f=document.createDocumentFragment();
  list.slice(0,12).forEach(s=>{
    const d=document.createElement('button');d.type='button';d.className='car-fav'+(S.cur?.id===s.id?' on':'');d.dataset.id=s.id;
    const ic=document.createElement('div');ic.className='car-fav-ic';ic.style.background=s.c||'var(--ac)';
    if(s.img){const im=document.createElement('img');im.src=s.img;im.alt='';im.loading='lazy';im.onerror=function(){this.replaceWith(document.createTextNode(s.e));};ic.appendChild(im);}
    else{ic.textContent=s.e;}
    const nm=document.createElement('div');nm.className='car-fav-nm';nm.textContent=s.n;
    d.appendChild(ic);d.appendChild(nm);f.appendChild(d);
  });
  w.appendChild(f);
  w.onclick=e=>{const b=e.target.closest('.car-fav');if(b)play(b.dataset.id);};
}

/* ── SLEEP ── */
let _slT=null;
function setSleep(min){
  if(_slT){clearInterval(_slT);_slT=null;}const lbl=g('sleepLbl');
  if(min===0){lbl.classList.remove('s');return;}
  const end=Date.now()+min*60000;lbl.classList.add('s');
  _slT=setInterval(()=>{const l=end-Date.now();if(l<=0){userPause();clearInterval(_slT);_slT=null;lbl.classList.remove('s');g('sleepSel').value='0';toast('Uyku zamanlayıcısı: durdu');return;}lbl.textContent=`⏰ ${Math.floor(l/60000)}:${Math.floor((l%60000)/1000).toString().padStart(2,'0')}`;},1000);
  toast(`⏰ ${min} dk sonra durur`);
}

/* ── ADD/DEL ── */
function addCh(name,url,genre,emoji,imgUrl,bitrate){
  if(!isUrl(url)){toast('Geçersiz URL','err');return false;}if(ch.find(x=>x.u===url)){toast('Bu kanal zaten ekli','warn');return false;}
  ch.push({id:mkId(),n:name.slice(0,MAX_N),g:(genre||'Diğer').slice(0,MAX_G),u:url,e:(emoji||'📻').slice(0,4),c:COLORS[Math.floor(Math.random()*COLORS.length)],img:(imgUrl&&isUrl(imgUrl))?imgUrl:'',br:bitrate||0});
  dataSave();renderCards();renderSettings();updateSearchVisibility();updateNavBadge();
  toast(isHttpUrl(url)?'Kanal eklendi; HTTP yayın HTTPS altında engellenebilir':name+' eklendi',isHttpUrl(url)?'warn':'ok');
  // Auto-fetch logo if not provided
  if(!imgUrl||!isUrl(imgUrl))setTimeout(autoFetchLogos,500);
  return true;
}
async function delCh(id){
  const s=ch.find(x=>x.id===id);
  const ok=await confirm2('Kanalı sil',`"${s?.n||'Bu kanal'}" silinecek. Emin misiniz?`);if(!ok)return;
  ch=ch.filter(x=>x.id!==id);
  if(S.cur?.id===id){S.cur=null;S.should=false;IM.setUStop(true);aud.pause();S.playing=false;g('mplay').classList.remove('s');g('scr').classList.remove('mp-on');updatePlayUI();}
  dataSave();renderCards();renderSettings();updateSearchVisibility();updateNavBadge();toast('Silindi');
}

function updateSearchVisibility(){
  const show=(_curPage==='f'||_curPage==='a')&&ch.length>0;
  g('searchBar').style.display=show?'block':'none';
  g('chips').style.display=show?'flex':'none';
}

/* ── MODAL ── */
function openMod(){setDialogOpen('addMod',true);}
function closeMod(){setDialogOpen('addMod',false);['rTR','rGL','rTG'].forEach(id=>g(id).innerHTML='');g('inN').value='';g('inU').value='';g('inE').value='📻';g('inImg').value='';g('fgN').classList.remove('bad');g('fgU').classList.remove('bad');}
function doManualAdd(){
  const name=g('inN').value.trim(),url=g('inU').value.trim();let ok=true;
  if(!name){g('fgN').classList.add('bad');ok=false;}else g('fgN').classList.remove('bad');
  if(!isUrl(url)){g('fgU').classList.add('bad');ok=false;}else g('fgU').classList.remove('bad');
  if(!ok)return;if(addCh(name,url,g('inC').value,g('inE').value||'📻',g('inImg').value.trim()))closeMod();
}

/* ── SEARCH API ── */
const _sr=new Map();
function _srSet(k,v){if(_sr.size>10){const first=_sr.keys().next().value;_sr.delete(first);}_sr.set(k,v);}
async function apiCall(ep){
  const reqs=APIS.map(h=>fetchWithTimeout(`https://${h}.api.radio-browser.info/json/${ep}`,{},6000).then(r=>{if(!r.ok)throw new Error(r.status);return r.json();}));
  try{return await firstFulfilled(reqs);}catch{return null;}
}
async function doSearch(q,extra,targetId,key){
  const el=g(targetId);
  try{
    el.innerHTML='<div class="sr-msg"><div class="skeleton" style="width:60%;height:12px;margin:0 auto 6px"></div><div class="skeleton" style="width:40%;height:10px;margin:0 auto"></div></div>';
    const seen=new Set(),all=[];
    const d1=await apiCall(`stations/search?name=${encodeURIComponent(q)}${extra}&limit=35&hidebroken=true&order=clickcount&reverse=true`);
    if(d1)d1.forEach(x=>{if(!seen.has(x.stationuuid)){seen.add(x.stationuuid);all.push(x);}});
    if(all.length<8){const d2=await apiCall(`stations/search?tag=${encodeURIComponent(q)}${extra}&limit=20&hidebroken=true&order=clickcount&reverse=true`);if(d2)d2.forEach(x=>{if(!seen.has(x.stationuuid)){seen.add(x.stationuuid);all.push(x);}});}
    if(!all.length){el.innerHTML='<div class="sr-msg">Bulunamadı. Farklı terim deneyin.</div>';return;}
    _srSet(key,all);renderSR(all,el,key);
  }catch{el.innerHTML='<div class="sr-msg">Arama sırasında hata oluştu.</div>';}
}
async function doTagSearch(q){
  const el=g('rTG');
  try{
    el.innerHTML='<div class="sr-msg"><div class="skeleton" style="width:60%;height:12px;margin:0 auto 6px"></div><div class="skeleton" style="width:40%;height:10px;margin:0 auto"></div></div>';
    let d=await apiCall(`stations/search?tag=${encodeURIComponent(q)}&countrycode=TR&limit=30&hidebroken=true&order=clickcount&reverse=true`);
    if(!d?.length)d=await apiCall(`stations/search?tag=${encodeURIComponent(q)}&limit=30&hidebroken=true&order=clickcount&reverse=true`);
    if(!d?.length){el.innerHTML='<div class="sr-msg">Bulunamadı.</div>';return;}
    _srSet('tag',d);renderSR(d,el,'tag');
  }catch{el.innerHTML='<div class="sr-msg">Arama sırasında hata oluştu.</div>';}
}
function renderSR(data,container,key){
  const wrap=document.createElement('div');wrap.className='srch-res';
  data.forEach((x,i)=>{
    const url=x.url_resolved||x.url,added=ch.some(a=>a.u===url);
    const item=document.createElement('div');item.className='sr-item';
    if(x.favicon&&isUrl(x.favicon)){const sImg=document.createElement('img');sImg.src=x.favicon;sImg.alt='';sImg.style.cssText='width:28px;height:28px;border-radius:6px;object-fit:cover;flex-shrink:0;background:var(--bg3);';sImg.loading='lazy';sImg.onerror=function(){this.style.display='none';};item.appendChild(sImg);}
    const inf=document.createElement('div');inf.className='sr-inf';
    const nm=document.createElement('div');nm.className='sr-nm';nm.textContent=x.name;
    const tg=document.createElement('div');tg.className='sr-tg';tg.textContent=`${x.country||''} · ${x.tags?x.tags.split(',').slice(0,2).join(', '):'—'} · ${x.bitrate||'?'} kbps`;
    inf.appendChild(nm);inf.appendChild(tg);item.appendChild(inf);
    if(added){const ok=document.createElement('span');ok.className='sr-ok';ok.textContent='✓ Ekli';item.appendChild(ok);}
    else{const btn=document.createElement('button');btn.className='sr-add';btn.textContent='+ Ekle';btn.dataset.key=key;btn.dataset.i=i;item.appendChild(btn);}
    wrap.appendChild(item);
  });
  wrap.addEventListener('click',e=>{const btn=e.target.closest('.sr-add');if(!btn)return;pickSR(btn.dataset.key,parseInt(btn.dataset.i,10),container,key);});
  container.innerHTML='';container.appendChild(wrap);
}
function pickSR(cacheKey,i,container,origKey){
  const data=_sr.get(cacheKey);if(!data?.[i])return;
  const x=data[i],url=x.url_resolved||x.url;if(!isUrl(url)){toast('Geçersiz URL','err');return;}
  const t=(x.tags||'').toLowerCase();let genre='Diğer';
  if(t.includes('pop'))genre='Pop';else if(t.includes('rock'))genre='Rock';else if(/jazz/.test(t))genre='Caz';else if(/news|haber|talk/.test(t))genre='Haber';else if(/türk|turkish|folk/.test(t))genre='THM';else if(/islam|quran|dini/.test(t))genre='Dini';else if(/electro|dance|edm|house|techno/.test(t))genre='Elektronik';else if(/classic/.test(t))genre='TSM';else if(/sport/.test(t))genre='Spor';else if(/child|kid|çocuk/.test(t))genre='Çocuk';
  const favicon=(x.favicon&&isUrl(x.favicon))?x.favicon:'';
  if(addCh(x.name,url,genre,'📻',favicon,x.bitrate||0)){const fresh=_sr.get(origKey);if(fresh)renderSR(fresh,container,origKey);}
}

/* ── AUTO FETCH LOGOS ── */
let _logoFetching=false;
async function autoFetchLogos(limit=20){
  if(_logoFetching)return;
  const allMissing=ch.filter(s=>!s.img);
  const missing=allMissing.slice(0,limit);
  if(!missing.length)return;
  _logoFetching=true;
  let updated=0;
  try{
  // Batch: search by URL for each station without logo
  for(const s of missing){
    try{
      // Try exact URL match first
      let d=await apiCall(`stations/byurl?url=${encodeURIComponent(s.u)}`);
      if(!d?.length){
        // Fallback: search by name
        d=await apiCall(`stations/search?name=${encodeURIComponent(s.n)}&limit=5&hidebroken=true&order=clickcount&reverse=true`);
      }
      if(d?.length){
        // Find best match with a valid favicon
        const match=d.find(x=>x.favicon&&isUrl(x.favicon));
        if(match){
          s.img=match.favicon;
          updated++;
        }
      }
    }catch{}
    // Small delay to avoid hammering the API
    await new Promise(r=>setTimeout(r,300));
  }
  }finally{_logoFetching=false;}
  if(updated>0){
    dataSave();renderCards();
    if(S.cur){
      const cur=ch.find(x=>x.id===S.cur.id);
      if(cur&&cur.img&&!S.cur.img){S.cur=cur;updatePlayerArt();}
    }
    const left=Math.max(0,allMissing.length-missing.length);
    toast(left?`${updated} logo indirildi, ${left} sonraya bırakıldı`:`${updated} logo otomatik indirildi`,'ok');
  }
}
function updatePlayerArt(){
  if(!S.cur)return;
  const s=S.cur;
  const mIco=g('mIco');mIco.innerHTML='';mIco.style.background=s.c||'var(--ac)';
  if(s.img){const mi=document.createElement('img');mi.src=s.img;mi.alt='';mi.loading='lazy';mi.onerror=function(){this.replaceWith(document.createTextNode(s.e));};mIco.appendChild(mi);}
  else{mIco.textContent=s.e;}
  const fpArt=g('fpArt');fpArt.innerHTML='';fpArt.style.background=`linear-gradient(135deg,${s.c||'var(--ac)'},${darken(s.c||'#7c6cf0')})`;
  if(s.img){const fi=document.createElement('img');fi.src=s.img;fi.alt='';fi.loading='lazy';fi.onerror=function(){this.replaceWith(document.createTextNode(s.e));};fpArt.appendChild(fi);}
  else{fpArt.textContent=s.e;}
  updateMeta(s);
}

/* ── EXPORT/IMPORT/RESET ── */
function doExport(){
  const blob=new Blob([JSON.stringify(backupData(),null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='turkradyo_yedek.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Yedek indirildi','ok');
}
function importData(d){
  if(!d||typeof d!=='object'||!Array.isArray(d.ch))throw new Error('format');
  let added=0,mapped=0;
  const idMap=new Map();
  d.ch.forEach(x=>{
    if(!x||typeof x.id!=='string'||!x.id)return;if(typeof x.n!=='string'||!x.n.trim())return;if(typeof x.u!=='string'||!isUrl(x.u))return;
    const existing=ch.find(c=>c.u===x.u);
    if(existing){idMap.set(x.id,existing.id);mapped++;return;}
    const newId=mkId();
    ch.push({id:newId,n:String(x.n).slice(0,MAX_N),g:typeof x.g==='string'?x.g.slice(0,MAX_G):'Diğer',u:x.u,e:typeof x.e==='string'?x.e.slice(0,4):'📻',c:typeof x.c==='string'&&/^#[0-9a-f]{6}$/i.test(x.c)?x.c:COLORS[Math.floor(Math.random()*COLORS.length)],img:typeof x.img==='string'&&isUrl(x.img)?x.img:'',br:typeof x.br==='number'?x.br:0});
    idMap.set(x.id,newId);added++;
  });
  const ids=new Set(ch.map(x=>x.id));
  if(Array.isArray(d.fv))d.fv.forEach(f=>{if(typeof f!=='string')return;const id=idMap.get(f)||f;if(ids.has(id)&&!fv.includes(id))fv.push(id);});
  if(Array.isArray(d.rc)){d.rc.forEach(r=>{if(!r||typeof r.id!=='string'||typeof r.t!=='number')return;const id=idMap.get(r.id)||r.id;if(ids.has(id)&&!rc.find(h=>h.id===id))rc.push({id,t:r.t});});rc.sort((a,b)=>b.t-a.t);rc=rc.slice(0,MAX_H);}
  dataSave();renderCards();renderSettings();updateSearchVisibility();updateNavBadge();renderSyncStatus();
  return{added,mapped};
}
function doImport(e){
  const f=e.target.files[0];if(!f)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    try{
      const res=importData(JSON.parse(ev.target.result));
      toast(res.mapped?`${res.added} yeni, ${res.mapped} mevcut kanal eşlendi`:`${res.added} kanal yüklendi`,'ok');
    }catch{toast('Geçersiz dosya formatı','err');}
  };
  reader.onerror=()=>toast('Dosya okunamadı','err');reader.readAsText(f);e.target.value='';
}
async function doReset(){
  const ok=await confirm2('Tümünü sil','Tüm kanallar, favoriler ve geçmiş kalıcı olarak silinecek.');if(!ok)return;
  ch=[];fv=[];rc=[];S.cur=null;S.should=false;IM.setUStop(true);aud.pause();S.playing=false;
  g('mplay').classList.remove('s');g('scr').classList.remove('mp-on');updatePlayUI();dataSave();renderCards();renderSettings();updateSearchVisibility();updateNavBadge();toast('Sıfırlandı');
}

/* ── KEYBOARD SHORTCUTS ── */
let _kbdTimer=null;
function showKbdHint(text){
  const el=g('kbdHint');el.textContent=text;el.classList.add('s');
  clearTimeout(_kbdTimer);_kbdTimer=setTimeout(()=>el.classList.remove('s'),1500);
}
function handleKeyboard(e){
  if(trapDialogFocus(e))return;
  if(e.code==='Escape'){
    if(_activeDialog?.id==='cfmOv'){e.preventDefault();_cfmClose(false);return;}
    if(_activeDialog?.id==='addMod'){e.preventDefault();closeMod();return;}
    if(_activeDialog?.id==='iosInstallOv'){e.preventDefault();closeIOSInstall();return;}
    closeFP();if(_carOpen)closeCar();return;
  }
  // Skip if focused on input/textarea/select
  if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'||e.target.tagName==='SELECT')return;
  switch(e.code){
    case 'Space':e.preventDefault();if(S.cur){togglePlay();showKbdHint(S.playing?'⏸ Durduruldu':'▶ Oynatılıyor');}break;
    case 'ArrowLeft':e.preventDefault();prevSt();if(S.cur)showKbdHint('⏮ '+S.cur.n);break;
    case 'ArrowRight':e.preventDefault();nextSt();if(S.cur)showKbdHint('⏭ '+S.cur.n);break;
    case 'ArrowUp':e.preventDefault();setVol(Math.min(100,parseInt(g('volM').value)+5));showKbdHint('🔊 '+g('volM').value+'%');break;
    case 'ArrowDown':e.preventDefault();setVol(Math.max(0,parseInt(g('volM').value)-5));showKbdHint('🔉 '+g('volM').value+'%');break;
    case 'KeyM':if(aud.volume>0){aud._prevVol=aud.volume;setVol(0);showKbdHint('🔇 Sessiz');}else{setVol(Math.round((aud._prevVol||0.8)*100));showKbdHint('🔊 Ses açıldı');}break;
    case 'KeyF':if(S.cur){toggleFav(S.cur.id);showKbdHint(fv.includes(S.cur.id)?'❤️ Favorilere eklendi':'💔 Favoriden çıkarıldı');}break;
    case 'KeyS':toggleShuffle();break;
    case 'Escape':closeFP();if(_carOpen)closeCar();break;
  }
}

/* ── PWA INSTALL ── */
let _deferredPrompt=null;
function _isIOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent)&&!window.MSStream;}
function _isSafari(){return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);}
function _isStandalone(){return window.matchMedia('(display-mode:standalone)').matches||window.navigator.standalone===true;}
function openIOSInstall(){setDialogOpen('iosInstallOv',true);}
function closeIOSInstall(){setDialogOpen('iosInstallOv',false);lsSave('pwa_dismissed',true);}
function _updateInstallSettingRow(){
  if(_isStandalone()){
    g('btnInstallApp').style.display='none';
    g('btnAlreadyInstalled').style.display='flex';
  } else {
    g('btnAlreadyInstalled').style.display='none';
    g('btnInstallApp').style.display='flex';
  }
}
function setupInstallPrompt(){
  // iOS instructions modal close
  g('iosInstallOv').addEventListener('click',e=>{if(e.target===g('iosInstallOv'))closeIOSInstall();});
  g('iosInstallClose').addEventListener('click',closeIOSInstall);

  // Android/Chrome native install
  window.addEventListener('beforeinstallprompt',e=>{
    e.preventDefault();_deferredPrompt=e;
    if(!_isStandalone()&&!lsLoad('pwa_dismissed',false)){
      setTimeout(()=>{g('installBar').style.display='flex';},3000);
    }
    _updateInstallSettingRow();
  });
  window.addEventListener('appinstalled',()=>{
    _deferredPrompt=null;g('installBar').style.display='none';
    _updateInstallSettingRow();toast('Uygulama yüklendi!','ok');
  });

  g('installBtn').addEventListener('click',async()=>{
    if(!_deferredPrompt)return;
    _deferredPrompt.prompt();
    const{outcome}=await _deferredPrompt.userChoice;
    if(outcome==='accepted')toast('Uygulama yükleniyor!','ok');
    _deferredPrompt=null;g('installBar').style.display='none';
  });
  g('installClose').addEventListener('click',()=>{
    g('installBar').style.display='none';lsSave('pwa_dismissed',true);
  });

  // Settings install button
  g('btnInstallApp').addEventListener('click',()=>{
    if(_deferredPrompt){
      _deferredPrompt.prompt();
      _deferredPrompt.userChoice.then(({outcome})=>{
        if(outcome==='accepted')toast('Uygulama yükleniyor!','ok');
        _deferredPrompt=null;_updateInstallSettingRow();
      });
    } else if(_isIOS()&&_isSafari()){
      openIOSInstall();
    } else if(_isIOS()){
      toast('Safari ile açıp "Ana Ekrana Ekle" seçeneğini kullanın','warn');
    } else {
      toast('Tarayıcınız yüklemeyi desteklemiyor','warn');
    }
  });

  // Show on settings page render
  _updateInstallSettingRow();

  // iOS: show instructions automatically (first visit, Safari only)
  if(_isIOS()&&_isSafari()&&!_isStandalone()&&!lsLoad('pwa_dismissed',false)){
    setTimeout(openIOSInstall,4000);
  }
}

/* ── OFFLINE DETECTION ── */
function setupOfflineDetection(){
  const bar=g('offlineBar');
  const update=()=>{bar.classList.toggle('s',!navigator.onLine);};
  window.addEventListener('online',()=>{update();toast('Bağlantı kuruldu','ok');if(S.cur&&S.should&&aud.paused&&!IM._uStop)IOS.resume(1000);});
  window.addEventListener('offline',()=>{update();toast('Bağlantı kesildi','warn');});
  update();
}

/* ═══ INIT ═══ */
function init(){
  if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').catch(()=>{});}

  dataLoad();loadIntOpts();renderChips();renderCards();renderSettings();updateNavBadge();
  g('appVersionLabel').textContent=`TürkRadyo v${APP_VERSION}`;
  renderSyncStatus();maybeRestoreHashBackup();
  // Auto-fetch missing logos after a short delay
  setTimeout(autoFetchLogos,2500);

  // Visualizer bars
  const vis=g('fpVis');
  for(let i=0;i<12;i++){const b=document.createElement('i');b.style.height=(Math.random()*38+6)+'px';b.style.animationDelay=(Math.random()*.5)+'s';b.style.animationDuration=(.3+Math.random()*.4)+'s';vis.appendChild(b);}

  IM.init(aud);IOS.init(aud);setupMS();setupInstallPrompt();setupOfflineDetection();

  // Generate PNG apple-touch-icon for iOS home screen (SVG not supported by iOS)
  try{
    const cvs=document.createElement('canvas');cvs.width=180;cvs.height=180;
    const ctx=cvs.getContext('2d');
    const grd=ctx.createLinearGradient(0,0,180,180);grd.addColorStop(0,'#7c6cf0');grd.addColorStop(1,'#ff6b9d');
    ctx.fillStyle=grd;ctx.beginPath();if(ctx.roundRect){ctx.roundRect(0,0,180,180,34);}else{ctx.rect(0,0,180,180);}ctx.fill();
    const cx=90,cy=127;
    ctx.strokeStyle='white';ctx.lineCap='round';
    [[53,0.5],[34,0.75],[14,1]].forEach(([r,a])=>{ctx.globalAlpha=a;ctx.lineWidth=13;ctx.beginPath();ctx.arc(cx,cy,r,1.25*Math.PI,1.75*Math.PI,false);ctx.stroke();});
    ctx.globalAlpha=1;ctx.fillStyle='white';ctx.beginPath();ctx.arc(cx,cy+8,8,0,2*Math.PI);ctx.fill();
    const png=cvs.toDataURL('image/png');
    [g('ati180'),g('atiAny')].forEach(l=>{if(l)l.href=png;});
  }catch{}

  // iOS audio unlock - also unlocks AudioContext
  document.addEventListener('touchstart',function u(){
    aud.play().then(()=>aud.pause()).catch(()=>{});
    if(IM._actx&&IM._actx.state==='suspended')try{IM._actx.resume();}catch{}
    document.removeEventListener('touchstart',u);
  },{once:true});

  setTimeout(()=>g('spl').classList.add('h'),1800);

  /* audio events */
  aud.addEventListener('playing',()=>{setPlaying(true);S.retries=0;IM.setUStop(false);setStatus('live');renderCards();IOS._startRecovery();});
  aud.addEventListener('pause',()=>{
    S.playing=false;updatePlayUI();
    g('ambient').classList.remove('playing');g('mplay').classList.remove('playing');g('fplay').classList.remove('playing');
    if('mediaSession' in navigator){
      // Interrupt sırasında kontrolleri kilit ekranında göstermeye devam et
      if(IM._interrupted)navigator.mediaSession.playbackState='paused';
      else navigator.mediaSession.playbackState=IM._uStop?'paused':'none';
    }
  });
  aud.addEventListener('waiting',()=>setStatus('load'));
  /* Exponential backoff reconnect — tünel/sinyal kesintisi için
     Gecikmeler: 2s,4s,8s,16s,32s sonra 60s cap; online geri gelince anında dener */
  aud.addEventListener('error',()=>{
    if(!S.cur||!S.should||IM._uStop||IM._interrupted)return;
    const n=Math.min(S.retries,6);
    const delay=Math.min(60000,2000*Math.pow(2,n));
    S.retries++;
    setStatus('retry');
    if(S.retries<=5)toast(`Bağlantı yeniden deneniyor (${S.retries})`,'warn');
    else if(S.retries===6)toast('Bağlantı düşük, denemeye devam ediliyor...','warn');
    setTimeout(()=>{
      if(!S.cur||!S.should||IM._uStop||IM._interrupted)return;
      if(!navigator.onLine)return; // online event'i kendi dener
      aud.src=S.cur.u;aud.load();aud.volume=IM._baseVol;
      aud.play().catch(()=>{});
    },delay);
  });
  /* Stalled/waiting — 8sn yanıtsızsa tetikle */
  let _stallT=null;
  aud.addEventListener('stalled',()=>{
    clearTimeout(_stallT);
    _stallT=setTimeout(()=>{
      if(!S.cur||!S.should||IM._uStop||IM._interrupted)return;
      if(aud.readyState>=2&&!aud.paused)return;
      try{aud.src=S.cur.u;aud.load();aud.volume=IM._baseVol;aud.play().catch(()=>{});}catch{}
    },8000);
  });
  aud.addEventListener('playing',()=>{clearTimeout(_stallT);_stallT=null;});

  /* confirm modal */
  g('cfmYes').addEventListener('click',()=>_cfmClose(true));
  g('cfmNo').addEventListener('click',()=>_cfmClose(false));
  g('cfmOv').addEventListener('click',e=>{if(e.target===g('cfmOv'))_cfmClose(false);});

  /* mini player */
  g('mplay').addEventListener('click',openFP);
  g('btnPP').addEventListener('click',e=>{e.stopPropagation();togglePlay();});
  g('mpVol').addEventListener('click',e=>e.stopPropagation());
  g('volM').addEventListener('input',e=>{e.stopPropagation();setVol(e.target.value);});

  /* full player */
  g('btnFpClose').addEventListener('click',closeFP);
  g('btnFpPlay').addEventListener('click',togglePlay);
  g('btnFpPrev').addEventListener('click',prevSt);
  g('btnFpNext').addEventListener('click',nextSt);
  g('btnFpFav').addEventListener('click',()=>{if(S.cur)toggleFav(S.cur.id);});
  g('btnFpShuffle').addEventListener('click',toggleShuffle);
  g('btnFpShare').addEventListener('click',shareStation);
  g('volF').addEventListener('input',e=>setVol(e.target.value));
  g('sleepSel').addEventListener('change',e=>setSleep(Number(e.target.value)));

  /* interrupt panel */
  g('fpIntHdr').addEventListener('click',()=>{g('fpIntBody').classList.toggle('open');g('fpIntHdr').classList.toggle('open');});
  g('swCall').addEventListener('change',e=>{IM.opts.call=e.target.checked;saveIntOpts();toast(e.target.checked?'Arama koruması açık':'Arama koruması kapalı');});
  g('swNotif').addEventListener('change',e=>{IM.opts.notif=e.target.checked;saveIntOpts();toast(e.target.checked?'Bildirim ses kısma açık':'Bildirim ses kısma kapalı');});
  g('resumeDelay').addEventListener('input',e=>{const v=parseInt(e.target.value);IM.opts.resumeDelay=v;g('resumeDelayVal').textContent=(v/1000).toFixed(2).replace(/\.?0+$/,'')+'s';});
  g('resumeDelay').addEventListener('change',()=>saveIntOpts());
  g('notifVol').addEventListener('input',e=>{const v=parseInt(e.target.value);IM.opts.notifVol=v;g('notifVolVal').textContent=v+'%';});
  g('notifVol').addEventListener('change',()=>saveIntOpts());

  /* add modal */
  g('btnAdd').addEventListener('click',openMod);
  g('btnMCancel').addEventListener('click',closeMod);
  g('btnMAdd').addEventListener('click',doManualAdd);
  g('addMod').addEventListener('click',e=>{if(e.target===g('addMod'))closeMod();});

  /* shuffle button (header) */
  g('btnShuffle').addEventListener('click',()=>{if(ch.length<2){toast('En az 2 kanal gerekli','warn');return;}shufflePlay();toast('Rastgele kanal açıldı','ok');});

  /* car mode */
  g('btnCarMode').addEventListener('click',openCar);
  g('btnOpenCar').addEventListener('click',openCar);
  g('carClose').addEventListener('click',closeCar);
  g('carPlay').addEventListener('click',()=>{if(S.cur)togglePlay();});
  g('carPrev').addEventListener('click',msPrev);
  g('carNext').addEventListener('click',msNext);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&_carOpen)requestCarWakeLock();else if(document.hidden)releaseCarWakeLock();});

  /* data saver + data usage */
  loadDS();DU.render();
  g('swDataSaver').addEventListener('change',e=>{DS.enabled=e.target.checked;DS.warnedThisSession=false;saveDS();toast(DS.enabled?'Ekonomi modu açık':'Ekonomi modu kapalı');});
  g('btnResetData').addEventListener('click',()=>DU.reset());
  /* Online geri gelince anında reconnect dene */
  window.addEventListener('online',()=>{if(S.cur&&S.should&&aud.paused&&!IM._uStop&&!IM._interrupted){S.retries=0;try{aud.src=S.cur.u;aud.load();aud.volume=IM._baseVol;aud.play().catch(()=>{});}catch{}}});

  /* search API */
  g('bTR').addEventListener('click',()=>{const q=g('qTR').value.trim();if(!q){toast('Arama yazın','warn');return;}doSearch(q,'&countrycode=TR','rTR','tr');});
  g('bGL').addEventListener('click',()=>{const q=g('qGL').value.trim();if(!q){toast('Arama yazın','warn');return;}doSearch(q,'','rGL','gl');});
  g('bTG').addEventListener('click',()=>{const q=g('qTG').value.trim();if(!q){toast('Tür yazın','warn');return;}doTagSearch(q);});
  [['qTR','bTR'],['qGL','bGL'],['qTG','bTG']].forEach(([inp,btn])=>{g(inp).addEventListener('keydown',e=>{if(e.key==='Enter')g(btn).click();});});
  g('inN').addEventListener('input',()=>g('fgN').classList.remove('bad'));
  g('inU').addEventListener('input',()=>g('fgU').classList.remove('bad'));

  /* search bar with debounce */
  const searchInput=g('searchInput');
  const searchClear=g('searchClear');
  const debouncedSearch=debounce(()=>{_searchQ=searchInput.value.trim();renderCards();},200);
  searchInput.addEventListener('input',()=>{
    searchClear.classList.toggle('vis',searchInput.value.length>0);
    debouncedSearch();
  });
  searchClear.addEventListener('click',()=>{searchInput.value='';_searchQ='';searchClear.classList.remove('vis');renderCards();});

  /* settings */
  g('btnExport').addEventListener('click',doExport);
  g('btnImport').addEventListener('click',()=>g('fileIn').click());
  g('fileIn').addEventListener('change',doImport);
  g('btnCloudBackup').addEventListener('click',doCloudBackup);
  g('btnCloudRestore').addEventListener('click',()=>doCloudRestore());
  g('btnSyncEndpoint').addEventListener('click',askSyncEndpoint);
  g('btnSyncPush').addEventListener('click',syncPush);
  g('btnSyncPull').addEventListener('click',syncPull);
  g('btnReset').addEventListener('click',doReset);
  g('btnFetchLogos').addEventListener('click',()=>{
    const missing=ch.filter(s=>!s.img).length;
    if(!missing){toast('Tüm logolar mevcut','ok');return;}
    if(_logoFetching){toast('Logolar zaten indiriliyor...','warn');return;}
    toast(`${missing} logo aranıyor...`);autoFetchLogos(80);
  });

  /* nav */
  document.querySelectorAll('.bnav button[data-pg]').forEach(btn=>{btn.addEventListener('click',()=>goPage(btn.dataset.pg));});

  /* keyboard */
  document.addEventListener('keydown',handleKeyboard);

  syncIntUI();
  updateSearchVisibility();

  goPage('f');
}

window.TurkRadyo={version:APP_VERSION,exportData:backupData,importData,syncPush,syncPull};
init();
})();
