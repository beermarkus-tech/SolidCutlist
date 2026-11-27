# SolidCutlist

Woodworking cut-list optimizer that runs as a Google Apps Script web app bound to a
Google Sheet. It packs lumber (1D) and sheet goods (2D) onto store boards and shop stock,
and produces a shopping list, cut diagrams, labels and offcut analytics. UI in
EN / DE / FR / ES / PT-BR / IT.

- Product description: [`SolidCutlist.md`](SolidCutlist.md)
- How the code is organised: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- How the optimizer works (user-facing): [`algo.md`](algo.md)
- Manual test plan: [`TEST_PLAN.md`](TEST_PLAN.md)

## Layout

```
src/
  appsscript.json          Apps Script manifest (scopes, web-app settings)
  Backend/Main.js          doGet() + include() — serves Frontend/index
  Backend/Code.gs          Sheet-as-database API (save/load, archive, thumbnails, starter pack)
  Frontend/index.html      Page shell; includes every view, CSS and JS partial
  Frontend/Views/          HTML views (setup, projects, import, cutlist)
  Frontend/JS/Core/        state + sync, translations, tables, utils (units, parsing)
  Frontend/JS/Domain/      projects, parts, materials/profiles, stock, prices, jobs
  Frontend/JS/Modules/     optimizer, canvas diagrams, import, export, printing, tour
test/                      Node test suite (runs the real src/ files in a VM)
build.js                   Minifies src/ into dist/ (optional, for shipping)
```

## Development

```bash
npm install      # dev dependency: html-minifier-terser (for the build only)
npm test         # run the test suite (Node 18+)
npm run build    # write a minified copy to dist/ (fails if any file can't be minified)
npm run build:pwa  # PWA branch: static website in dist-pwa/ (see docs/PWA_PLAN.md)
```

Deploy with [clasp](https://github.com/google/clasp): `.clasp.json` points at `./src`
(switch `rootDir` to `./dist` to push the minified build).

## Data notes

- All lengths are stored in **millimetres**; the display unit (mm / decimal inch /
  fractional inch) is only a view.
- Each store price records the unit system it was entered in (`priceSystem`), so
  switching display units never changes prices.
- Never commit secrets: `.idx/dev.nix` and every other file here is in git history.

## Credits

App icon: the "wood" emoji from [Google Noto Emoji](https://github.com/googlefonts/noto-emoji), Apache License 2.0. See `pwa-src/ICON-CREDITS.md`.
