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
Add the set to `sets` in `data/catalog.json`, then **append** its cards to the end of `cards`. Share links depend on card order, so existing entries must keep their positions.

## Credits
Original card list: [MLP Merch Kayou Card Database](https://data.mlpmerch.com/kayou-cards/series/trading-card-game/booster-pack/). Fan-made project, not affiliated with Hasbro or KAYOU.


## Development
The site uses native JavaScript modules. There is no bundler or runtime dependency. Serve the repository over HTTP, for example with `python3 -m http.server 8000`, then open `http://localhost:8000`. Opening `index.html` directly with a `file://` URL will not load the modules.

`app.js` fetches `data/catalog.json` and validates it before creating the store, state, filters, renderer and dialogs, attaches events, then starts the app. While loading, it displays a status message. A failed request or invalid catalog displays a retry button before any collection controls are attached. The catalog uses a module-relative URL so it also works under the GitHub Pages `/pony-binder/` path.

| File | Responsibility |
| --- | --- |
| `data/catalog.json` | Set metadata and card records, with no executable JavaScript |
| `js/catalog.js` | JSON loading, validation, catalog lookup, derived card numbers, display sorting and rarity metadata |
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

Catalog fields: `sets` contains `code`, `name`, and `series`. Each record in `cards` contains `id`, `s` (set code), `n` (name), `r` (rarity), `sh` (Shining boolean), `c` (printed number), and `img` (image URL). Runtime indexes and derived numbers stay in JavaScript. Keep existing IDs and array positions unchanged.

Card data from the MLP Merch Kayou Card Database (data.mlpmerch.com), CC BY-NC-SA.

## Official card images
All 572 card image URLs point directly to KAYOU's official image host, `static-sg.kayouofficial.com`. The catalog remains local JSON; browsers download card images directly from KAYOU.

Image sources: [Fantasy Wonderland](https://www.kayouofficial.com/en-US/series/series-2nicsllo), [Discord!!!](https://www.kayouofficial.com/en-US/series/series-ry03llcx), and [Nightmare Night](https://www.kayouofficial.com/en-US/series/series-27z4pa09).

Run `python3 scripts/update-kayou-images.py` to refresh image URLs from those pages. The updater matches printed card numbers and Shining status, including day/night and A/A2/B/B2/C/C2 variants. It preserves card IDs, names, all other metadata, and array order. It resolves every image before writing the catalog and stops on missing or duplicate matches. The updater requires network access and Python 3.9 or later, with no third-party packages. It depends on KAYOU's server-rendered page format.
