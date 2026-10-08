import { createStore } from './js/storage.js';
import { createState } from './js/state.js';
import { createFilters } from './js/filters.js';
import { createRenderer } from './js/rendering.js';
import { createDialogs } from './js/dialogs.js';
import { bindEvents } from './js/events.js';

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
