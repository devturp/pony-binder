import { SETS, CARDS, RARITIES, RNAME, SORTED, BY_ID } from './modules/catalog.js';
import { db, save, me, uid, newProfile, COLORS } from './modules/storage.js';
import { encode, decode } from './modules/share.js';
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// ---------- state ----------
const st = { set:'BP02', q:'', rarity:'all', status:'all', shining:false, view:null };
function parseHash(){
  const h = location.hash.slice(1);
  st.view = h.startsWith('view=') ? decode(h.slice(5)) : null;
}
const active = () => st.view || me();
const entry = (p,c) => p.cards[c.id] || { q:0, w:false, t:false };

function setEntry(c, patch){
  const p = me(); const e = { ...entry(p,c), ...patch };
  e.q = Math.max(0, Math.min(63, e.q|0));
  if (!e.q && !e.w && !e.t) delete p.cards[c.id]; else p.cards[c.id] = e;
  save(); updateCard(c); renderStats();
}

// ---------- rendering ----------
const ICON = {
  heart:'<svg viewBox="0 0 24 24" fill="FILL" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  swap:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/></svg>'
};

function renderProfile(){
  const area = $('#profileArea'), p = me();
  if (!p){ area.innerHTML = ''; return; }
  area.innerHTML = `
    <button class="who" id="whoBtn" title="Switch collector"><span class="avatar" style="background:${p.color}">${esc(p.name[0]||'?').toUpperCase()}</span>${esc(p.name)}</button>
    <button class="btn" id="shareBtn"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v12M7 8l5-5 5 5"/></svg><span class="lbl">Share</span></button>
    <button class="btn" id="backupBtn"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 3v12M7 10l5 5 5-5M4 20h16"/></svg><span class="lbl">Backup</span></button>`;
  $('#whoBtn').onclick = openProfiles; $('#shareBtn').onclick = openShare; $('#backupBtn').onclick = openBackup;
}

function renderBanner(){
  const b = $('#viewBanner');
  if (!st.view){ b.hidden = true; document.body.classList.remove('readonly'); return; }
  b.hidden = false; document.body.classList.add('readonly');
  b.innerHTML = `Viewing ${esc(st.view.name)}'s collection (view only)
    ${me() ? '<button class="btn" id="saveFriend">Save as a profile</button>' : ''}
    <button class="btn" id="exitView">${me() ? 'Back to my binder' : 'Start my own binder'}</button>`;
  $('#exitView').onclick = () => { history.replaceState(null,'',location.pathname); parseHash(); renderAll(); if (!me()) openWelcome(); };
  const sf = $('#saveFriend');
  if (sf) sf.onclick = () => {
    const id = uid(); db.profiles[id] = { name: st.view.name, color: COLORS[Object.keys(db.profiles).length % COLORS.length], cards: st.view.cards, created: Date.now(), friend:true };
    save(); toast(`Saved ${st.view.name} as a profile on this device`);
  };
}

function renderTabs(){
  const tabs = [...SETS.map(s => [s.code, s.name]), ['all','All sets']];
  $('#setTabs').innerHTML = tabs.map(([k,n]) =>
    `<button class="tab" role="tab" data-set="${k}" aria-selected="${st.set===k}">${esc(n)}</button>`).join('');
  $('#setTabs').querySelectorAll('.tab').forEach(t => t.onclick = () => { st.set = t.dataset.set; renderTabs(); renderStats(); renderGrid(); });
}

function renderFilters(){
  $('#rarity').innerHTML = '<option value="all">All rarities</option>' + RARITIES.map(([k,n]) => `<option value="${k}">${n} (${k})</option>`).join('');
  const s = $('#status');
  const compare = st.view && me();
  s.innerHTML = `<option value="all">All cards</option><option value="owned">Owned</option><option value="missing">Missing</option>
    <option value="wish">Wishlist</option><option value="trade">For trade</option><option value="dupes">Duplicates</option>
    ${compare ? `<option value="theyhave">They have, I need</option><option value="ihave">I have, they want</option>` : ''}`;
  if (![...s.options].some(o => o.value===st.status)) st.status = 'all';
  s.value = st.status; $('#rarity').value = st.rarity;
}

function inScope(c){ return st.set==='all' || c.s===st.set; }

function renderStats(){
  const p = active(); if (!p){ $('#stats').innerHTML=''; return; }
  const scope = CARDS.filter(inScope);
  const owned = scope.filter(c => entry(p,c).q>0).length;
  const total = scope.reduce((a,c) => a + entry(p,c).q, 0);
  const wish = scope.filter(c => entry(p,c).w).length;
  const trade = scope.filter(c => entry(p,c).t || entry(p,c).q>1).length;
  const pct = scope.length ? Math.round(owned/scope.length*100) : 0;
  const base = scope.filter(c => !c.sh), baseOwned = base.filter(c => entry(p,c).q>0).length;
  const label = st.set==='all' ? 'All sets' : SETS.find(s=>s.code===st.set).name;
  const rar = RARITIES.map(([k]) => { const r = scope.filter(c=>c.r===k); if(!r.length) return '';
    return `<span class="rar-chip" title="${RNAME[k]}">${k} ${r.filter(c=>entry(p,c).q>0).length}/${r.length}</span>`; }).join('');
  $('#stats').innerHTML = `
    <div class="stat overall"><h3>${esc(label)} completion</h3>
      <div class="big">${owned}<small> / ${scope.length} cards · ${pct}%</small></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="rar-row">${rar}</div></div>
    <div class="stat"><h3>Base cards (no Shining)</h3><div class="big">${baseOwned}<small> / ${base.length}</small></div>
      <div class="bar"><i style="width:${base.length?baseOwned/base.length*100:0}%"></i></div></div>
    <div class="stat"><h3>Total copies</h3><div class="big">${total}</div><div class="sub">${trade} cards for trade or spare</div></div>
    <div class="stat"><h3>Wishlist</h3><div class="big">${wish}</div><div class="sub">${wish ? 'Cards still being hunted' : 'Tap the heart on any card'}</div></div>`;
}

function matches(c){
  const p = active(), e = entry(p,c);
  if (!inScope(c)) return false;
  if (st.rarity!=='all' && c.r!==st.rarity) return false;
  if (st.shining && !c.sh) return false;
  if (st.q){ const q = st.q.toLowerCase(); if (!c.n.toLowerCase().includes(q) && !c.c.toLowerCase().includes(q)) return false; }
  switch(st.status){
    case 'owned': return e.q>0;
    case 'missing': return !e.q;
    case 'wish': return e.w;
    case 'trade': return e.t || e.q>1;
    case 'dupes': return e.q>1;
    case 'theyhave': return e.q>0 && !entry(me(),c).q;
    case 'ihave': { const m = entry(me(),c); return e.w && !e.q && (m.q>1 || m.t); }
  }
  return true;
}

function cardHTML(c){
  const p = active(), e = entry(p,c);
  return `<article class="card ${e.q?'owned':''}" data-i="${c.i}">
    <button class="card-img" data-act="open" aria-label="View ${esc(c.n)}">
      <img loading="lazy" src="${c.img}" alt="${esc(c.n)} card" width="400" height="559">
      <span class="badges"><span class="badge">${c.r}</span>${c.sh?'<span class="badge sh">Shining ※</span>':''}</span>
      ${e.q?`<span class="qty-pill">×${e.q}</span>`:''}
    </button>
    <div class="card-body">
      <div><p class="card-name">${esc(c.n)}</p><span class="card-code">${c.sh?'※':''}${esc(c.c)} · ${RNAME[c.r]}</span></div>
      <div class="ctrls">
        <div class="stepper">
          <button class="icon-btn" data-act="dec" aria-label="Remove one">−</button>
          <span>${e.q}</span>
          <button class="icon-btn" data-act="inc" aria-label="Add one">+</button>
        </div>
        <div>
          <button class="icon-btn wish ${e.w?'on':''}" data-act="wish" aria-pressed="${e.w}" title="Wishlist" aria-label="Wishlist">${ICON.heart.replace('FILL', e.w?'currentColor':'none')}</button>
          <button class="icon-btn trade ${e.t?'on':''}" data-act="trade" aria-pressed="${e.t}" title="Mark for trade" aria-label="Mark for trade">${ICON.swap}</button>
        </div>
      </div>
    </div></article>`;
}

function renderGrid(){
  const p = active(), g = $('#grid');
  if (!p){ g.innerHTML=''; $('#count').textContent=''; return; }
  const list = SORTED.filter(matches);
  $('#count').textContent = `Showing ${list.length} card${list.length===1?'':'s'}`;
  g.innerHTML = list.length ? list.map(cardHTML).join('') :
    `<div class="empty"><b>No cards match</b>Try a different set, rarity or status filter.</div>`;
}

function updateCard(c){
  const el = document.querySelector(`.card[data-i="${c.i}"]`); if (!el) return;
  if (!matches(c) && st.status!=='all'){ /* keep visible until next filter change to avoid jumpiness */ }
  el.outerHTML = cardHTML(c);
}

function renderAll(){ renderProfile(); renderBanner(); renderFilters(); renderTabs(); renderStats(); renderGrid(); }

// ---------- events ----------
$('#grid').addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]'); if (!b) return;
  const c = CARDS[+b.closest('.card').dataset.i];
  const act = b.dataset.act;
  if (act==='open') return openCard(c);
  if (st.view) return;
  const e = entry(me(),c);
  if (act==='inc') setEntry(c,{q:e.q+1});
  if (act==='dec') setEntry(c,{q:e.q-1});
  if (act==='wish') setEntry(c,{w:!e.w});
  if (act==='trade') setEntry(c,{t:!e.t});
});
let qt; $('#q').addEventListener('input', e => { clearTimeout(qt); qt = setTimeout(()=>{ st.q = e.target.value.trim(); renderGrid(); }, 120); });
$('#rarity').onchange = e => { st.rarity = e.target.value; renderGrid(); };
$('#status').onchange = e => { st.status = e.target.value; renderGrid(); };
$('#shining').onchange = e => { st.shining = e.target.checked; renderGrid(); };
window.addEventListener('hashchange', () => { parseHash(); renderAll(); });

// ---------- dialogs ----------
const menu = $('#menuDlg');
function showMenu(html, closable=true){
  menu.innerHTML = `<div class="dlg-in">${html}</div>`;
  menu.oncancel = closable ? null : (e => e.preventDefault());
  if (!menu.open) menu.showModal();
}
menu.addEventListener('click', e => { if (e.target===menu && !menu.oncancel) menu.close(); });

function openCard(c){
  const d = $('#cardDlg'), ro = !!st.view;
  const draw = () => {
    const e = entry(active(),c);
    const mine = st.view && me() ? entry(me(),c) : null;
    d.innerHTML = `<div class="cd">
      <button class="btn dlg-x" data-x aria-label="Close">✕</button>
      <img src="${c.img.replace('/s400/','/s800/')}" alt="${esc(c.n)} card" style="background:url('${c.img}') center/cover">
      <div>
        <h2 style="font:700 26px var(--font-d);margin:0">${esc(c.n)}</h2>
        <dl><dt>Number</dt><dd>${c.sh?'※':''}${esc(c.c)}</dd>
          <dt>Set</dt><dd>${esc(SETS.find(s=>s.code===c.s).name)}</dd>
          <dt>Rarity</dt><dd>${RNAME[c.r]}${c.sh?' · Shining':''}</dd>
          ${mine?`<dt>You own</dt><dd>${mine.q}</dd>`:''}</dl>
        ${ro ? `<p>${esc(st.view.name)} owns <b>${e.q}</b>${e.w?' and has it on their wishlist':''}${e.t?' and has it marked for trade':''}.</p>` : `
        <div class="big-stepper"><button class="icon-btn" data-a="dec" aria-label="Remove one">−</button><span>${e.q}</span><button class="icon-btn" data-a="inc" aria-label="Add one">+</button><span style="font:600 15px var(--font-b);color:var(--muted)">owned</span></div>
        <div class="row">
          <button class="btn ${e.w?'primary':''}" data-a="wish">${e.w?'On wishlist':'Add to wishlist'}</button>
          <button class="btn ${e.t?'primary':''}" data-a="trade">${e.t?'Marked for trade':'Mark for trade'}</button>
        </div>`}
        <p style="margin-top:16px;font-size:13px"><a href="https://data.mlpmerch.com/kayou-cards/details/${c.id}/" target="_blank" rel="noopener">View on MLP Merch</a> · <a href="https://www.pricecharting.com/search-products?q=${encodeURIComponent('my little pony '+c.c)}&type=prices" target="_blank" rel="noopener">Check prices</a></p>
      </div></div>`;
    d.querySelector('[data-x]').onclick = () => d.close();
    d.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      const e2 = entry(me(),c), a = b.dataset.a;
      if (a==='inc') setEntry(c,{q:e2.q+1}); if (a==='dec') setEntry(c,{q:e2.q-1});
      if (a==='wish') setEntry(c,{w:!e2.w}); if (a==='trade') setEntry(c,{t:!e2.t});
      draw();
    });
  };
  draw(); d.showModal();
  d.onclick = e => { if (e.target===d) d.close(); };
}

function openWelcome(){
  showMenu(`<h2>Welcome to Pony Binder</h2>
    <p>Track your My Little Pony TCG cards from Fantasy Wonderland, Discord!!! and Nightmare Night. What should we call your binder?</p>
    <form id="wf"><input type="text" id="wname" maxlength="24" placeholder="Your name" required autofocus>
    <div class="row"><button class="btn primary" type="submit">Start collecting</button>
    <label class="btn ghost" style="cursor:pointer">Restore a backup<input type="file" id="wfile" accept=".json,application/json" hidden></label></div></form>
    <p style="font-size:13px;margin-top:14px">Your collection is saved in this browser. Nothing is uploaded anywhere.</p>`, false);
  $('#wf').onsubmit = e => { e.preventDefault(); const n = $('#wname').value.trim(); if(!n) return; newProfile(n); menu.close(); renderAll(); };
  $('#wfile').onchange = e => importFile(e.target.files[0]);
}

function openProfiles(){
  const ids = Object.keys(db.profiles);
  showMenu(`<h2>Collectors on this device</h2><p>Switch binders, or add one for a family member or friend.</p>
    <div class="list">${ids.map(id => { const p = db.profiles[id], n = Object.values(p.cards).filter(e=>e.q>0).length;
      return `<button class="btn ${id===db.current?'cur':''}" data-id="${id}"><span style="display:flex;gap:10px;align-items:center"><span class="avatar" style="background:${p.color}">${esc(p.name[0]||'?').toUpperCase()}</span>${esc(p.name)}${p.friend?' <small style="color:var(--muted)">(friend)</small>':''}</span><small>${n} owned</small></button>`; }).join('')}</div>
    <form id="pf" class="row"><input type="text" id="pname" maxlength="24" placeholder="New collector name" style="flex:1"><button class="btn primary" type="submit">Add</button></form>
    <div class="row"><button class="btn" id="renameBtn">Rename current</button><button class="btn" id="delBtn">Delete current</button><button class="btn ghost" id="closeBtn">Close</button></div>`);
  menu.querySelectorAll('[data-id]').forEach(b => b.onclick = () => { db.current = b.dataset.id; save(); menu.close(); renderAll(); });
  $('#pf').onsubmit = e => { e.preventDefault(); const n = $('#pname').value.trim(); if(!n) return; newProfile(n); menu.close(); renderAll(); toast(`Created ${n}'s binder`); };
  $('#renameBtn').onclick = () => { const n = prompt('New name', me().name); if (n && n.trim()){ me().name = n.trim().slice(0,24); save(); menu.close(); renderAll(); } };
  $('#delBtn').onclick = () => {
    if (!confirm(`Delete ${me().name}'s binder from this device? This cannot be undone unless you have a backup.`)) return;
    delete db.profiles[db.current]; db.current = Object.keys(db.profiles)[0] || null; save(); menu.close();
    if (!me()) openWelcome(); renderAll();
  };
  $('#closeBtn').onclick = () => menu.close();
}

function shareURL(){ return location.origin + location.pathname + '#view=' + encode(me()); }
function openShare(){
  const url = shareURL();
  showMenu(`<h2>Share your binder</h2>
    <p>Send this link to friends. They'll see a view-only snapshot of your collection, including your wishlist and trade cards, and can compare it with their own. Send a new link after you update your cards.</p>
    <textarea readonly id="shareTxt">${esc(url)}</textarea>
    <div class="row"><button class="btn primary" id="copyBtn">Copy link</button>${navigator.share?'<button class="btn" id="natBtn">Share…</button>':''}<button class="btn ghost" id="closeBtn">Close</button></div>`);
  $('#copyBtn').onclick = async () => { try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch(e){ $('#shareTxt').select(); document.execCommand('copy'); toast('Link copied'); } };
  const nb = $('#natBtn'); if (nb) nb.onclick = () => navigator.share({ title: `${me().name}'s Pony Binder`, url }).catch(()=>{});
  $('#closeBtn').onclick = () => menu.close();
}

function openBackup(){
  showMenu(`<h2>Backup and restore</h2>
    <p>Browser storage can be cleared, so save a backup file now and then. You can also use a backup to move your binder to another device.</p>
    <div class="row"><button class="btn primary" id="expBtn">Download backup</button>
    <label class="btn" style="cursor:pointer">Restore from file<input type="file" id="impFile" accept=".json,application/json" hidden></label>
    <button class="btn" id="csvBtn">Export CSV</button><button class="btn ghost" id="closeBtn">Close</button></div>`);
  $('#expBtn').onclick = () => {
    const p = me(), data = { app:'pony-binder', version:1, exported:new Date().toISOString(), profile:{ name:p.name, color:p.color, cards:p.cards } };
    download(`pony-binder-${p.name.replace(/\W+/g,'-').toLowerCase()}.json`, JSON.stringify(data,null,1), 'application/json');
  };
  $('#csvBtn').onclick = () => {
    const p = me(), rows = [['Set','Number','Name','Rarity','Shining','Quantity','Wishlist','Trade']];
    SORTED.forEach(c => { const e = entry(p,c); rows.push([SETS.find(s=>s.code===c.s).name, (c.sh?'※':'')+c.c, c.n, RNAME[c.r], c.sh?'Yes':'', e.q, e.w?'Yes':'', e.t?'Yes':'']); });
    download(`pony-binder-${p.name.replace(/\W+/g,'-').toLowerCase()}.csv`, rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n'), 'text/csv');
  };
  $('#impFile').onchange = e => importFile(e.target.files[0]);
  $('#closeBtn').onclick = () => menu.close();
}

function importFile(f){
  if (!f) return;
  f.text().then(t => {
    const d = JSON.parse(t); if (!d.profile || !d.profile.cards) throw new Error('bad');
    const cards = {}; for (const [id,e] of Object.entries(d.profile.cards)) if (BY_ID[id]) cards[id] = { q:+e.q||0, w:!!e.w, t:!!e.t };
    const existing = Object.keys(db.profiles).find(id => db.profiles[id].name === d.profile.name);
    if (existing && !confirm(`Replace the existing "${d.profile.name}" binder with this backup?`)) return;
    const id = existing || uid();
    db.profiles[id] = { name:d.profile.name || 'Collector', color:d.profile.color || COLORS[0], cards, created:Date.now() };
    db.current = id; save(); menu.close(); renderAll(); toast(`Restored ${db.profiles[id].name}'s binder`);
  }).catch(() => alert('That file is not a Pony Binder backup.'));
}

function download(name, text, type){
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text],{type}));
  a.download = name; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
let tt; function toast(m){ const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(()=>t.classList.remove('show'), 2200); }

// ---------- boot ----------
parseHash();
if (db.current && !db.profiles[db.current]) db.current = Object.keys(db.profiles)[0] || null;
renderAll();
if (!me() && !st.view) openWelcome();
