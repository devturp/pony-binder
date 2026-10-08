import { entry } from './state.js';

export function createFilters(state, store){
  const { st, active } = state;
  const { me } = store;
  function inScope(c){ return st.set==='all' || c.s===st.set; }

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

  return { inScope, matches };
}
