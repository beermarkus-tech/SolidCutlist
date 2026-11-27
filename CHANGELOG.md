# Changelog

## Status of the branches

| Branch / tag | What it is | Live? |
|---|---|---|
| `main`, tag `v1.0` | Etsy launch version | **Yes, live** |
| `work-in-progress`, tag `v1.1-rc` | **v1.1 RC: corrected version of the live app.** New features and all audit fixes. Pushed to the WIP test Sheet only. | **No, not live yet** |
| `PWA` | Starting point for the Progressive Web App rewrite (branched from v1.1 RC build 39) | No |

---

## v1.1 RC, build 39 (not live yet)

Corrected version of live v1.0. Becomes live once it has been tested in the WIP
Sheet and merged into `main`.

### New since v1.0 (builds 01–22)
- Bulk material line items and a global safety margin in the optimizer.
- CSV export of the parts list. CSV import auto-detects columns, has a Qty column and
  parses fractions; fixed the first data row being dropped.
- JSON backup/restore of the whole app, single projects, stock and store prices.
- Fractional inches displayed as `16-3/4`; defaults are inches and $.
- Android photo-upload fix, pull-to-refresh disabled, toolbar tidy-ups.
- Automated test suite (`npm test`).

### Fixes from the code audit (builds 23–39)
- **Security:** removed a committed API key (since revoked).
- **Prices:** each store price remembers its unit system, so switching mm ↔ inches no
  longer changes prices.
- **Optimizer:**
  - exact fits from inch input are accepted;
  - sheets without a grain value no longer force rotation;
  - equal-cost boards are chosen by fewest boards, then least waste.
- **Input and CSV:** decimal commas, fractions with inch marks, quoted CSV fields, tab
  delimiters; nearest-profile matching; invalid / zero / negative sizes are rejected.
- **Google Sheet saving:**
  - saves are locked, so they can't overlap;
  - a failed save never empties a tab or looks newer than it is;
  - text like `1/2` or `007` stays text;
  - large projects can be archived.
- **Sync:** one save at a time; unsynced edits are kept across reloads; the conflict
  prompt appears only when two devices really both changed data; storage-full no
  longer blocks saving.
- **Jobs:** optimizer toggles no longer leak job settings into the master settings.
- **Data integrity:**
  - deleting a project removes its groups;
  - deleting a material or profile flags the prices and stock that use it;
  - photos are always resized to fit a Sheet cell;
  - an offcut commit with quantity 0 commits nothing.
- **Display:**
  - sqft waste in inches mode;
  - label board numbers match the diagrams;
  - project dates use the local day.
- **Translations:** 54 missing or hard-coded texts translated in all 6 languages, with
  English fallback instead of raw keys.
- **Hardening:** names and links escaped, Bootstrap loaded with integrity checks,
  boot logo 250 KB → 12 KB, dead code removed, build fails loudly on errors.

## v1.0 (live)
Etsy launch version.
