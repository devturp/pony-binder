import { decode } from './sharing.js';

export const entry = (p,c) => p.cards[c.id] || { q:0, w:false, t:false };
export function createState(store){
  const { me, save } = store;
  const st = { set:'BP02', q:'', rarity:'all', status:'all', shining:false, view:null };
  function parseHash(){
    const h = location.hash.slice(1);
    st.view = h.startsWith('view=') ? decode(h.slice(5)) : null;
  }
  const active = () => st.view || me();

  function setEntry(c, patch){
    const p = me(); const e = { ...entry(p,c), ...patch };
    e.q = Math.max(0, Math.min(63, e.q|0));
    if (!e.q && !e.w && !e.t) delete p.cards[c.id]; else p.cards[c.id] = e;
    save();
  }

  return { st, parseHash, active, setEntry };
}
