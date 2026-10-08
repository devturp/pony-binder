// Browser-local collection profiles. Storage format remains ponybinder.v1.
const KEY = 'ponybinder.v1';
const COLORS = ['#d94c95','#6c4bb6','#2f9e6f','#e07a2e','#2f7fd9','#b8418a','#8a6d1f','#c0392b'];
// ---------- storage ----------
function load(){
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.profiles) return d; } catch(e){}
  return { profiles:{}, current:null };
}
export let db = load();
export const save = () => localStorage.setItem(KEY, JSON.stringify(db));
export const me = () => db.profiles[db.current];
export const uid = () => Math.random().toString(36).slice(2,9);
export function newProfile(name){
  const id = uid(), n = Object.keys(db.profiles).length;
  db.profiles[id] = { name, color: COLORS[n % COLORS.length], cards:{}, created: Date.now() };
  db.current = id; save(); return id;
}


export { COLORS };
