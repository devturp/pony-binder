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
    const c = CARDS[+b.closest('[data-i]').dataset.i];
    const act = b.dataset.act;
    if (act==='open') return openCard(c);
    if (st.view) return;
    const e = entry(me(),c);
    if (act==='inc') setEntry(c,{q:e.q+1});
    if (act==='dec') setEntry(c,{q:e.q-1});
    if (act==='wish') setEntry(c,{w:!e.w});
    if (act==='trade') setEntry(c,{t:!e.t});
  });
  $('#statsToggle').onclick = () => { st.statsExpanded = !st.statsExpanded; renderer.renderStats(); };
  $('#quickAdd').onclick = () => { st.quick = !st.quick; renderGrid(); };
  function saveQuantity(ev){
    const input = ev.target.closest('[data-quantity]');
    if (!input || st.view || !me()) return;
    const c = CARDS[Number(input.dataset.quantity)];
    if (!c) return;
    const value = input.value.trim();
    const q = Number(value);
    if (value === '' || !Number.isInteger(q) || q<0 || q>63){
      if (ev.type === 'change') input.value = entry(me(),c).q;
      return;
    }
    setEntry(c,{ q });
    if (ev.type === 'change') input.value = entry(me(),c).q;
  }
  $('#grid').addEventListener('input', saveQuantity);
  $('#grid').addEventListener('change', saveQuantity);
  let qt; $('#q').addEventListener('input', e => { clearTimeout(qt); qt = setTimeout(()=>{ st.q = e.target.value.trim(); renderGrid(); }, 120); });
  $('#rarity').onchange = e => { st.rarity = e.target.value; renderGrid(); };
  $('#status').onchange = e => { st.status = e.target.value; renderGrid(); };
  $('#shining').onchange = e => { st.shining = e.target.checked; renderGrid(); };
  window.addEventListener('hashchange', () => { parseHash(); renderAll(); });

}
