import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const src=readFileSync('js/app.js','utf8');
const noop=()=>{};
const section=(start,end)=>src.slice(src.indexOf(start),src.indexOf(end,src.indexOf(start)));
function npContext(){
  const timers=[],els=new Map(),requests=[];
  const c={S:{cur:{id:'A',u:'https://a.test/live',e:'radio'},playing:true},DS:{enabled:false},
    document:{hidden:false,createElement:()=>({})},navigator:{},cleanImageUrl:u=>u,setImageSrc:(img,u)=>{img.src=u;},
    g:id=>{if(!els.has(id))els.set(id,{textContent:'',innerHTML:'',classList:{add:noop,remove:noop},appendChild(img){this.image=img;}});return els.get(id);},
    fetchWithTimeout:async(...args)=>{requests.push(args);return{ok:true,json:async()=>args[0].includes('itunes')?{results:[{artistName:'Artist',trackName:'Track',artworkUrl100:'https://art.test/100x100bb'}]}:{lyrics:'Test lyrics'}};},
    isPowerConstrained:()=>true,NP_IOS_POLL_MS:120000,NP_POLL_MS:60000,
    setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},setInterval:(fn,ms)=>{timers.push({fn,ms});return timers.length;},
    clearTimeout:noop,clearInterval:noop,URL,Map,Date,AbortController,DOMException};
  vm.createContext(c);vm.runInContext(section('const NP={','/* ═══ INTERRUPT MANAGER')+'\nglobalThis.NP=NP;',c);
  return{c,timers,els,requests};
}
test('artwork and lyrics complete with correct request timeouts',async()=>{
  const {c,requests,els}=npContext();await c.NP._fetchArtwork('Artist - Track');
  assert.equal(c.NP._lastArtTitle,'Artist - Track');assert.equal(requests.length,2);
  assert.equal(els.get('fpArt').image.src,'https://art.test/500x500bb');
  assert.equal(els.get('lyricsText').textContent,'Test lyrics');
  assert.equal(requests[0][2],4000);assert.equal(requests[1][2],5000);
});
test('unavailable artwork still allows direct artist-title lyrics lookup',async()=>{
  const {c,els}=npContext();c.fetchWithTimeout=async url=>{if(url.includes('itunes'))throw Error('offline');return{ok:true,json:async()=>({lyrics:'Fallback'})};};
  await c.NP._fetchArtwork('Artist - Track');assert.equal(els.get('lyricsText').textContent,'Fallback');
});
test('old artwork response cannot replace a new station even with the same title',async()=>{
  const {c,els}=npContext();let release;
  c.fetchWithTimeout=()=>new Promise(r=>release=r);
  const p=c.NP._fetchArtwork('Same title');c.NP.stop();c.S.cur={id:'B',e:'B'};
  release({ok:true,json:async()=>({results:[{artworkUrl100:'https://old.test/art'}]})});await p;
  assert.equal(els.get('fpArt').image,undefined);
});
test('initial metadata poll does no work when screen is hidden',async()=>{
  const {c,timers}=npContext();let calls=0;c.NP._fetchFor=async()=>{calls++;return null;};
  c.NP.start(c.S.cur);c.document.hidden=true;await timers.find(t=>t.ms===15000).fn();assert.equal(calls,0);
});
test('pending station A metadata cannot overwrite station B and is aborted',async()=>{
  const {c,timers}=npContext();let release,signal;const titles=[];
  c.NP._fetchFor=(_u,s)=>{signal=s;return new Promise(r=>release=r);};c.NP._setTitle=t=>titles.push(t);
  c.NP.start(c.S.cur);const pending=timers.find(t=>t.ms===15000).fn();
  c.S.cur={id:'B',u:'https://b.test/live'};c.NP.start(c.S.cur);assert.equal(signal.aborted,true);
  release('Station A song');await pending;assert.ok(!titles.includes('Station A song'));
});
test('metadata polls do not overlap or retry aborted endpoints',async()=>{
  const {c,timers,requests}=npContext();let release,calls=0;
  c.NP._fetchFor=()=>{calls++;return new Promise(r=>release=r);};
  c.NP.start(c.S.cur);const p=timers[0].fn();await timers[1].fn();assert.equal(calls,1);release(null);await p;
  const fresh=npContext();const ctrl=new AbortController();ctrl.abort();await fresh.c.NP._fetchFor('https://x.test/live',ctrl.signal);
  assert.equal(fresh.requests.length,0);assert.equal(fresh.c.NP._cooldown.size,0);
});
function playbackContext(){
  const timers=[];let plays=0,pauses=0;
  const c={S:{cur:{id:'A'},playing:false,should:true},IM:{_uStop:false,setUStop(v){this._uStop=v;},_clearTimers:noop,_hideBanner:noop,suspendAudioContext:noop,resumeAudioContext:noop},
    IOS:{_stopRecovery:noop,_startRecovery:noop},NP:{stop:noop,start:noop},
    aud:{play:async()=>{plays++;if(plays===1)throw Error('temporary');}},
    prepareCurrentStreamForResume:async()=>true,releaseIOSHoldAudio:noop,updateMeta:noop,setStatus:noop,renderCards:noop,toast:noop,syncMediaSessionState:noop,
    pauseAudioWithoutIOSHold:()=>pauses++,setPausedUI:()=>{c.S.playing=false;},setPlaying:v=>{c.S.playing=v;if(v)c.S.should=true;},
    setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},Date};
  vm.createContext(c);
  vm.runInContext('let _resumePromise=null,_resumeToken=0,_lastAutoResumeAt=0;const AUTO_RESUME_MIN_GAP_MS=1500;'+section('function pauseForUser(','function stopSession(')+section('function _resumeAudioContext(','function resumeFromMediaSession('),c);
  return{c,timers,plays:()=>plays,pauses:()=>pauses};
}
test('explicit pause cancels delayed reconnect before second play',async()=>{
  const {c,timers,plays}=playbackContext();const p=c.resumeCurrentStation({source:'app'});await new Promise(setImmediate);
  assert.ok(timers.some(t=>t.ms===600));c.pauseForUser();timers.find(t=>t.ms===600).fn();await p;
  assert.equal(plays(),1);assert.equal(c.S.playing,false);assert.equal(c.S.should,false);
});
test('explicit pause cancels playback while stream attachment is pending',async()=>{
  const {c,plays}=playbackContext();let release;c.prepareCurrentStreamForResume=()=>new Promise(r=>release=r);
  const p=c.resumeCurrentStation({source:'app'});await new Promise(setImmediate);c.pauseForUser();release(true);await p;
  assert.equal(plays(),0);assert.equal(c.S.should,false);
});
test('media-session pause really pauses without starting silent audio',()=>{
  const {c,plays,pauses}=playbackContext();c.S.playing=true;c.pauseForUser({source:'media-session'});
  assert.equal(pauses(),1);assert.equal(plays(),0);assert.equal(c.S.playing,false);assert.equal(c.S.resumable,true);
});
function imContext(){
  const contexts=[];
  class AudioContextMock{
    constructor(){this.state='running';contexts.push(this);}
    addEventListener(_type,fn){this.onState=fn;}
    close(){this.state='closed';return Promise.resolve();}
    suspend(){this.state='suspended';this.onState();return Promise.resolve();}
    resume(){this.state='running';this.onState();return Promise.resolve();}
  }
  const c={DS:{enabled:false},window:{AudioContext:AudioContextMock},S:{playing:true,should:true},document:{hidden:false}};
  vm.createContext(c);vm.runInContext(section('const IM={','/* ── iOS RECOVERY')+'\nglobalThis.IM=IM;',c);
  return{c,contexts};
}
test('closed and replaced AudioContext events are ignored',()=>{
  const {c,contexts}=imContext();c.IM.initAudioContext();const old=contexts[0];c.IM.releaseAudioContext();
  assert.doesNotThrow(()=>old.onState());c.IM.initAudioContext();assert.doesNotThrow(()=>old.onState());assert.equal(c.IM._actx,contexts[1]);
});
test('intentional suspend does not look like notification and hidden resume is blocked',()=>{
  const {c,contexts}=imContext();let notifications=0;c.IM.interruptNotif=()=>notifications++;
  c.IM.initAudioContext();c.IM.suspendAudioContext();assert.equal(notifications,0);
  c.document.hidden=true;c.IM.resumeAudioContext();assert.equal(contexts[0].state,'suspended');
  c.document.hidden=false;c.IM.resumeAudioContext();assert.equal(contexts[0].state,'running');
});
test('visibility change stops metadata and helper context without pausing the radio',()=>{
  const events=new Map();let stops=0,starts=0,suspends=0,pauses=0;
  const c={document:{hidden:true,addEventListener:(name,fn)=>events.set(name,fn)},window:{addEventListener:noop},
    navigator:{},S:{cur:{id:'A'},playing:true,should:true},
    IM:{_uStop:false,_interrupted:false,suspendAudioContext:()=>suspends++,resumeAudioContext:noop},
    NP:{stop:()=>stops++,start:()=>starts++},setInterval:()=>1,clearInterval:noop,IOS_RECOVERY_INTERVAL_MS:30000};
  vm.createContext(c);vm.runInContext(section('const IOS={','/* ── MEDIA SESSION')+'\nglobalThis.IOS=IOS;',c);
  c.IOS.init({paused:false,addEventListener:noop,pause:()=>pauses++});
  events.get('visibilitychange')();assert.equal(stops,1);assert.equal(suspends,1);assert.equal(pauses,0);assert.equal(c.S.should,true);
  c.document.hidden=false;events.get('visibilitychange')();assert.equal(starts,1);
});
