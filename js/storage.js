import { COLORS } from './catalog.js';

const KEY = 'ponybinder.v1';

export function createStore(){
  function load(){
    try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.profiles) return d; } catch(e){}
    return { profiles:{}, current:null };
  }
  const db = load();
  const save = () => localStorage.setItem(KEY, JSON.stringify(db));
  const me = () => db.profiles[db.current];
  const uid = () => Math.random().toString(36).slice(2,9);
  function newProfile(name){
    const id = uid(), n = Object.keys(db.profiles).length;
    db.profiles[id] = { name, color: COLORS[n % COLORS.length], cards:{}, created: Date.now() };
    db.current = id; save(); return id;
  }

  return { db, save, me, uid, newProfile };
}
