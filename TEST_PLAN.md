# SolidCutlist — Master Test Plan
**Version 2.0 | Created: 2026-04-12 | Revised: 2026-04-18 | Status: Pending — features/fixes in progress before execution**

---

## How to resume this plan in a future Claude Code session
Tell Claude: *"Let's continue the SolidCutlist test plan. Read TEST_PLAN.md and the memory files, then pick up where we left off."*
Claude will read this file and the memory index at `~/.claude/projects/-home-user-woodbench/memory/MEMORY.md`.

---

## Phase Progress Tracker

| # | Phase | Owner | Status | Notes |
|---|-------|-------|--------|-------|
| 1  | Static Code Analysis | Claude | ✅ Complete | 3 real fixes (P1-1, P1-2, P1-8). P0-1 intentional design. 5 agent false positives. |
| 2  | Settings, Persistence & Onboarding | Both | ✅ Complete | 2 bugs fixed: catalog modal view unit not saving, opt-use-stock checkbox not restored on boot. |
| 3  | CRUD & Data Integrity | Both | ✅ Complete | Cascade deletes, per-field warnings, click-away save, sort fixes, recalc button wiring, offcut sort, support contact added. Transport limits to re-verify in Phase 5/6. |
| 4  | State & Job Isolation | Claude | ✅ Complete | 2 P1 bugs fixed: handleSettingsValueChange + handleMobileSettingsValueChange leaked into appState.settings when job was active. All master arrays (parts/catalog/stock/materials/profiles/projects) fully isolated. |
| 5  | Optimizer — 1D Lumber | Both | ✅ Complete | All 12 scenarios passed. 2 fixes: sourcing error "size: 0mm" hidden, unit label added to failed-parts list. Stock pill added to cutlist cards. |
| 6  | Optimizer — 2D Sheets | Both | ✅ Complete | All 10 scenarios passed. Fixes: effectiveTransportL rotation feasibility check, >= segMax threshold for exact-limit parts, grain lines per-element (not global), Stock pill on cutlist cards, red size label suppressed on no-catalog errors. |
| 7  | Import Wizard | You | ✅ Complete | All scenarios passed. wrong_delimiter.csv shows "not a CSV file" error — acceptable behavior. |
| 8  | Results Views (Shopping List, Analytics, Canvas, Print) | You | ⬜ Not started | |
| 9  | i18n & Localization | Both | ⬜ Not started | |
| 10 | Mobile UX | You | ⬜ Not started | |
| 11 | Error Handling & Edge Cases | Both | ⬜ Not started | |
| 12 | End-to-End Integration | Both | ⬜ Not started | |
| 13 | Benchmarking vs. Competing Tools | Both | ⬜ Not started | |

Update status to: ⬜ Not started / 🔄 In progress / ✅ Complete / ❌ Blocked

---

## Context & Constraints

- **App**: SolidCutlist — woodworking cut optimizer, Google Apps Script Web App + Google Sheets backend
- **Status**: Beta, never released. To be sold commercially as a GSheet with bound script (one-shot ship).
- **Dev setup**: Non-developer, vibe-coded with Gemini + Claude. Working on Samsung Galaxy Tab S10 Ultra, Chrome.
- **2D packing**: Gemini-proposed algorithm, approximate (not mathematically optimal), tested against known problems.
- **Jobs**: Fully isolated sandboxes. NOTHING writes back to master state. Any link from job → master state is a P0 bug.
- **Mobile scope**: Only the Cutlist results section (shopping list + cut diagrams) needs to be mobile-friendly.
- **Offline scenario**: Users inside lumber stores with no wifi. localStorage is the fallback. Offline strategy to be designed in Phase 11.
- **Languages**: EN, DE, FR, ES, PT-BR, IT. All UI strings must be translated.

---

## Phase 1 — Static Code Analysis *(Claude)*

Claude reads every JS module and flags:
- Logic errors in packing math (kerf, trim, running totals)
- Dead code or unreachable branches
- Missing null/undefined guards
- Shared object references between job data and master state (hidden writeback — P0)
- Incorrect unit conversion paths
- Any function that mutates `appState` from within a job context

**Output**: Prioritized bug report (P0 / P1 / P2). Fix before moving to later phases.

---

## Phase 2 — Settings, Persistence & Onboarding *(Both)*

### Settings
- Switch display units (mm → dec inches → frac inches → back): do all existing values re-render correctly?
- Switch currency (€ → $ → £ → back): shopping list and catalog prices update everywhere
- Switch language through all 6 options: full UI re-renders without page reload
- Toggle dark/light mode: no elements left with hardcoded colors
- Set kerf = 0, kerf = 5mm, kerf larger than a part dimension
- Set transport limits, then verify optimizer respects them

### Persistence (localStorage)
- Change settings → reload page → settings are restored
- Add data → reload page → all data intact
- Change language → reload page → language persists

### Welcome Tour
- First-launch: tour appears automatically
- Language selector on step 1: switching language immediately re-renders tour in new language
- Unit and currency selections on step 1: apply correctly when advancing
- Skip tour: marks complete, shows checklist
- Complete all steps: lands on Projects view
- Re-trigger tour from settings: works as session-only (no state saved)

### Getting Started Checklist
- Appears after tour is completed
- Each checklist item checks off when action is performed
- Starter pack load marks the first item done
- "All done" state shows dismiss button
- Dismiss hides widget permanently

---

## Phase 3 — CRUD & Data Integrity *(Both)*

Test each entity in dependency order:

| Entity | Key checks |
|--------|-----------|
| Materials | Create, rename, delete — does deleting break parts/catalog/stock that reference it? |
| Profiles | Same cascade check |
| Catalog entries | Add, edit, delete. Delete a store — what happens to its entries? |
| Stock | Add, edit qty, delete. Flag/unflag as scrap. |
| Projects | Create, rename, status transitions (all 5 stages), delete with and without parts |
| Groups | Create inside project, rename, delete group that has parts assigned |
| Parts | All three categories (Lumber/Sheet/Fastener), qty > 1, edge dimensions, delete |
| Settings | Change every setting; verify UI re-renders — especially unit switching |
| Jobs | Create from 0/1/many projects. Multipliers. Delete. Reload after page refresh. |

---

## Phase 4 — State & Job Isolation *(Claude)*

Claude traces every code path where job data could write back to master state.

- Verify `appState.materials`, `appState.profiles`, `appState.catalog`, `appState.stock`, `appState.projects`, `appState.parts` are **never mutated** during a job run
- Verify job results object holds its own copies of any master data it needs
- Change a part in master state while a job is loaded → reload job → job reflects the original data, not the change
- Delete a catalog item used in a job → reload job → job handles gracefully (no crash, clear error)
- Multiplier changes affect job quantities only — master part quantities unchanged

**Any writeback found = P0 bug, fixed before proceeding.**

---

## Phase 5 — Optimizer, 1D Lumber *(Both)*

Claude pre-analyzes the algorithm. You create synthetic projects and run each scenario.

| Test ID | Scenario | What to verify |
|---------|----------|---------------|
| L-01 | 1 part, exact length of 1 stock piece | Zero waste, no purchase |
| L-02 | 2 parts that together exactly fill 1 board (accounting for kerf) | 1 board used, kerf correctly deducted |
| L-03 | Part longer than all stock AND all catalog — impossible | Clear error, no crash |
| L-04 | Part longer than transport limit | Flagged or blocked with clear message |
| L-05 | All needed stock available, no catalog needed | Only stock used, shopping list empty |
| L-06 | No stock at all, buy everything from cheapest catalog source | Correct store, qty, cost |
| L-07 | Stock has scraps — scraps should be consumed first | Scraps appear first in cut diagram |
| L-08 | Mixed: stock covers some, catalog covers rest | Correct split shown |
| L-09 | Single part type, qty = 5 | Correct repetition in cut diagram |
| L-10 | Multiple materials and profiles in one job | Each handled independently |
| L-11 | Factory trim applied once per board — not twice | Math check on first cut |
| L-12 | Many small cuts on one board — kerf accumulates correctly | Running total verified |

---

## Phase 6 — Optimizer, 2D Sheets *(Both)*

| Test ID | Scenario | What to verify |
|---------|----------|---------------|
| S-01 | 1 part, exact dimensions of 1 sheet | Zero waste, no purchase |
| S-02 | 4 identical parts that tile perfectly on a sheet | Correct qty, correct layout |
| S-03 | Rip-first preference — horizontal panels | Correct cut sequence |
| S-04 | Cross-first preference — vertical panels | Correct cut sequence |
| S-05 | Auto mode — observe which orientation it chose | Should match longer dimension logic |
| S-06 | Grain direction enforced — part must not rotate | Grain constraint respected |
| S-07 | Near-square part — rotation should not matter | Both orientations give same waste |
| S-08 | Part wider than transport width limit | Error/flag |
| S-09 | Part longer than transport length limit | Error/flag |
| S-10 | Offcut above scrap threshold — becomes usable scrap | Appears in offcuts list |
| S-11 | Offcut below scrap threshold — treated as waste | NOT in offcuts list |
| S-12 | Multiple sheet sizes in catalog | Optimizer picks more cost-efficient size |
| S-13 | Known 2D benchmark problem | Repeat your previous manual validation |

---

## Phase 7 — Import Wizard *(You)*

Prepare these test CSV files:

| File | Scenario |
|------|----------|
| `happy_path.csv` | Clean SketchUp export, all columns present |
| `missing_cols.csv` | 2–3 expected columns absent |
| `wrong_delimiter.csv` | Semicolons or tabs instead of commas |
| `mixed_units.csv` | Dimensions in inches when app is in mm (or vice versa) |
| `empty.csv` | Header row only, zero data rows |
| `large.csv` | 100+ parts |
| `special_chars.csv` | Part names with quotes, commas, accented characters |

Per file: test Upload → Column mapping → Review → Commit.
Also test: cancel at step 2, cancel at step 3, import same file twice.

---

## Phase 8 — Results Views *(You)*

### Shopping List
- Grand total and subtitle appear in the correct language
- Per-store groupings correct (My Shop Stock always first, Sourcing Issues always last)
- Checkboxes mark items purchased and persist across reload
- Edit material button opens correct item
- Link icon opens correct URL in new tab
- Job with only fasteners (no cuttable parts): shopping list handles gracefully

### Analytics & Offcuts
- Waste percentages are plausible (cross-check with Phase 5/6 results)
- Offcuts list matches what the optimizer decided was above/below threshold
- Charts render correctly, no overlapping labels

### Cut Diagrams (Canvas)
- Diagrams render for lumber boards and sheet panels
- Color coding matches project assignment in a multi-project job
- Part labels readable at default zoom
- Zoom in/out, fullscreen, scroll on large diagrams
- Edge case: job with only fasteners — canvas shows appropriate empty state

### Print
- Shopping list, parts table, cut diagrams, labels — check in print preview
- No elements cut off at page edge
- Dark mode styles don't bleed into print output

---

## Phase 9 — i18n & Localization *(Both)*

### Key coverage
- Claude scans all JS template literals and HTML for any remaining hardcoded strings
- Verify `t('key')` never returns the key itself (missing translation fallback check) for all 6 languages

### Per-language smoke test (You — spot check each language)
Switch to each language and verify:
- Welcome tour renders fully translated
- All view labels, buttons, column headers translated
- Settings modal fully translated
- Toast messages translated
- Error messages translated

### Unit system rendering
- mm: dimensions shown as integers or 1 decimal
- Decimal inches: correct conversion and display
- Fractional inches: fractions render correctly (e.g. 1⅛")
- Unit labels update everywhere after switching (table headers, input labels, diagrams)

### Currency rendering
- Symbol appears in correct position for each currency
- Shopping list totals update immediately on currency change

### Layout stress test (You)
- Switch to French and Italian (longest labels) — check for text overflow, broken layouts, truncated buttons
- Check mobile tab bar in French/Italian — all tabs still reachable by swiping

---

## Phase 10 — Mobile UX *(You)*

Test on your Samsung Galaxy Tab S10 Ultra (Chrome) in both orientations, and in Chrome DevTools phone emulation (390px width) for the phone scenarios.

### Tab navigation
- All tabs in cutlist view reachable by swiping the tab bar
- Active tab indicator visible after swipe

### Mobile action bar
- Load job / Recalculate / Save Changes / Undo buttons appear at correct times
- Settings offcanvas opens and closes cleanly
- Offcanvas settings save correctly

### Cutlist results on mobile
- Shopping list readable and usable on phone width
- Cut diagrams render and are scrollable
- Analytics tab renders without overflow

### Cross-browser & resolution matrix

| Browser | Platform | Priority |
|---------|----------|----------|
| Chrome | Desktop Windows/Mac | P0 |
| Chrome | Android tablet (Tab S10 Ultra) | P0 |
| Safari | iPad (any model) | P0 |
| Safari | iPhone | P1 — cutlist section only |
| Edge | Windows Desktop | P1 |
| Firefox | Desktop | P2 |
| Chrome | iPhone | P2 — cutlist section only |
| Samsung Internet | Android | P3 |

| Category | Logical Resolution | Example Device |
|----------|--------------------|----------------|
| Desktop large | 1920×1080 | Standard monitor |
| Desktop small | 1366×768 | Older laptop |
| Desktop wide | 2560×1440 | Modern monitor |
| iPad Pro 12.9" | 1366×1024 | Power users |
| iPad Air 11" | 1180×820 | Common iPad |
| Galaxy Tab S10 Ultra | 1480×924 | Your dev device |
| Phone portrait | 390×844 | iPhone 14 / Pixel 7 |
| Phone landscape | 844×390 | Same, rotated |

---

## Phase 11 — Error Handling & Edge Cases *(Both)*

### Data edge cases
- Project with zero parts → run optimizer → clear message, no crash
- Job with multiplier = 0 → optimizer result is empty, not an error
- Part with dimension = 0 → validation blocks or flags it
- Catalog entry with price = 0 → optimizer picks it (free stock), shopping list shows €0.00
- All stock is scrap only, no full boards → handled gracefully

### Corrupt / missing state
- Manually delete a key from localStorage → app recovers without white-screening
- Corrupt JSON in localStorage → app resets cleanly with user message
- Import a CSV with 0 data rows → wizard shows clear empty state, no commit allowed

### Offline / localStorage
- Load app fully with wifi → turn wifi off → reload page: does app load from localStorage?
- Load app fully with wifi → turn wifi off → run optimizer: completes from local data?
- Load app fully with wifi → turn wifi off → edit a part: saves to localStorage?
- Start with wifi OFF → load app fresh: what does user see?
- Open app → edit data → turn wifi off → close tab → reopen: localStorage restores state?

**Offline strategy options (decide after diagnostic results):**

| Option | Description | Effort |
|--------|-------------|--------|
| A | "Prepare for store visit" button: saves full snapshot to localStorage before leaving | Low |
| B | localStorage-first boot: load local immediately, sync Sheets in background | Medium |
| C | Service Worker / PWA: full offline-first caching | High |

**Minimum advice to ship (regardless of option chosen):**
> Open the app before entering the store while you have wifi. Do not close the browser tab while in the store. Changes made offline will sync when wifi is restored.

---

## Phase 12 — End-to-End Integration *(Both)*

Full scenario simulating a real first-time user session:

1. Open fresh app (cleared state)
2. Complete welcome tour, set language to German, units to mm, currency to €
3. Add 2 materials, 3 profiles, catalog prices at 2 stores, 5 stock pieces
4. Create 2 projects with groups and parts (mixed lumber + sheet)
5. Run optimizer — verify shopping list and cut diagrams
6. Save as job
7. Reload page — verify job persists correctly
8. Load job, change a multiplier, recalculate — verify master state is unchanged
9. Import a CSV to a new project
10. Run optimizer including imported parts
11. Mark some shopping list items as purchased
12. Print shopping list
13. Switch language to French mid-session — verify all results views update

Repeat once on: desktop Chrome, iPad Safari, and Chrome DevTools phone emulation (cutlist section only).

---

## Phase 13 — Benchmarking vs. Competing Tools *(Both)*

**Goal:** Verify the optimizer produces reasonable, competitive results across realistic scenarios. Not about being "the best" on every metric — about being credible and defensible to paying customers.

### Reference tools

| Tool | Type | Notes |
|------|------|-------|
| CutList Plus | Desktop, paid | Industry standard for lumber + sheet |
| CutList Optimizer (cutlistoptimizer.com) | Web, freemium | Closest web competitor |
| Opticutter (opticutter.com) | Web | Strong 2D sheet focus |
| Manual calculation | Baseline | Sanity check for simple scenarios |

### Benchmark scenarios

| # | Scenario | Type | What to measure |
|---|----------|------|-----------------|
| B-01 | 10 parts, 1 lumber profile, 1 board size | 1D | Waste %, boards used |
| B-02 | 30 parts, mixed lengths, 1 lumber profile | 1D | Waste %, boards used |
| B-03 | 10 parts, 1 sheet size (plywood) | 2D | Waste %, sheets used |
| B-04 | 20 parts, mixed sizes, grain direction constraints | 2D | Waste %, sheets used |
| B-05 | Large job: 60+ parts, 3 profiles, 2 sheet sizes | Mixed | Waste %, total cost |
| B-06 | Edge case: one part nearly full-board size | 1D+2D | Correct fit, no crash |
| B-07 | Kerf sensitivity: run B-01 with 0mm, 3.2mm, 5mm kerf | 1D | Board count changes correctly |
| B-08 | Cut-in-store: transport length = 2400mm, part = 2350mm | 1D | Flagged correctly, competitors can't do this |

### Acceptance criteria
- Waste % within ~5 percentage points of best-in-class on B-01 through B-04
- No scenario where SolidCutlist uses significantly more boards/sheets than competitors
- Results are stable: re-running same input always produces same output

### SolidCutlist differentiators (not benchmarkable — document as selling points)
- **Cut-in-store / transport length constraint** — boards limited by what fits in a car; no competitor offers this
- **Multi-store shopping list** with per-item pricing and purchase tracking
- **Job-based workflow** with project groups, multipliers, and isolated sandboxes
- **Full i18n** in 6 languages — unique in this market
- **Web-based, no install** — runs on any device including tablet in the lumber store

---

## Recommended Execution Order

1. **Phase 1** — Claude does static analysis; you continue development in parallel
2. **Phase 4** — job isolation check (P0 risk, Claude-only, fast to run)
3. **Phase 5 & 6** — optimizer correctness, highest commercial risk
4. **Phase 13** — benchmarking, run alongside Phase 5 & 6 to compare results directly
5. **Phase 3** — CRUD cascade bugs before they corrupt test data
6. **Phase 2** — settings, persistence, onboarding polish
7. **Phase 7, 8, 9, 10** — UI/UX phases, can run roughly in parallel
8. **Phase 11** — error handling and offline strategy decision
9. **Phase 12** — final gate before ship
