# SolidCutlist — Master Test Plan
**Version 1.0 | Created: 2026-04-12 | Status: Pending — features/fixes in progress before execution**

---

## How to resume this plan in a future Claude Code session
Tell Claude: *"Let's continue the SolidCutlist test plan. Read TEST_PLAN.md and the memory files, then pick up where we left off."*
Claude will read this file and the memory index at `~/.claude/projects/-home-user-woodbench/memory/MEMORY.md`.

---

## Phase Progress Tracker

| # | Phase | Owner | Status | Notes |
|---|-------|-------|--------|-------|
| 1 | Static Code Analysis | Claude | ⬜ Not started | |
| 2 | CRUD & Data Integrity | Both | ⬜ Not started | |
| 3 | Optimizer — 1D Lumber | Both | ⬜ Not started | |
| 4 | Optimizer — 2D Sheets | Both | ⬜ Not started | |
| 5 | Domain UI | You | ⬜ Not started | |
| 6 | Import Wizard | You | ⬜ Not started | |
| 7 | Canvas & Print | You | ⬜ Not started | |
| 8 | Cross-Browser & Resolution | You | ⬜ Not started | |
| 9 | Offline / localStorage | Both | ⬜ Not started | |
| 10 | End-to-End Integration | Both | ⬜ Not started | |

Update status to: ⬜ Not started / 🔄 In progress / ✅ Complete / ❌ Blocked

---

## Context & Constraints

- **App**: SolidCutlist — woodworking cut optimizer, Google Apps Script Web App + Google Sheets backend
- **Status**: Beta, never released. To be sold commercially as a GSheet with bound script (one-shot ship).
- **Dev setup**: Non-developer, vibe-coded with Gemini + Claude. Working on Samsung Galaxy Tab S10 Ultra, Chrome.
- **2D packing**: Gemini-proposed algorithm, approximate (not mathematically optimal), tested against known problems.
- **Jobs**: Fully isolated sandboxes. NOTHING writes back to master state. Any link from job → master state is a P0 bug.
- **Mobile scope**: Only the Cutlist results section (shopping list + cut diagrams) needs to be mobile-friendly.
- **Offline scenario**: Users inside lumber stores with no wifi. localStorage is the fallback. Offline strategy to be designed in Phase 9.

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

## Phase 2 — CRUD & Data Integrity *(Both)*

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

## Phase 3 — Optimizer, 1D Lumber *(Both)*

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

## Phase 4 — Optimizer, 2D Sheets *(Both)*

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

## Phase 5 — Domain UI *(You)*

**Projects view**
- Create project with no name → expect validation error
- Duplicate project name
- Cycle all status transitions (Design → Quoting → Ready → In Progress → Completed → back)
- Delete project with many parts

**Parts form**
- Submit empty form
- Enter qty = 0, qty = negative
- Enter very small and very large dimensions
- Switch category mid-entry
- Assign part to a group, then delete that group

**Setup — Catalog**
- Add entry with no store selected
- Delete a profile that has catalog entries
- Duplicate catalog entries

**Setup — Stock**
- Zero quantity
- Very large quantity
- Scrap flag toggle

**Settings**
- Switch display units (mm → dec inches → frac inches → back): do all existing values render correctly?
- Set kerf = 0
- Set kerf larger than a part dimension
- Set transport limits, then run optimizer

**Jobs**
- Create with no projects selected
- Load a job, set multiplier to 0
- Load a job, set multiplier to a decimal (e.g. 1.5)

---

## Phase 6 — Import Wizard *(You)*

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

## Phase 7 — Canvas & Print *(You)*

- Cut diagrams render for lumber boards and sheet panels
- Color coding matches project assignment in a multi-project job
- Part labels readable at default zoom
- Zoom in/out, fullscreen, scroll on large diagrams
- Print: shopping list, parts table, cut diagrams, labels — check in print preview
- Edge case: job with only fasteners (no cuttable parts) — what does canvas show?

---

## Phase 8 — Cross-Browser & Resolution *(You)*

### Browser Priority Matrix

| Browser | Platform | Priority |
|---------|----------|----------|
| Chrome | Desktop Windows/Mac | P0 |
| Chrome | Android tablet (your Tab S10 Ultra) | P0 |
| Safari | iPad (any model) | P0 |
| Safari | iPhone | P1 — cutlist section only |
| Edge | Windows Desktop | P1 |
| Firefox | Desktop | P2 |
| Chrome | iPhone | P2 — cutlist section only |
| Samsung Internet | Android tablet/phone | P3 |

### Resolution Matrix

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

> For phone resolutions: **test cutlist results section only**.

---

## Phase 9 — Offline / localStorage *(Both)*

### Diagnostic Tests (run first to understand current behavior)

| Test ID | Steps | What to observe |
|---------|-------|----------------|
| O-01 | Load app fully with wifi → turn wifi off → reload page | Does app load? Does data appear? |
| O-02 | Load app fully with wifi → turn wifi off → navigate views | Does navigation work offline? |
| O-03 | Load app fully with wifi → turn wifi off → run optimizer | Does it complete? Any errors? |
| O-04 | Load app fully with wifi → turn wifi off → edit a part | Saves to localStorage? Error shown? |
| O-05 | Start with wifi OFF → load app fresh | What does user see? Blank? Error? Fallback? |
| O-06 | Load app → edit data → turn wifi off → close tab → reopen tab | Does localStorage restore state? |

### Strategy Options (decide after diagnostic results)

**Option A — "Store Mode" button** *(simplest, lowest risk)*
A "Prepare for store visit" button that saves a complete snapshot to localStorage + shows a confirmation. User taps before leaving the shop. No architecture change.

**Option B — localStorage-first boot** *(medium effort)*
On app start: load localStorage immediately → render → try Sheets in background → update if successful. Works even with slow/no connection after first visit.

**Option C — Service Worker / PWA** *(highest effort)*
Full offline-first caching. Most robust but most complex; may conflict with GAS serving model.

### Minimum user advice to ship (regardless of option chosen)
> - Open the app before entering the store, while you still have wifi.
> - The app will remember your last data session.
> - Do not close the browser tab while in the store.
> - Changes made offline will sync when wifi is restored.

---

## Phase 10 — End-to-End Integration *(Both)*

Full scenario simulating a real first-time user session:

1. Open fresh app (cleared state)
2. Add 2 materials, 3 profiles, catalog prices at 2 stores, 5 stock pieces
3. Create 2 projects with groups and parts (mixed lumber + sheet)
4. Run optimizer — verify shopping list and cut diagrams
5. Save as job
6. Reload page — verify job persists correctly
7. Load job, change a multiplier, recalculate — verify master state is unchanged
8. Import a CSV to a new project
9. Run optimizer including imported parts
10. Print shopping list

Repeat once on: desktop Chrome, iPad Safari, and Android phone (cutlist section only).

---

## Recommended Execution Order

1. **Phase 1** — Claude does static analysis; you continue development
2. **Phase 3 & 4** — highest risk, easiest to build synthetic data for
3. **Phase 2** — catch cascade bugs before they corrupt test data
4. **Phase 5, 6, 7** — can run roughly in parallel, UI polish
5. **Phase 8** — cross-browser after features are stable
6. **Phase 9** — offline strategy design + decision
7. **Phase 10** — final gate before ship
