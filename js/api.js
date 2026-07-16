// Radio Browser API katmanı (ES modülü).
// Birden çok aynaya paralel istek atar, ilk başarılı yanıtı döndürür.
import { fetchWithTimeout } from './utils.js';

export const APIS=['de1','nl1','at1','de2'];

export async function apiCall(ep){
  const ctrls=APIS.map(()=>new AbortController());
  const reqs=APIS.map((h,i)=>fetchWithTimeout(`https://${h}.api.radio-browser.info/json/${ep}`,{cache:'no-store',signal:ctrls[i].signal},6000).then(r=>{if(!r.ok)throw new Error(r.status);return r.json();}));
  try{return await Promise.any(reqs);}catch{return null;}
  finally{ctrls.forEach(c=>{try{c.abort();}catch{}});}
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
