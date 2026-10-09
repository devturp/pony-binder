import { SETS, CARDS, SORTED, RARITIES, RNAME, COLORS } from './catalog.js';
import { $, esc, toast } from './ui.js';
import { entry } from './state.js';

export function createRenderer(store, state, filters, actions){
  const { db, me, uid, save } = store;
  const { st, active, parseHash } = state;
  const { inScope, matches } = filters;
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
    $('#whoBtn').onclick = actions.openProfiles; $('#shareBtn').onclick = actions.openShare; $('#backupBtn').onclick = actions.openBackup;
  }

  function renderBanner(){
    const b = $('#viewBanner');
    if (!st.view){ b.hidden = true; document.body.classList.remove('readonly'); return; }
    b.hidden = false; document.body.classList.add('readonly');
    b.innerHTML = `Viewing ${esc(st.view.name)}'s collection (view only)
    ${me() ? '<button class="btn" id="saveFriend">Save as a profile</button>' : ''}
    <button class="btn" id="exitView">${me() ? 'Back to my binder' : 'Start my own binder'}</button>`;
    $('#exitView').onclick = () => { history.replaceState(null,'',location.pathname); parseHash(); renderAll(); if (!me()) actions.openWelcome(); };
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

  function quickHTML(c){
    const e = entry(active(),c);
    return `<article class="quick-row ${e.q?'owned':''}" data-i="${c.i}">
      <button class="quick-card" data-act="open" aria-label="View ${esc(c.n)} ${esc(c.c)}${c.sh?' Shining':''}">
        <span class="card-code">${c.sh?'※':''}${esc(c.c)} · ${c.r}</span>
        <span class="card-name">${esc(c.n)}</span>
        <span class="quick-variant">${c.sh?'Shining ※':'Regular'}</span>
      </button>
      ${st.view ? `<span class="quick-total" aria-label="Quantity">×${e.q}</span>` : `<label class="quick-quantity">Qty<input type="number" min="0" max="63" step="1" inputmode="numeric" data-quantity="${c.i}" value="${e.q}" aria-label="Quantity for ${esc(c.n)} ${esc(c.c)}${c.sh?' Shining':''}"></label>`}
    </article>`;
  }

  function renderGrid(){
    const p = active(), g = $('#grid');
    g.classList.toggle('quick-list', st.quick);
    $('#quickAdd').setAttribute('aria-pressed', String(st.quick));
    $('#quickAdd').textContent = st.quick ? 'Card grid' : 'Quick Add';
    $('#quickHelp').hidden = !st.quick;
    $('#quickHelp').textContent = st.view ? 'Viewing shared quantities. This collection is read only.' : 'Enter quantities to save immediately. Use Tab to move through the checklist. Allowed quantities: 0–63.';
    if (!p){ g.innerHTML=''; $('#count').textContent=''; return; }
    const list = SORTED.filter(matches);
    $('#count').textContent = `Showing ${list.length} card${list.length===1?'':'s'}`;
    g.innerHTML = list.length ? list.map(st.quick ? quickHTML : cardHTML).join('') :
      `<div class="empty"><b>No cards match</b>Try a different set, rarity or status filter.</div>`;
  }

  function updateCard(c){
    if (st.quick){
      const row = document.querySelector(`.quick-row[data-i="${c.i}"]`);
      if (!row) return;
      const e = entry(active(),c);
      row.classList.toggle('owned', e.q>0);
      const input = row.querySelector('[data-quantity]');
      // Keep the focused input and caret intact while saving valid keystrokes.
      if (input && document.activeElement !== input) input.value = e.q;
      return;
    }

    const el = document.querySelector(`.card[data-i="${c.i}"]`); if (!el) return;
    // Keep the tile visible until the next filter change to avoid jumpiness.
    el.outerHTML = cardHTML(c);
  }

  function renderAll(){ renderProfile(); renderBanner(); renderFilters(); renderTabs(); renderStats(); renderGrid(); }

  return { renderAll, renderTabs, renderStats, renderGrid, updateCard };
}
