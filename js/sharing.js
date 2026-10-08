import { CARDS } from './catalog.js';

// one byte per card index: bits 0-5 quantity (max 63), bit 6 wishlist, bit 7 trade
export function encode(p){
  // sparse: for each card with data, varint(index gap) then one value byte
  const out = []; let prev = -1;
  CARDS.forEach((c,i) => { const e = p.cards[c.id]; if(!e) return;
    const b = Math.min(e.q||0,63) | (e.w?64:0) | (e.t?128:0); if(!b) return;
    let gap = i - prev - 1; prev = i;
    do { let x = gap & 127; gap >>= 7; if (gap) x |= 128; out.push(x); } while (gap);
    out.push(b); });
  let bin = ''; out.forEach(b => bin += String.fromCharCode(b));
  const b64 = btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return 'v2.' + encodeURIComponent(p.name) + '.' + b64;
}
export function decode(str){
  const m = /^v2\.([^.]*)\.([A-Za-z0-9_-]*)$/.exec(str); if(!m) return null;
  try {
    let b64 = m[2].replace(/-/g,'+').replace(/_/g,'/'); while(b64.length%4) b64+='=';
    const bin = atob(b64), cards = {}; let pos = 0, idx = -1;
    while (pos < bin.length){
      let gap = 0, shift = 0, x;
      do { x = bin.charCodeAt(pos++); gap |= (x & 127) << shift; shift += 7; } while (x & 128 && pos < bin.length);
      idx += gap + 1; const b = bin.charCodeAt(pos++);
      if (idx < CARDS.length && b) cards[CARDS[idx].id] = { q:b&63, w:!!(b&64), t:!!(b&128) };
    }
    return { name: decodeURIComponent(m[1]) || 'Friend', color:'#6c4bb6', cards };
  } catch(e){ return null; }
}

