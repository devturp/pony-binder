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

## Code organization
- `app.js`: UI rendering, filters, dialogs, and event handlers
- `modules/catalog.js`: catalog indexes and rarity definitions
- `modules/storage.js`: browser-local profiles and persistence
- `modules/share.js`: backward-compatible share-link codec

Serve the site over HTTP (for example, GitHub Pages or a local static server). ES modules do not reliably load from `file://` URLs.
