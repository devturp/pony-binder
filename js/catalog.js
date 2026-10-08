export const SETS = window.SETS, CARDS = window.CARDS;
export const RARITIES = [
  ['C','Common'],['U','Uncommon'],['SR','Silver Rare'],['SPR','Sapphire Rare'],
  ['ER','Emerald Rare'],['GR','Gold Rare'],['CR','Colorful Rare'],['RR','Ruby Rare']];
export const RNAME = Object.fromEntries(RARITIES);
export const RORD = Object.fromEntries(RARITIES.map(([k],i)=>[k,i]));
export const COLORS = ['#d94c95','#6c4bb6','#2f9e6f','#e07a2e','#2f7fd9','#b8418a','#8a6d1f','#c0392b'];
CARDS.forEach((c,i) => { c.i = i; c.num = parseInt(c.c.replace(/^.*?(\d+)$/,'$1'),10) || 0; });
export const SORTED = [...CARDS].sort((a,b) => a.s.localeCompare(b.s) || RORD[a.r]-RORD[b.r] || a.num-b.num || (a.sh-b.sh));
export const BY_ID = Object.fromEntries(CARDS.map(c => [c.id,c]));

