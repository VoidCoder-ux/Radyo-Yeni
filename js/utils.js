// Uygulama durumundan bağımsız saf yardımcılar (ES modülü).
// DOM'a dokunmazlar; birim testleri tests/unit.test.mjs içinde.
import { trNormalize } from '../src/lib/core.js';

export function mkId(){return 'r'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
export function isHttpUrl(u){try{return new URL(u).protocol==='http:';}catch{return false;}}
export function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};}
export function relTime(ts,now=Date.now()){const m=Math.floor((now-ts)/60000);if(m<1)return'Az önce';if(m<60)return m+'dk';const h=Math.floor(m/60);if(h<24)return h+'sa';return Math.floor(h/24)+'g';}
/* Koyulaştırırken maviyi artırır: logo zeminlerinde gece-moru gölge tonu bilinçli tasarım tercihi */
export function darken(h){try{return`rgb(${Math.max(0,parseInt(h.slice(1,3),16)-50)},${Math.max(0,parseInt(h.slice(3,5),16)-30)},${Math.min(255,parseInt(h.slice(5,7),16)+40)})`;}catch{return'#4a3ab5';}}
/* '#rrggbb' -> [r,g,b]; geçersiz girdide paletin ilk rengine düşer. */
function orbParts(h){
  try{
    const p=[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
    return p.some(n=>!Number.isFinite(n))?[124,92,255]:p;
  }catch{return[124,92,255];}
}
/* Arka plan orb'ları için hazır yumuşak geçiş üretir. Eskiden düz renkli bir
   daire filter:blur() ile yumuşatılıyordu; blur çekirdeği her karede GPU'da
   yeniden çalıştığı için kaydırma sırasında telefonu ısıtan asıl maliyet oydu
   (ölçüm: 31 -> 60 FPS). Gradyan aynı görünümü sıfır süzgeç maliyetiyle verir.
   darken=true, ikinci orb için darken() ile aynı renk kaymasını uygular. */
export function orbGradient(h,darken){
  let [r,g,b]=orbParts(h);
  if(darken){r=Math.max(0,r-50);g=Math.max(0,g-30);b=Math.min(255,b+40);}
  const c=`${r},${g},${b}`;
  return `radial-gradient(circle closest-side,rgba(${c},1) 0%,rgba(${c},.72) 38%,rgba(${c},.28) 62%,rgba(${c},0) 100%)`;
}
/* SVG icon helper — references symbols defined in the index.html sprite */
export function icon(name,opts){const o=opts||{};const cls='svg-i'+(o.fill?' fill':'')+(o.cls?' '+o.cls:'');return `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;}

export function fetchWithTimeout(url,opts={},ms=6000){
  const ctrl=new AbortController();
  const onAbort=()=>ctrl.abort();
  const t=setTimeout(()=>ctrl.abort(),ms);
  if(opts.signal){
    if(opts.signal.aborted)ctrl.abort();
    else opts.signal.addEventListener('abort',onAbort,{once:true});
  }
  return fetch(url,{...opts,signal:ctrl.signal}).finally(()=>{
    clearTimeout(t);
    if(opts.signal)opts.signal.removeEventListener('abort',onAbort);
  });
}

export function initialRoute(search){
  try{
    const page=new URLSearchParams(search).get('page');
    if(page==='fav'||page==='favorites'||page==='f')return{page:'f'};
    if(page==='add')return{page:'a',openAdd:true};
    if(page==='all'||page==='channels'||page==='a')return{page:'a'};
    if(page==='recent'||page==='history'||page==='r')return{page:'r'};
    if(page==='settings'||page==='s')return{page:'s'};
  }catch{}
  return{page:'h'};
}

/* trNormalize eşleşmesinin orijinal metindeki [başlangıç,bitiş) aralığını bulur.
   Filtre trNormalize kullandığı için vurgu da aynı kuralla yapılmalı; ayrıca
   'İ'.toLowerCase() gibi çok-karakterli dönüşümlerde indeks kayması olmaz. */
export function trMatchRange(name,query){
  const qn=trNormalize(query);
  if(!qn)return null;
  const chars=Array.from(name);
  let norm='';const idxMap=[];
  for(let i=0;i<chars.length;i++){
    const cn=trNormalize(chars[i]);
    for(let k=0;k<cn.length;k++){norm+=cn[k];idxMap.push(i);}
  }
  const pos=norm.indexOf(qn);
  if(pos<0)return null;
  const sc=idxMap[pos],ec=idxMap[pos+qn.length-1];
  return [chars.slice(0,sc).join('').length,chars.slice(0,ec+1).join('').length];
}

export function formatBytes(bytes){
  if(bytes<1024)return bytes+' B';
  if(bytes<1024*1024)return(bytes/1024).toFixed(1)+' KB';
  if(bytes<1024*1024*1024)return(bytes/1024/1024).toFixed(1)+' MB';
  return(bytes/1024/1024/1024).toFixed(2)+' GB';
}

export function formatListenTime(sec){
  if(sec<60)return '<1 dk';
  const m=Math.floor(sec/60);
  if(m<60)return m+' dk';
  const h=Math.floor(m/60);
  return (h+' sa '+(m%60?(m%60)+' dk':'')).trim();
}
