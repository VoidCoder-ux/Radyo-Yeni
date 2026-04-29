(function(){
'use strict';

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

function encodeBackup(data){
  const json=JSON.stringify(data);
  if(window.TextEncoder)return bytesToBase64(new TextEncoder().encode(json));
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function extractBackupToken(input){
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

function decodeBackup(input){
  const token=extractBackupToken(input);
  if(!token)throw new Error('empty-backup');
  if(token.trim().startsWith('{'))return JSON.parse(token);
  const bytes=base64ToBytes(token);
  const json=window.TextDecoder?new TextDecoder().decode(bytes):decodeURIComponent(escape(String.fromCharCode.apply(null,bytes)));
  return JSON.parse(json);
}

async function copyText(text){
  if(navigator.clipboard&&window.isSecureContext){
    await navigator.clipboard.writeText(text);
    return true;
  }
  return false;
}

window.TurkRadyoStorage={encodeBackup,decodeBackup,extractBackupToken,copyText};
})();
