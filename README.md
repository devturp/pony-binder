# Pony Binder

A collection tracker for the English My Little Pony Trading Card Game by KAYOU. Fantasy Wonderland (BP01), Discord!!! (BP02), and Nightmare Night (BP03), including all 572 regular and Shining cards.

## Accounts and saving

Visitors can browse, search, filter and open card details without an account. Google sign-in enables one private binder per account, with quantities, wishlist and trade flags saved to Cloud Firestore and synchronized across devices. Guests cannot track cards. The application no longer reads or writes the old `ponybinder.v1` localStorage collection, and no automatic migration runs.

Authentication may persist using Firebase's own browser session storage. Firestore uses its default memory cache; the app does not configure a persistent collection cache. Signed-out users have no collection access. Sharing controls and `#view` collection links are disabled for everyone. Read-only collection sharing is on the backlog.

The status message distinguishes connection/loading, saving, saved, offline and failed changes. Retry resubmits failed changes. Explicit sign-out is blocked while writes are pending or failed. A navigation warning asks users to stay while writes are pending; browsers may not show this warning in every situation. Unsaved changes are held in memory and can be lost if the page closes, so do not leave until the page says all changes are saved.

## Firebase setup, required before deploying

Web configuration is injected at deployment from the repository Actions secret `FIREBASE_WEB_CONFIG`. Never commit real configuration, service-account credentials or private keys. Only browser configuration fields are accepted by the build.

### Deployment and key rotation

1. In Google Cloud → APIs & Services → Credentials for `pony-binder`, create a replacement browser API key. Restrict it to the required Firebase APIs, excluding unrelated services such as Generative Language API. Add website restrictions for `https://ponybinder.app/*` and only other origins actually used by the app. Keep Firebase Authentication's authorized domains configured separately.
2. In this repository → Settings → Secrets and variables → Actions → New repository secret, name it `FIREBASE_WEB_CONFIG`. Set its value to the Firebase web configuration as a plain JSON object, using the replacement key. Include `apiKey`, `authDomain`, `projectId`, `appId` and optionally `storageBucket`, `messagingSenderId`, `measurementId`. Do not include JavaScript declarations or service-account fields.
3. Before merging the deployment change, set Settings → Pages → Source to **GitHub Actions**. The workflow builds only runtime assets into `dist`, generates `js/firebase-config.js` there, and deploys to the existing custom domain. Missing or invalid configuration stops deployment.
4. Merge, then verify Google sign-in and collection reads/writes at `ponybinder.app`. Delete the old exposed key in Google Cloud Credentials after the replacement works. If immediate revocation is required, delete it first; sign-in may be unavailable until the replacement deploys.
5. Only after revocation, close the GitHub secret-scanning alert as **Revoked**. Source removal alone does not resolve exposure: commit history still contains the old key. Revocation renders that historical key unusable; this change does not rewrite history.

The replacement browser key remains visible in the deployed site. GitHub Actions secrets keep it out of source commits; they do not make browser configuration confidential. API restrictions and Firestore rules enforce the relevant protections. See [Firebase API key guidance](https://firebase.google.com/docs/projects/api-keys) and [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

### Authentication and database setup

1. In Firebase Authentication, enable Google and select a support email.
2. In Authentication settings, authorize `devturp.github.io` and any custom hostname used for this app. Add `localhost` only if testing locally. Enter hostnames, without URL paths.
3. Create the default Cloud Firestore database using Standard edition in production mode. The app uses the `(default)` database. Keep the Spark plan; no Functions or Cloud Storage are used.
4. Open Firestore → Rules, replace the existing rules with `firestore.rules`, and Publish. These rules allow only the matching authenticated Google account to read/write `/users/{uid}/cards/{cardId}`. They reject extra fields, non-integer quantities, quantities outside 0–63, and non-boolean flags. No other database paths are granted access.
5. Alternatively, from your authenticated local Firebase CLI, run `firebase deploy --only firestore:rules --project pony-binder`. `firebase.json` points to the supplied rules file and does not change hosting.

Use the Firebase Rules Playground to verify that unauthenticated users and a different UID cannot read or write another account's card. Test an owner read/write, then verify that invalid quantity/flag writes are denied. In the deployed app, check Google sign-in, a new empty collection, quantity/wishlist/trade edits, sign-out, reload and a second device signed into the same account. These live checks require project access and are not included in Node unit tests.

## Data and synchronization

Each card is a separate document under `/users/{uid}/cards/{stableCardId}`, containing `q`, `w`, and `t`. The authenticated user's Google display name labels their binder. No account email or name is saved in collection documents.

A Firestore listener reads the signed-in account's card documents. Transactions create a complete card record if missing; otherwise they update only the changed fields. Edits to different cards and different fields cannot overwrite the entire binder. Simultaneous edits to the same field use the last committed value. Per-card queues preserve rapid edit order within a tab; at most six saves run concurrently. Pending edits are applied over incoming snapshots until acknowledged. Failed operations remain visible and retryable. Account changes detach the previous listener and ignore stale callbacks.

Zero-quantity records remain when needed, rather than deleting documents and risking concurrent flag changes. Each initial listener connection reads the saved card documents, and changes cause further reads/writes, so monitor free-tier usage in Firebase.

Backup download, CSV export and explicit restore remain available while signed in. Restore applies the file's card quantities/flags to the current account and resets cards absent from the backup. It does not import the old localStorage collection automatically, create additional collectors, or rename the Google account. Restore runs as individual queued card writes, not one atomic operation; failures may leave a partial restore until retried. Confirm replacements before starting and wait for all changes to save.

## UI

Quick Add switches between the card grid and a checklist. Valid whole quantities from 0–63 save immediately. Invalid edits leave saved values intact and revert on change. Rows remain visible until filters change, and focused Quick Add inputs stay intact during synchronization. Guests can use the checklist as a read-only card list.

On phones, completion stats collapse into a compact summary; Show stats expands the dashboard. Search and filters use a mobile layout, and quantity controls have 44px touch targets. Desktop shows the full dashboard.

## Development

Native JavaScript modules, no bundler. Deployment uses `node scripts/build-site.mjs` with the `FIREBASE_WEB_CONFIG` environment variable. Firebase SDK browser modules are pinned to version 13.0.0. For local development, copy `js/firebase-config.example.js` to the ignored `js/firebase-config.js` and fill in your restricted browser configuration, then serve over HTTP, for example `python3 -m http.server 8000`. Alternatively build and serve `dist`. Run `npm test` with Node.js 22 or later. Tests use an injected cloud adapter and a minimal DOM stub; they do not exercise real Google OAuth, production Firestore, browser layout, or Firebase security-rule enforcement.

`js/firebase.js` implements Firebase operations; `js/storage.js` manages cloud state and queues; `js/state.js` holds view state; filters/rendering/events/dialogs handle the UI. `app.js` wires these together. The catalog loads before cloud initialization, so SDK initialization failure does not prevent public card browsing.

## Catalog and images

`data/catalog.json` contains `sets` and `cards`. Sets use `code`, `name`, `series`. Card fields: `id` (stable ID), `s` (set), `n` (name), `r` (rarity), `sh` (Shining boolean), `c` (printed number), `img` (image URL). Keep existing IDs unchanged. Runtime indexes and sorting remain in `js/catalog.js`.

Images load directly from KAYOU's official CDN. Run `python3 scripts/update-kayou-images.py` to refresh image URLs from the official Fantasy Wonderland, Discord!!! and Nightmare Night pages. The updater preserves all other fields and requires Python 3.9 or later plus network access.

Original card list: [MLP Merch Kayou Card Database](https://data.mlpmerch.com/kayou-cards/series/trading-card-game/booster-pack/), CC BY-NC-SA. Card images: KAYOU. Fan-made tool, not affiliated with Hasbro or KAYOU.

## Backlog

- Read-only collection links and trading comparisons after login/saving are stable.
- Additional collectors under one account if needed.
