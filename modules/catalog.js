// Shared card catalog indexes and sort order.
export const SETS = window.SETS;
export const CARDS = window.CARDS;
export const RARITIES = [['C','Common'],['U','Uncommon'],['SR','Silver Rare'],['SPR','Sapphire Rare'],['ER','Emerald Rare'],['GR','Gold Rare'],['CR','Colorful Rare'],['RR','Ruby Rare']];
export const RNAME = Object.fromEntries(RARITIES);
const RORD = Object.fromEntries(RARITIES.map(([k],i)=>[k,i]));
CARDS.forEach((c,i) => { c.i = i; c.num = parseInt(c.c.replace(/^.*?(\d+)$/,'$1'),10) || 0; });
export const SORTED = [...CARDS].sort((a,b) => a.s.localeCompare(b.s) || RORD[a.r]-RORD[b.r] || a.num-b.num || (a.sh-b.sh));
export const BY_ID = Object.fromEntries(CARDS.map(c => [c.id,c]));
