# Pony Binder

A simple collection tracker for the English **My Little Pony Trading Card Game** by KAYOU. It covers Fantasy Wonderland (BP01), Discord!!! (BP02), and Nightmare Night (BP03): 572 cards in all, Shining (※) parallels included.

**Live site:** https://devturp.github.io/pony-binder/

## Features
- Track how many copies you own, plus wishlist and trade flags for every card
- Completion progress by set and by rarity (C, U, SR, SPR, ER, GR, CR, RR)
- Search, rarity, status and Shining filters
- Multiple collectors on one device
- Share links: friends can view a read-only snapshot of your binder and see what they have that you need
- JSON backup/restore and CSV export

All data lives in your browser's localStorage. Nothing gets uploaded.

## Adding a new set
Add the set to `SETS` in `cards.js`, then **append** its cards to the end of `CARDS`. Share links depend on card order, so existing entries must keep their positions.

## Credits
Card list and images: [MLP Merch Kayou Card Database](https://data.mlpmerch.com/kayou-cards/series/trading-card-game/booster-pack/). Fan-made project, not affiliated with Hasbro or KAYOU.


## Development
The site uses native JavaScript modules. There is no bundler or runtime dependency. Serve the repository over HTTP, for example with `python3 -m http.server 8000`, then open `http://localhost:8000`. Opening `index.html` directly with a `file://` URL will not load the modules.

`cards.js` still loads first as the catalog script. `app.js` creates the store, state, filters, renderer and dialogs, attaches events, then starts the app.

| File | Responsibility |
| --- | --- |
| `js/catalog.js` | Catalog lookup, derived card numbers, display sorting and rarity metadata |
| `js/storage.js` | Load/save the existing `ponybinder.v1` database and create collectors |
| `js/state.js` | Active binder, view hash, card entries and quantity updates |
| `js/sharing.js` | Existing v2 share-link encoding and decoding |
| `js/filters.js` | Set, search, rarity, status, Shining and comparison matching |
| `js/rendering.js` | Profile header, shared-view banner, tabs, filters, stats and grid |
| `js/dialogs.js` | Card details, welcome, profiles, sharing and backup dialogs |
| `js/backup.js` | Version 1 backup serialization/reading and CSV formatting |
| `js/events.js` | Grid actions, filter inputs and hash changes |
| `js/ui.js` | DOM lookup, HTML escaping, downloads and toasts |

Renderer dialog callbacks and dialog render callbacks are wired in `app.js`. The modules do not import one another in a cycle. Updating a card persists it through state, then refreshes its tile and stats through the renderer.

Run `npm test` with Node.js 22 or later. No dependency installation is needed. Tests cover storage compatibility, card updates, share links, filters, comparisons, backups, CSV output, module startup and dialog/event wiring. The wiring tests use a minimal DOM stub and do not test browser layout or native browser APIs. Share-link and CSV fixtures were captured from the original app before extraction.
