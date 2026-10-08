import { loadCatalog } from './js/catalog.js';
import { createStore } from './js/storage.js';
import { createState } from './js/state.js';
import { createFilters } from './js/filters.js';
import { createRenderer } from './js/rendering.js';
import { createDialogs } from './js/dialogs.js';
import { bindEvents } from './js/events.js';

export async function startApp(){
  const status = document.querySelector('#catalogStatus');
  status.hidden = false;
  status.textContent = 'Loading cards…';
  document.querySelector('#binder').hidden = true;
  try {
    await loadCatalog();
  } catch (error) {
    console.error('Unable to load the card catalog', error);
    status.innerHTML = '<p>Unable to load cards. Check your connection and try again.</p><button class="btn" id="retryCatalog" type="button">Try again</button>';
    document.querySelector('#retryCatalog').onclick = startApp;
    return;
  }
  status.hidden = true;
  document.querySelector('#binder').hidden = false;
  const store = createStore();
  const state = createState(store);
  const filters = createFilters(state, store);
  
  // Defer dialog calls until both the renderer and dialogs are initialized.
  const renderer = createRenderer(store, state, filters, {
    openProfiles: () => dialogs.openProfiles(),
    openShare: () => dialogs.openShare(),
    openBackup: () => dialogs.openBackup(),
    openWelcome: () => dialogs.openWelcome()
  });
  const setEntry = (card, patch) => {
    state.setEntry(card, patch);
    renderer.updateCard(card);
    renderer.renderStats();
  };
  const dialogs = createDialogs(store, state, renderer.renderAll, setEntry);
  bindEvents(store, state, renderer, dialogs, setEntry);
  
  state.parseHash();
  if (store.db.current && !store.db.profiles[store.db.current]) {
    store.db.current = Object.keys(store.db.profiles)[0] || null;
  }
  renderer.renderAll();
  if (!store.me() && !state.st.view) dialogs.openWelcome();
}

await startApp();
