import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createDOM } from './dom.js';

globalThis.window = { addEventListener(){} };
const rawCatalog = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
globalThis.fetch = async url => {
  assert.equal(url.pathname.endsWith('/data/catalog.json'), true);
  return { ok:true, json:async()=>structuredClone(rawCatalog) };
};
const catalog = await import('../js/catalog.js');
await catalog.loadCatalog();
const { CARDS, SETS, SORTED } = await import('../js/catalog.js');
const { createStore } = await import('../js/storage.js');
const { createState, entry } = await import('../js/state.js');
const { createFilters } = await import('../js/filters.js');
const { encode, decode } = await import('../js/sharing.js');
const { backupData, readBackup, csvData } = await import('../js/backup.js');
const { createRenderer } = await import('../js/rendering.js');
const { createDialogs } = await import('../js/dialogs.js');
const { bindEvents } = await import('../js/events.js');

function setup(saved=null){
  const data = new Map(saved ? [['ponybinder.v1', saved]] : []);
  globalThis.localStorage = { getItem:key => data.get(key) ?? null, setItem:(key,value) => data.set(key,value) };
  globalThis.location = { hash:'', origin:'https://example.com', pathname:'/pony-binder/' };
  const store = createStore();
  return { store, state:createState(store), data };
}
function profile(){
  return { name:'Nick & Cordelia', color:'#d94c95', cards:{
    [CARDS[0].id]:{ q:2, w:false, t:true },
    [CARDS[130].id]:{ q:0, w:true, t:false },
    [CARDS.at(-1).id]:{ q:63, w:true, t:true }
  } };
}

test('catalog keeps all 572 cards in their original share-link positions', () => {
  assert.equal(CARDS.length, 572);
  assert.equal(SETS.length, 3);
  assert.equal(new Set(CARDS.map(c => c.id)).size, 572);
  assert.equal(createHash('sha256').update(JSON.stringify(CARDS.map(c => c.id))).digest('hex'), 'a8f37da8422cf2cf5a991296d2b5e95b2e27d481b2765f60872f18d907785433');
  assert.ok(CARDS.every((c,i) => c.i===i));
  assert.equal(SORTED.length, 572);
 });
test('existing v2 link fixture preserves gaps, quantities and flags', () => {
  const p = profile();
  assert.match(encode(p), /^v3\./);
  assert.deepEqual(decode('v2.Nick%20%26%20Cordelia.AIKBAUC4A_8'), { ...p, color:'#6c4bb6' });
  assert.equal(decode('invalid'), null);
  assert.equal(decode('v2.%ZZ.'), null);
 });
test('empty and Unicode profiles round-trip without storing zero entries', () => {
  const p = { name:'コーデリア 🦄', cards:{ [CARDS[10].id]:{ q:0, w:false, t:false } } };
  assert.deepEqual(decode(encode(p)), { name:p.name, color:'#6c4bb6', cards:{} });
 });
test('loads existing storage and persists independent collectors under the same key', () => {
  const saved = { profiles:{ nick:profile() }, current:'nick' };
  const { store, data } = setup(JSON.stringify(saved));
  assert.deepEqual(store.me(), saved.profiles.nick);
  store.newProfile('Cordelia');
  assert.equal(store.me().name, 'Cordelia');
  assert.deepEqual(store.db.profiles.nick, saved.profiles.nick);
  assert.deepEqual(JSON.parse(data.get('ponybinder.v1')), store.db);
 });
test('missing and corrupt storage start with an empty database', () => {
  assert.deepEqual(setup().store.db, { profiles:{}, current:null });
  assert.deepEqual(setup('{bad').store.db, { profiles:{}, current:null });
 });
test('card updates preserve flags, clamp quantities and remove empty entries', () => {
  const { store, state } = setup(); store.newProfile('Nick');
  const c = CARDS[0];
  state.setEntry(c, { q:100, w:true });
  assert.deepEqual(entry(store.me(),c), { q:63, w:true, t:false });
  state.setEntry(c, { q:-5 });
  assert.deepEqual(entry(store.me(),c), { q:0, w:true, t:false });
  state.setEntry(c, { w:false });
  assert.equal(store.me().cards[c.id], undefined);
  assert.deepEqual(createStore().me().cards, {});
 });
test('filters retain set, rarity, search, Shining and status behavior', () => {
  const { store, state } = setup(); store.newProfile('Nick');
  store.me().cards = profile().cards;
  const filters = createFilters(state, store), { st } = state;
  for(const set of [...SETS.map(s => s.code),'all']){
    st.set=set;
    assert.deepEqual(SORTED.filter(filters.matches), SORTED.filter(c => set==='all' || c.s===set));
  }
  st.set='all'; st.shining=true;
  assert.deepEqual(SORTED.filter(filters.matches), SORTED.filter(c => c.sh));
  st.shining=false; st.rarity='CR';
  assert.deepEqual(SORTED.filter(filters.matches), SORTED.filter(c => c.r==='CR'));
  st.rarity='all'; st.q='Twilight';
  assert.deepEqual(SORTED.filter(filters.matches), SORTED.filter(c => c.n.toLowerCase().includes('twilight') || c.c.toLowerCase().includes('twilight')));
  st.q=CARDS[0].c.toLowerCase(); assert.ok(filters.matches(CARDS[0])); st.q='';
  for(const [status, expected] of Object.entries({ owned:[0,571], missing:Array.from({length:572},(_,i)=>i).filter(i=>i!==0&&i!==571), wish:[130,571], trade:[0,571], dupes:[0,571] })){
    st.status=status;
    assert.deepEqual(CARDS.filter(filters.matches).map(c=>c.i), expected);
  }
 });
test('shared views select the friend and compare both trade directions', () => {
  const { store, state } = setup(); store.newProfile('Nick');
  state.setEntry(CARDS[130], { q:2 });
  location.hash='#view='+encode(profile()); state.parseHash();
  assert.equal(state.active().name, profile().name);
  const { matches } = createFilters(state,store); state.st.set='all';
  state.st.status='theyhave'; assert.deepEqual(CARDS.filter(matches).map(c=>c.i), [0,571]);
  state.st.status='ihave'; assert.deepEqual(CARDS.filter(matches).map(c=>c.i), [130]);
  location.hash=''; state.parseHash(); assert.equal(state.active(), store.me());
 });
test('version 1 backups retain metadata and ignore unknown card IDs on restore', () => {
  const p = profile(), backup = backupData(p);
  assert.equal(backup.app, 'pony-binder'); assert.equal(backup.version, 1);
  assert.ok(!Number.isNaN(Date.parse(backup.exported)));
  assert.deepEqual(readBackup(JSON.stringify(backup)), p);
  backup.profile = { ...p, cards:{ ...p.cards, unknown:{ q:9 } } };
  assert.deepEqual(readBackup(JSON.stringify(backup)), p);
  assert.throws(() => readBackup('{}')); assert.throws(() => readBackup('bad'));
 });
test('CSV output matches the pre-refactor format and sort order', () => {
  const csv = csvData(profile());
  assert.equal(csv.split('\n').length,573);
  assert.equal(createHash('sha256').update(csv).digest('hex'), '7e0767f39f300a45c29dde50c21796a76c59d7b8666ac74b0b6249b98ba7a261');
 });

function wire(saved=null){
  const env=setup(saved), dom=createDOM(); globalThis.document=dom.document;
  Object.defineProperty(globalThis, 'navigator', { configurable:true, value:{} });
  const filters=createFilters(env.state,env.store);
  let dialogs;
  const renderer=createRenderer(env.store,env.state,filters, {
    openProfiles:()=>dialogs.openProfiles(), openShare:()=>dialogs.openShare(),
    openBackup:()=>dialogs.openBackup(), openWelcome:()=>dialogs.openWelcome()
  });
  const setEntry=(c,patch)=>{ env.state.setEntry(c,patch); renderer.updateCard(c); renderer.renderStats(); };
  dialogs=createDialogs(env.store,env.state,renderer.renderAll,setEntry);
  bindEvents(env.store,env.state,renderer,dialogs,setEntry);
  return { ...env, ...dom, renderer, dialogs };
}
test('first-time welcome creates a collector and renders the default binder', () => {
  const app=wire(); app.renderer.renderAll(); app.dialogs.openWelcome();
  assert.equal(app.get('#menuDlg').open,true);
  app.get('#wname').value='Nick'; app.get('#wf').onsubmit({ preventDefault(){} });
  assert.equal(app.store.me().name,'Nick'); assert.equal(app.get('#menuDlg').open,false);
  assert.match(app.get('#profileArea').innerHTML,/Nick/);
  assert.equal(app.get('#count').textContent, `Showing ${CARDS.filter(c=>c.s==='BP02').length} cards`);
  assert.equal(typeof app.get('#shareBtn').onclick,'function');
 });
test('dialogs and delegated events work after switching profiles and in read-only mode', () => {
  const app=wire(); app.store.newProfile('Nick'); app.renderer.renderAll();
  app.get('#whoBtn').onclick(); app.get('#pname').value='Cordelia';
  app.get('#pf').onsubmit({ preventDefault(){} });
  assert.equal(app.store.me().name,'Cordelia');
  const c=CARDS.find(c=>c.s==='BP02');
  const click=act=>app.get('#grid').listeners.click({ target:{ closest:()=>({ dataset:{ act }, closest:()=>({ dataset:{ i:c.i } }) }) } });
  click('inc'); assert.equal(entry(app.store.me(),c).q,1);
  click('open'); assert.equal(app.get('#cardDlg').open,true);
  app.get('#cardDlg').querySelectorAll('[data-a]').find(b=>b.dataset.a==='wish').onclick();
  assert.equal(entry(app.store.me(),c).w,true);
  app.dialogs.openShare(); assert.match(app.get('#menuDlg').innerHTML,/#view=v3.Cordelia/);
  app.dialogs.openBackup(); assert.equal(typeof app.get('#expBtn').onclick,'function');
  app.state.st.view=decode(encode(profile())); app.renderer.renderAll();
  click('inc'); assert.equal(entry(app.store.me(),c).q,1);
  click('open'); assert.equal(app.get('#cardDlg').querySelectorAll('[data-a]').length,0);
  assert.match(app.get('#viewBanner').innerHTML,/view only/);
 });
test('app entry point boots its module graph and attaches controls', async () => {
  const { get, document }=createDOM(); setup(); globalThis.document=document;
  await import('../app.js');
  assert.equal(get('#menuDlg').open,true);
  assert.equal(typeof get('#grid').listeners.click,'function');
  assert.equal(typeof get('#rarity').onchange,'function');
 });

test('restore dialog imports backups and respects replacement confirmation', async () => {
  const app=wire(); app.store.newProfile('Nick'); app.renderer.renderAll(); app.dialogs.openBackup();
  const p=profile(), text=JSON.stringify(backupData(p));
  app.get('#impFile').onchange({ target:{ files:[{ text:async()=>text }] } });
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(app.store.me().cards,p.cards);
  assert.equal(app.store.me().name,p.name);
  assert.equal(app.get('#menuDlg').open,false);
  app.store.me().cards={}; app.store.save();
  globalThis.confirm=()=>false;
  app.dialogs.openBackup(); app.get('#impFile').onchange({ target:{ files:[{ text:async()=>text }] } });
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(app.store.me().cards,{});
  assert.equal(app.get('#menuDlg').open,true);
  globalThis.confirm=()=>true;
  app.get('#impFile').onchange({ target:{ files:[{ text:async()=>text }] } });
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(app.store.me().cards,p.cards);
  assert.equal(Object.values(app.store.db.profiles).filter(profile=>profile.name===p.name).length,1);
  let message; globalThis.alert=text=>{message=text;};
  app.dialogs.openBackup(); app.get('#impFile').onchange({ target:{ files:[{ text:async()=>'{bad' }] } });
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(message,'That file is not a Pony Binder backup.');
});


test('catalog loading rejects HTTP errors, malformed JSON and invalid data without replacing the catalog', async () => {
  const before = catalog.CARDS;
  await assert.rejects(catalog.loadCatalog(async()=>({ ok:false, status:404 })), /404/);
  await assert.rejects(catalog.loadCatalog(async()=>({ ok:true, json:async()=>{ throw new SyntaxError('Bad JSON'); } })), /Bad JSON/);
  for (const change of [d=>d.cards.push(d.cards[0]), d=>d.cards[0].s='unknown', d=>d.cards[0].r='unknown', d=>d.cards[0].sh='yes', d=>d.sets.push(d.sets[0]), d=>d.cards=[]]) {
    const data=structuredClone(rawCatalog); change(data);
    await assert.rejects(catalog.loadCatalog(async()=>({ ok:true, json:async()=>data })), /Invalid catalog/);
    assert.equal(catalog.CARDS, before);
  }
});

test('startup waits for the catalog and recovers after a failed request', async () => {
  const { startApp } = await import('../app.js');
  const { get, document }=createDOM(); setup(); globalThis.document=document;
  const originalFetch=globalThis.fetch, originalError=console.error;
  let finish;
  try {
    globalThis.fetch=()=>new Promise(resolve=>{ finish=resolve; });
    const pending=startApp();
    assert.equal(get('#binder').hidden,true);
    assert.equal(get('#grid').listeners.click,undefined);
    finish({ ok:false, status:503 }); console.error=()=>{};
    await pending;
    assert.match(get('#catalogStatus').innerHTML,/Unable to load cards/);
    assert.equal(get('#grid').listeners.click,undefined);
    globalThis.fetch=originalFetch;
    await get('#retryCatalog').onclick();
    assert.equal(get('#catalogStatus').hidden,true);
    assert.equal(get('#binder').hidden,false);
    assert.equal(typeof get('#grid').listeners.click,'function');
    assert.equal(get('#menuDlg').open,true);
  } finally { globalThis.fetch=originalFetch; console.error=originalError; }
});


test('all card images use Kayou while collection metadata and positions stay unchanged', () => {
  assert.ok(rawCatalog.cards.every(c => new URL(c.img).hostname === 'static-sg.kayouofficial.com'));
  const metadata=rawCatalog.cards.map(({ img, ...card })=>card);
  assert.equal(createHash('sha256').update(JSON.stringify(metadata)).digest('hex'), '5dab7b60870ff8e47f666def696059da330b9a52994cb676d2997a48bd257849');
});

test('Quick Add saves quantities immediately, preserves flags and rejects invalid edits', () => {
  const app=wire(); app.store.newProfile('Nick'); app.renderer.renderAll();
  const c=CARDS.find(c=>c.s==='BP02'); app.state.setEntry(c,{q:1,w:true,t:true});
  app.get('#quickAdd').onclick();
  assert.equal(app.state.st.quick,true);
  assert.match(app.get('#grid').innerHTML,/data-quantity=/);
  assert.doesNotMatch(app.get('#grid').innerHTML,/<img/);
  const input={value:'12',dataset:{quantity:String(c.i)},closest(){return this;}};
  const fire=type=>app.get('#grid').listeners[type]({type,target:input});
  fire('input');
  assert.deepEqual(entry(app.store.me(),c),{q:12,w:true,t:true});
  assert.equal(JSON.parse(app.data.get('ponybinder.v1')).profiles[app.store.db.current].cards[c.id].q,12);
  assert.match(app.get('#stats').innerHTML,/12/);
  for (const bad of ['', '-1', '64', '1.5', 'abc']){
    input.value=bad; fire('input'); assert.equal(entry(app.store.me(),c).q,12);
    fire('change'); assert.equal(Number(input.value),12);
  }
  input.value='0'; fire('input'); assert.deepEqual(entry(app.store.me(),c),{q:0,w:true,t:true});
  app.state.setEntry(c,{w:false,t:false}); fire('input'); assert.equal(app.store.me().cards[c.id],undefined);
  app.get('#quickAdd').onclick(); assert.equal(app.state.st.quick,false);
  assert.match(app.get('#grid').innerHTML,/<img/);
});

test('Quick Add applies filters and shared quantities remain read only', () => {
  const app=wire(); app.store.newProfile('Nick'); app.renderer.renderAll();
  app.get('#quickAdd').onclick();
  app.get('#rarity').onchange({target:{value:'CR'}});
  app.get('#shining').onchange({target:{checked:true}});
  const expected=CARDS.filter(c=>c.s==='BP02' && c.r==='CR' && c.sh);
  assert.equal((app.get('#grid').innerHTML.match(/data-quantity=/g)||[]).length,expected.length);
  const c=expected[0];
  app.state.st.view={name:'Friend',cards:{[c.id]:{q:3,w:false,t:false}}}; app.renderer.renderAll();
  assert.doesNotMatch(app.get('#grid').innerHTML,/data-quantity=/);
  assert.match(app.get('#grid').innerHTML,/×3/);
  const before=app.data.get('ponybinder.v1');
  const input={value:'5',dataset:{quantity:String(c.i)},closest(){return this;}};
  app.get('#grid').listeners.input({type:'input',target:input});
  assert.equal(app.data.get('ponybinder.v1'),before);
  assert.match(app.get('#quickHelp').textContent,/read only/);
});

test('mobile progress updates quantities and keeps expanded stats through view changes', () => {
  const app=wire(); app.store.newProfile('Nick'); app.renderer.renderAll();
  assert.equal(app.get('#statsToggle')['aria-expanded'],'false');
  assert.match(app.get('#progressText').textContent,/0 \/ 191 · 0%/);
  app.get('#statsToggle').onclick();
  assert.equal(app.get('#statsToggle')['aria-expanded'],'true');
  assert.equal(app.get('#statsToggle').textContent,'Hide stats');
  const c=CARDS.find(c=>c.s==='BP02');app.state.setEntry(c,{q:1});app.renderer.renderStats();
  assert.match(app.get('#progressText').textContent,/1 \/ 191 · 1%/);
  assert.equal(app.get('#progressBar').style.width,'1%');
  app.get('#quickAdd').onclick();app.renderer.renderAll();
  assert.equal(app.get('#statsToggle')['aria-expanded'],'true');
  app.state.st.view={name:'Friend',cards:{}};app.renderer.renderAll();
  assert.match(app.get('#progressText').textContent,/0 \/ 191/);
  app.get('#statsToggle').onclick();assert.equal(app.get('#statsToggle')['aria-expanded'],'false');
});


test('v3 and legacy v2 links survive catalog reordering and insertion', () => {
  const p=profile(), link=encode(p), original=[...CARDS];
  try {
    CARDS.reverse(); CARDS.unshift({id:'future-card'});
    assert.deepEqual(decode(link),{...p,color:'#6c4bb6'});
    assert.equal(encode(p),link);
    assert.deepEqual(decode('v2.Nick%20%26%20Cordelia.AIKBAUC4A_8'),{...p,color:'#6c4bb6'});
  } finally { CARDS.splice(0,CARDS.length,...original); }
});

test('v3 supports dotted Unicode names, rejects corrupt records, and skips unknown IDs', () => {
  const p={name:'Nick. 🦄',cards:profile().cards};
  assert.deepEqual(decode(encode(p)),{...p,color:'#6c4bb6'});
  const link=bytes=>'v3.Friend.'+Buffer.from(bytes).toString('base64url');
  for (const bytes of [[1,1,65,1],[0,2,65],[0,1,255,1],[0,0,1],[0,1,65,0],[0,1,65,1,0,1,65,1]]) assert.equal(decode(link(bytes)),null);
  assert.deepEqual(decode(link([0,1,65,1])),{name:'Friend',color:'#6c4bb6',cards:{}});
});

test('full v3 collection round-trips all flags and legacy map stays frozen', async () => {
  const { LEGACY_SHARE_IDS }=await import('../js/legacy-share-ids.js');
  assert.equal(createHash('sha256').update(JSON.stringify(LEGACY_SHARE_IDS)).digest('hex'),'a8f37da8422cf2cf5a991296d2b5e95b2e27d481b2765f60872f18d907785433');
  assert.ok(Object.isFrozen(LEGACY_SHARE_IDS));
  const p={name:'Full binder',cards:Object.fromEntries(CARDS.map((c,i)=>[c.id,{q:63,w:!!(i%2),t:!!(i%3)}]))};
  assert.deepEqual(decode(encode(p)),{...p,color:'#6c4bb6'});
  assert.equal(decode('v2.Friend.gA'),null);
  assert.equal(decode('v2.Friend.AA'),null);
});
