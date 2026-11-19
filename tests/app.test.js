import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createDOM} from './dom.js';
const raw=JSON.parse(readFileSync(new URL('../data/catalog.json',import.meta.url)));
globalThis.window={addEventListener(){}};
globalThis.fetch=async()=>({ok:true,json:async()=>structuredClone(raw)});
const catalog=await import('../js/catalog.js');await catalog.loadCatalog();
const {CARDS}=catalog;
const {createStore}=await import('../js/storage.js');
const {createState,entry}=await import('../js/state.js');
const {createFilters}=await import('../js/filters.js');
const {createRenderer}=await import('../js/rendering.js');
const {createDialogs}=await import('../js/dialogs.js');
const {bindEvents}=await import('../js/events.js');
const {backupData,readBackup,csvData}=await import('../js/backup.js');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(options={saveDelay:0}){
  const streams=[],writes=[];
  const backend={watchCards(uid,next,error){const stream={uid,next,error,stopped:false};streams.push(stream);return()=>stream.stopped=true;},writeCard(uid,id,patch){return new Promise((resolve,reject)=>writes.push({uid,id,patch,resolve,reject}));},logout:async()=>{},login:async()=>{}};
  const store=createStore(backend,options);return {store,backend,streams,writes};
}
function signed(options){const app=setup(options);app.store.connect({uid:'nick',displayName:'Nick'});app.streams[0].next({});return app;}
function wire(env=setup()){
  const dom=createDOM();globalThis.document=dom.document;
  const state=createState(env.store),filters=createFilters(state,env.store);
  let dialogs;
  const renderer=createRenderer(env.store,state,filters,{login(){},logout(){},openBackup:()=>dialogs.openBackup()});
  dialogs=createDialogs(env.store,state,renderer.renderAll,env.store.setEntry);
  bindEvents(env.store,state,renderer,dialogs,env.store.setEntry);
  return {...env,...dom,state,filters,renderer,dialogs};
}
test('catalog includes BP04 and preserves all previous card IDs and ordering',()=>{
  assert.equal(CARDS.length,769);
  assert.equal(createHash('sha256').update(JSON.stringify(CARDS.filter(c=>c.s!=='BP04').map(c=>c.id))).digest('hex'),'a8f37da8422cf2cf5a991296d2b5e95b2e27d481b2765f60872f18d907785433');
  assert.ok(CARDS.every(c=>new URL(c.img).hostname==='static-sg.kayouofficial.com'));
});
test('guest browses cards and dialogs without tracking, localStorage or shared hashes',()=>{
  globalThis.localStorage={getItem(){throw Error('Must not read localStorage');},setItem(){throw Error('Must not write localStorage');}};
  globalThis.location={hash:'#view=v3.old.anything'};
  const app=wire();app.store.connect(null);app.renderer.renderAll();
  assert.match(app.get('#grid').innerHTML,/<img/);assert.doesNotMatch(app.get('#grid').innerHTML,/data-act="inc"/);
  assert.equal(app.store.setEntry(CARDS[0],{q:1}),false);
  app.dialogs.openCard(CARDS[0]);assert.equal(app.get('#cardDlg').open,true);assert.equal(app.get('#cardDlg').querySelectorAll('[data-a]').length,0);
  app.get('#quickAdd').onclick();assert.doesNotMatch(app.get('#grid').innerHTML,/data-quantity=/);
  assert.match(app.get('#profileArea').innerHTML,/Sign in with Google/);assert.doesNotMatch(app.get('#profileArea').innerHTML,/shareBtn/);
});
test('account starts empty and blocks edits until server confirms collection',()=>{
  const app=setup();app.store.connect({uid:'nick'});assert.equal(app.store.setEntry(CARDS[0],{q:3}),false);
  app.streams[0].next({}, {fromCache:true});assert.equal(app.store.editable(),false);
  app.streams[0].next({});assert.equal(app.store.editable(),true);assert.deepEqual(app.store.me().cards,{});
});
test('writes only changed fields, overlays pending edits and saves without losing remote flags',async()=>{
  const {store,streams,writes}=signed(),c=CARDS[0];
  store.setEntry(c,{q:2});assert.deepEqual(writes[0].patch,{q:2});assert.equal(entry(store.me(),c).q,2);
  streams[0].next({[c.id]:{q:0,w:true,t:false}});
  assert.deepEqual(entry(store.me(),c),{q:2,w:true,t:false});
  writes[0].resolve();await tick();assert.equal(store.status().pending,0);assert.equal(entry(store.me(),c).w,true);
});
test('rapid edits serialize per card and distinct cards can save independently',async()=>{
  const {store,writes}=signed(),c=CARDS[0];store.setEntry(c,{q:1});store.setEntry(c,{q:12});store.setEntry(CARDS[1],{w:true});
  assert.equal(writes.length,2);assert.equal(entry(store.me(),c).q,12);
  writes[0].resolve();await tick();assert.equal(writes.length,3);assert.deepEqual(writes[2].patch,{q:12});
  writes[1].resolve();writes[2].resolve();await tick();assert.equal(store.status().pending,0);
});
test('failed writes remain pending, block signout, and retry in order',async()=>{
  const {store,writes}=signed();store.setEntry(CARDS[0],{q:1});store.setEntry(CARDS[0],{q:2});writes[0].reject(Error('offline'));await tick();
  assert.equal(store.status().failed,true);await assert.rejects(store.logout(),/Wait/);
  store.retry();assert.equal(writes.length,2);writes[1].resolve();await tick();assert.equal(writes.length,3);writes[2].resolve();await tick();assert.equal(store.status().pending,0);
});
test('account switching detaches streams and ignores late callbacks',async()=>{
  const {store,streams,writes}=signed();store.setEntry(CARDS[0],{q:8});
  store.connect({uid:'cordelia',displayName:'Cordelia'});assert.equal(streams[0].stopped,true);streams[1].next({});
  writes[0].resolve();streams[0].next({[CARDS[0].id]:{q:8,w:false,t:false}});await tick();
  assert.equal(store.me().name,'Cordelia');assert.deepEqual(store.me().cards,{});
  store.connect(null);assert.equal(store.me(),null);assert.equal(store.editable(),false);
});
test('read failure disables editing and retry preserves unsaved operations',async()=>{
  const {store,streams,writes}=signed();store.setEntry(CARDS[0],{q:4});streams[0].error(Error('denied'));
  assert.equal(store.editable(),false);store.retry();streams[1].next({});assert.equal(entry(store.me(),CARDS[0]).q,4);
  writes[0].resolve();await tick();assert.equal(store.status().pending,0);
});
test('offline metadata blocks new edits until connection returns',()=>{
  const {store,streams}=signed();streams[0].next({}, {fromCache:true});assert.equal(store.status().offline,true);assert.equal(store.editable(),false);
  streams[0].next({});assert.equal(store.editable(),true);
});
test('signed-in Quick Add saves whole quantities and keeps invalid edits out of cloud',()=>{
  const app=wire(signed());app.renderer.renderAll();app.get('#quickAdd').onclick();const c=CARDS.find(c=>c.s==='BP02');
  const input={value:'12',dataset:{quantity:String(c.i)},closest(){return this;}};
  app.get('#grid').listeners.input({type:'input',target:input});assert.equal(entry(app.store.me(),c).q,12);
  input.value='64';app.get('#grid').listeners.change({type:'change',target:input});assert.equal(Number(input.value),12);assert.equal(app.writes.length,1);
});
test('filters and mobile progress work for cloud collection',()=>{
  const app=wire(signed());app.streams[0].next({[CARDS.find(c=>c.s==='BP02').id]:{q:1,w:true,t:false}});app.renderer.renderAll();
  assert.match(app.get('#progressText').textContent,/1 \/ 191/);app.get('#statsToggle').onclick();assert.equal(app.get('#statsToggle')['aria-expanded'],'true');
  app.state.st.set='all';app.state.st.status='owned';assert.equal(CARDS.filter(app.filters.matches).length,1);
});
test('backups and CSV preserve stable card IDs and flags',()=>{
  const p={name:'Nick',color:'#d94c95',cards:{[CARDS[0].id]:{q:2,w:true,t:false}}};
  assert.deepEqual(readBackup(JSON.stringify(backupData(p))),p);assert.equal(csvData(p).split('\n').length,770);
});
test('malformed catalog leaves active catalog intact',async()=>{
  const before=catalog.CARDS;await assert.rejects(catalog.loadCatalog(async()=>({ok:false,status:404})));assert.equal(catalog.CARDS,before);
});

test('app boots into public catalog and responds to authenticated cloud loading',async()=>{
  const dom=createDOM();globalThis.document=dom.document;
  const {startApp}=await import('../app.js');
  const nextDOM=createDOM();globalThis.document=nextDOM.document;
  let authCallback,nextCards;
  const backend={watchAuth(fn){authCallback=fn;fn(null);return()=>{};},watchCards(uid,fn){nextCards=fn;return()=>{};},login:async()=>{},logout:async()=>{},writeCard:async()=>{}};
  await startApp({backend});
  assert.match(nextDOM.get('#cloudStatus').textContent,/Browse cards/);
  assert.match(nextDOM.get('#grid').innerHTML,/<img/);
  authCallback({uid:'nick',displayName:'Nick'});assert.match(nextDOM.get('#cloudStatus').textContent,/Loading/);
  nextCards({});assert.match(nextDOM.get('#cloudStatus').textContent,/All changes saved/);
  assert.match(nextDOM.get('#grid').innerHTML,/data-act="inc"/);
  authCallback(null);assert.doesNotMatch(nextDOM.get('#grid').innerHTML,/data-act="inc"/);
});

test('restore applies card values to cloud only after explicit confirmation',async()=>{
  const app=wire(signed());app.renderer.renderAll();app.dialogs.openBackup();
  const c=CARDS[0],backup=JSON.stringify(backupData({name:'Old name',color:'#fff',cards:{[c.id]:{q:5,w:true,t:false}}}));
  globalThis.confirm=()=>false;app.get('#impFile').onchange({target:{files:[{text:async()=>backup}]}});await tick();assert.equal(app.writes.length,0);
  globalThis.confirm=()=>true;app.get('#impFile').onchange({target:{files:[{text:async()=>backup}]}});await tick();
  assert.deepEqual(app.writes[0].patch,{q:5,w:true,t:false});assert.equal(app.store.me().name,'Nick');
});

test('rapid edits combine after 750ms from the last click, with immediate UI and save guards',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const {store,writes,streams}=signed({}),c=CARDS[0];
  store.setEntry(c,{q:1});t.mock.timers.tick(500);
  store.setEntry(c,{q:2});t.mock.timers.tick(500);
  store.setEntry(c,{q:3,w:true});
  streams[0].next({[c.id]:{q:0,w:false,t:true}});
  assert.deepEqual(entry(store.me(),c),{q:3,w:true,t:true});
  assert.equal(store.status().pending,1);
  await assert.rejects(store.logout(),/Wait/);
  t.mock.timers.tick(749);assert.equal(writes.length,0);
  t.mock.timers.tick(1);assert.equal(writes.length,1);
  assert.deepEqual(writes[0].patch,{q:3,w:true});
  writes[0].resolve();await tick();assert.equal(store.status().pending,0);
});

test('cards debounce independently and later edits wait behind an unchanged in-flight save',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const {store,writes}=signed({}),c=CARDS[0],other=CARDS[1];
  store.setEntry(c,{q:1});t.mock.timers.tick(400);store.setEntry(other,{q:2});
  t.mock.timers.tick(350);assert.equal(writes.length,1);
  store.setEntry(c,{q:2});store.setEntry(c,{q:3,t:true});
  assert.deepEqual(writes[0].patch,{q:1});
  t.mock.timers.tick(400);assert.equal(writes.length,2);assert.equal(writes[1].id,other.id);
  t.mock.timers.tick(350);assert.equal(writes.length,2);
  writes[0].resolve();await tick();assert.equal(writes.length,3);
  assert.deepEqual(writes[2].patch,{q:3,t:true});
  writes[1].resolve();writes[2].resolve();await tick();assert.equal(store.status().pending,0);
});

test('account changes cancel waiting edits and failed debounced saves remain retryable',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const {store,writes,streams}=signed({});
  store.setEntry(CARDS[0],{q:3});store.connect({uid:'cordelia'});streams[1].next({});
  t.mock.timers.tick(750);assert.equal(writes.length,0);
  store.setEntry(CARDS[0],{q:4});t.mock.timers.tick(750);
  writes[0].reject(Error('offline'));await tick();assert.equal(store.status().failed,true);
  store.retry();assert.equal(writes.length,2);assert.deepEqual(writes[1].patch,{q:4});
  writes[1].resolve();await tick();assert.equal(store.status().pending,0);
});


test('BP04 contains all official rarities, Tokens and separate Shining Emerald variants',()=>{
  const cards=CARDS.filter(c=>c.s==='BP04');
  assert.equal(catalog.SETS.find(s=>s.code==='BP04').name,"Hearth's Warming Eve");
  const counts={};for(const c of cards){const key=(c.sh?'※':'')+c.r;counts[key]=(counts[key]||0)+1;}
  assert.deepEqual(counts,{CR:12,GR:12,SR:14,U:18,C:48,RR:6,ER:6,SPR:28,'※CR':12,'※GR':6,'※RR':6,'※ER':12,'※SPR':11,TK:6});
  assert.equal(new Set(cards.map(c=>c.id)).size,197);
  assert.equal(new Set(cards.map(c=>(c.sh?'※':'')+c.c)).size,197);
  assert.deepEqual(cards.filter(c=>c.r==='TK').map(c=>c.c),['TK-02','TK-03','TK-04','TK-05','TK-06','TK-07']);
  const emeralds=catalog.SORTED.filter(c=>c.s==='BP04'&&c.r==='ER');
  assert.deepEqual(emeralds.map(c=>(c.sh?'※':'')+c.c),Array.from({length:6},(_,i)=>{
    const code=`BP04-ER${String(i+1).padStart(2,'0')}`;return [code,`※${code}-A`,`※${code}-B`];
  }).flat());
});

test('BP04 supports set/rarity/Shining filters, stats, tracking and backup export',async()=>{
  const app=wire(signed());app.state.st.set='BP04';app.renderer.renderAll();
  assert.match(app.get('#setTabs').innerHTML,/Hearth&#39;s Warming Eve|Hearth's Warming Eve/);
  assert.match(app.get('#progressText').textContent,/0 \/ 197/);
  assert.match(app.get('#rarity').innerHTML,/Token \(TK\)/);
  app.state.st.rarity='TK';assert.equal(CARDS.filter(app.filters.matches).length,6);
  app.state.st.rarity='ER';app.state.st.shining=true;assert.equal(CARDS.filter(app.filters.matches).length,12);
  app.state.st.q='ER01-B';assert.equal(CARDS.filter(app.filters.matches).length,1);
  const variant=CARDS.find(c=>c.s==='BP04'&&c.c==='BP04-ER01-B'),token=CARDS.find(c=>c.s==='BP04'&&c.r==='TK');
  app.store.setEntry(variant,{q:3,w:true});app.store.setEntry(token,{q:1});
  assert.equal(app.writes.length,2);assert.notEqual(app.writes[0].id,app.writes[1].id);
  for(const write of app.writes)write.resolve();await tick();
  const restored=readBackup(JSON.stringify(backupData(app.store.me())));
  assert.deepEqual(restored.cards[variant.id],{q:3,w:true,t:false});
  assert.equal(restored.cards[token.id].q,1);
  const csv=csvData(app.store.me());assert.match(csv,/※BP04-ER01-B/);assert.match(csv,/"TK-02"/);assert.match(csv,/"Token"/);
  app.state.st.q='';app.state.st.rarity='all';app.state.st.shining=false;app.renderer.renderStats();
  assert.match(app.get('#progressText').textContent,/2 \/ 197/);
});
