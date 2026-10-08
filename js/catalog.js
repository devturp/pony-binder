export let SETS = [], CARDS = [], SORTED = [], BY_ID = {};
export const RARITIES = [
  ['C','Common'],['U','Uncommon'],['SR','Silver Rare'],['SPR','Sapphire Rare'],
  ['ER','Emerald Rare'],['GR','Gold Rare'],['CR','Colorful Rare'],['RR','Ruby Rare']];
export const RNAME = Object.fromEntries(RARITIES);
export const RORD = Object.fromEntries(RARITIES.map(([k],i)=>[k,i]));
export const COLORS = ['#d94c95','#6c4bb6','#2f9e6f','#e07a2e','#2f7fd9','#b8418a','#8a6d1f','#c0392b'];
// Validate the entire response before replacing the active catalog.
export async function loadCatalog(fetcher = globalThis.fetch){
  const response = await fetcher(new URL('../data/catalog.json', import.meta.url));
  if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);
  const data = await response.json();
  if (!Array.isArray(data?.sets) || !data.sets.length || !Array.isArray(data.cards) || !data.cards.length) {
    throw new Error('Invalid catalog: sets and cards are required');
  }
  const codes = new Set(), ids = new Set();
  for (const set of data.sets){
    if (!set || typeof set.code !== 'string' || !set.code || codes.has(set.code) || typeof set.name !== 'string' || !Number.isInteger(set.series)) {
      throw new Error('Invalid catalog set');
    }
    codes.add(set.code);
  }
  for (const card of data.cards){
    if (!card || !['id','s','n','r','c','img'].every(key => typeof card[key] === 'string' && card[key].length) ||
        ids.has(card.id) || !codes.has(card.s) || !Object.hasOwn(RNAME, card.r) || typeof card.sh !== 'boolean') {
      throw new Error('Invalid catalog card');
    }
    ids.add(card.id);
  }
  SETS = data.sets;
  CARDS = data.cards.map((c,i) => ({ ...c, i, num:parseInt(c.c.replace(/^.*?(\d+)$/,'$1'),10) || 0 }));
  SORTED = [...CARDS].sort((a,b) => a.s.localeCompare(b.s) || RORD[a.r]-RORD[b.r] || a.num-b.num || (a.sh-b.sh));
  BY_ID = Object.fromEntries(CARDS.map(c => [c.id,c]));
}
