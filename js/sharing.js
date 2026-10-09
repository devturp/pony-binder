import { LEGACY_SHARE_IDS } from './legacy-share-ids.js';
import { CARDS } from './catalog.js';

// v3 stores stable UTF-8 IDs, prefix-compressed against the previous ID.
// The value byte keeps v2's quantity, wishlist and trade bits.
export function encode(p){
  const out = [], utf8 = new TextEncoder(); let previous = new Uint8Array();
  const known = new Set(CARDS.map(c=>c.id));
  for (const id of Object.keys(p.cards).filter(id=>known.has(id)).sort()){
    const e = p.cards[id];
    const q = Math.max(0, Math.min(63, Math.trunc(Number(e.q)||0)));
    const value = q | (e.w?64:0) | (e.t?128:0); if (!value) continue;
    const bytes = utf8.encode(id); let prefix = 0;
    while (prefix<previous.length && prefix<bytes.length && prefix<255 && previous[prefix]===bytes[prefix]) prefix++;
    const suffix = bytes.slice(prefix);
    if (suffix.length>255) throw new Error('Card ID is too long to share');
    out.push(prefix, suffix.length, ...suffix, value); previous = bytes;
  }
  const binary = out.map(b=>String.fromCharCode(b)).join('');
  const payload = btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return 'v3.' + encodeURIComponent(p.name).replace(/\./g,'%2E') + '.' + payload;
}

function decodeV3(bin){
  const cards = {}, seen = new Set(), known = new Set(CARDS.map(c=>c.id));
  const utf8 = new TextDecoder('utf-8', { fatal:true });
  let pos = 0, previous = new Uint8Array();
  while (pos<bin.length){
    if (pos+2>bin.length) throw new Error('Truncated ID header');
    const prefix = bin.charCodeAt(pos++), length = bin.charCodeAt(pos++);
    if (prefix>previous.length || pos+length>=bin.length) throw new Error('Invalid ID length');
    const bytes = new Uint8Array(prefix+length); bytes.set(previous.slice(0,prefix));
    for (let i=0;i<length;i++) bytes[prefix+i] = bin.charCodeAt(pos++);
    const id = utf8.decode(bytes), value = bin.charCodeAt(pos++);
    if (!id || seen.has(id) || !value) throw new Error('Invalid card record');
    seen.add(id); previous = bytes;
    if (known.has(id)) cards[id] = { q:value&63, w:!!(value&64), t:!!(value&128) };
  }
  return cards;
}

export function decode(str){
  const m = /^(v2|v3)\.([^.]*)\.([A-Za-z0-9_-]*)$/.exec(str); if(!m) return null;
  try {
    let b64 = m[3].replace(/-/g,'+').replace(/_/g,'/'); while(b64.length%4) b64+='=';
    const bin = atob(b64);
    if (m[1]==='v3') return { name:decodeURIComponent(m[2]) || 'Friend', color:'#6c4bb6', cards:decodeV3(bin) };
    const cards = {}; let pos = 0, idx = -1;
    while (pos < bin.length){
      let gap = 0, shift = 0, x;
      do {
        if (pos>=bin.length || shift>28) throw new Error('Invalid legacy gap');
        x = bin.charCodeAt(pos++); gap += (x & 127) * 2**shift; shift += 7;
      } while (x & 128);
      if (pos>=bin.length) throw new Error('Missing legacy value');
      idx += gap + 1; const b = bin.charCodeAt(pos++);
      if (idx < LEGACY_SHARE_IDS.length && b) cards[LEGACY_SHARE_IDS[idx]] = { q:b&63, w:!!(b&64), t:!!(b&128) };
    }
    return { name: decodeURIComponent(m[2]) || 'Friend', color:'#6c4bb6', cards };
  } catch(e){ return null; }
}

