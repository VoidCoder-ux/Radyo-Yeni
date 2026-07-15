// Anonim yedek linki kodlama/çözme yardımcıları (ES modülü; js/app.js import eder).
const MAX_TOKEN_CHARS=1400000;
const MAX_JSON_CHARS=1048576;

function bytesToBase64(bytes){
  let bin='';
  const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk){
    bin+=String.fromCharCode.apply(null,bytes.subarray(i,i+chunk));
  }
  return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function base64ToBytes(text){
  const b64=String(text||'').replace(/-/g,'+').replace(/_/g,'/');
  const padded=b64+'='.repeat((4-b64.length%4)%4);
  const bin=atob(padded);
  const bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
  return bytes;
}

export function encodeBackup(data){
  const json=JSON.stringify(data);
  if(json.length>MAX_JSON_CHARS)throw new Error('backup-too-large');
  return bytesToBase64(new TextEncoder().encode(json));
}

export function extractBackupToken(input){
  const raw=String(input||'').trim();
  if(!raw)return '';
  try{
    const u=new URL(raw,location.href);
    const fromHash=(u.hash||'').match(/backup=([^&]+)/);
    if(fromHash)return decodeURIComponent(fromHash[1]);
    const fromQuery=u.searchParams.get('backup');
    if(fromQuery)return fromQuery;
  }catch{}
  const hash=raw.match(/backup=([^&\s]+)/);
  return hash?decodeURIComponent(hash[1]):raw;
}

export function decodeBackup(input){
  const token=extractBackupToken(input);
  if(!token)throw new Error('empty-backup');
  if(token.length>MAX_TOKEN_CHARS)throw new Error('backup-too-large');
  // Ham JSON yolu da base64 yoluyla aynı 1 MB sınırına tabi olmalı.
  if(token.trim().startsWith('{')){
    if(token.length>MAX_JSON_CHARS)throw new Error('backup-too-large');
    return JSON.parse(token);
  }
  const bytes=base64ToBytes(token);
  if(bytes.length>MAX_JSON_CHARS)throw new Error('backup-too-large');
  const json=new TextDecoder().decode(bytes);
  if(json.length>MAX_JSON_CHARS)throw new Error('backup-too-large');
  return JSON.parse(json);
}

export async function copyText(text){
  if(navigator.clipboard&&window.isSecureContext){
    await navigator.clipboard.writeText(text);
    return true;
  }
  return false;
}
