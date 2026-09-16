import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {cleanImageUrl} from '../src/lib/core.js';
const src=readFileSync('js/app.js','utf8');
function setup(){
  const positions=[];
  const c={navigator:{mediaSession:{metadata:null,setPositionState:(...args)=>positions.push(args)}},
    DS:{enabled:false},MediaMetadata:class{constructor(value){Object.assign(this,value);}},
    cleanImageUrl,syncMediaSessionState:()=>{},URL,location:{href:'https://radio.test/'}};
  vm.createContext(c);vm.runInContext(src.slice(src.indexOf("let _lastMetaKey='';"),src.indexOf('/* ── PLAY STATE')),c);
  return{c,positions};
}
test('station without logo has no synthetic artwork or generic genre text',()=>{
  const {c,positions}=setup();c.updateMeta({id:'super',n:'Süper Fm',g:'Diğer',c:'#ff8888',e:'radio'});
  assert.equal(c.navigator.mediaSession.metadata.artwork.length,0);
  assert.equal(c.navigator.mediaSession.metadata.title,'Süper Fm');
  assert.equal(c.navigator.mediaSession.metadata.artist,'Canlı Radyo');
  assert.equal(positions[0].length,0);
});
test('real station logo is retained without inventing its pixel dimensions',()=>{
  const {c}=setup();c.updateMeta({id:'a',n:'Radio',img:'https://logo.test/logo.png'});
  const art=c.navigator.mediaSession.metadata.artwork[0];assert.equal(art.src,'https://logo.test/logo.png');assert.equal(art.sizes,undefined);
  c.updateMeta({id:'b',n:'No logo'});assert.equal(c.navigator.mediaSession.metadata.artwork.length,0);
});
test('economy mode omits remote artwork as well as generated covers',()=>{
  const {c}=setup();c.DS.enabled=true;c.updateMeta({id:'a',n:'Radio',img:'https://logo.test/logo.png'});
  assert.equal(c.navigator.mediaSession.metadata.artwork.length,0);
});
