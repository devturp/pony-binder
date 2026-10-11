import { SETS, RNAME, BY_ID } from './catalog.js';
import { $, esc, toast, download } from './ui.js';
import { entry } from './state.js';
import { backupData, csvData, readBackup } from './backup.js';

export function createDialogs(store, state, renderAll, setEntry){
  const { me } = store;
  const { active } = state;
  const menu = $('#menuDlg');
  function showMenu(html, closable=true){
    menu.innerHTML = `<div class="dlg-in">${html}</div>`;
    menu.oncancel = closable ? null : (e => e.preventDefault());
    if (!menu.open) menu.showModal();
  }
  menu.addEventListener('click', e => { if (e.target===menu && !menu.oncancel) menu.close(); });

  function openCard(c){
    const d = $('#cardDlg'), ro = !store.editable();
    const draw = () => {
      const e = entry(active(),c);
      const mine = null;
      d.innerHTML = `<div class="cd">
      <button class="btn dlg-x" data-x aria-label="Close">✕</button>
      <img src="${c.img.replace('/s400/','/s800/')}" alt="${esc(c.n)} card" style="background:url('${c.img}') center/cover">
      <div>
        <h2 style="font:700 26px var(--font-d);margin:0">${esc(c.n)}</h2>
        <dl><dt>Number</dt><dd>${c.sh?'※':''}${esc(c.c)}</dd>
          <dt>Set</dt><dd>${esc(SETS.find(s=>s.code===c.s).name)}</dd>
          <dt>Rarity</dt><dd>${RNAME[c.r]}${c.sh?' · Shining':''}</dd>
          ${mine?`<dt>You own</dt><dd>${mine.q}</dd>`:''}</dl>
        ${ro ? `<p>Sign in with Google to track this card.</p>` : `
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

  function openBackup(){
    if(!store.editable()) return;
    showMenu(`<h2>Backup and restore</h2>
    <p>Your collection syncs to your Google account. Download a backup or CSV for your own records. Restoring replaces your current cloud collection.</p>
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

  async function importFile(f){
    if(!f || !store.editable()) return;
    if(store.status().pending){alert('Wait for current changes to save before restoring.');return;}
    const owner=store.status().user.uid;
    let restored;
    try { restored=readBackup(await f.text()); }
    catch { alert('That file is not a Pony Binder backup.');return; }
    if(!store.editable() || store.status().user.uid!==owner) return;
    if(!confirm('Replace your cloud collection with this backup? This updates all your devices.')) return;
    const ids=new Set([...Object.keys(me().cards),...Object.keys(restored.cards)]);
    for(const id of ids){
      const card=BY_ID[id];if(card)setEntry(card,{q:0,w:false,t:false,...restored.cards[id]});
    }
    menu.close();renderAll();toast('Restore queued. Check the save status before leaving.');
  }
  return {openCard,openBackup};
}
