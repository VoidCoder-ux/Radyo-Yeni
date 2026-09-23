// Radio Browser API katmanı (ES modülü).
// Birden çok aynaya paralel istek atar, ilk başarılı yanıtı döndürür.
import { fetchWithTimeout } from './utils.js';

/* Radio Browser aynaları zaman içinde kapanıyor: 'nl1' ve 'at1' artık DNS'te
   çözülmüyor, bu yüzden eski sabit liste isteklerin yarısını daha ilk adımda
   harcıyordu. Sabit liste yalnızca ilk istek ve çevrimdışı yedeği olarak durur;
   güncel liste all.api.radio-browser.info/json/servers üzerinden arka planda
   tazelenir, böylece bir ayna daha kapandığında uygulama kendini toparlar. */
export const FALLBACK_HOSTS=['all.api.radio-browser.info','de1.api.radio-browser.info','de2.api.radio-browser.info'];
const SERVERS_URL='https://all.api.radio-browser.info/json/servers';
const REQ_TIMEOUT=8000,SERVERS_TIMEOUT=5000,SERVERS_TTL=6*60*60*1000,MAX_HOSTS=4;
let _hosts=null,_hostsAt=0,_hostsReq=null;

/* Sunucu listesi uzak kaynaktan geldiği için yalnızca radio-browser.info
   alt alan adları kabul edilir; aksi halde bozuk ya da ele geçmiş bir yanıt
   sonraki tüm istekleri başka bir sunucuya yönlendirebilirdi. */
export function normalizeHosts(list){
  if(!Array.isArray(list))return [];
  const out=[];
  for(const item of list){
    const raw=item&&typeof item==='object'?item.name:item;
    if(typeof raw!=='string')continue;
    const host=raw.trim().toLowerCase();
    if(!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.api\.radio-browser\.info$/.test(host))continue;
    if(!out.includes(host))out.push(host);
  }
  return out;
}

function refreshHosts(){
  if(_hostsReq||(_hosts&&Date.now()-_hostsAt<SERVERS_TTL))return;
  _hostsReq=fetchWithTimeout(SERVERS_URL,{cache:'no-store'},SERVERS_TIMEOUT)
    .then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
    .then(d=>{
      const list=normalizeHosts(d);
      if(!list.length)return;
      // Yükü aynalara dağıt: her oturum listeye farklı sırayla girsin.
      for(let i=list.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[list[i],list[j]]=[list[j],list[i]];}
      _hosts=list.slice(0,MAX_HOSTS);_hostsAt=Date.now();
    })
    .catch(()=>{})
    .finally(()=>{_hostsReq=null;});
}

/* Aramayı bekletmemek için liste eşzamanlı okunur; tazeleme arka planda döner. */
function activeHosts(){
  refreshHosts();
  return _hosts&&_hosts.length?_hosts:FALLBACK_HOSTS;
}

/* Verilen aynalara paralel istek atar, ilk başarılı yanıtta diğerlerini iptal
   eder. Hepsi düşerse reddeder. */
function raceHosts(hosts,ep){
  const ctrls=hosts.map(()=>new AbortController());
  const reqs=hosts.map((h,i)=>fetchWithTimeout(`https://${h}/json/${ep}`,{cache:'no-store',signal:ctrls[i].signal},REQ_TIMEOUT).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}));
  return Promise.any(reqs).finally(()=>{ctrls.forEach(c=>{try{c.abort();}catch{}});});
}

/* Tüm aynalar başarısız olduğunda hata fırlatır. Eskiden null dönüyordu ve
   arayüz bunu boş sonuçtan ayıramayıp ağ hatasına "Bulunamadı" diyordu. */
export async function apiCall(ep){
  const hosts=activeHosts();
  try{return await raceHosts(hosts,ep);}
  catch(err){
    // Keşfedilen aynalar topluca düşerse önbelleği hemen düşür ve bilinen yedek
    // listeyle bir kez daha dene. Aksi halde TTL dolana kadar (6 saat) çalışan
    // aynalar dururken arama hata vermeyi sürdürürdü — bu PR'ın düzelttiği
    // "liste eskidi, her şey durdu" hatasının aynısı.
    if(hosts!==FALLBACK_HOSTS){
      _hosts=null;_hostsAt=0;
      const rest=FALLBACK_HOSTS.filter(h=>!hosts.includes(h));
      if(rest.length)return await raceHosts(rest,ep);
    }
    throw err;
  }
}

/* Hatanın kullanıcıya gösterilmesi gerekmeyen çağrılar için (arka plan logo
   taraması) null dönen sarmalayıcı. */
export async function apiCallSafe(ep){
  try{return await apiCall(ep);}catch{return null;}
}

/* Radio Browser tag listesinden uygulamanın tür (genre) etiketini çıkarır. */
export function genreFromTags(tags){
  const t=String(tags||'').toLowerCase();
  if(t.includes('pop'))return 'Pop';
  if(t.includes('rock'))return 'Rock';
  if(/jazz/.test(t))return 'Caz';
  if(/news|haber|talk/.test(t))return 'Haber';
  if(/türk|turkish|folk/.test(t))return 'THM';
  if(/islam|quran|dini/.test(t))return 'Dini';
  if(/electro|dance|edm|house|techno/.test(t))return 'Elektronik';
  if(/classic/.test(t))return 'TSM';
  if(/sport/.test(t))return 'Spor';
  if(/child|kid|çocuk/.test(t))return 'Çocuk';
  return 'Diğer';
}
