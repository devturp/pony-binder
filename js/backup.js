import { SETS, SORTED, RNAME, BY_ID } from './catalog.js';
import { entry } from './state.js';

export function backupData(p){
  return { app:'pony-binder', version:1, exported:new Date().toISOString(), profile:{ name:p.name, color:p.color, cards:p.cards } };
}

export function csvData(p){
  const rows = [['Set','Number','Name','Rarity','Shining','Quantity','Wishlist','Trade']];
  SORTED.forEach(c => { const e = entry(p,c); rows.push([SETS.find(s=>s.code===c.s).name, (c.sh?'※':'')+c.c, c.n, RNAME[c.r], c.sh?'Yes':'', e.q, e.w?'Yes':'', e.t?'Yes':'']); });
  return rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
}

export function readBackup(text){
  const d = JSON.parse(text); if (!d.profile || !d.profile.cards) throw new Error('bad');
  const cards = {}; for (const [id,e] of Object.entries(d.profile.cards)) if (BY_ID[id]) cards[id] = { q:+e.q||0, w:!!e.w, t:!!e.t };
  return { ...d.profile, cards };
}
