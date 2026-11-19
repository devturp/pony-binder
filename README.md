# Pony Binder

A collection tracker for the English My Little Pony Trading Card Game by KAYOU. Fantasy Wonderland (BP01), Discord!!! (BP02), Nightmare Night (BP03), and Hearth's Warming Eve (BP04), including all 769 regular, Shining, and Token cards.

## Accounts and saving

Visitors can browse, search, filter and open card details without an account. Google sign-in enables one private binder per account, with quantities, wishlist and trade flags saved to Cloud Firestore and synchronized across devices. Guests cannot track cards. The application no longer reads or writes the old `ponybinder.v1` localStorage collection, and no automatic migration runs.

Authentication may persist using Firebase's own browser session storage. Firestore uses its default memory cache; the app does not configure a persistent collection cache. Signed-out users can view a shared collection only through its active random link. Original `#view` links remain unsupported; new sharing links use `#share=<token>`.

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
4. Open Firestore → Rules, replace the existing rules with `firestore.rules`, and Publish. These rules allow only the matching authenticated Google account to read/write `/users/{uid}/cards/{cardId}`. They reject extra fields, non-integer quantities, quantities outside 0–63, and non-boolean flags. Private sharing settings are owner-only. The shared collection rules allow direct reads through active random links and deny all collection listing and visitor writes. Publish the updated rules before using the Share feature.
5. Alternatively, from your authenticated local Firebase CLI, run `firebase deploy --only firestore:rules --project pony-binder`. `firebase.json` points to the supplied rules file and does not change hosting.

Use the Firebase Rules Playground to verify that unauthenticated users and a different UID cannot read or write another account's card. Test an owner read/write, then verify that invalid quantity/flag writes are denied. In the deployed app, check Google sign-in, a new empty collection, quantity/wishlist/trade edits, sign-out, reload and a second device signed into the same account. These live checks require project access and are not included in Node unit tests.

## Data and synchronization

Each card is a separate document under `/users/{uid}/cards/{stableCardId}`, containing `q`, `w`, and `t`. The authenticated user's Google display name labels their binder. No account email or name is saved in collection documents.

A Firestore listener reads the signed-in account's card documents. Transactions create a complete card record if missing; otherwise they update only the changed fields. Edits to different cards and different fields cannot overwrite the entire binder. Simultaneous edits to the same field use the last committed value. Card counts and flags update immediately in the UI. Changes to each card combine into one field patch after 750 milliseconds without another edit to that card. Pauses longer than this can produce separate writes. In-flight transactions stay unchanged; subsequent edits queue behind them. Waiting changes count as pending, so the saving status and sign-out/navigation guards remain active. Per-card queues preserve edit order within a tab; at most six saves run concurrently. This reduces document writes for rapid edits to one card; each distinct card document still incurs its own write. Pending edits are applied over incoming snapshots until acknowledged. Failed operations remain visible and retryable. Account changes detach the previous listener and ignore stale callbacks.

Zero-quantity records remain when needed, rather than deleting documents and risking concurrent flag changes. Each initial listener connection reads the saved card documents, and changes cause further reads/writes, so monitor free-tier usage in Firebase.

Backup download, CSV export and explicit restore remain available while signed in. Restore applies the file's card quantities/flags to the current account and resets cards absent from the backup. It does not import the old localStorage collection automatically, create additional collectors, or rename the Google account. Restore runs as individual queued card writes, not one atomic operation; failures may leave a partial restore until retried. Confirm replacements before starting and wait for all changes to save.

## Read-only collection sharing

Sign in, wait for your collection to load and save, then choose **Share → Create link → Copy link**. Sharing starts off for every account. Friends can open the link without signing in, browse all sets, filter owned/missing/wishlist/trade cards, view stats and open card details. The shared view has no quantity, wishlist, trade, backup, restore or sharing controls, even if the visitor has signed in elsewhere. Owners can choose **Stop sharing** to revoke access. Creating a link after revocation generates a new random token; old links stay disabled.

Each link contains 32 cryptographically random bytes (256 bits) in the URL fragment. Tokens do not contain user IDs or encoded collection data. No public directory exists; Firestore rules deny listing and querying shared collection documents. Anyone holding a link can forward it, and downloaded copies or screenshots cannot be recalled. Shared pages request no indexing and use a no-referrer policy. The visitor store does not subscribe to auth or private card paths. Cached snapshots are not shown until server access is confirmed, and missing/revoked/denied links clear the visible collection.

`/users/{uid}/sharing/config` privately records the active token. `/sharedCollections/{token}` holds one compact published card map, a generic display name, the owner's Firebase UID for access control, and a server timestamp. Only known card IDs and `q`, `w`, `t` fields are copied; Google display names, email addresses, tokens and backup metadata are not published. Existing private card rules remain owner-only.

After private changes finish saving, the signed-in owner's open page publishes an updated shared map after a 1.5-second quiet window. This is a separate document write per combined update, not a write for each shared card. Guests read/listen to one shared document, and updates incur normal Firestore reads. Rules may also incur reads of the private link-setting document. Accounts with sharing off do not publish copies. Pending shared updates are shown in the save status and navigation warning; explicit sign-out flushes pending shared updates. A failed shared update leaves private saves intact and offers **Retry update** in Share. Before leaving, wait until both private and shared saves finish; otherwise the shared version may temporarily lag until the owner reopens the site. On sign-in, enabled links refresh from the loaded collection.

Creating and stopping sharing use atomic Firestore transactions. Publishing rechecks the private active token, so a stale tab cannot recreate a revoked link. Account changes cancel queued publication and ignore callbacks from the previous account. Share documents cannot be reassigned to another owner or written through a revoked token. Sharing failures do not grant additional database permissions.

Deployment: publish the PR's entire `firestore.rules` file through Firebase Console → Firestore Database → Rules, or run `firebase deploy --only firestore:rules --project pony-binder` from your authenticated local CLI. The Pages workflow tests rules but does not deploy them. No new production secret, Functions deployment, paid plan or database index is required. In production, verify owner create/copy, incognito read-only viewing, saved-edit updates and revocation before announcing the feature.

## UI

Quick Add switches between the card grid and a checklist. Valid whole quantities from 0–63 save immediately. Invalid edits leave saved values intact and revert on change. Rows remain visible until filters change, and focused Quick Add inputs stay intact during synchronization. Guests can use the checklist as a read-only card list.

On phones, completion stats collapse into a compact summary; Show stats expands the dashboard. Search and filters use a mobile layout, and quantity controls have 44px touch targets. Desktop shows the full dashboard.

## Development

Native JavaScript modules, no bundler. Deployment uses `node scripts/build-site.mjs` with the `FIREBASE_WEB_CONFIG` environment variable. Firebase SDK browser modules are pinned to version 13.0.0. For local development, copy `js/firebase-config.example.js` to the ignored `js/firebase-config.js` and fill in your restricted browser configuration, then serve over HTTP, for example `python3 -m http.server 8000`. Alternatively build and serve `dist`. Run `npm ci` and `npm test` with Node.js 24.12 or later. Run `npm run test:rules` with Java 21 or later to exercise access controls against the local Firestore emulator using a demo project. Both checks run in the deployment workflow. Tests use an injected cloud adapter and a minimal DOM stub; they do not exercise real Google OAuth, production Firestore, browser layout, or production Firebase security-rule enforcement. The separate emulator tests verify rules and sharing transactions without production credentials.

`js/firebase.js` implements Firebase operations; `js/storage.js` manages cloud state and queues; `js/state.js` holds view state; filters/rendering/events/dialogs handle the UI. `app.js` wires these together. The catalog loads before cloud initialization, so SDK initialization failure does not prevent public card browsing.

## Catalog and images

`data/catalog.json` contains `sets` and `cards`. Sets use `code`, `name`, `series`. Card fields: `id` (stable ID), `s` (set), `n` (name), `r` (rarity), `sh` (Shining boolean), `c` (printed number), `img` (image URL). Keep existing IDs unchanged. Runtime indexes and sorting remain in `js/catalog.js`.

Images load directly from KAYOU's official CDN. Run `python3 scripts/update-kayou-images.py` to refresh image URLs from the official Fantasy Wonderland, Discord!!!, Nightmare Night and Hearth's Warming Eve pages. The updater preserves all other fields and requires Python 3.9 or later plus network access.

Original card list: [MLP Merch Kayou Card Database](https://data.mlpmerch.com/kayou-cards/series/trading-card-game/booster-pack/), CC BY-NC-SA. Card images: KAYOU. Fan-made tool, not affiliated with Hasbro or KAYOU.

## Backlog

- Trading comparisons between collections.
- Additional collectors under one account if needed.


## Hearth's Warming Eve (BP04)

The 197 entries come directly from [Kayou's official card list](https://www.kayouofficial.com/en-US/series/series-i9q374dz): 146 non-Shining entries (including six Tokens) and 51 Shining variants. Shining Emerald cards retain the official A/B suffixes as separate trackable entries. Token numbers remain TK-02 through TK-07, as listed by Kayou; no TK-01 is invented. Names and image URLs follow the source, including its spelling. New stable IDs use the set and printed card code, with a Shining suffix where needed. All BP01–BP03 records and IDs remain unchanged.
