import {
  APP_VERSION,
  LIMITS,
  isUrl,
  cleanImageUrl,
  trNormalize,
  normalizeStation,
  createBackup,
  mergeImportedBackup
} from '../src/lib/core.js';
import { encodeBackup, decodeBackup, encodeStation, decodeStation, copyText } from './storage.js';
import {
  mkId,
  isHttpUrl,
  debounce,
  relTime,
  darken,
  icon as _ic,
  fetchWithTimeout,
  initialRoute,
  trMatchRange,
  formatBytes,
  formatListenTime
} from './utils.js';
import { apiCall, genreFromTags } from './api.js';

(function(){
'use strict';

const LS={CH:'trch8',FV:'trfv8',RC:'trrc8',INT:'trint9',CAR:'trcar1',DS:'trds1',DU:'trdu1',OB:'trob1',ST:'trst1'};
const COLORS=['#7c5cff','#22d3ee','#34d399','#60a5fa','#a855f7','#14b8a6','#818cf8','#38bdf8','#ec4899','#2dd4bf','#93c5fd','#c084fc'];
const GENRES=['Tümü','Pop','Rock','Haber','THM','TSM','Arabesk','Caz','Elektronik','Karma','Dini','Çocuk','Spor','Diğer'];
const MAX_N=LIMITS.name,MAX_G=LIMITS.genre,MAX_H=LIMITS.history,MAX_IMPORT_BYTES=LIMITS.importBytes,MAX_BACKUP_TOKEN=1400000;
const IOS_RECOVERY_INTERVAL_MS=30000,NP_POLL_MS=60000,NP_IOS_POLL_MS=120000,DATA_USAGE_TICK_MS=15000,DATA_USAGE_LOW_POWER_TICK_MS=60000;
const _corruptStorage=new Map();

function esc(s){const d=document.createElement('div');d.textContent=(s==null)?'':String(s);return d.innerHTML;}
function setImageSrc(img,value){
  const clean=cleanImageUrl(value);
  if(!clean)return false;
  img.referrerPolicy='no-referrer';
  img.src=clean;
  return true;
}
function backupCorruptValue(k,raw){
  if(!raw||_corruptStorage.has(k))return;
  // Sabit tek yedek anahtarı kullan; aksi halde kalıcı bozuk bir değer her
  // sayfa açılışında yeni `.corrupt.<ts>` anahtarı yazıp kotayı doldurur.
  const bak=`${k}.corrupt`;
  _corruptStorage.set(k,{raw,bak});
  try{localStorage.setItem(bak,raw);}catch{}
}
function lsSave(k,v){
  try{
    localStorage.setItem(k,JSON.stringify(v));
    return true;
  }catch(e){
    if(e?.name==='QuotaExceededError')toast('Depolama dolu!','warn');else toast('Kayıt hatası','err');
    return false;
  }
}
function lsLoad(k,d){
  try{
    const v=localStorage.getItem(k);
    if(!v)return d;
    return JSON.parse(v);
  }catch{
    try{backupCorruptValue(k,localStorage.getItem(k));}catch{}
    toast('Bozuk kayıt yedeğe alındı','warn');
    return d;
  }
}
function g(id){return document.getElementById(id);}
function setVisible(target,on,display='block'){const el=typeof target==='string'?g(target):target;if(!el)return;if(on){el.classList.remove('is-hidden');el.style.display=display;}else{el.classList.add('is-hidden');el.style.display='none';}}

/* ── TOAST v2 ── */
let _toastT=null;
function toast(msg,type){
  const el=g('tst');el.textContent=msg;
  el.className='tst s'+(type==='ok'?' t-ok':type==='err'?' t-err':type==='warn'?' t-warn':'');
  clearTimeout(_toastT);_toastT=setTimeout(()=>el.classList.remove('s'),2600);
}
let _activeDialog=null,_prevFocus=null;
/* ── Modal/overlay geri-tuşu (popstate) yönetimi ──
   Açık bir overlay varken donanım/tarayıcı geri tuşu uygulamayı kapatmak yerine
   en üstteki overlay'i kapatır. Her açılışta bir history state push edilir;
   gerçek kapanış daima popstate üzerinden yapılır (kullanıcı kapatma butonuna
   bastığında history.back() tetikleyip kapanışı popstate'e bırakırız). */
const _dlgStack=[];let _dlgPopping=false;
const _dlgClosePending=new Set();
function _deferDialogClose(id){
  if(_dlgPopping)return false;            // popstate'ten geliyoruz → gerçekten kapat
  if(_dlgStack.lastIndexOf(id)===-1)return false; // history kaydı yok → gerçekten kapat
  if(_dlgClosePending.has(id))return true; // back() zaten yolda; çift tıklamada ikinci back()'i yutarak alttaki diyaloğun kapanmasını önle
  _dlgClosePending.add(id);
  try{history.back();return true;}catch{_dlgClosePending.delete(id);return false;}
}
function setDialogOpen(id,open){
  const ov=g(id);if(!ov)return;
  const box=ov.querySelector('[tabindex="-1"],.modal-c,.cfm-box,.ios-box');
  if(open){
    _prevFocus=document.activeElement;
    ov.classList.add('s');_activeDialog=ov;
    if(_dlgStack.lastIndexOf(id)===-1){_dlgStack.push(id);try{history.pushState({_dlg:id},'');}catch{}}
    setTimeout(()=>{const first=ov.querySelector('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');(first||box||ov).focus?.();},30);
  }else{
    ov.classList.remove('s');
    if(_activeDialog===ov)_activeDialog=null;
    _dlgClosePending.delete(id);
    const idx=_dlgStack.lastIndexOf(id);if(idx!==-1)_dlgStack.splice(idx,1);
    const focusTarget=_prevFocus;
    if(focusTarget&&document.contains(focusTarget))setTimeout(()=>focusTarget.focus?.(),30);
    _prevFocus=null;
  }
}
const _dialogClosers={
  fplay:()=>closeFP(),
  carMode:()=>closeCar(),
  addMod:()=>closeMod(),
  cfmOv:()=>_cfmClose(_cfmPendingVal===undefined?false:_cfmPendingVal),
  inpOv:()=>_inpClose(_inpPendingVal===undefined?null:_inpPendingVal),
  iosInstallOv:()=>closeIOSInstall()
};
window.addEventListener('popstate',()=>{
  if(!_dlgStack.length)return;
  _dlgPopping=true;
  const id=_dlgStack[_dlgStack.length-1];
  try{(_dialogClosers[id]||(()=>setDialogOpen(id,false)))();}finally{_dlgPopping=false;}
});
function trapDialogFocus(e){
  if(!_activeDialog||e.key!=='Tab')return false;
  const focusables=[..._activeDialog.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(x=>!x.disabled&&x.offsetParent!==null);
  if(!focusables.length)return false;
  const first=focusables[0],last=focusables[focusables.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();return true;}
  if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();return true;}
  return false;
}

/* ── RIPPLE EFFECT ── */
function addRipple(e,el){
  const r=document.createElement('span');r.className='ripple';
  const rect=el.getBoundingClientRect();
  const size=Math.max(rect.width,rect.height)*2;
  r.style.cssText=`width:${size}px;height:${size}px;left:${e.clientX-rect.left-size/2}px;top:${e.clientY-rect.top-size/2}px;`;
  el.appendChild(r);setTimeout(()=>r.remove(),500);
}

/* ── HAPTİK ── kısa dokunsal geri bildirim (Android). reduce-motion'a saygı duyar;
   iOS Safari'de Vibration API yoktur, sessizce yok sayılır. */
let _reduceMotion=false;
try{_reduceMotion=matchMedia('(prefers-reduced-motion:reduce)').matches;
  matchMedia('(prefers-reduced-motion:reduce)').addEventListener?.('change',e=>{_reduceMotion=e.matches;});
}catch{}
function haptic(ms=10){if(_reduceMotion)return;try{navigator.vibrate?.(ms);}catch{}}

/* ── CONFIRM ── */
let _cfmRes=null;
function confirm2(title,msg,okLbl='Sil'){
  return new Promise(resolve=>{
    // Açık bir onay beklerken yeni çağrı gelirse öncekini iptal (false) ile
    // çöz; aksi halde önceki await sonsuza kadar asılı kalır.
    if(_cfmRes){try{_cfmRes(false);}catch{}}
    _cfmRes=resolve;g('cfmTitle').textContent=title;g('cfmMsg').textContent=msg;g('cfmYes').textContent=okLbl;setDialogOpen('cfmOv',true);
  });
}
let _cfmPendingVal;
function _cfmClose(val){
  if(_deferDialogClose('cfmOv')){_cfmPendingVal=val;return;}
  _cfmPendingVal=undefined;
  setDialogOpen('cfmOv',false);if(_cfmRes){_cfmRes(val);_cfmRes=null;}
}

/* ── PROMPT (özel giriş modalı; native prompt() bazı WebView/standalone
   ortamlarda sessizce null döner ve tasarımla uyumsuzdur) ── */
let _inpRes=null,_inpPendingVal;
function prompt2(title,msg,opts={}){
  return new Promise(resolve=>{
    if(_inpRes){try{_inpRes(null);}catch{}}
    _inpRes=resolve;
    g('inpTitle').textContent=title;g('inpMsg').textContent=msg;
    const f=g('inpField');f.value=opts.value||'';f.placeholder=opts.placeholder||'';
    g('inpYes').textContent=opts.okLbl||'Tamam';
    setDialogOpen('inpOv',true);
    setTimeout(()=>{f.focus();if(opts.selectAll)f.select();},60);
  });
}
function _inpClose(val){
  if(_deferDialogClose('inpOv')){_inpPendingVal=val;return;}
  _inpPendingVal=undefined;
  setDialogOpen('inpOv',false);if(_inpRes){_inpRes(val);_inpRes=null;}
}

/* ── DATA ── */
let ch=[],fv=[],rc=[];
let _filterGenre='Tümü',_searchQ='',_sortMode='default',_shuffle=false;

function dataLoad(){
  const rCh=lsLoad(LS.CH,[]),rFv=lsLoad(LS.FV,[]),rRc=lsLoad(LS.RC,[]);
  ch=Array.isArray(rCh)?rCh.filter(x=>x&&typeof x==='object'&&typeof x.id==='string'&&x.id).map(x=>normalizeStation(x,{colors:COLORS,makeId:mkId})).filter(Boolean):[];
  const ids=new Set(ch.map(x=>x.id));
  fv=Array.isArray(rFv)?[...new Set(rFv.filter(f=>typeof f==='string'&&ids.has(f)))]:[];
  const seen=new Set();
  rc=Array.isArray(rRc)?rRc.filter(r=>r&&typeof r==='object'&&typeof r.id==='string'&&ids.has(r.id)&&typeof r.t==='number'&&!seen.has(r.id)&&seen.add(r.id)).slice(0,MAX_H):[];
}
function dataSave(){
  const ids=new Set(ch.map(x=>x.id));
  fv=fv.filter(f=>ids.has(f));
  rc=rc.filter(r=>ids.has(r.id));
  const ok=lsSave(LS.CH,ch)&lsSave(LS.FV,fv)&lsSave(LS.RC,rc);
  return !!ok;
}
function backupData(){return createBackup({ch,fv,rc});}

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

/* ═══ DİNLEME İSTATİSTİKLERİ (kanal başına toplam saniye) ═══ */
const ST={
  _pending:new Map(),_lastFlush:0,
  load(){const raw=lsLoad(LS.ST,{});return raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};},
  add(id,sec){
    if(!id||!(sec>0))return;
    this._pending.set(id,(this._pending.get(id)||0)+sec);
    if(Date.now()-this._lastFlush>60000)this.flush();
  },
  flush(){
    if(!this._pending.size)return;
    const o=this.load();
    for(const [id,sec] of this._pending)o[id]=Math.round((o[id]||0)+sec);
    this._pending.clear();this._lastFlush=Date.now();
    // Silinen kanalların kayıtlarını düşür (depo şişmesin)
    const ids=new Set(ch.map(x=>x.id));
    for(const k of Object.keys(o))if(!ids.has(k))delete o[k];
    lsSave(LS.ST,o);
  },
  of(id){return (this.load()[id]||0)+(this._pending.get(id)||0);},
  total(){const o=this.load();let t=0;for(const k in o)t+=o[k];for(const s of this._pending.values())t+=s;return t;},
  top(n){
    const o=this.load();
    for(const [id,sec] of this._pending)o[id]=(o[id]||0)+sec;
    return Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,n);
  },
  format(sec){return formatListenTime(sec);}
};

/* ═══ DATA SAVER + DATA USAGE ═══ */
const DS={enabled:false,warnedThisSession:false};
const DU={
  _tickT:null,_lastTick:0,_pendingBytes:0,_lastFlush:0,_monthKey(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');},
  load(){const raw=lsLoad(LS.DU,null);if(!raw||typeof raw!=='object'||raw.month!==this._monthKey())return{month:this._monthKey(),bytes:0};return{month:raw.month,bytes:typeof raw.bytes==='number'?raw.bytes:0};},
  save(o){lsSave(LS.DU,o);},
  add(bytes){
    this._pendingBytes+=bytes;
    if(!document.hidden)this.render();
    const flushAfter=isPowerConstrained()?120000:60000;
    if(Date.now()-this._lastFlush>flushAfter)this.flush();
  },
  flush(){
    if(!this._pendingBytes)return;
    const o=this.load();
    o.bytes+=this._pendingBytes;
    this._pendingBytes=0;
    this._lastFlush=Date.now();
    this.save(o);
    if(!document.hidden)this.render();
  },
  startTick(){
    if(this._tickT)return;
    this._lastTick=Date.now();
    const tickMs=isPowerConstrained()?DATA_USAGE_LOW_POWER_TICK_MS:DATA_USAGE_TICK_MS;
    this._tickT=setInterval(()=>{
      if(!S.cur||!S.playing){this.stopTick();return;}
      const now=Date.now();
      // Arka planda timer kısıtlaması nedeniyle tek tick'te dakikalarca dt
      // birikebilir; aşırı tahmini önlemek için bir tick'i en fazla 2 aralıkla sınırla.
      const dt=Math.min((now-this._lastTick)/1000,(tickMs/1000)*2);this._lastTick=now;
      const br=(S.cur.br&&S.cur.br>0)?S.cur.br:96; // varsayılan 96 kbps tahmin
      const bytes=Math.round(dt*br*125); // kbps / 8 * 1000
      this.add(bytes);
      ST.add(S.cur.id,dt);
    },tickMs);
  },
  stopTick(){if(this._tickT){clearInterval(this._tickT);this._tickT=null;}this.flush();ST.flush();},
  reset(){this._pendingBytes=0;this.save({month:this._monthKey(),bytes:0});this.render();toast('Veri sayacı sıfırlandı','ok');},
  format(bytes){return formatBytes(bytes);},
  render(){
    const el=g('dataUsageTxt');if(!el)return;
    const o=this.load();
    const bytes=o.bytes+this._pendingBytes;
    const [y,m]=o.month.split('-');
    const names=['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
    el.textContent=`${names[parseInt(m,10)-1]} ${y}: ${this.format(bytes)} (tahmini)`;
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
function isPowerConstrained(){return DS.enabled||isCellular()||_isIOS();}
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
function loadDS(){DS.enabled=!!lsLoad(LS.DS,false);setVisible('dsPill',DS.enabled,'inline-flex');g('swDataSaver').checked=DS.enabled;}
function saveDS(){lsSave(LS.DS,DS.enabled);setVisible('dsPill',DS.enabled,'inline-flex');}

/* ═══ CLOUD / ANONYMOUS BACKUP ═══ */
async function doCloudBackup(){
  let token;
  try{token=encodeBackup(backupData());}
  catch{toast('Yedek çok büyük; JSON dosyası indiriliyor','warn');doExport();return;}
  const link=location.origin+location.pathname+'#backup='+encodeURIComponent(token);
  if(link.length>60000){toast('Yedek link için büyük; JSON dosyası indiriliyor','warn');doExport();return;}
  if(navigator.share){
    try{await navigator.share({title:'Pulse Radio yedeği',text:'Pulse Radio anonim yedek linki',url:link});toast('Yedek linki paylaşıldı','ok');return;}catch{}
  }
  try{
    const copied=await copyText(link);
    if(copied){toast('Yedek linki kopyalandı','ok');return;}
  }catch{}
  await prompt2('Yedek linki','Linki kopyalayıp güvenli bir yerde saklayın.',{value:link,okLbl:'Kapat',selectAll:true});
}
async function doCloudRestore(input){
  const raw=input||await prompt2('Linkten geri yükle','Anonim yedek linkini veya kodunu yapıştırın.',{placeholder:'#backup=... veya kod',okLbl:'Devam'});
  if(!raw)return;
  if(String(raw).length>MAX_BACKUP_TOKEN){toast('Yedek linki çok büyük','err');return;}
  try{
    const d=decodeBackup(raw);
    const ok=await confirm2('Yedeği geri yükle','Linkteki kanallar mevcut listeye eklenecek; aynı URL’ler eşlenecek.','Yükle');
    if(!ok)return;
    const res=importData(d);
    toast(res.mapped?`${res.added} yeni, ${res.mapped} mevcut kanal eşlendi`:`${res.added} kanal yüklendi`,'ok');
    if(location.hash.includes('backup='))history.replaceState(null,'',location.pathname+location.search);
  }catch{toast('Yedek linki okunamadı','err');}
}
function maybeRestoreHashBackup(){if(location.hash.includes('backup='))setTimeout(()=>doCloudRestore(location.href),800);}
function maybeAddSharedStation(){
  if(!location.hash.includes('add='))return;
  setTimeout(async()=>{
    let d;
    try{d=decodeStation(location.href);}catch{toast('Kanal linki okunamadı','err');return;}
    const name=typeof d.n==='string'?d.n.trim():'';
    const url=typeof d.u==='string'?d.u.trim():'';
    if(!name||!isUrl(url)){toast('Kanal linki geçersiz','err');return;}
    const clearHash=()=>{if(location.hash.includes('add='))history.replaceState(null,'',location.pathname+location.search);};
    if(ch.some(x=>x.u===url)){toast('Bu kanal zaten ekli','warn');clearHash();return;}
    const ok=await confirm2('Paylaşılan radyoyu ekle',`"${name}" kanalınıza eklenecek.`,'Ekle');
    if(!ok){clearHash();return;}
    if(addCh(name,url,typeof d.g==='string'?d.g:'Diğer',typeof d.e==='string'&&d.e?d.e:'📻',typeof d.img==='string'?d.img:'',typeof d.br==='number'?d.br:0))clearHash();
  },600);
}

/* ═══ BAŞLANGIÇ PAKETİ (ilk açılış onboarding'i) ═══ */
let _starterLoading=false;
function starterDismissed(){return !!lsLoad(LS.OB,false);}
async function loadStarterPack(btn){
  if(_starterLoading)return;_starterLoading=true;
  if(btn){btn.disabled=true;btn.textContent='Ekleniyor...';}
  try{
    const r=await fetchWithTimeout('data/starter-stations.json',{},8000);
    if(!r.ok)throw new Error(r.status);
    const list=await r.json();
    if(!Array.isArray(list))throw new Error('format');
    const prev=ch.slice();
    let added=0;
    for(const item of list){
      const s=normalizeStation({...item,id:mkId()},{colors:COLORS,makeId:mkId});
      if(!s||ch.some(x=>x.u===s.u))continue;
      ch.push(s);added++;
    }
    if(added&&!dataSave()){ch=prev;toast('Kanallar kaydedilemedi','err');return;}
    lsSave(LS.OB,true);
    renderCards();renderSettings();updateSearchVisibility();updateNavBadge();
    toast(added?`${added} radyo eklendi — iyi dinlemeler!`:'Kanallar zaten ekli','ok');
    scheduleAutoFetchLogos(1500,10);
  }catch{
    toast('Hazır liste yüklenemedi','err');
    if(btn){btn.disabled=false;btn.textContent='Popüler radyoları ekle';}
  }finally{_starterLoading=false;}
}
function makeStarterBox(){
  const box=document.createElement('section');box.className='starter-box';
  box.innerHTML=`<h3>${_ic('radio')}Hazır listeyle başla</h3><p>Türkiye'nin popüler radyolarını tek dokunuşla ekle. Sonradan istediğini silebilir veya düzenleyebilirsin.</p>`;
  const row=document.createElement('div');row.className='starter-btns';
  const b1=document.createElement('button');b1.type='button';b1.className='fbtn fk';b1.textContent='Popüler radyoları ekle';
  b1.addEventListener('click',()=>loadStarterPack(b1));
  const b2=document.createElement('button');b2.type='button';b2.className='fbtn fc';b2.textContent='Kendim ekleyeceğim';
  b2.addEventListener('click',()=>{lsSave(LS.OB,true);renderCards();openMod();});
  row.appendChild(b1);row.appendChild(b2);box.appendChild(row);
  return box;
}

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
          album:'Pulse Radio',
          artwork:navigator.mediaSession.metadata.artwork||[]
        });}catch{}
      }
    }else{
      np.classList.remove('s');mNow.classList.remove('s');mName?.classList.remove('has-np');
      if(carNp)carNp.textContent='';
    }
  },
  stop(){clearTimeout(this._initialTimer);clearInterval(this._timer);this._initialTimer=null;this._timer=null;this._curId=null;this._setTitle('');},
  start(station){
    this.stop();
    if(!station)return;
    this._curId=station.id;
    if(DS.enabled)return;
    const run=async()=>{
      if(!S.cur||S.cur.id!==this._curId)return;
      const t=await this._fetchFor(station.u);
      if(S.cur&&S.cur.id===this._curId&&t&&t!==this._curTitle)this._setTitle(t);
    };
    const conservative=isPowerConstrained();
    if(conservative)this._initialTimer=setTimeout(run,15000);
    else run();
    const delay=conservative?NP_IOS_POLL_MS:NP_POLL_MS;
    this._timer=setInterval(()=>{if(document.hidden&&conservative)return;run();},delay);
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
    // Resume serileştirmesine katıl: token alarak bekleyen resume'ları geçersiz kıl;
    // bu çağrıdan sonra kullanıcı istasyon değiştirirse (play() token'ı artırır)
    // aşağıdaki denemeler aud'a dokunmadan sessizce vazgeçer.
    const token=++_resumeToken;_resumePromise=null;
    if(this._actx&&this._actx.state==='suspended'){try{this._actx.resume().catch(()=>{});}catch(e){}}
    aud.loop=false;aud.volume=0.01;
    const attempt=(n)=>{
      if(!S.cur||this._uStop||token!==_resumeToken)return;
      aud.play().then(()=>{if(token!==_resumeToken)return;setPlaying(true);S.retries=0;setStatus('live');renderCards();IOS._startRecovery();if(cb)cb();}).catch(()=>{
        if(token!==_resumeToken)return;
        if(n<3){setTimeout(()=>{if(S.cur&&S.should&&!this._uStop&&token===_resumeToken){aud.volume=0.01;attachStream(S.cur.u,true).then(ok=>{if(ok&&token===_resumeToken)attempt(n+1);});}},1000*(n+1));}
        else{setStatus('retry');toast('Bağlantı yeniden deneniyor...','warn');if(cb)cb();}
      });
    };
    attachStream(S.cur.u,true).then(ok=>{if(ok)attempt(0);});
  },
  initAudioContext(){
    if(DS.enabled||this._actx)return;
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx)return;
    try{this._actx=new Ctx();
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
    if(DS.enabled||(!S.playing&&!S.should&&!this._interrupted))return;
    if(!this._actx)this.initAudioContext();
    if(this._actx&&this._actx.state!=='running'){try{this._actx.resume().catch(()=>{});}catch(e){}}
  },
  releaseAudioContext(){
    const ctx=this._actx;
    this._actx=null;this._actxState=null;
    try{ctx?.close?.().catch(()=>{});}catch(e){}
  },
  // Arka plan/duraklatmada context'i KAPATMA — sadece askıya al. Kapalı bir
  // context bir daha 'running'e dönemez ve kesinti→devam sinyali kaybolur.
  // Askıya alınmış context ihmal edilebilir güç/veri kullanır.
  suspendAudioContext(){
    const ctx=this._actx;
    if(ctx&&ctx.state==='running'){try{ctx.suspend().catch(()=>{});}catch(e){}}
  },
  setUStop(v){this._uStop=v;if(v){this._clearTimers();this._interrupted=false;this._type=null;this._hideBanner();}},
  init(a){
    a.addEventListener('webkitInterruptBegin',()=>{if(!this._uStop&&(S.playing||S.should))this.interruptCall();});
    a.addEventListener('webkitInterruptEnd',()=>{if(this._interrupted&&this._type==='call')this.resumeFromCall();});
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
  _startRecovery(){
    // Tüm platformlarda çalışır: ended/stalled sonrası sessiz kalan yayını
    // 30 sn'lik bekçi yakalayıp yeniden başlatır (eskiden yalnız iOS'taydı).
    if(document.hidden||this._recoveryTimer)return;
    this._recoveryTimer=setInterval(()=>{if(S.cur&&S.should&&this.a.paused&&!IM._uStop&&!IM._interrupted&&!this._rel)this.resume(0);},IOS_RECOVERY_INTERVAL_MS);
  },
  _stopRecovery(){if(this._recoveryTimer){clearInterval(this._recoveryTimer);this._recoveryTimer=null;}},
  resume(delay){clearTimeout(this._rt);this._rt=setTimeout(()=>{if(!S.cur||IM._uStop||!S.should||IM._interrupted)return;resumeCurrentStation({source:'ios-recovery'}).finally(()=>IM._hideBanner());},Math.max(0,delay));},
  reload(){if(!S.cur||this._rel||IM._uStop)return;this._rel=true;destroyHls();try{aud.removeAttribute('src');aud.load();}catch{}resumeCurrentStation({source:'ios-reload'}).finally(()=>{this._rel=false;});}
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
  set('play',()=>handleMediaSessionPlay());
  set('pause',()=>handleMediaSessionPause());
  set('previoustrack',msPrev);
  set('nexttrack',msNext);
  set('stop',()=>handleMediaSessionStop());
  // Canlı yayında seek bar gözükmesin
  set('seekto',null);set('seekbackward',null);set('seekforward',null);
}
let _metaArtCache=new Map();
let _lastMetaKey='';
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
function _artMime(src){
  try{
    const p=new URL(src,location.href).pathname.toLowerCase();
    if(p.endsWith('.jpg')||p.endsWith('.jpeg'))return 'image/jpeg';
    if(p.endsWith('.webp'))return 'image/webp';
  }catch{}
  return 'image/png';
}
function updateMeta(s){
  if(!('mediaSession' in navigator))return;
  const artwork=[];
  const artSrc=cleanImageUrl(s.img);
  const metaKey=`${s.id}|${s.n}|${s.g||''}|${artSrc}|${DS.enabled?'ds':'full'}`;
  if(_lastMetaKey===metaKey&&navigator.mediaSession.metadata){syncMediaSessionState();return;}
  _lastMetaKey=metaKey;
  if(artSrc&&!DS.enabled){
    // Station logo - primary artwork for lock screen
    const type=_artMime(artSrc);
    artwork.push({src:artSrc,sizes:'512x512',type});
  }else{
    // Canvas fallback with station branding
    const fallback=_makeArtwork(s);
    if(fallback)artwork.push({src:fallback,sizes:'512x512',type:'image/png'});
  }
  try{
    navigator.mediaSession.metadata=new MediaMetadata({
      title:s.n,
      artist:(s.g&&s.g!=='Diğer')?s.g:'Canlı Radyo',
      album:'Pulse Radio',
      artwork
    });
  }catch{}
  syncMediaSessionState();
  // Canlı yayın - seek bar gösterme
  try{navigator.mediaSession.setPositionState({duration:0,position:0,playbackRate:1});}catch{}
}

/* ── PLAY STATE ── */
const S={cur:null,playing:false,should:false,resumable:false,softPaused:false,retries:0};
const aud=g('aud');
const _httpWarned=new Set();
let _resumePromise=null,_resumeToken=0,_lastAutoResumeAt=0;
const AUTO_RESUME_MIN_GAP_MS=1500;
let _iosPauseHoldPromise=null,_lastSoftPauseAt=0,_iosHoldSrc='',_iosHoldSwitching=false,_iosHoldReleaseTimer=null,_suppressIOSPauseHold=false;
/* ── HLS (m3u8) ──
   Safari HLS'i native çalar; diğer tarayıcılarda hls.js (yerelde vendorlanmış,
   yalnızca gerektiğinde yüklenir) MSE üzerinden çalar. */
let _hlsLibPromise=null,_hlsInstance=null,_hlsUrl='';
function isHlsUrl(u){return /\.m3u8(\?|#|$)/i.test(String(u||''));}
function nativeHlsSupported(){return !!aud.canPlayType('application/vnd.apple.mpegurl');}
function needsHlsJs(u){return isHlsUrl(u)&&!nativeHlsSupported();}
function loadHlsLib(){
  if(window.Hls)return Promise.resolve(window.Hls);
  if(_hlsLibPromise)return _hlsLibPromise;
  _hlsLibPromise=new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='js/vendor/hls.light.min.js';
    s.onload=()=>window.Hls?res(window.Hls):rej(new Error('hls-lib'));
    s.onerror=()=>{_hlsLibPromise=null;s.remove();rej(new Error('hls-lib'));};
    document.head.appendChild(s);
  });
  return _hlsLibPromise;
}
function destroyHls(){
  if(!_hlsInstance)return;
  try{_hlsInstance.destroy();}catch{}
  _hlsInstance=null;_hlsUrl='';
}
function _onHlsFatal(){
  // Native <audio> error backoff'unun HLS karşılığı (aynı gecikme merdiveni).
  if(!S.cur||!S.should||IM._uStop||IM._interrupted)return;
  const n=Math.min(S.retries,6);
  const delay=Math.min(60000,2000*Math.pow(2,n));
  S.retries++;
  setStatus('retry');
  if(S.retries<=5)toast(`Bağlantı yeniden deneniyor (${S.retries})`,'warn');
  else if(S.retries===6)toast('Bağlantı düşük, denemeye devam ediliyor...','warn');
  setTimeout(()=>{
    if(!S.cur||!S.should||IM._uStop||IM._interrupted)return;
    if(!navigator.onLine)return;
    resumeCurrentStation({source:'audio-error'});
  },delay);
}
/* Yayını <audio>'ya bağlar; m3u8 + MSE gerektiren tarayıcıda hls.js kullanır.
   false dönerse yayın bu tarayıcıda oynatılamaz (kullanıcı bilgilendirildi). */
async function attachStream(url,force=false){
  if(needsHlsJs(url)){
    let Hls;
    try{Hls=await loadHlsLib();}catch{toast('HLS bileşeni yüklenemedi; bağlantıyı kontrol edin','err');return false;}
    if(!Hls.isSupported()){toast('Bu tarayıcı HLS (m3u8) yayınını desteklemiyor','err');return false;}
    if(_hlsInstance&&_hlsUrl===url&&!force&&!aud.error)return true;
    destroyHls();
    try{aud.removeAttribute('src');}catch{}
    const h=new Hls({enableWorker:false});
    _hlsInstance=h;_hlsUrl=url;
    h.on(Hls.Events.ERROR,(_e,data)=>{
      if(_hlsInstance!==h||!data||!data.fatal)return;
      if(data.type===Hls.ErrorTypes.MEDIA_ERROR){try{h.recoverMediaError();return;}catch{}}
      destroyHls();
      _onHlsFatal();
    });
    h.loadSource(url);
    h.attachMedia(aud);
    return true;
  }
  destroyHls();
  aud.src=url;
  aud.load();
  return true;
}
function warnHttpStream(s){
  if(!s||!isHttpUrl(s.u)||_httpWarned.has(s.id))return;
  _httpWarned.add(s.id);
  toast(location.protocol==='https:'?'HTTP yayın tarayıcı tarafından HTTPS altında engellenebilir':'HTTP yayın güvenli değildir','warn');
}

function setPlaying(v){
  S.playing=v;
  if(v){S.should=true;S.resumable=true;S.softPaused=false;aud.muted=false;aud.volume=IM._baseVol;}
  updatePlayUI();
  syncMediaSessionState();
  g('ambient').classList.toggle('playing',v);
  g('mplay').classList.toggle('playing',v);
  g('fplay').classList.toggle('playing',v);
  if(v)setVisible('installBar',false);
  if(v)DU.startTick();else DU.stopTick();
  updateCarNow();
}
function updatePlayUI(){
  const ic=_ic(S.playing?'pause':'play',{fill:true});
  g('btnPP').innerHTML=ic;g('btnFpPlay').innerHTML=ic;g('fpVis').classList.toggle('paused',!S.playing);
  ['btnPP','btnFpPlay','carPlay'].forEach(id=>g(id)?.setAttribute('aria-pressed',String(S.playing)));
}
function syncMediaSessionState(){
  if(!('mediaSession' in navigator))return;
  try{
    if(S.cur){
      if(!navigator.mediaSession.metadata)updateMeta(S.cur);
      navigator.mediaSession.playbackState=S.playing?'playing':'paused';
    }else{
      navigator.mediaSession.playbackState='none';
    }
  }catch{}
}
function setPausedUI(){
  S.playing=false;updatePlayUI();
  g('ambient').classList.remove('playing');
  g('mplay').classList.remove('playing');
  g('fplay').classList.remove('playing');
  DU.stopTick();updateCarNow();syncMediaSessionState();
}
function setStatus(t){
  const el=g('mStat');
  if(t==='live')el.innerHTML='<span class="cdot"></span>Canlı Yayın';
  else if(t==='conn')el.innerHTML='<span class="cdot warn-dot"></span>Bağlanıyor...';
  else if(t==='load')el.innerHTML='<span class="cdot warn-dot"></span>Yükleniyor...';
  else if(t==='retry')el.innerHTML='<span class="cdot warn-dot"></span>Yeniden bağlanıyor...';
}

/* ── PLAY ── */
function play(id){
  const s=ch.find(x=>x.id===id);if(!s)return;
  warnHttpStream(s);
  _resumeToken++;_resumePromise=null;
  S.cur=s;S.retries=0;S.should=true;S.resumable=true;IM.setUStop(false);
  g('mplay').classList.add('s');g('scr').classList.add('mp-on');
  // Mini player icon
  const mIco=g('mIco');mIco.innerHTML='';mIco.style.background=`linear-gradient(145deg,${s.c||'#7c5cff'},${darken(s.c||'#7c5cff')})`;
  if(s.img){const mi=document.createElement('img');setImageSrc(mi,s.img);mi.alt='';mi.loading='lazy';mi.onerror=function(){this.replaceWith(document.createTextNode(s.e));};mIco.appendChild(mi);}
  else{mIco.textContent=s.e;}
  g('mName').textContent=s.n;
  // Full player art
  const fpArt=g('fpArt');fpArt.innerHTML='';fpArt.style.background=`linear-gradient(135deg,${s.c||'#7c5cff'},${darken(s.c||'#7c5cff')})`;
  if(s.img){const fi=document.createElement('img');setImageSrc(fi,s.img);fi.alt='';fi.onerror=function(){this.replaceWith(document.createTextNode(s.e));};fpArt.appendChild(fi);}
  else{fpArt.textContent=s.e;}
  g('fpOrb1').style.background=s.c||'#7c5cff';
  g('fpOrb2').style.background=darken(s.c||'#7c5cff');
  g('fpName').textContent=s.n;g('fpGenre').textContent=s.g||'Radyo';
  // Bitrate
  if(s.br>0){g('fpBitrate').textContent=`${s.br} kbps`;setVisible('fpBitrate',true,'inline-flex');}else{setVisible('fpBitrate',false);}
  setStatus('conn');updateFavBtn();addHist(s);updateMeta(s);updateCarNow();dsWarnMaybe(s);
  // Yükleme ve NP başlatma resumeCurrentStation içinde tek yerden yapılır
  // (çift aud.load() ve çift NP poller'ı önler).
  resumeCurrentStation({source:'station-select'});
  renderCards();
}
function togglePlay(){if(!S.cur)return;haptic(12);S.playing?pauseForUser({source:'app'}):userResume();}
function shouldSoftPauseForIOS(source){
  return _isIOS()&&S.cur&&!aud.paused&&(source==='media-session'||source==='media-session-stop');
}
function getIOSHoldSrc(){
  if(_iosHoldSrc)return _iosHoldSrc;
  const sampleRate=8000,seconds=1,samples=sampleRate*seconds,dataBytes=samples*2;
  const buf=new ArrayBuffer(44+dataBytes),v=new DataView(buf);
  const str=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
  str(0,'RIFF');v.setUint32(4,36+dataBytes,true);str(8,'WAVE');str(12,'fmt ');
  v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
  v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*2,true);
  v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,dataBytes,true);
  _iosHoldSrc=URL.createObjectURL(new Blob([buf],{type:'audio/wav'}));
  return _iosHoldSrc;
}
function isIOSHoldAudioActive(){
  return !!(_iosHoldSrc&&(aud.currentSrc===_iosHoldSrc||aud.src===_iosHoldSrc));
}
function clearIOSHoldReleaseTimer(){clearTimeout(_iosHoldReleaseTimer);_iosHoldReleaseTimer=null;}
function releaseIOSHoldAudio(){
  clearIOSHoldReleaseTimer();
  if(!isIOSHoldAudioActive())return;
  _suppressIOSPauseHold=true;
  try{aud.pause();aud.loop=false;aud.removeAttribute('src');aud.load();}catch{}
  finally{setTimeout(()=>{_suppressIOSPauseHold=false;},0);}
}
function pauseAudioWithoutIOSHold(){
  _suppressIOSPauseHold=true;
  try{aud.pause();}finally{setTimeout(()=>{_suppressIOSPauseHold=false;},0);}
}
function handleMediaSessionPlay(){
  if(S.cur)return resumeFromMediaSession();
}
function handleMediaSessionPause(){
  if(!S.cur)return;
  if(S.softPaused){updateMeta(S.cur);syncMediaSessionState();return;}
  pauseForUser({source:'media-session'});
}
function handleMediaSessionStop(){
  if(!S.cur)return;
  if(_isIOS()){pauseForUser({source:'media-session-stop'});return;}
  stopSession('media-session-stop',{clearCurrent:false});
}
async function startIOSHoldAudio(){
  _iosHoldSwitching=true;
  try{
    try{aud.pause();}catch{}
    destroyHls();
    aud.loop=true;aud.muted=false;aud.src=getIOSHoldSrc();aud.load();
    await aud.play();
    return true;
  }catch{
    return false;
  }finally{
    setTimeout(()=>{_iosHoldSwitching=false;},600);
  }
}
function enterIOSSoftPause(holdMs=25000){
  S.should=false;S.resumable=true;S.softPaused=true;_lastSoftPauseAt=Date.now();
  IOS._stopRecovery();NP.stop();
  clearIOSHoldReleaseTimer();
  if(holdMs>0)_iosHoldReleaseTimer=setTimeout(()=>{if(S.softPaused)releaseIOSHoldAudio();},holdMs);
}
function softPauseForIOS(){
  // iOS ignores programmatic volume changes for live audio. Swap the live stream
  // to a silent loop so the radio really stops while the PWA keeps Now Playing.
  enterIOSSoftPause();
  startIOSHoldAudio().catch(()=>{});
  setPausedUI();updateMeta(S.cur);syncMediaSessionState();
}
function holdIOSMediaSessionAfterSystemPause(){
  if(!_isIOS()||!S.cur||IM._uStop||IM._interrupted||(!S.resumable&&!S.should))return false;
  enterIOSSoftPause();
  setPausedUI();updateMeta(S.cur);syncMediaSessionState();
  if(_iosPauseHoldPromise)return true;
  _iosPauseHoldPromise=(async()=>{
    try{
      await _resumeAudioContext();
      if(!S.cur||IM._uStop||!S.softPaused)return;
      await startIOSHoldAudio();
      if(S.cur&&!IM._uStop&&S.softPaused){setPausedUI();updateMeta(S.cur);syncMediaSessionState();}
    }catch{
      // If iOS refuses play() here, the PWA cannot reclaim the lock-screen target
      // until Safari grants another media-session action or user gesture.
    }finally{_iosPauseHoldPromise=null;}
  })();
  return true;
}
function handleIOSInterruptionPause(){
  // iOS, bir bildirim/arama/rota değişimi/kilit nedeniyle <audio>'yu kendiliğinden
  // duraklattı. Oynatma niyetini (S.should) KORUYORUZ ki:
  //  1) Kilit ekranı / Control Center "Çal" düğmesi (MediaSession 'play') çalışsın,
  //  2) Ön plana dönüşte (visibilitychange/focus/pageshow) ve recovery timer'ı
  //     resumeCurrentStation'ı tetikleyebilsin.
  // S.should=false YAPMIYORUZ ve sessiz-hold WAV'a GEÇMİYORUZ — eski hata buydu.
  S.softPaused=false;
  setPausedUI();
  // Now Playing hedefini canlı tut: metadata + 'paused' durumu kilit ekranında
  // Çal düğmesini gösterir; kullanıcı dokununca resumeFromMediaSession devreye girer.
  if(S.cur)updateMeta(S.cur);
  syncMediaSessionState();
  // Ön plandaysak kesinti biter bitmez kendiliğinden denemeyi tetikle.
  if(!document.hidden&&S.cur&&S.should&&!IM._uStop)IOS.resume(700);
}
function pauseForUser(opts={}){
  if(!S.cur)return;
  const source=opts.source||'app';
  S.should=false;S.resumable=opts.resumable!==false;IM.setUStop(false);
  IOS._stopRecovery();NP.stop();
  // Kilit ekranından devam edebilmek için context'i kapatma, askıya al.
  IM.suspendAudioContext();
  if(shouldSoftPauseForIOS(source))softPauseForIOS();
  else{S.softPaused=false;releaseIOSHoldAudio();pauseAudioWithoutIOSHold();setPausedUI();}
  // Keep station metadata alive so iOS lock screen / Control Center can resume.
  updateMeta(S.cur);syncMediaSessionState();
}
function stopSession(reason,opts={}){
  const clearCurrent=opts.clearCurrent!==false;
  _resumeToken++;_resumePromise=null;
  IM.setUStop(true);S.should=false;S.resumable=false;S.playing=false;S.softPaused=false;
  IOS._stopRecovery();DU.stopTick();NP.stop();IM.releaseAudioContext();releaseIOSHoldAudio();
  try{aud.loop=false;aud.muted=false;aud.volume=IM._baseVol;pauseAudioWithoutIOSHold();}catch{}
  if(clearCurrent){
    destroyHls();
    try{aud.removeAttribute('src');aud.load();}catch{}S.cur=null;
    // Tam durdurmada sessiz-hold blob URL'ini serbest bırak (gerekirse tekrar üretilir).
    if(_iosHoldSrc){try{URL.revokeObjectURL(_iosHoldSrc);}catch{}_iosHoldSrc='';}
  }
  setPausedUI();
  if(clearCurrent){g('mplay').classList.remove('s');g('scr').classList.remove('mp-on');}
  syncMediaSessionState();updateCarNow();
}
function _sameAudioSrc(url){
  if(!url)return false;
  try{
    const want=new URL(url,location.href).href;
    return aud.currentSrc===want||aud.src===want;
  }catch{return aud.currentSrc===url||aud.src===url;}
}
function _needsStreamReload(){
  if(!S.cur)return false;
  if(_hlsInstance)return _hlsUrl!==S.cur.u||aud.ended||!!aud.error;
  return isIOSHoldAudioActive()||!aud.src||!aud.currentSrc||!_sameAudioSrc(S.cur.u)||aud.ended||!!aud.error||aud.readyState===0;
}
async function prepareCurrentStreamForResume(forceReload=false){
  if(!S.cur)return false;
  aud.loop=false;aud.muted=false;aud.volume=IM._baseVol;
  if(forceReload||_needsStreamReload()){
    return attachStream(S.cur.u,forceReload);
  }
  return true;
}
function _resumeAudioContext(){
  IM.resumeAudioContext();
  return Promise.resolve();
}
function _delay(ms){return new Promise(r=>setTimeout(r,ms));}
async function resumeCurrentStation(opts={}){
  if(!S.cur)return false;
  if(_resumePromise)return _resumePromise;
  const source=opts.source||'app';
  // Otomatik tetikleyicileri (online/error/stalled/recovery/foreground) birleştir:
  // kısa aralıkta üst üste gelen denemeleri yut. Kullanıcı/MediaSession/istasyon
  // seçimi her zaman geçer.
  // 'ios-reload' kapıdan muaf: reload() çağrısı src'yi silmiş durumda, throttle'a
  // takılırsa yayın src'siz (sessiz) kalır; _rel bayrağı zaten fırtınayı önlüyor.
  const isAuto=source!=='app'&&source!=='media-session'&&source!=='station-select'&&source!=='ios-reload';
  const now=Date.now();
  if(isAuto){
    if(now-_lastAutoResumeAt<AUTO_RESUME_MIN_GAP_MS)return false;
    _lastAutoResumeAt=now;
  }
  const token=++_resumeToken;
  _resumePromise=(async()=>{
    IM.setUStop(false);IM._clearTimers();IM._interrupted=false;IM._type=null;IM._hideBanner();
    S.should=true;S.resumable=true;
    releaseIOSHoldAudio();
    updateMeta(S.cur);setStatus('conn');
    await _resumeAudioContext();
    if(token!==_resumeToken||!S.cur)return false;
    try{
      if(S.softPaused)S.softPaused=false;
      if(!(await prepareCurrentStreamForResume(source==='media-session')))throw new Error('attach-failed');
      await aud.play();
      if(token===_resumeToken){setPlaying(true);S.retries=0;setStatus('live');IOS._startRecovery();NP.start(S.cur);renderCards();}
      return true;
    }catch(firstErr){
      if(token!==_resumeToken||!S.cur)return false;
      try{
        S.softPaused=false;
        if(!(await prepareCurrentStreamForResume(true)))throw new Error('attach-failed');
        await _delay(source==='media-session'?350:600);
        await _resumeAudioContext();
        await aud.play();
        if(token===_resumeToken){setPlaying(true);S.retries=0;setStatus('live');IOS._startRecovery();NP.start(S.cur);renderCards();}
        return true;
      }catch{
        if(token===_resumeToken){
          setStatus('retry');setPausedUI();updateMeta(S.cur);
          if(source!=='media-session')toast('Tekrar deneyin','warn');
        }
        return false;
      }
    }
  })().finally(()=>{if(token===_resumeToken)_resumePromise=null;});
  return _resumePromise;
}
function resumeFromMediaSession(){return resumeCurrentStation({source:'media-session'});}
function userResume(){return resumeCurrentStation({source:'app'});}
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
  g('btnFpShuffle').setAttribute('aria-pressed',String(_shuffle));
  toast(_shuffle?'🔀 Karışık mod açık':'🔀 Karışık mod kapalı');
}
function setVol(v){const vol=v/100;if(!S.softPaused){aud.muted=false;aud.volume=vol;}IM.setBaseVol(vol);g('volM').value=v;g('volF').value=v;}
function syncSliders(){const v=Math.round(IM._baseVol*100);g('volM').value=v;g('volF').value=v;}

/* ── SHARE ── */
function shareStation(){
  if(!S.cur)return;
  const s=S.cur;
  let link='';
  try{link=location.origin+location.pathname+'#add='+encodeURIComponent(encodeStation(s));}catch{}
  const text=`${s.n} - ${s.g||'Radyo'} dinliyorum! 📻`+(link?'':`\n${s.u}`);
  if(navigator.share){navigator.share(link?{title:s.n,text,url:link}:{title:s.n,text}).catch(()=>{});}
  else{navigator.clipboard?.writeText(link||`${text}\n${s.u}`).then(()=>toast(link?'Kanal linki kopyalandı':'Link kopyalandı','ok')).catch(()=>{});}
}

/* ── INT OPTS ── */
function loadIntOpts(){const saved=lsLoad(LS.INT,null);if(saved&&typeof saved==='object'){if(typeof saved.call==='boolean')IM.opts.call=saved.call;if(typeof saved.notif==='boolean')IM.opts.notif=saved.notif;if(typeof saved.resumeDelay==='number')IM.opts.resumeDelay=saved.resumeDelay;if(typeof saved.notifVol==='number')IM.opts.notifVol=saved.notifVol;}}
function saveIntOpts(){lsSave(LS.INT,IM.opts);}
function syncIntUI(){g('swCall').checked=IM.opts.call;g('swNotif').checked=IM.opts.notif;g('resumeDelay').value=IM.opts.resumeDelay;g('resumeDelayVal').textContent=(IM.opts.resumeDelay/1000).toFixed(2).replace(/\.?0+$/,'')+'s';g('notifVol').value=IM.opts.notifVol;g('notifVolVal').textContent=IM.opts.notifVol+'%';}

/* ── FAV & HIST ── */
function toggleFav(id){
  const prev=fv.slice();
  const i=fv.indexOf(id);
  if(i>=0)fv.splice(i,1);else fv.push(id);
  if(!dataSave()){fv=prev;toast('Favori kaydedilemedi','err');return;}
  haptic(i>=0?8:14);
  toast(i>=0?'Favoriden çıkarıldı':'Favorilere eklendi',i>=0?undefined:'ok');
  renderCards();updateFavBtn();updateNavBadge();if(_carOpen)renderCarFavs();
}
function updateFavBtn(){
  if(!S.cur)return;
  const on=fv.includes(S.cur.id);
  const btn=g('btnFpFav');
  btn.innerHTML=_ic('heart',{fill:on});
  btn.setAttribute('aria-pressed',String(on));
  if(on)btn.setAttribute('data-fav','on');else btn.removeAttribute('data-fav');
}
function addHist(s){rc=rc.filter(r=>r.id!==s.id);rc.unshift({id:s.id,t:Date.now()});if(rc.length>MAX_H)rc=rc.slice(0,MAX_H);dataSave();}
function updateNavBadge(){const badge=g('favBadge');if(fv.length>0){badge.textContent=fv.length;setVisible(badge,true,'inline-flex');}else{setVisible(badge,false);}}

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
function setStationTone(el,s){
  const color=s.c||COLORS[0];
  el.style.setProperty('--station-color',color);
  el.style.setProperty('--station-color-dark',darken(color));
}
function createCardLogo(s,isOn){
  const ico=document.createElement('div');ico.className='cico';setStationTone(ico,s);
  if(s.img){
    const img=document.createElement('img');img.alt='';
    const src=cleanImageUrl(s.img);
    img.referrerPolicy='no-referrer';
    if(_imgObserver){img.dataset.src=src;img.className='lazy-logo';img.onload=function(){this.classList.add('loaded');};_imgObserver.observe(img);}
    else{img.src=src;}
    img.onerror=function(){this.replaceWith(document.createTextNode(s.e));};ico.appendChild(img);
  }else{ico.textContent=s.e;}
  if(isOn&&S.playing){
    const status=document.createElement('div');status.className='cico-status';status.innerHTML='<div class="ceq"><i></i><i></i><i></i><i></i></div>';ico.appendChild(status);
  }
  return ico;
}
function createCardName(s){
  const nm=document.createElement('div');nm.className='cnam';
  const r=_searchQ?trMatchRange(s.n,_searchQ):null;
  if(r){const n=s.n;nm.innerHTML=esc(n.slice(0,r[0]))+'<b class="mark">'+esc(n.slice(r[0],r[1]))+'</b>'+esc(n.slice(r[1]));}
  else{nm.textContent=s.n;}
  return nm;
}
function createCardChip(text,cls,title){
  const chip=document.createElement('span');chip.className='cbits'+(cls?' '+cls:'');chip.textContent=text;
  if(title)chip.title=title;
  return chip;
}
function createCardMeta(s,isOn,extraText){
  const gn=document.createElement('div');gn.className='cgen';
  if(isOn)gn.appendChild(createCardChip(S.playing?'CANLI':'SEÇİLİ','live'));
  const main=document.createElement('span');main.className='cgen-main';
  if(isOn){const dot=document.createElement('span');dot.className='cdot';main.appendChild(dot);}
  main.appendChild(document.createTextNode(extraText||s.g||'Radyo'));gn.appendChild(main);
  if(!extraText&&s.br>0)gn.appendChild(createCardChip(s.br+'kbps'));
  if(isHttpUrl(s.u))gn.appendChild(createCardChip('HTTP','http','HTTPS altında engellenebilir'));
  return gn;
}
function makeCard(s,showDrag){
  const isOn=S.cur?.id===s.id,isFav=fv.includes(s.id);
  const div=document.createElement('div');div.className='card'+(isOn?' on':'')+(isOn&&S.playing?' playing':'');div.dataset.action='play';div.dataset.id=s.id;setStationTone(div,s);
  div.setAttribute('role','group');div.setAttribute('aria-label',s.n);
  if(isOn)div.setAttribute('aria-current','true');
  const shell=document.createElement('div');shell.className='card-shell'+(showDrag?' has-drag':'');
  if(showDrag){
    const dh=document.createElement('div');dh.className='drag-handle';dh.innerHTML=_ic('grip',{fill:true});dh.dataset.action='drag';dh.setAttribute('aria-label','Sıralamak için sürükle');
    div.draggable=true;shell.appendChild(dh);
  }
  const ico=createCardLogo(s,isOn);
  const inf=document.createElement('div');inf.className='cinf';
  const nm=createCardName(s);
  const gn=createCardMeta(s,isOn);
  inf.appendChild(nm);inf.appendChild(gn);
  const acts=document.createElement('div');acts.className='cacts';
  const fb=document.createElement('button');fb.className='cfav';fb.dataset.action='fav';fb.dataset.id=s.id;fb.innerHTML=_ic('heart',{fill:isFav});fb.setAttribute('aria-label',isFav?'Favoriden çıkar':'Favorilere ekle');fb.setAttribute('aria-pressed',String(isFav));
  const pb=document.createElement('button');pb.className='cplay';pb.dataset.action='play';pb.dataset.id=s.id;pb.innerHTML=_ic(isOn&&S.playing?'pause':'play',{fill:true});pb.setAttribute('aria-label',`${s.n} kanalını çal`);pb.setAttribute('aria-pressed',String(isOn&&S.playing));
  acts.appendChild(fb);acts.appendChild(pb);
  shell.appendChild(ico);shell.appendChild(inf);shell.appendChild(acts);div.appendChild(shell);return div;
}
const _delegated=new WeakSet();
function attachDel(container){
  if(_delegated.has(container))return;
  _delegated.add(container);
  container.addEventListener('click',e=>{
    const fb=e.target.closest('[data-action="fav"]'),pb=e.target.closest('[data-action="play"]');
    if(fb){e.stopPropagation();toggleFav(fb.dataset.id);return;}
    if(pb){addRipple(e,pb);const id=pb.dataset.id;if(S.cur?.id===id){togglePlay();}else{play(id);}}
  });
  container.addEventListener('keydown',e=>{
    if(e.key!=='Enter'&&e.key!==' ')return;
    const target=e.target.closest('[data-action="fav"],[data-action="play"]');
    if(!target||!container.contains(target))return;
    e.preventDefault();target.click();
  });
}

function renderMiniLogo(parent,s,cls){
  const box=document.createElement('div');box.className=cls;setStationTone(box,s);
  if(s?.img){
    const img=document.createElement('img');setImageSrc(img,s.img);img.alt='';img.loading='lazy';
    img.onerror=function(){this.replaceWith(document.createTextNode(s.e||'📻'));};
    box.appendChild(img);
  }else{
    box.textContent=s?.e||'📻';
  }
  parent.appendChild(box);
  return box;
}
function makeHomePill(s,label){
  const btn=document.createElement('button');btn.className='home-pill';btn.type='button';
  btn.setAttribute('aria-label',`${s.n} kanalını çal`);
  const top=document.createElement('div');top.className='home-pill-top';
  renderMiniLogo(top,s,'home-pill-ic');
  const txt=document.createElement('div');txt.className='home-pill-text';
  const nm=document.createElement('div');nm.className='home-pill-name';nm.textContent=s.n;
  const meta=document.createElement('div');meta.className='home-pill-meta';meta.textContent=label||s.g||'Canlı Radyo';
  txt.appendChild(nm);txt.appendChild(meta);top.appendChild(txt);
  const chip=createCardChip(S.cur?.id===s.id&&S.playing?'CANLI':(s.br?`${s.br}kbps`:'Dinle'),S.cur?.id===s.id&&S.playing?'live':'');
  btn.appendChild(top);btn.appendChild(chip);
  btn.addEventListener('click',()=>play(s.id));
  return btn;
}
function quickButton(icon,title,sub,handler){
  const btn=document.createElement('button');btn.className='quick-btn';btn.type='button';
  btn.innerHTML=`<span class="quick-ic">${_ic(icon)}</span><span class="quick-txt"><strong>${esc(title)}</strong><span>${esc(sub)}</span></span>`;
  btn.addEventListener('click',handler);
  return btn;
}

/* ── RENDER ── */
let _renderPending=false;
function renderCards(){
  if(_renderPending)return;
  _renderPending=true;
  requestAnimationFrame(()=>{
    _renderPending=false;
    if(_curPage==='h')renderHome();
    else if(_curPage==='f')renderFavs();
    else if(_curPage==='a')renderAll();
    else if(_curPage==='r')renderRecent();
    else if(_curPage==='s')renderSettings();
  });
}
function renderHome(){
  const w=g('homeList');if(!w)return;
  w.innerHTML='';w.className='pad home-pad';
  const hero=document.createElement('section');hero.className='home-hero';
  const current=S.cur||ch.find(x=>rc[0]?.id===x.id)||ch.find(x=>fv.includes(x.id))||ch[0]||null;
  hero.innerHTML=`<div class="home-kicker">Canlı yayın</div><h1 class="home-title">Pulse Radio</h1><p class="home-sub">Favorilerini, son dinlediklerini ve radyolarını tek elle kontrol et.</p>`;
  const now=document.createElement('div');now.className='home-now';
  if(current){
    renderMiniLogo(now,current,'home-now-ic');
    const copy=document.createElement('div');
    copy.innerHTML=`<div class="home-now-title">${esc(current.n)}</div><div class="home-now-sub">${S.cur?.id===current.id?(S.playing?'Canlı yayın':'Seçili istasyon'):'Hızlı başlat'} · ${esc(current.g||'Radyo')}</div>`;
    const btn=document.createElement('button');btn.className='home-now-btn';btn.type='button';btn.setAttribute('aria-label',`${current.n} kanalını çal`);btn.innerHTML=_ic(S.cur?.id===current.id&&S.playing?'pause':'play',{fill:true});btn.addEventListener('click',()=>{if(S.cur?.id===current.id){togglePlay();}else{play(current.id);}});
    now.appendChild(copy);now.appendChild(btn);
  }else{
    now.innerHTML=`<div class="home-now-ic">${_ic('radio')}</div><div><div class="home-now-title">Başlamak için radyo ekle</div><div class="home-now-sub">Türkiye, dünya veya manuel yayın adresi</div></div>`;
    const btn=document.createElement('button');btn.className='home-now-btn';btn.type='button';btn.setAttribute('aria-label','Radyo ekle');btn.innerHTML=_ic('plus');btn.addEventListener('click',openMod);now.appendChild(btn);
  }
  hero.appendChild(now);w.appendChild(hero);

  if(!ch.length&&!starterDismissed()){
    w.appendChild(makeStarterBox());
  }

  const quick=document.createElement('div');quick.className='quick-grid';
  quick.appendChild(quickButton('heart','Favoriler',`${fv.length} kayıt`,()=>goPage('f')));
  quick.appendChild(quickButton('shuffle','Karıştır',ch.length>1?'Rastgele çal':'Kanal ekle',()=>{if(ch.length<2){openMod();return;}shufflePlay();}));
  quick.appendChild(quickButton('car','Araba Modu','Büyük kontroller',openCar));
  quick.appendChild(quickButton('plus','Radyo Ekle','Yeni yayın bul',openMod));
  w.appendChild(quick);

  const favStations=ch.filter(x=>fv.includes(x.id)).sort((a,b)=>fv.indexOf(a.id)-fv.indexOf(b.id)).slice(0,6);
  const recentStations=rc.map(r=>ch.find(x=>x.id===r.id)).filter(Boolean).slice(0,6);
  const suggested=getFiltered(ch).filter(x=>!fv.includes(x.id)).slice(0,6);

  const chMap=new Map(ch.map(x=>[x.id,x]));
  const topStations=ST.top(6).filter(([,sec])=>sec>=60).map(([id])=>chMap.get(id)).filter(Boolean);
  const sections=[
    ['Hızlı Favoriler',favStations,'Favori'],
    ['En Çok Dinlenenler',topStations,'⏱'],
    ['Son Dinlenenler',recentStations,'Son'],
    ['Önerilen',suggested,'Keşfet']
  ];
  sections.forEach(([title,list,label])=>{
    if(title==='En Çok Dinlenenler'&&!list.length)return; // istatistik birikince görünür
    const ttl=document.createElement('div');ttl.className='ttl';ttl.innerHTML=`${title} <span class="count-badge">${list.length}</span>`;w.appendChild(ttl);
    if(list.length){
      const strip=document.createElement('div');strip.className='home-strip';
      list.forEach(s=>strip.appendChild(makeHomePill(s,title==='En Çok Dinlenenler'?ST.format(ST.of(s.id)):label)));
      w.appendChild(strip);
    }else{
      const note=document.createElement('div');note.className='home-empty-note';note.textContent=title==='Önerilen'?'Henüz önerilecek kanal yok. Radyo ekleyerek başla.':'Bu bölüm dinleme alışkanlığına göre dolacak.';
      w.appendChild(note);
    }
  });
  attachDel(w);
}
function renderAll(){
  const w=g('allList');w.innerHTML='';
  w.classList.add('card-grid');
  const filtered=getFiltered(ch);
  if(!ch.length){w.innerHTML=`<div class="empty"><span class="empty-ic">${_ic('broadcast')}</span><h3>Henüz kanal yok</h3><p>Radyo arayıp ekleyin veya Türk radyolarını keşfedin</p><button class="empty-btn" id="eaA">${_ic('plus')}<span>Radyo Ekle</span></button></div>`;g('eaA')?.addEventListener('click',openMod);return;}
  if(!filtered.length){w.innerHTML=`<div class="empty"><span class="empty-ic">${_ic('search')}</span><h3>Sonuç bulunamadı</h3><p>Farklı bir filtre veya arama deneyin</p></div>`;return;}
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
  const f=document.createDocumentFragment();filtered.forEach(s=>f.appendChild(makeCard(s)));w.appendChild(f);attachDel(w);
}
function renderFavs(){
  const w=g('favList');w.innerHTML='';
  w.classList.add('card-grid');
  const favStations=ch.filter(x=>fv.includes(x.id));
  favStations.sort((a,b)=>fv.indexOf(a.id)-fv.indexOf(b.id));
  const list=getFiltered(favStations);
  if(!favStations.length){w.innerHTML=`<div class="empty"><span class="empty-ic">${_ic('heart')}</span><h3>Favori yok</h3><p>Kanallarım sekmesinden kalp simgesi ile ekleyin<br>veya yeni radyo arayın</p><button class="empty-btn" id="eaF">${_ic('plus')}<span>Radyo Ekle</span></button></div>`;g('eaF')?.addEventListener('click',openMod);return;}
  if(!list.length){w.innerHTML=`<div class="empty"><span class="empty-ic">${_ic('search')}</span><h3>Filtre sonucu boş</h3><p>Farklı bir kategori deneyin</p></div>`;return;}
  w.classList.add('fav-mode');
  const ttl=document.createElement('div');ttl.className='ttl';ttl.innerHTML=`Favorilerim <span class="count-badge">${list.length}</span>`;w.appendChild(ttl);
  const f=document.createDocumentFragment();list.forEach(s=>f.appendChild(makeCard(s,true)));w.appendChild(f);attachDel(w);initFavDrag(w);
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
    const prev=fv.slice();fv.splice(fromIdx,1);fv.splice(toIdx,0,dragId);
    if(!dataSave()){fv=prev;toast('Sıralama kaydedilemedi','err');return;}
    renderFavs();toast('Sıralama güncellendi','ok');
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
      if(fromIdx>=0&&toIdx>=0){const prev=fv.slice();fv.splice(fromIdx,1);fv.splice(toIdx,0,touchDragId);if(!dataSave()){fv=prev;toast('Sıralama kaydedilemedi','err');}else{renderFavs();toast('Sıralama güncellendi','ok');}}
    }
    container.querySelectorAll('.drag-over').forEach(c=>c.classList.remove('drag-over'));
    touchDragId=null;touchMoved=false;
  });
}
function renderRecent(){
  const w=g('recList');w.innerHTML='';const chMap=new Map(ch.map(x=>[x.id,x]));const valid=rc.filter(r=>chMap.has(r.id));
  w.classList.add('card-grid');
  if(!valid.length){w.innerHTML=`<div class="empty"><span class="empty-ic">${_ic('history')}</span><h3>Geçmiş yok</h3><p>Dinlediğiniz radyolar burada görünür</p></div>`;return;}
  const ttl=document.createElement('div');ttl.className='ttl';ttl.innerHTML=`Son Dinlenenler <span class="count-badge">${valid.length}</span>`;w.appendChild(ttl);
  const f=document.createDocumentFragment();
  valid.forEach((r,i)=>{
    const s=chMap.get(r.id);
    const isOn=S.cur?.id===s.id;
    const div=document.createElement('div');div.className='card'+(isOn?' on':'')+(isOn&&S.playing?' playing':'');div.dataset.action='play';div.dataset.id=s.id;setStationTone(div,s);
    div.setAttribute('role','group');div.setAttribute('aria-label',s.n);
    if(isOn)div.setAttribute('aria-current','true');
    const shell=document.createElement('div');shell.className='card-shell';
    const ico=createCardLogo(s,isOn);
    const inf=document.createElement('div');inf.className='cinf';
    const nm=document.createElement('div');nm.className='cnam';nm.textContent=s.n;
    const gn=createCardMeta(s,isOn,relTime(r.t));
    const acts=document.createElement('div');acts.className='cacts';
    const isFav=fv.includes(s.id);
    const fb=document.createElement('button');fb.className='cfav';fb.dataset.action='fav';fb.dataset.id=s.id;fb.innerHTML=_ic('heart',{fill:isFav});fb.setAttribute('aria-label',isFav?'Favoriden çıkar':'Favorilere ekle');fb.setAttribute('aria-pressed',String(isFav));
    const pb=document.createElement('button');pb.className='cplay';pb.dataset.action='play';pb.dataset.id=s.id;pb.innerHTML=_ic(isOn&&S.playing?'pause':'play',{fill:true});pb.setAttribute('aria-label',`${s.n} kanalını çal`);pb.setAttribute('aria-pressed',String(isOn&&S.playing));
    acts.appendChild(fb);acts.appendChild(pb);inf.appendChild(nm);inf.appendChild(gn);shell.appendChild(ico);shell.appendChild(inf);shell.appendChild(acts);div.appendChild(shell);f.appendChild(div);
  });
  w.appendChild(f);attachDel(w);
}
function renderSettings(){
  const w=g('chList');g('chCount').textContent=ch.length;w.innerHTML='';
  g('statCh').textContent=ch.length;g('statFav').textContent=fv.length;g('statRec').textContent=rc.length;
  const stTime=g('statTime');if(stTime){const t=ST.total();stTime.textContent=t<60?'0 dk':ST.format(t);}
  if(!ch.length){const r=document.createElement('div');r.className='set-row is-static';r.innerHTML=`<div class="set-ic ic-muted">${_ic('broadcast')}</div><div class="set-lb"><h4>Kanal yok</h4><p>Radyo arayıp ekleyin</p></div>`;w.appendChild(r);return;}
  const f=document.createDocumentFragment();
  ch.forEach(s=>{
    const r=document.createElement('div');r.className='set-row is-static';
    const ic=document.createElement('div');ic.className='set-ic';ic.style.background=`linear-gradient(145deg,${s.c||'#7c5cff'},${darken(s.c||'#7c5cff')})`;ic.style.color='#fff';
    if(s.img){const img=document.createElement('img');setImageSrc(img,s.img);img.alt='';img.loading='lazy';img.className='set-logo-img';img.onerror=function(){this.replaceWith(document.createTextNode(s.e));};ic.appendChild(img);}
    else{ic.textContent=s.e;}
    const lb=document.createElement('div');lb.className='set-lb';
    const h4=document.createElement('h4');h4.textContent=s.n;const p=document.createElement('p');p.textContent=(s.g||'Radyo')+(s.br?' · '+s.br+'kbps':'');
    lb.appendChild(h4);lb.appendChild(p);
    const acts=document.createElement('div');acts.className='set-row-acts';
    const eb=document.createElement('button');eb.className='edit-b';eb.dataset.action='edit';eb.dataset.id=s.id;eb.innerHTML=_ic('edit');eb.setAttribute('aria-label',`${s.n} kanalını düzenle`);
    const btn=document.createElement('button');btn.className='del-b';btn.dataset.action='del';btn.dataset.id=s.id;btn.innerHTML=_ic('trash');btn.setAttribute('aria-label',`${s.n} kanalını sil`);
    acts.appendChild(eb);acts.appendChild(btn);
    r.appendChild(ic);r.appendChild(lb);r.appendChild(acts);f.appendChild(r);
  });
  w.appendChild(f);
  if(!_delegated.has(w)){_delegated.add(w);w.addEventListener('click',e=>{
    const eb=e.target.closest('[data-action="edit"]');
    if(eb){e.stopPropagation();openEditCh(eb.dataset.id);return;}
    const b=e.target.closest('[data-action="del"]');if(b){e.stopPropagation();delCh(b.dataset.id);}
  });}
}

/* ── CHIPS (genre filter) ── */
function renderChips(){
  const c=g('chips');c.innerHTML='';
  GENRES.forEach(genre=>{
    const chip=document.createElement('div');chip.className='chip'+(genre===_filterGenre?' a':'');chip.textContent=genre;
    chip.dataset.genre=genre;
    chip.tabIndex=0;chip.setAttribute('role','button');chip.setAttribute('aria-pressed',String(genre===_filterGenre));
    c.appendChild(chip);
  });
  if(!_delegated.has(c)){
    _delegated.add(c);
    c.addEventListener('click',e=>{const chip=e.target.closest('.chip');if(!chip||!chip.dataset.genre)return;_filterGenre=chip.dataset.genre;renderChips();renderCards();});
    c.addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;const chip=e.target.closest('.chip');if(!chip||!chip.dataset.genre)return;e.preventDefault();chip.click();});
  }
}

/* ── NAV ── */
let _curPage='h';
function goPage(p){
  _curPage=p;
  document.querySelectorAll('.pg').forEach(x=>x.classList.remove('a'));
  document.querySelectorAll('.bnav button').forEach(x=>{x.classList.remove('a');x.removeAttribute('aria-current');});
  g({h:'pH',f:'pF',a:'pA',r:'pR',s:'pS'}[p]).classList.add('a');
  const nav=g({h:'navH',f:'navF',a:'navA',r:'navR',s:'navS'}[p]);nav.classList.add('a');nav.setAttribute('aria-current','page');
  const showSearch=(p==='h'||p==='f'||p==='a')&&ch.length>0;
  setVisible('searchBar',showSearch,'block');
  setVisible('chips',showSearch,'flex');
  if(p==='h')renderHome();if(p==='f')renderFavs();if(p==='a')renderAll();if(p==='r')renderRecent();if(p==='s')renderSettings();
  g('scr').scrollTop=0;
}

/* ── FULL PLAYER ── */
let _fpPrevFocus=null,_carPrevFocus=null;
function openFP(){
  _fpPrevFocus=document.activeElement;
  setDialogOpen('fplay',true);syncSliders();syncIntUI();g('btnFpShuffle').classList.toggle('shuffle-on',_shuffle);g('btnFpShuffle').setAttribute('aria-pressed',String(_shuffle));
  setTimeout(()=>g('btnFpClose').focus?.(),30);
}
function closeFP(){if(_deferDialogClose('fplay'))return;setDialogOpen('fplay',false);setTimeout(()=>_fpPrevFocus?.focus?.(),0);}

/* ── CAR MODE ── */
let _carOpen=false,_wakeLock=null,_wakeRetryT=null,_wakeRetryMs=1000;
async function requestCarWakeLock(){
  if(!_carOpen||!navigator.wakeLock||_wakeLock)return;
  try{
    _wakeLock=await navigator.wakeLock.request('screen');
    _wakeRetryMs=1000;
    _wakeLock.addEventListener('release',()=>{
      _wakeLock=null;
      clearTimeout(_wakeRetryT);
      if(_carOpen&&!document.hidden){
        const delay=_wakeRetryMs;
        _wakeRetryMs=Math.min(_wakeRetryMs*3,10000);
        _wakeRetryT=setTimeout(requestCarWakeLock,delay);
      }
    });
  }catch{}
}
async function releaseCarWakeLock(){
  clearTimeout(_wakeRetryT);
  _wakeRetryMs=1000;
  const lock=_wakeLock;_wakeLock=null;
  try{await lock?.release();}catch{}
}
function openCar(){
  haptic(15);
  _carOpen=true;
  _carPrevFocus=document.activeElement;
  setDialogOpen('carMode',true);
  renderCarFavs();updateCarNow();
  try{if(screen.orientation?.lock)screen.orientation.lock('landscape').catch(()=>{});}catch{}
  requestCarWakeLock();
  setTimeout(()=>g('carClose').focus?.(),30);
}
function closeCar(){
  if(_deferDialogClose('carMode'))return;
  _carOpen=false;
  setDialogOpen('carMode',false);
  releaseCarWakeLock();
  try{if(screen.orientation?.unlock)screen.orientation.unlock();}catch{}
  setTimeout(()=>_carPrevFocus?.focus?.(),0);
}
function updateCarNow(){
  if(!_carOpen)return;
  const nm=g('carNm'),np=g('carNp'),gn=g('carGn'),pb=g('carPlay');
  if(S.cur){nm.textContent=S.cur.n;gn.textContent=S.cur.g||'Radyo';np.textContent=NP._curTitle||'';}
  else{nm.textContent='Radyo seç';gn.textContent='';np.textContent='';}
  pb.innerHTML=_ic(S.playing?'pause':'play',{fill:true});
  pb.setAttribute('aria-pressed',String(S.playing));
  renderCarFavs();
}
function renderCarFavs(){
  const w=g('carFavs');if(!w)return;
  w.innerHTML='';
  const list=ch.filter(x=>fv.includes(x.id));
  list.sort((a,b)=>fv.indexOf(a.id)-fv.indexOf(b.id));
  if(!list.length){w.innerHTML='<div class="car-fav-empty">Henüz favori yok.<br>Favorileri ana ekrandan ekleyin.</div>';return;}
  const f=document.createDocumentFragment();
  list.slice(0,12).forEach(s=>{
    const d=document.createElement('button');d.type='button';d.className='car-fav'+(S.cur?.id===s.id?' on':'');d.dataset.id=s.id;
    const ic=document.createElement('div');ic.className='car-fav-ic';ic.style.background=`linear-gradient(145deg,${s.c||'#7c5cff'},${darken(s.c||'#7c5cff')})`;
    if(s.img){const im=document.createElement('img');setImageSrc(im,s.img);im.alt='';im.loading='lazy';im.onerror=function(){this.replaceWith(document.createTextNode(s.e));};ic.appendChild(im);}
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
  _slT=setInterval(()=>{const l=end-Date.now();if(l<=0){stopSession('sleep-timer');clearInterval(_slT);_slT=null;lbl.classList.remove('s');g('sleepSel').value='0';toast('Uyku zamanlayıcısı: durdu');return;}lbl.textContent=`⏰ ${Math.floor(l/60000)}:${Math.floor((l%60000)/1000).toString().padStart(2,'0')}`;},1000);
  toast(`⏰ ${min} dk sonra durur`);
}

/* ── ADD/DEL ── */
function addCh(name,url,genre,emoji,imgUrl,bitrate){
  if(!isUrl(url)){toast('Geçersiz URL','err');return false;}
  if(ch.find(x=>x.u===url)){toast('Bu kanal zaten ekli','warn');return false;}
  const station={id:mkId(),n:name.slice(0,MAX_N),g:(genre||'Diğer').slice(0,MAX_G),u:url,e:(emoji||'\uD83D\uDCFB').slice(0,4),c:COLORS[Math.floor(Math.random()*COLORS.length)],img:cleanImageUrl(imgUrl),br:bitrate||0};
  ch.push(station);
  if(!dataSave()){ch=ch.filter(x=>x.id!==station.id);toast('Kanal kaydedilemedi','err');return false;}
  renderCards();renderSettings();updateSearchVisibility();updateNavBadge();
  toast(isHttpUrl(url)?'Kanal eklendi; HTTP yayın HTTPS altında engellenebilir':name+' eklendi',isHttpUrl(url)?'warn':'ok');
  if(!station.img)scheduleAutoFetchLogos(500,3);
  return true;
}
async function delCh(id){
  const s=ch.find(x=>x.id===id);
  const ok=await confirm2('Kanalı sil',`"${s?.n||'Bu kanal'}" silinecek. Emin misiniz?`);if(!ok)return;
  const prev={ch:ch.slice(),fv:fv.slice(),rc:rc.slice()};
  ch=ch.filter(x=>x.id!==id);
  // Önce kaydet, başarılıysa yayını durdur: kayıt başarısız olursa geri alınan
  // S.cur'un ses/mini-player durumu da bozulmamış olur.
  if(!dataSave()){ch=prev.ch;fv=prev.fv;rc=prev.rc;toast('Silme kaydedilemedi','err');return;}
  if(S.cur?.id===id){stopSession('delete-station');}
  renderCards();renderSettings();updateSearchVisibility();updateNavBadge();toast('Silindi');
}

function updateSearchVisibility(){
  const show=(_curPage==='h'||_curPage==='f'||_curPage==='a')&&ch.length>0;
  setVisible('searchBar',show,'block');
  setVisible('chips',show,'flex');
}

/* ── MODAL ── */
let _editId=null;
function openMod(){setDialogOpen('addMod',true);}
function closeMod(){
  if(_deferDialogClose('addMod'))return;
  setDialogOpen('addMod',false);
  ['rTR','rGL','rTG'].forEach(id=>g(id).innerHTML='');
  g('inN').value='';g('inU').value='';g('inE').value='📻';g('inImg').value='';
  g('fgN').classList.remove('bad');g('fgU').classList.remove('bad');
  if(_editId){
    _editId=null;
    g('addModalTitle').innerHTML=`${_ic('radio')}Radyo Ekle`;
    g('btnMAdd').textContent='Ekle';
    document.querySelector('.add-tabs').classList.remove('is-hidden');
    _activateAddTab('tr');
  }
}
function openEditCh(id){
  const s=ch.find(x=>x.id===id);if(!s)return;
  _editId=id;
  g('addModalTitle').innerHTML=`${_ic('edit')}Radyoyu Düzenle`;
  g('btnMAdd').textContent='Kaydet';
  document.querySelector('.add-tabs').classList.add('is-hidden');
  _activateAddTab('manual');
  g('inN').value=s.n;g('inU').value=s.u;
  const inC=g('inC');inC.value=s.g||'Diğer';if(inC.value!==s.g)inC.value='Diğer';
  g('inE').value=s.e||'📻';g('inImg').value=s.img||'';
  g('fgN').classList.remove('bad');g('fgU').classList.remove('bad');
  setDialogOpen('addMod',true);
}
function setupAddSheetKeyboard(){
  const modal=g('addMod');
  const sheet=modal?.querySelector('.modal-c');
  if(!modal||!sheet)return;
  modal.addEventListener('focusin',e=>{
    if(!e.target.matches('input,select,textarea'))return;
    setTimeout(()=>e.target.scrollIntoView({block:'center',inline:'nearest',behavior:'smooth'}),80);
  });
  if(window.visualViewport){
    const sync=()=>sheet.style.setProperty('--vvh',`${Math.round(window.visualViewport.height)}px`);
    window.visualViewport.addEventListener('resize',sync);
    window.visualViewport.addEventListener('scroll',sync);
    sync();
  }
}
let _activateAddTab=()=>{};
function setupAddTabs(){
  const tabs=[...document.querySelectorAll('[data-add-tab]')];
  const panels=[...document.querySelectorAll('[data-add-panel]')];
  const activate=name=>{
    tabs.forEach(tab=>{const on=tab.dataset.addTab===name;tab.classList.toggle('a',on);tab.setAttribute('aria-selected',String(on));});
    panels.forEach(panel=>panel.classList.toggle('a',panel.dataset.addPanel===name));
  };
  _activateAddTab=activate;
  tabs.forEach(tab=>tab.addEventListener('click',()=>activate(tab.dataset.addTab)));
}
function doManualAdd(){
  const name=g('inN').value.trim(),url=g('inU').value.trim();let ok=true;
  if(!name){g('fgN').classList.add('bad');ok=false;}else g('fgN').classList.remove('bad');
  if(!isUrl(url)){g('fgU').classList.add('bad');ok=false;}else g('fgU').classList.remove('bad');
  if(!ok)return;
  if(_editId){if(applyEditCh(_editId,name,url))closeMod();return;}
  if(addCh(name,url,g('inC').value,g('inE').value||'📻',g('inImg').value.trim()))closeMod();
}
function applyEditCh(id,name,url){
  const s=ch.find(x=>x.id===id);
  if(!s){toast('Kanal bulunamadı','err');return true;}
  if(ch.some(x=>x.id!==id&&x.u===url)){toast('Bu URL başka bir kanalda kayıtlı','warn');return false;}
  const prev={...s};
  const urlChanged=s.u!==url;
  s.n=name.slice(0,MAX_N);s.g=(g('inC').value||'Diğer').slice(0,MAX_G);s.u=url;
  s.e=(g('inE').value||'📻').slice(0,4);s.img=cleanImageUrl(g('inImg').value.trim());
  if(!dataSave()){Object.assign(s,prev);toast('Değişiklik kaydedilemedi','err');return false;}
  renderCards();renderSettings();
  if(S.cur?.id===s.id){
    g('mName').textContent=s.n;g('fpName').textContent=s.n;g('fpGenre').textContent=s.g||'Radyo';
    updatePlayerArt();
    // URL değiştiyse ve yayın niyeti sürüyorsa yeni adresle yeniden başlat
    if(urlChanged&&(S.playing||S.should))play(s.id);
  }
  toast('Kanal güncellendi','ok');
  if(!s.img)scheduleAutoFetchLogos(500,3);
  return true;
}

/* ── SEARCH API ── */
const _sr=new Map();
const _searchSeq={};
function _srSet(k,v){if(_sr.size>10){const first=_sr.keys().next().value;_sr.delete(first);}_sr.set(k,v);}
const SEARCH_PAGE=30;
const _srchState={}; // targetId -> {key,base,fallbackTag,seen,list,offset,done}
async function runSearch(targetId,key,base,opts={}){
  const el=g(targetId);
  const append=!!opts.append;
  const st=append&&_srchState[targetId]?_srchState[targetId]:
    {key,base,fallbackTag:opts.fallbackTag||'',seen:new Set(),list:[],offset:0,done:false};
  _srchState[targetId]=st;
  const seq=(_searchSeq[targetId]||0)+1;_searchSeq[targetId]=seq;
  try{
    if(!append)el.innerHTML='<div class="sr-msg"><div class="skeleton skel-wide"></div><div class="skeleton skel-narrow"></div></div>';
    const d=await apiCall(`stations/search?${st.base}&limit=${SEARCH_PAGE}&offset=${st.offset}&hidebroken=true&order=clickcount&reverse=true`);
    if(_searchSeq[targetId]!==seq)return;
    const got=Array.isArray(d)?d:[];
    got.forEach(x=>{if(!st.seen.has(x.stationuuid)){st.seen.add(x.stationuuid);st.list.push(x);}});
    st.offset+=SEARCH_PAGE;
    if(got.length<SEARCH_PAGE)st.done=true;
    // İlk sayfa zayıfsa tür araması ile tamamla (yalnız ad aramalarında)
    if(!append&&st.fallbackTag&&st.list.length<8){
      const extra=st.base.includes('countrycode=')?'&'+st.base.split('&').filter(p=>p.startsWith('countrycode=')).join(''):'';
      const d2=await apiCall(`stations/search?tag=${encodeURIComponent(st.fallbackTag)}${extra}&limit=20&hidebroken=true&order=clickcount&reverse=true`);
      if(_searchSeq[targetId]!==seq)return;
      if(d2)d2.forEach(x=>{if(!st.seen.has(x.stationuuid)){st.seen.add(x.stationuuid);st.list.push(x);}});
    }
    if(!st.list.length){el.innerHTML='<div class="sr-msg">Bulunamadı. Farklı terim deneyin.</div>';return false;}
    _srSet(key,st.list);
    renderSR(st.list,el,key);
    return true;
  }catch{
    if(_searchSeq[targetId]===seq&&!append)el.innerHTML='<div class="sr-msg">Arama sırasında hata oluştu.</div>';
    return false;
  }
}
async function doTagSearch(q){
  // Önce Türkiye içinde ara; sonuç yoksa tüm dünyada dene.
  const found=await runSearch('rTG','tag',`tag=${encodeURIComponent(q)}&countrycode=TR`);
  if(found===false&&_srchState.rTG&&!_srchState.rTG.list.length){
    await runSearch('rTG','tag',`tag=${encodeURIComponent(q)}`);
  }
}
function renderSR(data,container,key){
  const wrap=document.createElement('div');wrap.className='srch-res';
  const st=_srchState[container.id];
  data.forEach((x,i)=>{
    const url=x.url_resolved||x.url,added=ch.some(a=>a.u===url);
    const item=document.createElement('div');item.className='sr-item';
    if(cleanImageUrl(x.favicon)){const sImg=document.createElement('img');setImageSrc(sImg,x.favicon);sImg.alt='';sImg.className='sr-logo';sImg.loading='lazy';sImg.onerror=function(){this.style.display='none';};item.appendChild(sImg);}
    const inf=document.createElement('div');inf.className='sr-inf';
    const nm=document.createElement('div');nm.className='sr-nm';nm.textContent=x.name;
    const tg=document.createElement('div');tg.className='sr-tg';tg.textContent=`${x.country||''} · ${x.tags?x.tags.split(',').slice(0,2).join(', '):'—'} · ${x.bitrate||'?'} kbps`;
    inf.appendChild(nm);inf.appendChild(tg);item.appendChild(inf);
    if(added){const ok=document.createElement('span');ok.className='sr-ok';ok.textContent='✓ Ekli';item.appendChild(ok);}
    else{const btn=document.createElement('button');btn.className='sr-add';btn.textContent='+ Ekle';btn.dataset.key=key;btn.dataset.i=i;item.appendChild(btn);}
    wrap.appendChild(item);
  });
  wrap.addEventListener('click',e=>{const btn=e.target.closest('.sr-add');if(!btn)return;pickSR(btn.dataset.key,parseInt(btn.dataset.i,10),container,key);});
  if(st&&!st.done){
    const more=document.createElement('button');more.type='button';more.className='sr-more';more.textContent='Daha fazla yükle';
    more.addEventListener('click',()=>{more.disabled=true;more.textContent='Yükleniyor...';runSearch(container.id,st.key,st.base,{append:true});});
    wrap.appendChild(more);
  }
  container.innerHTML='';container.appendChild(wrap);
}
function pickSR(cacheKey,i,container,origKey){
  const data=_sr.get(cacheKey);if(!data?.[i])return;
  const x=data[i],url=x.url_resolved||x.url;if(!isUrl(url)){toast('Geçersiz URL','err');return;}
  const genre=genreFromTags(x.tags);
  const favicon=cleanImageUrl(x.favicon);
  if(addCh(x.name,url,genre,'📻',favicon,x.bitrate||0)){const fresh=_sr.get(origKey);if(fresh)renderSR(fresh,container,origKey);}
}

/* ── AUTO FETCH LOGOS ── */
let _logoFetching=false;
function shouldAutoFetchLogos(){return !document.hidden&&!_isIOS()&&!DS.enabled&&!isCellular();}
function scheduleAutoFetchLogos(delay=2500,limit=5){
  setTimeout(()=>{if(shouldAutoFetchLogos())autoFetchLogos(limit);},delay);
}
async function autoFetchLogos(limit=20){
  if(_logoFetching)return;
  const allMissing=ch.filter(s=>!s.img);
  const missing=allMissing.slice(0,limit);
  if(!missing.length)return;
  _logoFetching=true;
  let updated=0;
  const prevImgs=new Map(missing.map(s=>[s.id,s.img]));
  const curHadImg=!!S.cur?.img;
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
        const match=d.find(x=>cleanImageUrl(x.favicon));
        if(match){
          const logo=cleanImageUrl(match.favicon);
          if(logo){s.img=logo;updated++;}
        }
      }
    }catch{}
    // Small delay to avoid hammering the API
    await new Promise(r=>setTimeout(r,300));
  }
  }finally{_logoFetching=false;}
  if(updated>0){
    // Kayıt başarısızsa bellekteki img mutasyonlarını geri al (diğer tüm
    // mutasyonlardaki prev-snapshot kuralıyla tutarlı).
    if(!dataSave()){missing.forEach(s=>{if(prevImgs.has(s.id))s.img=prevImgs.get(s.id);});toast('Logolar kaydedilemedi','err');return;}
    renderCards();
    // S.cur, ch içindeki objeyle aynı referans olduğundan logosu bu turda
    // dolduysa S.cur.img zaten dolu; çalma öncesi durumla karşılaştır.
    if(S.cur?.img&&!curHadImg)updatePlayerArt();
    const left=Math.max(0,allMissing.length-missing.length);
    toast(left?`${updated} logo indirildi, ${left} sonraya bırakıldı`:`${updated} logo otomatik indirildi`,'ok');
  }
}
function updatePlayerArt(){
  if(!S.cur)return;
  const s=S.cur;
  const mIco=g('mIco');mIco.innerHTML='';mIco.style.background=`linear-gradient(145deg,${s.c||'#7c5cff'},${darken(s.c||'#7c5cff')})`;
  if(s.img){const mi=document.createElement('img');setImageSrc(mi,s.img);mi.alt='';mi.loading='lazy';mi.onerror=function(){this.replaceWith(document.createTextNode(s.e));};mIco.appendChild(mi);}
  else{mIco.textContent=s.e;}
  const fpArt=g('fpArt');fpArt.innerHTML='';fpArt.style.background=`linear-gradient(135deg,${s.c||'#7c5cff'},${darken(s.c||'#7c5cff')})`;
  if(s.img){const fi=document.createElement('img');setImageSrc(fi,s.img);fi.alt='';fi.loading='lazy';fi.onerror=function(){this.replaceWith(document.createTextNode(s.e));};fpArt.appendChild(fi);}
  else{fpArt.textContent=s.e;}
  updateMeta(s);
}

/* ── EXPORT/IMPORT/RESET ── */
function doExport(){
  const blob=new Blob([JSON.stringify(backupData(),null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='pulse_radio_yedek.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Yedek indirildi','ok');
}
function importData(d){
  // Birleştirme mantığı tek kaynaktan: src/lib/core.js:mergeImportedBackup.
  const res=mergeImportedBackup({current:{ch,fv,rc},incoming:d,makeId:mkId,colors:COLORS});
  const prev={ch,fv,rc};
  ch=res.ch;fv=res.fv;rc=res.rc;
  if(!dataSave()){ch=prev.ch;fv=prev.fv;rc=prev.rc;throw new Error('save-failed');}
  renderCards();renderSettings();updateSearchVisibility();updateNavBadge();
  return{added:res.added,mapped:res.mapped};
}
function doImport(e){
  const f=e.target.files[0];if(!f)return;
  if(f.size>MAX_IMPORT_BYTES){toast('Yedek dosyası çok büyük','err');e.target.value='';return;}
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
  const prev={ch:ch.slice(),fv:fv.slice(),rc:rc.slice(),cur:S.cur};
  ch=[];fv=[];rc=[];stopSession('reset-all');
  if(!dataSave()){ch=prev.ch;fv=prev.fv;rc=prev.rc;S.cur=prev.cur;toast('Sıfırlama kaydedilemedi','err');return;}
  renderCards();renderSettings();updateSearchVisibility();updateNavBadge();toast('Sıfırlandı');
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
    if(_activeDialog?.id==='inpOv'){e.preventDefault();_inpClose(null);return;}
    if(_activeDialog?.id==='addMod'){e.preventDefault();closeMod();return;}
    if(_activeDialog?.id==='iosInstallOv'){e.preventDefault();closeIOSInstall();return;}
    closeFP();if(_carOpen)closeCar();return;
  }
  // Skip if focused on input/textarea/select
  if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'||e.target.tagName==='SELECT')return;
  // Odak bir buton/etkileşimli öğedeyken kısayolları bırak: Space butonu
  // etkinleştirmeli (örn. onay diyaloğundaki Sil/İptal), oynatmayı değil.
  if(e.target.closest?.('button,[role="button"],a[href]'))return;
  switch(e.code){
    case 'Space':e.preventDefault();if(S.cur){togglePlay();showKbdHint(S.playing?'⏸ Durduruldu':'▶ Oynatılıyor');}break;
    case 'ArrowLeft':e.preventDefault();prevSt();if(S.cur)showKbdHint('⏮ '+S.cur.n);break;
    case 'ArrowRight':e.preventDefault();nextSt();if(S.cur)showKbdHint('⏭ '+S.cur.n);break;
    case 'ArrowUp':e.preventDefault();setVol(Math.min(100,parseInt(g('volM').value)+5));showKbdHint('🔊 '+g('volM').value+'%');break;
    case 'ArrowDown':e.preventDefault();setVol(Math.max(0,parseInt(g('volM').value)-5));showKbdHint('🔉 '+g('volM').value+'%');break;
    case 'KeyM':if(aud.volume>0){aud._prevVol=aud.volume;setVol(0);showKbdHint('🔇 Sessiz');}else{setVol(Math.round((aud._prevVol||0.8)*100));showKbdHint('🔊 Ses açıldı');}break;
    case 'KeyF':if(S.cur){toggleFav(S.cur.id);showKbdHint(fv.includes(S.cur.id)?'❤️ Favorilere eklendi':'💔 Favoriden çıkarıldı');}break;
    case 'KeyS':toggleShuffle();break;
  }
}

/* ── PWA INSTALL ── */
let _deferredPrompt=null;
function _isIOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent);}
/* iOS Chrome (CriOS), Firefox (FxiOS), Edge (EdgiOS), Opera (OPiOS) UA'ları da
   "Safari/" içerir; onları dışlamazsak Chrome kullanıcısına "Safari'de Paylaş"
   talimatı gösterilir. */
function _isSafari(){return /^((?!chrome|android|crios|fxios|edgios|opios).)*safari/i.test(navigator.userAgent);}
function _isStandalone(){return window.matchMedia('(display-mode:standalone)').matches||window.navigator.standalone===true;}
function openIOSInstall(){setDialogOpen('iosInstallOv',true);}
function closeIOSInstall(){if(_deferDialogClose('iosInstallOv'))return;setDialogOpen('iosInstallOv',false);lsSave('pwa_dismissed',true);}
function _updateInstallSettingRow(){
  if(_isStandalone()){
    setVisible('btnInstallApp',false);
    setVisible('btnAlreadyInstalled',true,'flex');
  } else {
    setVisible('btnAlreadyInstalled',false);
    setVisible('btnInstallApp',true,'flex');
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
      setTimeout(()=>setVisible('installBar',true,'flex'),3000);
    }
    _updateInstallSettingRow();
  });
  window.addEventListener('appinstalled',()=>{
    _deferredPrompt=null;setVisible('installBar',false);
    _updateInstallSettingRow();toast('Uygulama yüklendi!','ok');
  });

  g('installBtn').addEventListener('click',async()=>{
    if(!_deferredPrompt&&_isIOS()&&_isSafari()){openIOSInstall();setVisible('installBar',false);return;}
    if(!_deferredPrompt)return;
    _deferredPrompt.prompt();
    const{outcome}=await _deferredPrompt.userChoice;
    if(outcome==='accepted')toast('Uygulama yükleniyor!','ok');
    _deferredPrompt=null;setVisible('installBar',false);
  });
  g('installClose').addEventListener('click',()=>{
    setVisible('installBar',false);lsSave('pwa_dismissed',true);
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

  // iOS: show a non-blocking install banner first; instructions open on tap.
  if(_isIOS()&&_isSafari()&&!_isStandalone()&&!lsLoad('pwa_dismissed',false)){
    setTimeout(()=>setVisible('installBar',true,'flex'),4000);
  }
}

/* ── OFFLINE DETECTION ── */
function setupOfflineDetection(){
  const bar=g('offlineBar');
  const update=()=>{bar.classList.toggle('s',!navigator.onLine);};
  window.addEventListener('online',()=>{update();toast('Bağlantı kuruldu','ok');if(S.cur&&S.should&&aud.paused&&!IM._uStop&&!IM._interrupted){S.retries=0;resumeCurrentStation({source:'online'});}});
  window.addEventListener('offline',()=>{update();toast('Bağlantı kesildi','warn');});
  update();
}
function setupAccessibleRows(){
  const ids=['btnOpenCar','btnInstallApp','btnExport','btnImport','btnCloudBackup','btnCloudRestore','btnFetchLogos','btnReset'];
  ids.forEach(id=>{
    const el=g(id);if(!el)return;
    el.tabIndex=0;el.setAttribute('role','button');
    el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}});
  });
  const hdr=g('fpIntHdr');
  if(hdr){hdr.tabIndex=0;hdr.setAttribute('role','button');hdr.setAttribute('aria-expanded','false');}
}

/* ═══ INIT ═══ */
function init(){
  if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').catch(()=>{});}
  window.addEventListener('pagehide',()=>{DU.flush();ST.flush();IOS._stopRecovery();IM.suspendAudioContext();releaseIOSHoldAudio();releaseCarWakeLock();});

  try{localStorage.removeItem('trsync1');}catch{} // kaldırılan Özel Sync Endpoint özelliğinin eski kaydı
  dataLoad();loadIntOpts();renderChips();renderCards();renderSettings();updateNavBadge();
  g('appVersionLabel').textContent=`Pulse Radio v${APP_VERSION}`;
  maybeRestoreHashBackup();maybeAddSharedStation();
  // Uygulama açıkken gelen paylaşım linkleri (aynı belge içi hash değişimi)
  window.addEventListener('hashchange',()=>{maybeAddSharedStation();});
  // Auto-fetch missing logos after a short delay
  scheduleAutoFetchLogos(2500,5);

  // Visualizer bars — HTML'deki statik çubukları temizle ki stilsiz 5 çubuk
  // JS'in rastgele stillendirdiği 12'liyle yan yana kalmasın.
  const vis=g('fpVis');vis.innerHTML='';
  for(let i=0;i<12;i++){const b=document.createElement('i');b.style.height=(Math.random()*38+6)+'px';b.style.animationDelay=(Math.random()*.5)+'s';b.style.animationDuration=(.3+Math.random()*.4)+'s';vis.appendChild(b);}

  IM.init(aud);IOS.init(aud);setupMS();setupInstallPrompt();setupOfflineDetection();setupAccessibleRows();

  // Keep iOS audio activation lazy; the user's play tap starts the stream.
  document.addEventListener('touchstart',function u(){
    if(IM._actx&&IM._actx.state==='suspended'&&!DS.enabled)try{IM._actx.resume();}catch{}
    // iOS: <audio> elemanını ilk gesture'da bir kez "uyandır". Bu, sistem kesintisi
    // sonrası arka planda/ön planda aud.play()'in izin alma olasılığını artırır.
    if(_isIOS()&&!S.cur&&!aud.src){
      try{
        aud.muted=true;aud.src=getIOSHoldSrc();aud.load();
        const p=aud.play();
        if(p&&p.then)p.then(()=>{try{aud.pause();aud.removeAttribute('src');aud.load();}catch{}finally{aud.muted=false;}}).catch(()=>{aud.muted=false;});
        else aud.muted=false;
      }catch{aud.muted=false;}
    }
    document.removeEventListener('touchstart',u);
  },{once:true});

  setTimeout(()=>g('spl').classList.add('h'),1800);

  /* audio events */
  aud.addEventListener('playing',()=>{if(S.softPaused)return;setPlaying(true);S.retries=0;IM.setUStop(false);setStatus('live');renderCards();IOS._startRecovery();});
  aud.addEventListener('pause',()=>{
    if(_iosHoldSwitching)return;
    if(_suppressIOSPauseHold){_suppressIOSPauseHold=false;return;}
    // S.should hâlâ true ise bu, kullanıcının bilerek duraklatması DEĞİL —
    // iOS'un istem dışı kesintisidir (bildirim, arama, rota değişimi, kilit).
    // Bilerek duraklatmalar (pauseForUser) S.should'ı zaten false yapmıştır.
    // İstem dışı kesintide oynatma niyetini KORU; ön plana dönüşte veya kilit
    // ekranı düğmesiyle otomatik devam edebilelim.
    if(_isIOS()&&S.cur&&S.should&&!IM._uStop){
      handleIOSInterruptionPause();
      return;
    }
    if(holdIOSMediaSessionAfterSystemPause())return;
    S.softPaused=false;
    setPausedUI();
    if(S.cur&&!IM._uStop)updateMeta(S.cur);
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
      resumeCurrentStation({source:'audio-error'});
    },delay);
  });
  /* Stalled/waiting — 8sn yanıtsızsa tetikle */
  let _stallT=null;
  aud.addEventListener('stalled',()=>{
    if(_isIOS())return;
    clearTimeout(_stallT);
    _stallT=setTimeout(()=>{
      if(!S.cur||!S.should||IM._uStop||IM._interrupted)return;
      if(aud.readyState>=2&&!aud.paused)return;
      resumeCurrentStation({source:'audio-stalled'});
    },8000);
  });
  aud.addEventListener('playing',()=>{clearTimeout(_stallT);_stallT=null;});

  /* confirm modal */
  g('cfmYes').addEventListener('click',()=>_cfmClose(true));
  g('cfmNo').addEventListener('click',()=>_cfmClose(false));
  g('cfmOv').addEventListener('click',e=>{if(e.target===g('cfmOv'))_cfmClose(false);});

  /* input modal */
  g('inpYes').addEventListener('click',()=>_inpClose(g('inpField').value.trim()||null));
  g('inpNo').addEventListener('click',()=>_inpClose(null));
  g('inpOv').addEventListener('click',e=>{if(e.target===g('inpOv'))_inpClose(null);});
  g('inpField').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();_inpClose(g('inpField').value.trim()||null);}});

  /* manuel ekleme kategori seçenekleri — GENRES tek kaynak ('Tümü' filtre etiketi hariç) */
  const inC=g('inC');
  GENRES.filter(x=>x!=='Tümü').forEach(genre=>{const o=document.createElement('option');o.textContent=genre;inC.appendChild(o);});

  /* mini player */
  g('mplay').addEventListener('click',openFP);
  // Yalnız mini oynatıcının kendisi odaktayken (içindeki butonlar değil) çalış;
  // stopPropagation, document'taki global Space kısayolunun da tetiklenmesini önler.
  g('mplay').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target===e.currentTarget){e.preventDefault();e.stopPropagation();openFP();}});
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
  g('fpIntHdr').addEventListener('click',()=>{const open=g('fpIntBody').classList.toggle('open');g('fpIntHdr').classList.toggle('open',open);g('fpIntHdr').setAttribute('aria-expanded',String(open));});
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
  setupAddSheetKeyboard();setupAddTabs();

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
  g('swDataSaver').addEventListener('change',e=>{
    DS.enabled=e.target.checked;DS.warnedThisSession=false;saveDS();
    if(DS.enabled)IM.releaseAudioContext();
    _lastMetaKey='';
    if(S.cur){NP.start(S.cur);updateMeta(S.cur);}
    if(S.playing){DU.stopTick();DU.startTick();}
    toast(DS.enabled?'Ekonomi modu açık':'Ekonomi modu kapalı');
  });
  g('btnResetData').addEventListener('click',()=>DU.reset());
  /* search API */
  g('bTR').addEventListener('click',()=>{const q=g('qTR').value.trim();if(!q){toast('Arama yazın','warn');return;}runSearch('rTR','tr',`name=${encodeURIComponent(q)}&countrycode=TR`,{fallbackTag:q});});
  g('bGL').addEventListener('click',()=>{const q=g('qGL').value.trim();if(!q){toast('Arama yazın','warn');return;}const cc=g('glCountry').value;runSearch('rGL','gl',`name=${encodeURIComponent(q)}`+(cc?`&countrycode=${cc}`:''),{fallbackTag:q});});
  g('bTG').addEventListener('click',()=>{const q=g('qTG').value.trim();if(!q){toast('Tür yazın','warn');return;}doTagSearch(q);});
  [['qTR','bTR'],['qGL','bGL'],['qTG','bTG']].forEach(([inp,btn])=>{
    g(inp).addEventListener('keydown',e=>{if(e.key==='Enter')g(btn).click();});
    // Yazarken arama: 450ms durakla ve en az 2 karakterle otomatik ara
    const deb=debounce(()=>{if(g(inp).value.trim().length>=2)g(btn).click();},450);
    g(inp).addEventListener('input',deb);
  });
  g('glCountry').addEventListener('change',()=>{if(g('qGL').value.trim().length>=2)g('bGL').click();});
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

  const route=initialRoute(location.search);
  goPage(route.page);
  if(route.openAdd)setTimeout(openMod,0);
}

window.TurkRadyo={version:APP_VERSION,exportData:backupData,importData};
init();
})();
