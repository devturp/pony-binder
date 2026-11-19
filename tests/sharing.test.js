import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadCatalog, CARDS } from '../js/catalog.js';
import { createSharing, createSharedStore, newShareToken, validShareToken, shareRoute, shareURL, sharedCards } from '../js/sharing.js';
import { createState } from '../js/state.js';
import { createFilters } from '../js/filters.js';
import { createRenderer } from '../js/rendering.js';
import { createDialogs } from '../js/dialogs.js';
import { createDOM } from './dom.js';
const raw=JSON.parse(readFileSync(new URL('../data/catalog.json',import.meta.url)));
globalThis.fetch=async()=>({ok:true,json:async()=>structuredClone(raw)});
await loadCatalog();
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const TOKEN='a'.repeat(64),OTHER='b'.repeat(64);
function owner(){
  let info={user:{uid:'alice'},pending:0,editable:true},profile={cards:{}};
  const events=new Set(),streams=[],calls=[];
  const store={status:()=>info,me:()=>profile,editable:()=>info.editable,subscribe:fn=>{events.add(fn);return()=>events.delete(fn);}};
  const backend={
    watchSharing(uid,next,error){const stream={uid,next,error,stopped:false};streams.push(stream);return()=>stream.stopped=true;},
    async createShare(uid,token,cards){calls.push({op:'create',uid,token,cards});return token;},
    async updateShare(uid,token,cards){calls.push({op:'update',uid,token,cards});return true;},
    async revokeShare(uid){calls.push({op:'revoke',uid});}
  };
  const sharing=createSharing(store);sharing.attach(backend);
  function change(patch={},cards=profile.cards){info={...info,...patch};profile={cards};events.forEach(fn=>fn());}
  return {store,backend,sharing,streams,calls,change};
}
function viewer(){
  const streams=[];const backend={watchSharedCollection(token,next,error){const stream={token,next,error,stopped:false};streams.push(stream);return()=>stream.stopped=true;}};
  const store=createSharedStore(TOKEN);store.attach(backend);store.start();return {store,streams,backend};
}
test('links use random 256-bit tokens in the URL fragment and invalid share routes fail closed',()=>{
  const tokens=new Set(Array.from({length:100},newShareToken));assert.equal(tokens.size,100);
  assert.ok([...tokens].every(validShareToken));
  const url=shareURL(TOKEN,'https://ponybinder.app/?old=yes#other');
  assert.equal(url,`https://ponybinder.app/#share=${TOKEN}`);
  assert.deepEqual(shareRoute('#share='+TOKEN),{shared:true,token:TOKEN});
  for(const hash of ['#share=short','#share='+TOKEN+'&extra=true','#share='])assert.deepEqual(shareRoute(hash),{shared:true,token:null});
  assert.deepEqual(shareRoute('#view=old'),{shared:false,token:null});
});
test('shared payloads exclude unknown cards, account fields and empty entries',()=>{
  const a=CARDS[0].id,b=CARDS[1].id;
  assert.deepEqual(sharedCards({[a]:{q:3,w:true,t:false,email:'private',name:'private'},[b]:{q:0,w:false,t:false},email:'private',unknown:{q:63}}),{[a]:{q:3,w:true,t:false}});
  assert.deepEqual(sharedCards(null),{});
});
test('only a loaded signed-in owner can create links; disabled sharing never auto-publishes',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const a=owner();await assert.rejects(a.sharing.create(),/Wait/);
  a.streams[0].next(null);a.change({pending:1});await assert.rejects(a.sharing.create(),/Wait/);
  a.change({pending:0},{[CARDS[0].id]:{q:3,w:true,t:false}});t.mock.timers.tick(5000);assert.equal(a.calls.length,0);
  const token=await a.sharing.create();assert.ok(validShareToken(token));assert.equal(a.calls.length,1);
  assert.deepEqual(a.calls[0].cards,{[CARDS[0].id]:{q:3,w:true,t:false}});
  assert.equal(await a.sharing.create(),token);assert.equal(a.calls.length,1);
  a.change({user:null,editable:false});await assert.rejects(a.sharing.create(),/Wait/);
});
test('saved edits aggregate into one shared update after the quiet window',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const a=owner();a.streams[0].next(null);await a.sharing.create();
  a.change({pending:1},{[CARDS[0].id]:{q:1}});t.mock.timers.tick(5000);assert.equal(a.calls.length,1);
  a.change({pending:0},{[CARDS[0].id]:{q:3,w:true,t:false}});
  t.mock.timers.tick(1499);assert.equal(a.calls.length,1);
  t.mock.timers.tick(1);await tick();assert.equal(a.calls.length,2);
  assert.deepEqual(a.calls[1].cards,{[CARDS[0].id]:{q:3,w:true,t:false}});
  assert.equal(a.sharing.status().pending,false);
  a.change();t.mock.timers.tick(5000);assert.equal(a.calls.length,2);
});
test('shared update failure is visible and retryable without altering the private collection',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const a=owner();a.streams[0].next(null);await a.sharing.create();
  a.backend.updateShare=async()=>{throw Error('offline');};
  a.change({}, {[CARDS[0].id]:{q:2}});t.mock.timers.tick(1500);await tick();
  assert.match(a.sharing.status().error,/shared view/);assert.equal(a.sharing.status().pending,true);
  assert.equal(a.store.me().cards[CARDS[0].id].q,2);
  a.backend.updateShare=async()=>true;await a.sharing.update();assert.equal(a.sharing.status().pending,false);assert.equal(a.sharing.status().error,'');
});
test('revocation cancels queued publications and a stale tab cannot recreate a link',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const a=owner();a.streams[0].next(null);await a.sharing.create();a.change({}, {[CARDS[0].id]:{q:2}});
  await a.sharing.revoke();t.mock.timers.tick(5000);assert.equal(a.calls.filter(c=>c.op==='update').length,0);assert.equal(a.sharing.status().token,null);
  await a.sharing.create();a.backend.updateShare=async()=>false;a.change({}, {[CARDS[0].id]:{q:3}});
  t.mock.timers.tick(1500);await tick();assert.equal(a.sharing.status().token,null);assert.equal(a.calls.filter(c=>c.op==='create').length,2);
});
test('account switches discard stale sharing callbacks and in-flight create results',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const a=owner();a.streams[0].next(null);let resolve;
  a.backend.createShare=()=>new Promise(r=>resolve=r);const operation=a.sharing.create();
  a.change({user:{uid:'bob'}});assert.equal(a.streams[0].stopped,true);
  a.streams[0].next(TOKEN);resolve(TOKEN);await operation;assert.equal(a.sharing.status().token,null);
  a.streams[1].next(OTHER);a.change({user:null,editable:false});t.mock.timers.tick(5000);assert.equal(a.calls.length,0);
});
test('friends see collection stats, filters, quantities and flags without any editing controls',()=>{
  const v=viewer(),dom=createDOM();globalThis.document=dom.document;
  v.streams[0].next({cards:{[CARDS[0].id]:{q:3,w:true,t:true}}});
  const state=createState(v.store),filters=createFilters(state,v.store),renderer=createRenderer(v.store,state,filters,{});
  renderer.renderAll();assert.equal(state.st.status,'owned');assert.equal(CARDS.filter(filters.matches).length,1);
  assert.match(dom.get('#progressText').textContent,/1 \/ 769/);
  assert.doesNotMatch(dom.get('#profileArea').innerHTML,/id="(?:shareBtn|backupBtn|loginBtn|logoutBtn)"/);
  assert.doesNotMatch(dom.get('#grid').innerHTML,/data-act="(?:inc|dec|wish|trade)"/);
  assert.match(dom.get('#grid').innerHTML,/×3/);assert.equal(dom.get('#status').disabled,false);
  state.st.status='wish';assert.equal(CARDS.filter(filters.matches).length,1);
  state.st.status='trade';assert.equal(CARDS.filter(filters.matches).length,1);
  const dialogs=createDialogs(v.store,state,renderer.renderAll,v.store.setEntry);dialogs.openCard(CARDS[0]);
  assert.match(dom.get('#cardDlg').innerHTML,/Owned: 3 · On wishlist · Marked for trade/);assert.doesNotMatch(dom.get('#cardDlg').innerHTML,/data-a=/);
  assert.equal(v.store.setEntry(CARDS[0],{q:63}),false);assert.equal(v.store.me().cards[CARDS[0].id].q,3);
});
test('revoked, missing or cached links clear the shared data and retry ignores old callbacks',()=>{
  const v=viewer();v.streams[0].next({cards:{[CARDS[0].id]:{q:3}}});assert.ok(v.store.me());
  v.streams[0].next({cards:{}},{fromCache:true});assert.equal(v.store.me(),null);assert.equal(v.store.status().loading,true);
  v.streams[0].error(Error('permission-denied'));assert.equal(v.store.me(),null);assert.match(v.store.status().error,/unavailable/);
  v.store.retry();v.streams[0].next({cards:{[CARDS[0].id]:{q:63}}});assert.equal(v.store.me(),null);
  v.streams[1].next(null);assert.equal(v.store.me(),null);assert.equal(v.store.status().loading,false);
});
test('shared app startup never subscribes to auth or private collections, including invalid links',async()=>{
  globalThis.window={addEventListener(){}};globalThis.location={hash:''};globalThis.document=createDOM().document;
  const {startApp}=await import('../app.js');
  let next,reads=0;const backend={watchSharedCollection(token,fn){reads++;assert.equal(token,TOKEN);next=fn;return()=>{};},watchAuth(){throw Error('Must not read auth');},watchCards(){throw Error('Must not read private cards');}};
  const dom=createDOM();globalThis.document=dom.document;globalThis.location={hash:'#share='+TOKEN};
  const {store}=await startApp({backend});assert.equal(reads,1);assert.equal(dom.get('#binder').hidden,true);
  next({cards:{[CARDS[0].id]:{q:2,w:false,t:false}}});assert.equal(dom.get('#binder').hidden,false);assert.equal(dom.get('#sharedBanner').hidden,false);
  assert.equal(store.editable(),false);assert.doesNotMatch(dom.get('#grid').innerHTML,/data-act="inc"/);
  const invalid=createDOM();globalThis.document=invalid.document;globalThis.location={hash:'#share=broken'};
  await startApp({backend});assert.equal(reads,1);assert.equal(invalid.get('#binder').hidden,true);assert.match(invalid.get('#cloudStatus').textContent,/unavailable/);
});

test('owner Share dialog creates, copies and revokes the link',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const a=owner();a.streams[0].next(null);
  const dom=createDOM();globalThis.document=dom.document;globalThis.window={location:{href:'https://ponybinder.app/'}};
  let copied='';Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async value=>{copied=value;}}}});
  const state=createState(a.store);const dialogs=createDialogs(a.store,state,()=>{},()=>{},a.sharing);
  dialogs.openShare();assert.match(dom.get('#menuDlg').innerHTML,/Create link/);
  await dom.get('#createShare').onclick();assert.match(dom.get('#menuDlg').innerHTML,/Read-only link/);
  await dom.get('#copyShare').onclick();assert.equal(copied,shareURL(a.sharing.status().token));assert.equal(dom.get('#shareMessage').textContent,'Link copied.');
  await dom.get('#revokeShare').onclick();assert.equal(a.sharing.status().token,null);assert.match(dom.get('#menuDlg').innerHTML,/Sharing is off/);
});
test('edits during an in-flight shared update publish afterward without mutating the first payload',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const a=owner();a.streams[0].next(null);await a.sharing.create();let resolve,first;
  a.backend.updateShare=async(uid,token,cards)=>{first=cards;return new Promise(r=>resolve=r);};
  a.change({}, {[CARDS[0].id]:{q:1}});t.mock.timers.tick(1500);
  await assert.rejects(a.sharing.flush(),/Wait/);
  a.change({}, {[CARDS[0].id]:{q:3}});assert.equal(first[CARDS[0].id].q,1);
  resolve(true);await tick();let final;
  a.backend.updateShare=async(uid,token,cards)=>{final=cards;return true;};
  t.mock.timers.tick(1500);await tick();assert.equal(final[CARDS[0].id].q,3);assert.equal(a.sharing.status().pending,false);
});

test('a create response cannot restore a link revoked by another tab while creation finishes',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const a=owner();a.streams[0].next(null);let resolve;
  a.backend.createShare=()=>new Promise(r=>resolve=r);
  const operation=a.sharing.create();
  a.streams[0].next(TOKEN);a.streams[0].next(null);
  resolve(TOKEN);await operation;
  assert.equal(a.sharing.status().token,null);assert.equal(a.sharing.status().pending,false);
});
