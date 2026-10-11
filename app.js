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
  const store = createStore();
  const state = createState(store);
  const filters = createFilters(state,store);
  let dialogs;
  async function login(){try{await store.login();}catch{alert('Google sign-in failed. Enable Google sign-in and authorize this site domain in Firebase.');}}
  async function logout(){try{await store.logout();}catch(error){alert(error.message);}}
  const renderer=createRenderer(store,state,filters,{login,logout,openBackup:()=>dialogs.openBackup()});
  dialogs=createDialogs(store,state,renderer.renderAll,store.setEntry);
  bindEvents(store,state,renderer,dialogs,store.setEntry);
  function showStatus(){
    const info=store.status(), box=document.querySelector('#cloudStatus');
    box.textContent=!info.authReady?'Connecting to sign-in…':!info.user?'Browse cards, or sign in with Google to track your collection.':info.error || (info.offline?'Offline. Reconnect to load or save your collection.':info.loading?'Loading your collection…':info.failed?'Some changes could not save. Retry before leaving this page.':info.pending?'Saving changes…':'All changes saved');
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
  document.querySelector('#retryCloud').onclick=store.retry;
  renderer.renderAll();showStatus();
  window.addEventListener('beforeunload',event=>{if(store.status().pending){event.preventDefault();event.returnValue='';}});
  try {
    const cloud=backend || (await import('./js/firebase.js')).cloud;
    store.attach(cloud);store.start();
  } catch {
    document.querySelector('#cloudStatus').textContent='Sign-in is unavailable. You can still browse cards. Reload to try again.';
  }
}

await startApp();
