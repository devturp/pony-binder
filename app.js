import { createSharing, createSharedStore, shareRoute } from './js/sharing.js';
import { loadCatalog, BY_ID } from './js/catalog.js';
import { createStore } from './js/storage.js';
import { createState } from './js/state.js';
import { createFilters } from './js/filters.js';
import { createRenderer } from './js/rendering.js';
import { createDialogs } from './js/dialogs.js';
import { bindEvents } from './js/events.js';

export async function startApp({backend}={}){
  const status = document.querySelector('#catalogStatus');
  status.hidden = false;
  status.textContent = 'Loading cards…';
  document.querySelector('#binder').hidden = true;
  try {
    await loadCatalog();
  } catch (error) {
    console.error('Unable to load the card catalog', error);
    status.innerHTML = '<p>Unable to load cards. Check your connection and try again.</p><button class="btn" id="retryCatalog" type="button">Try again</button>';
    document.querySelector('#retryCatalog').onclick = ()=>startApp();
    return;
  }
  status.hidden = true;
  document.querySelector('#binder').hidden = false;
  const route=shareRoute(globalThis.location?.hash);
  if(route.shared)document.querySelector('meta[name="robots"]')?.setAttribute('content','noindex,nofollow');
  const store = route.shared?createSharedStore(route.token):createStore();
  const sharing=route.shared?null:createSharing(store);
  const state = createState(store);
  const filters = createFilters(state,store);
  let dialogs;
  async function login(){try{await store.login();}catch{alert('Google sign-in failed. Enable Google sign-in and authorize this site domain in Firebase.');}}
  async function logout(){try{await sharing?.flush();await store.logout();}catch(error){alert(error.message);}}
  const renderer=createRenderer(store,state,filters,{login,logout,openBackup:()=>dialogs.openBackup(),openShare:()=>dialogs.openShare()});
  dialogs=createDialogs(store,state,renderer.renderAll,store.setEntry,sharing);
  bindEvents(store,state,renderer,dialogs,store.setEntry);
  function showStatus(){
    const info=store.status(), box=document.querySelector('#cloudStatus');
    if(info.shared){
      box.textContent=info.error || (info.loading?'Loading shared collection…':'Read-only collection. Changes made by the owner appear after they save.');
      document.querySelector('#retryCloud').hidden=!info.error;
      document.querySelector('#retryCloud').textContent='Retry loading';
      document.querySelector('#binder').hidden=!store.me();
      const banner=document.querySelector('#sharedBanner');if(banner)banner.hidden=!store.me();
      return;
    }
    box.textContent=!info.authReady?'Connecting to sign-in…':!info.user?'Browse cards, or sign in with Google to track your collection.':info.error || (info.offline?'Offline. Reconnect to load or save your collection.':info.loading?'Loading your collection…':info.failed?'Some changes could not save. Retry before leaving this page.':info.pending?'Saving changes…':'All changes saved');
    const shared=sharing?.status();
    if(info.user && !info.pending && !info.error && shared?.token){
      if(shared.error)box.textContent=shared.error;
      else if(shared.pending)box.textContent='Collection saved. Updating shared view…';
    }
    document.querySelector('#retryCloud').hidden=!(info.error || info.failed);
  }
  store.subscribe(event=>{
    showStatus();
    if(event.type==='account'){
      document.querySelector('#cardDlg').close();document.querySelector('#menuDlg').close();
      renderer.renderAll();
    } else if(event.type==='cards'){
      for(const id of event.ids){const card=BY_ID[id];if(card)renderer.updateCard(card);}
      renderer.renderStats();
    }
  });
  sharing?.subscribe(showStatus);
  document.querySelector('#retryCloud').onclick=store.retry;
  renderer.renderAll();showStatus();
  window.addEventListener('beforeunload',event=>{if(store.status().pending || sharing?.status().pending){event.preventDefault();event.returnValue='';}});
  try {
    const cloud=backend || (await import('./js/firebase.js')).cloud;
    store.attach(cloud);sharing?.attach(cloud);store.start();
    window.addEventListener('hashchange',()=>{
      const next=shareRoute(globalThis.location?.hash);
      if(next.shared!==route.shared || next.token!==route.token)window.location.reload();
    });
  } catch {
    document.querySelector('#cloudStatus').textContent=route.shared?'Unable to load this shared collection. Reload to try again.':'Sign-in is unavailable. You can still browse cards. Reload to try again.';
  }
  return {store,sharing};
}

await startApp();

