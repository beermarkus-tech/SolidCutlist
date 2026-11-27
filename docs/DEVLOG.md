# SolidCutlist dev log

Hand-over notes so work can continue in a new chat. Last updated: 2026-11-27.
Read this first, then `docs/PWA_PLAN.md` and `CHANGELOG.md`.

## 1. Who / how to work

- Owner is a **non-developer** who sells SolidCutlist (woodworking cut-list optimizer). No sales yet.
- Often works from a **phone**; explain steps in plain language, one click at a time.
- **Never ask for tokens or secrets in chat.** Use the secure credential form (`request_credential`).
  OAuth client IDs are fine to share; client secrets are not.
- **Do not touch `main`** (it is the live Etsy version) unless the owner explicitly says to go live.
- Commit/push only to the branch being worked on. No pull requests unless asked.
- Every user-visible text needs all 6 languages (EN, DE, FR, ES, PT-BR, IT) in `js_languages.html`.

## 2. Branches and versions

| Branch | Version label | State |
|---|---|---|
| `main` (tag `v1.0`) | v1.0 | **Live** (Etsy). Untouched. |
| `work-in-progress` | v1.1 RC **build 40** (not live yet) | Corrected version of the live app (all audit fixes). Pushed to the WIP test Sheet. Owner tested: works well. |
| `PWA` | **SolidCutlist PWA v2.0 preview · build 41** (not live yet) | Progressive Web App, live as a preview on GitHub Pages. Active branch. |

- Build numbers are shared: next PWA push that changes the app → build 42. The label is in
  `src/Frontend/index.html` (`id="app-build-label"`); also add a `CHANGELOG.md` entry.
- `work-in-progress` commit `5fe5ca1` (build 40 backup fix) is not merged into `PWA` as a commit,
  but the same code change is already in `PWA`.

## 3. The PWA (branch `PWA`)

- URL: https://beermarkus-tech.github.io/SolidCutlist/
- Deploy: every push to `PWA` runs `.github/workflows/pwa-pages.yml` (Node 22: `npm ci`,
  `npm test`, build, deploy to Pages). Takes about a minute.
- Same `src/` builds both products: `build.js`/clasp → Apps Script Sheet version;
  `build-pwa.js` → static site in `dist-pwa/`.
- Key PWA files:
  - `src/Frontend/JS/Core/js_local_backend.html`: fake `google.script.run` backed by IndexedDB
    (does nothing inside Apps Script).
  - `src/Frontend/JS/Core/js_sync.html`: sync merge engine (pure functions).
  - `src/Frontend/JS/Modules/js_sync_drive.html`: Google sign-in + Drive files + Settings panel.
  - `src/Frontend/JS/Modules/js_pwa.html`: service worker registration, update banner.
  - `pwa/` (manifest, icons, starter packs), `pwa-src/` (service worker template, icon source).
  - `tools/starter-pack-from-backup.js`, `tools/starter-pack-add-thumbnails.js`.

### Phases
- Phase 1 (runs as a website): **done**.
- Phase 2 (installable, offline, update banner): **done**.
- Phase 3 (Google Drive sync): **done and tested by the owner on Android/computer.**
  iPhone/iPad **not tested** (owner has no device).
- Phase 4 (migrating Sheet customers): **dropped** (no customers yet).
- Phase 5.1 (optimizer in a Web Worker): **dropped** (optimizer is fast enough).

### Google Drive sync facts
- Google Cloud: existing project reused; Drive API enabled; OAuth consent screen **External,
  in Testing** (only listed test users can sign in); scope `drive.appdata` is in the
  **non-sensitive** group (no Google verification needed to publish).
- OAuth Web client ID (public, in code): `979914831203-n4vrjldr031ddg4gl1n0vjf23qo266ea.apps.googleusercontent.com`
  Authorized origins: `https://beermarkus-tech.github.io`, `http://localhost:8080`.
- Data lives in the user's own Drive, hidden app folder: `solidcutlist-data.json` and
  `solidcutlist-images.json`. No server of ours.
- Merge: per record, newest change wins; deletions via tombstones (90 days); device-only view
  settings are not synced. First sync on a device: Drive wins for items already in Drive.
- Google tokens last ~1 hour; then status shows "tap to sync" (popup needs a tap).

### Lessons learned (avoid repeating)
- `appState` is a script-level `let` in `js_state.html`, **not** `window.appState`. Code in other
  partials must use the identifier `appState`. (This caused the "reading 'projects'" sync error.)
  `projectImages` *is* on `window`.
- Tests: `test/drive-sync.test.js` simulates two devices + fake Drive and declares
  `let appState` like the app. Values from VM contexts must be compared after `JSON` round trip.
- Local browser checks: serve `dist-pwa/` with correct Content-Types (CSS as `text/css`) or the
  page renders unstyled. Chromium + Playwright are preinstalled.
- Use `100dvh`, not `100vh`, for full-height layouts (tablet bars hid the Calculate button).
- Node 22 is required (`npm test` glob).

## 4. Open to-do list (agreed with the owner)

1. **Phone layout pass** on all screens (only Cutlist is phone-tuned; Setup/Projects cramped
   in portrait).
2. **More automatic browser tests** (Playwright; offline + two-device sync partly exist in
   `test/e2e/pwa-offline.e2e.js` and the unit tests).
3. **Language box empty on first start** in Settings (`#setting-language`, value `''` because
   `appState.settings.language` is undefined on a fresh install; app shows English). One-line fix;
   probably also in the Sheet version.
4. **Tablet Calculate-button fix for the Sheet version**: done on `PWA` (commit `c10f05c`,
   `100dvh` + safe-area padding); owner has not yet decided whether to port it to
   `work-in-progress`.
5. **Phase 6, before selling:**
   - Choose selling model (licence key / subscription / one-off) and add licensing.
   - Privacy policy + homepage link, then **publish** the OAuth consent screen (out of Testing).
   - Optional: custom domain (e.g. `app.solidhomesteadplans.com`), listing copy, update
     `SolidCutlist.md`.
6. **Going live with v1.1** (merge `work-in-progress` → `main`): only when the owner says so.
7. Update `docs/PWA_PLAN.md`: mark Phase 3 tested, Phases 4 and 5.1 dropped.

## 5. Apps Script (Sheet version) deployment

- WIP Sheet script ID: `1JqaNkcXPPnAWSzrGty_cAMBC06HR_c3kxRdAzq2AArIIzUAfBBIJpWHF` (in `.clasp.json`).
- Pushing from a cloud session: Apps Script API `PUT https://script.googleapis.com/v1/projects/{id}/content`
  with an OAuth token (OAuth Playground, scope `https://www.googleapis.com/auth/script.projects`),
  saved by the owner through the secure credential form for host `script.googleapis.com`
  (paste only the `ya29…` value, without "Bearer"). Tokens expire after ~1 hour.

## 6. Commands

```bash
npm install
npm test            # unit tests (244 passing at build 41)
npm run build:pwa   # static site → dist-pwa/
npm run serve:pwa   # local preview at http://localhost:8080
npm run test:e2e    # Playwright: install/offline/update
npm run build       # minified Apps Script copy → dist/
```
