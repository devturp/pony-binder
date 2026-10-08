import { CARDS } from './catalog.js';
import { $ } from './ui.js';
import { entry } from './state.js';

export function bindEvents(store, state, renderer, dialogs, setEntry){
  const { me } = store;
  const { st, parseHash } = state;
  const { renderAll, renderGrid } = renderer;
  const { openCard } = dialogs;
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

}
