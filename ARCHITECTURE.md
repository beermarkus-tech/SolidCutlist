# SolidCutlist — Architecture Overview

_Generated from a read-through of the codebase on branch `claude/pwa-transformation-strategy-78wt3g`. This is a description of what exists today, not a proposal._

## 1. What the app is

SolidCutlist is a woodworking / cutlist-management tool: you define materials, profiles (cross-sections), stock on hand, and store catalog prices, then build "parts" lists per project and run a 1D/2D cut-optimization (bin-packing) engine to figure out how to cut your stock/sheets with minimal waste, print/export a shopping list and cut diagrams, and archive finished projects.

It is a **single-user, single-page web app whose entire backend is a Google Sheet, served by Google Apps Script**. There is no separate database, no Node/Express server, no REST API you'd recognize from a normal web stack.

## 2. How it's served (this is the load-bearing fact)

- `src/appsscript.json` declares a **Web App** deployment: `"executeAs": "USER_DEPLOYING"`, `"access": "MYSELF"` — i.e. only the deploying Google account can open it. OAuth scopes are limited to `spreadsheets.currentonly` and `script.locale`.
- `src/Backend/Main.js` → `doGet(e)` is the entire HTTP entry point. It does:
  ```js
  HtmlService.createTemplateFromFile('Frontend/index')
    .evaluate()
    .setTitle('SolidCutlist')
    .addMetaTag('viewport', ...)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  ```
  There is no routing beyond this — one template, always.
- `include(filename)` (also in `Main.js`) is a template helper used inside `index.html` as `<?!= include('path'); ?>`. Apps Script's `HtmlService` scriptlets stitch every CSS/JS/view "partial" file into **one HTML document at request time**. This is effectively a server-side templating/include system standing in for a bundler — there is no client-side module system, no `import`/`export`, everything becomes global functions/vars in one `<script>` soup.
- **Hosting model**: Apps Script Web Apps render inside a sandboxed iframe on a Google-controlled domain (`script.googleusercontent.com`), wrapped by a `script.google.com` page you don't control. You have no access to response headers, no static file serving at arbitrary paths, and no ability to register a service worker against the top-level origin. (This is the fact that matters for the PWA conversation — noted here for completeness, not elaborated on.)
- The frontend talks to the backend exclusively through **`google.script.run`**, Apps Script's built-in RPC bridge (23 call sites in the frontend). This bridge only exists because the page is served *by* Apps Script — it cannot be called from a page hosted anywhere else.

## 3. Repo layout

```
src/
  Backend/
    Main.js          → doGet() entry point + include() template helper
    Code.gs           → all server-side "API" functions (Sheet read/write)
  Frontend/
    index.html         → the one HTML shell; includes everything else
    CSS/                → two global stylesheet partials
    Views/              → 4 top-level screen partials
    JS/Core/            → state engine, i18n, tables, modals, generic UI
    JS/Domain/          → one file per data entity (parts, projects, stock, ...)
    JS/Modules/         → optimizer, canvas rendering, printing, CSV import, tour
  appsscript.json       → Web App deployment manifest (access, scopes, runtime)
build.js                → local-only: copies src/ → dist/, minifies the HTML
dist/                    → build output (mirrors src/, HTML minified)
```

`build.js` is a plain Node script (no bundler/webpack/vite) that recursively copies `src/` to `dist/`, minifying `.html` files with `html-minifier-terser` and copying `.js`/`.gs`/`.json` as-is. `dist/` is what actually gets pushed to Apps Script for deployment (presumably via `clasp`, though no `.clasp.json` is present in this checkout). There is no test suite (`npm test` is a stub) and no linter configured.

## 4. Backend (`src/Backend/`)

### `Main.js` (23 lines)
- `doGet(e)` — serves the HTML shell (see §2).
- `include(filename)` — server-side include used by scriptlets.

### `Code.gs` (589 lines) — the entire "API"
All functions are plain top-level Apps Script functions invoked via `google.script.run.<fnName>(...)` from the client. The **Google Sheet bound to the script is the database**; each logical table is a Sheet tab. Sheet tab names, from the `TABS` constant: `projects, groups, parts, stock, catalog, materials, profiles, stores, jobs`, plus ad-hoc tabs `Metadata`, `Archive`, `Thumbnails`, `settings`, and a `pck_*` family of "starter pack" template tabs.

Key functions and responsibilities:
- **`saveAppStateToSheet(payloadString)`** — the write path. Takes the *entire* app state as one JSON string, writes a status/timestamp banner into a `Metadata` tab, then calls `writeArrayToSheet` per table and `writeSettingsToSheet` for settings. This is a **full-state overwrite**, not incremental diffing.
- **`writeArrayToSheet(ss, sheetName, dataArray)`** — clears the tab, unions all object keys across rows to build headers, converts objects/arrays to JSON strings per cell, and — notably — **auto-chunks any single field whose JSON exceeds `CELL_LIMIT` (45,000 chars)** across multiple columns (`field__1`, `field__2`, …) to stay under Sheets' ~50k-char cell limit. This exists because things like embedded part geometry/images can get large.
- **`getAppStateFromSheet()`** — the read path. Loops the same `TABS` list, calls `readArrayFromSheet` per tab, rebuilds `settings` from a key/value tab, and returns one JSON string containing the whole app state plus a `cloud_timestamp`.
- **`readArrayFromSheet(sheet)`** — inverse of the write: detects and re-stitches chunked `field__N` columns back into single fields, coerces `'TRUE'/'FALSE'` strings to booleans, force-stringifies a few known ID-like columns, parses `date` columns, and JSON-parses any cell that looks like a `{...}`/`[...]` string.
- **Archive ("Deep Freeze") system**: `archiveProjectToSheet`, `getArchiveList`, `loadProjectFromArchive`, `deleteProjectFromArchive` — projects can be snapshotted (project + groups + parts + thumbnail + used materials/profiles as JSON blobs) into an `Archive` tab, separate from the live working tables, and later restored or deleted.
- **Thumbnails**: `getThumbnails`, `saveThumbnail`, `deleteThumbnail`, `bulkImportThumbnails`, `clearAllThumbnails` — project cover images (base64) are stored in their own `Thumbnails` tab, deliberately **outside** the main `AppState` sync payload, to avoid bloating that payload/hitting cell limits. Fetched/pushed as a separate `google.script.run` round trip.
- **`getStarterPack(profileRegion)`** — reads a bundled set of `pck_*` template tabs (region-specific: `US`/`EU`) to seed a brand-new user's materials/profiles/catalog/sample project, so the app isn't empty on first run.

There is no auth/user-scoping logic in `Code.gs` — `SpreadsheetApp.getActiveSpreadsheet()` always resolves to the one Sheet bound to the script, and access is gated entirely by the `"access": "MYSELF"` deployment setting (i.e., Google's own auth in front of the whole app, not app-level logic).

## 5. Frontend composition (`src/Frontend/`)

`index.html` is the shell: `<head>` includes the two CSS partials, `<body>` has a boot-loader splash screen, a top navbar (Setup / Projects / Cutlist / Import buttons calling `navigateTo(viewId)`), a `<main>` containing 4 view `<div>`s (all present in the DOM simultaneously, toggled via `.d-none` — this is a client-side "SPA" with **no real router**, just class toggling), several global Bootstrap modals (group manager, conflict-resolution, welcome tour, toasts), and then, at the very bottom, a long sequence of `<?!= include(...) ?>` tags that inject every JS partial **in a fixed order** (this order matters because everything shares one global scope and later files call functions defined in earlier ones):

```
Core:    js_languages → js_modals → js_state → js_tables → js_ui_core → js_utils
Domain:  js_jobs → js_materials → js_parts → js_projects → js_settings → js_prices → js_stock
Modules: js_canvas → js_import → js_optimizer → js_printing → js_welcome_tour
```

Styling is Bootstrap 5 (via CDN `<link>`/`<script>`) plus two custom partials (`css_global.html`, `css_custom.html`) for app-specific theme/dark-mode/layout rules. There's no CSS preprocessor.

### Views (`Frontend/Views/`) — the 4 screens
- **`view_setup.html`** (574 lines) — "My Stock" and "Store Prices/Catalog" tabs: manage physical inventory (`stock`) and vendor pricing (`catalog`), plus materials/profiles dictionaries.
- **`view_import.html`** (179 lines) — multi-step CSV import wizard (select file → map columns → confirm) for bulk-loading parts.
- **`view_projects.html`** (344 lines) — "Active Projects" and "Current Partlist" tabs: project/group CRUD, project cards or table view, archive access.
- **`view_cutlist.html`** (646 lines) — the two-panel optimizer workspace: configure the cut job (which parts, stock rules, kerf/trim/transport settings) on one side, view results (diagrams/shopping list/analytics) on the other.

### Core (`Frontend/JS/Core/`) — cross-cutting engine code
- **`js_state.html`** (475 lines) — **the heart of the app.** Defines `initialAppState` (the full data schema, see §6), and the boot/sync engine:
  - `loadState()` — on `DOMContentLoaded`, reads `localStorage['lumberLogicState']` as an offline fallback, then calls `google.script.run.getAppStateFromSheet()`.
  - `handleCloudDataResponse()` — compares the cloud timestamp to the local timestamp; if local is **>10s newer** than cloud, it assumes an unsynced local edit exists (e.g. browser closed before the debounced save fired) and shows a **conflict modal** (`showConflictModal`/`resolveConflict`) letting the user pick "use cloud" or "use local". Otherwise cloud wins silently.
  - `finalizeBoot(dataToLoad)` — assigns the global `appState`, sanitizes missing tables/settings, runs `autoHealMissingIDs()` (assigns IDs to any row missing one, then force-saves), triggers all the initial renders, does mobile-vs-desktop routing (`window.innerWidth < 768` picks `view-cutlist` vs `view-projects`), hides the boot loader, and shows the welcome tour or checklist on desktop.
  - `saveState()` — the **write entry point every mutation calls**: recalculates project totals, writes to `localStorage` **synchronously/immediately**, updates a small sync-status indicator in the navbar, and (re)arms a **3-second debounce timer** (`syncTimeout`) after which `triggerCloudSync()` actually fires `google.script.run.saveAppStateToSheet(...)`. So the save model is: instant local durability, delayed/coalesced cloud durability.
  - `resetApp()` — factory reset: rebuilds `appState` from hardcoded defaults (preserving saved jobs/label templates), pushes the empty state + clears thumbnails on the cloud in parallel, then re-runs `loadState()` in place (no page navigation, since GAS callbacks don't survive a hard reload well).
- **`js_languages.html`** (3690 lines) — i18n: a `translations` object keyed by language code (at least `en` present; likely more), a `t(key, replacements)` lookup helper, and `applyTranslations()` which walks `[data-i18n]`/`[data-i18n-title]` DOM attributes and fills them in. Almost entirely string tables.
- **`js_tables.html`** (496 lines) — generic sortable/filterable table infrastructure reused across every domain table (`handleSort`, per-column filter modal + apply/clear, inline-edit row registry: `registerEditableTable`, `activateEditRow`, `deactivateEditRow`).
- **`js_ui_core.html`** (256 lines) — `navigateTo(viewId)` (the "router" — hides all `.app-view`s, shows one, runs view-specific init hooks like `renderImportView()`/`renderOptimizerConfig()`), collapsible input sections, toasts (`showToast`), theme toggle/persistence (`applyTheme`/`toggleTheme`), and a `freezeUI()/unfreezeUI()` pair used to lock the screen during async operations (archiving, restoring).
- **`js_utils.html`** (391 lines) — unit conversion (`parseToBaseUnit`/`formatForDisplay` — the app stores everything in mm internally and masks display as mm/decimal-inch/fractional-inch per user setting), cost/weight calculators, `recalculateAllProjectTotals()`, generic row duplication/deletion helpers used by multiple domain files.
- **`js_modals.html`** (115 lines) — generic confirm-dialog (`requestConfirm`/`executeConfirm`) and info-tooltip popovers, reused everywhere instead of native `confirm()`.

### Domain (`Frontend/JS/Domain/`) — one file per entity, CRUD + rendering against `appState`
- **`js_projects.html`** (1164 lines) — projects & groups CRUD, project card/table views with search/filter/sort, status changes, thumbnail upload (`processImageUpload` → resizes client-side → `google.script.run.saveThumbnail`), the **Archive workflow** (`executeDeepFreeze` snapshots a project via `archiveProjectToSheet`, `restoreArchivedProject` pulls it back and re-links IDs via `_resolveRef`), icon picker.
- **`js_parts.html`** (513 lines) — the master parts/cutlist table: add/edit/delete parts, category-dependent fields (lumber vs sheet vs fastener), per-row cost/weight computation, footer totals.
- **`js_materials.html`** (441 lines) — materials + profiles dictionaries, and the **starter-pack loader** (`loadStarterPack` → `google.script.run.getStarterPack(region)` → `_applyStarterPack` merges the returned template data, including thumbnails, into the live state).
- **`js_stock.html`** (578 lines) — shop stock inventory CRUD, with both a "flat" and a "compressed/grouped by fingerprint" table view (`groupByFingerprint` from `js_utils.html`).
- **`js_prices.html`** (998 lines) — vendor catalog CRUD (price per item, normalized price-per-unit math), store management, price-link tracking.
- **`js_jobs.html`** (742 lines) — "Jobs" = saved/mobile-oriented optimizer sandboxes: `createJobSandbox`, save/load/delete a named cut job, plus a whole mobile-specific bottom-bar UI (`setMobileBarState`, undo/save/recalculate flows) distinct from the desktop optimizer panel.
- **`js_settings.html`** (163 lines) — renders and persists the settings panel (units, kerf, currency, theme, language, etc.) into `appState.settings`.

### Modules (`Frontend/JS/Modules/`) — the "product logic" beyond plain CRUD
- **`js_optimizer.html`** (2808 lines, the largest file) — the cut-optimization engine and its UI:
  - Packing algorithms: `pack1D`/`pack2D`/`pack2DV2` (with a `_bestPack2D` variant chooser), plus **transport-constrained** variants `pack1DTransport`/`pack2DTransport` (splits long cuts across multiple physically-transportable boards/sheets under a max-length + margin constraint), grain-direction-aware fitting (`checkFit`, `_resolveRot`), and offcut/waste computation (`_sheetTrueWaste`, `_largestOffcut`).
  - Orchestration: `prepOptimizerData()` groups selected parts by material/profile, `runPackingEngine()` runs the chosen packer per group and returns purchase/board/offcut results.
  - Config UI: `renderOptimizerConfig()`, kerf/scrap/transport toggle handlers, `runOptimization()` (the "go" button), `saveOptConfig()`.
  - Results UI: three tabs — partlist (`renderSandboxPartlistTab`), shopping list (`renderShoppingListTab`, with purchase-checkbox tracking `toggleShoppingItemPurchased`), and analytics (`renderAnalyticsTab`). `executeCommitToStock()` converts leftover offcuts from a completed job into new `stock` rows.
- **`js_canvas.html`** (868 lines) — draws the actual cut diagrams (`renderDiagramsTab`): lays out each purchased board/sheet as an SVG/canvas diagram showing where each part and each offcut sits, reading kerf/trim/transport settings from `appState.settings`.
- **`js_printing.html`** (812 lines) — builds printable HTML in a new browser window/tab (`printPartsTable`, plus label/shopping-list print variants) — a pure client-side `window.open()` + generated markup, no PDF library.
- **`js_import.html`** (810 lines) — the CSV import pipeline backing `view_import.html`: file parse → header/column mapping → unit-mismatch detection (`checkUnitMismatch`) → confirm → bulk-insert into `appState.parts`.
- **`js_welcome_tour.html`** (236 lines) — first-run onboarding: a step-by-step overlay tour (`showWelcomeTour`/`tourNext`/`tourPrev`) plus a persistent "getting started" checklist widget for desktop users, gated on `appState.settings.tourComplete`/`checklistDismissed`.

## 6. Data model (`appState`)

Everything lives in one big in-memory JS object, `appState`, mirrored to `localStorage` and to the Google Sheet. Shape (from `initialAppState` in `js_state.html`):

```
appState = {
  materials: [...]     // Tier 1: wood species/treatments dictionary
  profiles:  [...]     // Tier 1: cross-sections & sheet thicknesses (no lengths)
  catalog:   [...]     // Tier 2: what stores sell — material+profile+length+price
  stock:     [...]     // Tier 2: physical inventory on hand
  projects:  [...]     // Tier 3: top-level projects
  groups:    [...]     // Tier 3: sub-assemblies within a project
  parts:     [...]     // Tier 3: the master cutlist, one row per piece needed
  jobs:      [...]     // saved optimizer sandbox runs
  settings:  { baseUnit, displayUnit, bladeKerf, cutoffThreshold, factoryEdgeTrim, ... }
  ui:        {}         // ephemeral UI-only state (not part of the original schema, added defensively)
  local_timestamp: <ms epoch>   // stamped on every save, used for conflict detection
}
```

All physical measurements are stored internally in **millimeters** regardless of the user's preferred display unit; `parseToBaseUnit`/`formatForDisplay` (in `js_utils.html`) convert at the input/output boundary. IDs are app-generated strings like `PROJ-<timestamp>-<index>` (see `autoHealMissingIDs`), not Sheet row numbers — rows are matched by this `id` field on every read/write round trip.

Thumbnails (base64 project cover images) and the Archive are **not** part of `appState` — they're synced via separate `google.script.run` calls to their own Sheet tabs, specifically to keep the main state payload small (relevant given the ~45KB/cell chunking logic in `Code.gs`).

## 7. End-to-end data flows

**Boot:**
`DOMContentLoaded` → `loadState()` → read `localStorage` (fallback) → `google.script.run.getAppStateFromSheet()` → `Code.gs:getAppStateFromSheet()` reads all Sheet tabs → JSON string back to client → `handleCloudDataResponse()` compares timestamps (conflict modal if local is notably newer) → `finalizeBoot()` sanitizes + renders everything + routes to the right initial view → `fetchProjectThumbnails()` runs separately/async to backfill images without blocking boot.

**Any edit (e.g. add/update/delete a part, project, stock row, setting):**
Domain handler mutates `appState` directly in memory → calls `saveState()` → `localStorage` written **immediately** (synchronous, so a crash/close right after an edit doesn't lose data locally) → sync indicator shows "saved locally" → a 3s debounce timer is (re)armed → after 3s of no further edits, `triggerCloudSync()` fires → `google.script.run.saveAppStateToSheet()` → `Code.gs` overwrites every Sheet tab wholesale from the JSON payload → success/failure updates the sync indicator.

**Optimizer run:** user selects parts/settings in the Cutlist view → `runOptimization()` → `prepOptimizerData()` groups parts → `runPackingEngine()` runs `pack1D`/`pack2D`(/Transport variants) per group against available `stock`+`catalog` → results feed three read-only tabs (partlist, shopping list, analytics) and `js_canvas.html`'s diagram renderer → optionally `executeCommitToStock()` writes new `stock` rows (offcuts) back into `appState`, going through the normal `saveState()` path.

**Archive:** `executeDeepFreeze(projectId)` bundles project+groups+parts+thumbnail+used materials/profiles → `google.script.run.archiveProjectToSheet()` (separate Sheet tab, separate from live tables) → project can later be restored (`restoreArchivedProject`, which re-resolves material/profile IDs against whatever currently exists) or permanently deleted.

**CSV import:** `view_import.html` wizard → `js_import.html` parses the file client-side, maps columns, flags unit mismatches → on confirm, rows are pushed into `appState.parts` and go through the normal `saveState()` cloud-sync path — there's no server-side import endpoint.

## 8. Cross-cutting mechanisms worth knowing about

- **No client-side router** — 4 views exist simultaneously in the DOM; `navigateTo()` just toggles `.d-none` and calls a few view-specific init functions.
- **No component framework** — everything is direct DOM manipulation / template-string `innerHTML` building (e.g. `renderProjectsTable`, `renderStockTable`, `buildPartsReadRowInner`), no Vue/React/etc.
- **Global mutable state** — `appState` is a single global object every file reads/writes directly; there's no store abstraction, no pub/sub, no immutability — renders are triggered by explicit function calls after each mutation, not reactively.
- **Mobile vs desktop divergence** — `window.innerWidth < 768` gates both initial routing (`triggerMobileRouter`) and a parallel "mobile bar" UI in `js_jobs.html`, on top of the same underlying views (Bootstrap responsive classes handle most layout, but some behavior is JS-branched).
- **i18n** is a giant static dictionary + `t()`/`data-i18n` attribute scan, applied after every state load/change.
- **Offline behavior today**: `localStorage` already acts as an instant local cache/fallback and the app can boot from it if the cloud call fails — but this is a data-resilience feature, not a PWA (no service worker, no asset caching, no install/offline-shell capability, and see §2 for why that's structurally hard while served by Apps Script).

## 9. Summary for someone new to this codebase

This is a monolithic, vanilla-JS (no framework, no bundler) single-page app that happens to be delivered through Google Apps Script's HTML templating instead of a normal web server, with a Google Sheet as its only datastore and `google.script.run` as its only client↔server transport. All ~19k lines of frontend code share one global scope, one global `appState` object, and one save pipeline (instant local write + debounced full-state cloud overwrite with a timestamp-based conflict prompt). The interesting domain logic — the bin-packing optimizer (`js_optimizer.html`) and its diagram renderer (`js_canvas.html`) — is self-contained and doesn't depend on the Apps Script specifics; almost everything else (state sync, thumbnails, archive, starter pack) is written directly against the `google.script.run`/Sheet-as-DB model, which is the main coupling a PWA/hosting migration would have to deal with.
