import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {cleanImageUrl} from '../src/lib/core.js';
const src=readFileSync('js/app.js','utf8');
function setup(){
  const positions=[];
  const fills=[];let canvases=0;
  const ctx={fillStyle:'',fillRect(...rect){fills.push({color:this.fillStyle,rect});},beginPath(){},moveTo(){},lineTo(){},stroke(){}};
  const c={navigator:{mediaSession:{metadata:null,setPositionState:(...args)=>positions.push(args)}},
    document:{createElement(){canvases++;return{getContext:()=>ctx,toDataURL:()=> 'data:image/png;base64,minimal'};}},
    DS:{enabled:false},MediaMetadata:class{constructor(value){Object.assign(this,value);}},
    cleanImageUrl,syncMediaSessionState:()=>{},URL,location:{href:'https://radio.test/'}};
  vm.createContext(c);vm.runInContext(src.slice(src.indexOf("let _lastMetaKey='';"),src.indexOf('/* ── PLAY STATE')),c);
  return{c,positions,fills,canvases:()=>canvases};
}
test('station without logo uses opaque minimal artwork instead of iOS app-icon fallback',()=>{
  const {c,positions,fills}=setup();c.updateMeta({id:'super',n:'Süper Fm',g:'Diğer',c:'#ff8888',e:'radio'});
  assert.equal(c.navigator.mediaSession.metadata.artwork[0].src,'data:image/png;base64,minimal');
  assert.deepEqual(fills,[{color:'#121416',rect:[0,0,512,512]}]);
  assert.equal(c.navigator.mediaSession.metadata.title,'Süper Fm');
  assert.equal(c.navigator.mediaSession.metadata.artist,'Canlı Radyo');
  assert.equal(positions[0].length,0);
});
test('station changes cannot replace minimal artwork and drawing is cached',()=>{
  const {c,canvases}=setup();c.updateMeta({id:'a',n:'Radio',img:'https://logo.test/logo.png'});
  const art=c.navigator.mediaSession.metadata.artwork[0];assert.equal(art.src,'data:image/png;base64,minimal');
  c.updateMeta({id:'b',n:'No logo'});assert.equal(c.navigator.mediaSession.metadata.artwork[0].src,art.src);assert.equal(canvases(),1);
});
test('economy mode uses the same offline minimal artwork',()=>{
  const {c}=setup();c.DS.enabled=true;c.updateMeta({id:'a',n:'Radio',img:'https://logo.test/logo.png'});
  assert.equal(c.navigator.mediaSession.metadata.artwork[0].src,'data:image/png;base64,minimal');
});
