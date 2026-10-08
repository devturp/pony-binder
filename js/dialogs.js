import { SETS, RNAME, COLORS } from './catalog.js';
import { $, esc, toast, download } from './ui.js';
import { entry } from './state.js';
import { encode } from './sharing.js';
import { backupData, csvData, readBackup } from './backup.js';

export function createDialogs(store, state, renderAll, setEntry){
  const { db, me, uid, save, newProfile } = store;
  const { st, active } = state;
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
      const p = me(), data = backupData(p);
      download(`pony-binder-${p.name.replace(/\W+/g,'-').toLowerCase()}.json`, JSON.stringify(data,null,1), 'application/json');
    };
    $('#csvBtn').onclick = () => {
      const p = me();
      download(`pony-binder-${p.name.replace(/\W+/g,'-').toLowerCase()}.csv`, csvData(p), 'text/csv');
    };
    $('#impFile').onchange = e => importFile(e.target.files[0]);
    $('#closeBtn').onclick = () => menu.close();
  }

  function importFile(f){
    if (!f) return;
    f.text().then(t => {
      const profile = readBackup(t), cards = profile.cards;
      const existing = Object.keys(db.profiles).find(id => db.profiles[id].name === profile.name);
      if (existing && !confirm(`Replace the existing "${profile.name}" binder with this backup?`)) return;
      const id = existing || uid();
      db.profiles[id] = { name:profile.name || 'Collector', color:profile.color || COLORS[0], cards, created:Date.now() };
      db.current = id; save(); menu.close(); renderAll(); toast(`Restored ${db.profiles[id].name}'s binder`);
    }).catch(() => alert('That file is not a Pony Binder backup.'));
  }

  return { openCard, openWelcome, openProfiles, openShare, openBackup };
}
