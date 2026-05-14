# SolidCutlist — Product Description

> Living document. Intended as a reference for marketing copy, Etsy/Gumroad listings, and advertising discussions. Placeholders marked **[TBD]**.
>
> **Brand:** Solid Homestead Plans — SolidCutlist is a product under this brand.

---

## What Is SolidCutlist?

SolidCutlist is a woodworking cut-list optimizer that lives inside Google Sheets. It takes the list of parts you need for your project and works out the most efficient way to cut them from your available stock — and tells you exactly what to buy if you don't have enough.

It handles both dimensional lumber (boards) and sheet goods (plywood, MDF, melamine). It shows you a visual cut diagram for every board and sheet, prints workshop labels you can stick directly onto your parts, and produces a clean shopping list so you walk into the lumber yard knowing exactly what you need.

It is a web app — you open it in your browser, straight from your Google Sheet. No installation, no desktop software, no subscription. One purchase, yours forever.

**One feature worth calling out early:** you can run a full recalculation on your phone while standing inside the lumber store. If the length you planned for is out of stock, or a different size is on sale, you change the numbers on the spot and the optimizer re-runs in seconds. Walk out with the right material, not an approximation.

---

## Who Is It For?

**Hobbyist and semi-professional woodworkers** who are tired of doing cut-lists on paper, in spreadsheets, or in their head — and who want something smarter without paying for expensive CAD or professional shop software.

SolidCutlist sits under the **Solid Homestead Plans** brand — tools built for people who prefer to build things themselves, work with their hands, and make smart use of what they have. The cut-list optimizer is the natural companion to anyone already working from plans: you have the design, now you need to know what to buy and how to cut it.

More specifically:

- The homesteader or self-builder who wants to make the most of every board
- The weekend woodworker building a bookshelf, a workbench, a cabinet, or a piece of furniture
- The maker who buys lumber and sheet goods from a home improvement store or local yard
- The small shop owner who wants a better way to quote jobs and plan material orders
- Anyone who has ever over-bought timber or wasted a good board on a bad cut sequence

SolidCutlist is designed to feel familiar — it runs in the browser, looks clean, and does not require any technical knowledge to use.

---

## What Does It Do — Feature by Feature

### 1. Library Setup

Before you run your first calculation, you tell SolidCutlist about your world:

**My Stock** — enter the lumber and sheet material you already have in your shop. For each piece: category (lumber or sheet), profile (e.g. 38×89 2×4, 18mm ply), material (pine, oak, MDF…), quantity, length — and for sheets, the grain direction. Mark cut-offs and scraps as "scrap" so the optimizer knows to use those up first.

**Store Prices** — build a catalog of what your local lumber yard sells, with prices. SolidCutlist uses this to tell you what to buy and estimate the cost of your project.

**Profiles & Materials** — define the exact lumber profiles and material types used in your workshop. These become the building blocks for everything else.

### 2. Projects and Parts

Organise your work into **projects** — a project is a build (e.g. "Garden bench", "Kitchen drawer unit"). Inside each project, you define the **parts** you need: name, profile, material, and the dimensions required.

Parts can be imported via the **Import Wizard**. The wizard accepts a CSV file and walks you through mapping the columns to the right fields. The most natural source is **SketchUp** with the CutList plugin, which exports your 3D model's parts directly to CSV — making SolidCutlist the natural next step after drawing your design. Any other tool that can export a parts list to CSV works equally well.

### 3. The Optimizer

This is the heart of the app. Click **Calculate** and SolidCutlist solves the cutting puzzle.

**Two-stage strategy:**
1. First, it uses your shop stock — clearing out your offcuts and existing inventory before buying anything new
2. Then, it draws from your store catalog to fill what's missing

**For lumber (1D packing):** Greedy best-fit algorithm assigns parts to boards, respecting blade kerf, factory edge trim, and your minimum offcut threshold. Remaining offcuts above your threshold are kept as usable stock.

**For sheets (2D packing):** Guillotine-cut algorithm packs parts onto sheet goods in two passes — rip cuts first, then cross cuts (or vice versa, configurable). The packer respects grain direction, blade kerf, sheet edge trim, and your minimum usable offcut dimensions.

**Transport mode:** If your car or van can't take a full-length board, enable transport mode. Set a maximum length and the app will calculate where to cross-cut boards for transport, showing the glue-up points on the diagram.

**Settings you control:**
- Blade kerf — separately for lumber and sheet goods
- Factory edge trim — separately for lumber and sheets (the amount cut off the factory edge before the first real cut)
- Minimum offcut length (lumber) — anything shorter is counted as waste, not reusable stock
- Minimum offcut dimensions (sheets) — a sheet remnant below this size is counted as scrap
- Transport max length and margin (lumber and sheet, independently)

### 4. Results — What You Get Back

After calculation, four result views are available:

**Shopping List** — a clean, itemised list of what to buy: which profile and material, how many pieces of what length, from which store, at what estimated cost. Designed to be screenshot-able and taken straight to the lumber yard — or viewed on your phone while you're in the store.

**Analytics / KPIs** — a dashboard of key numbers:
- Total boards and sheets used (stock vs. newly purchased)
- Total cut count broken down by rip cuts, cross cuts, and edge trim cuts — for both lumber and sheets
- Total cut length (m or ft) — useful for estimating blade wear and machine time
- Material yield — how much of each board is useful parts vs. kerf vs. waste
- Total estimated cost

**Cut Diagrams (Canvas)** — a visual, colour-coded diagram of every board and every sheet showing exactly where each part sits, where the kerfs are, and what offcut remains. Parts are labelled. Hover or tap for details. For sheets, the 2D layout is shown to scale.

**Usable Offcuts** — a table of every offcut that meets your minimum reusable threshold, with dimensions floored to whole millimetres or the nearest 1/16 inch — no misleading decimal precision. Any offcut can be **committed back to your stock** in one click, with quantity control. The loop is closed: run a job, cut your parts, then push the leftovers back into your inventory so they show up in the next job.

### 5. Labels

Print workshop labels directly from the app — no extra software needed. Two label types:

**Part Label** — sticks onto a cut part in the workshop. Shows the part name, project, dimensions (in your chosen units), and material. Dimensions automatically shrink to fit if you're working in fractional inches and the text gets long.

**Store / Shopping Label** — identifies a raw material piece after the store has made transport cuts. When a board is too long to fit in your car, the lumber yard can cross-cut it for you before you load it. The store label goes on each resulting piece so you know exactly what it is, what length it was cut to, and which project it belongs to — preventing mix-ups between similar-looking boards.

Labels open in a print-ready browser window. Print to any printer or save as PDF.

### 6. Quality-of-Life Details

Small things that add up:

- **Toggle input forms** — every view has a one-click button to hide the input panel and give the table or results more screen space. Hit it again to bring the form back.
- **Compress large tables** — the Stock and Store Prices tables have a compact/expand toggle for when your inventory list gets long and you just want to scroll quickly.
- **Print your parts list** — print the full parts list for the current project directly from the Projects view. Also available inside the optimizer for the job's parts.
- **Print the shopping list or cut diagrams** — individual print buttons for the shopping list and the cut diagram panel, separately, so you only print what you need.
- **Projects in card or table view** — switch between a visual card layout (with project status badges) and a compact sortable table, whichever suits how you like to work.
- **Expand / collapse all cut detail tables** — in the cut diagrams view, collapse all the per-board detail tables at once, or expand them all.
- **Sort and filter everywhere** — every table (stock, catalog, parts, projects) supports column sorting and column filters. Find the 18mm oak pieces in your inventory in two clicks.
- **Recalculate on mobile** — while in the cutlist view on a phone, a sticky action bar at the bottom gives you Recalculate, Settings, Save, and Undo — all within thumb reach.

### 7. Settings & Preferences

Everything is configurable:

| Setting | Options |
|---------|---------|
| Display units | Millimetres, decimal inches, fractional inches (1/16") |
| Language | English, German, French, Spanish, Portuguese, Italian |
| Currency | $ USD, € EUR, £ GBP |
| Dark mode | On / Off |
| Blade kerf | Separate for lumber and sheets |
| Factory edge trim | Separate for lumber and sheets |
| Offcut thresholds | Min length (lumber), min width + length (sheets) |
| Transport mode | Max length and cut margin, per material type |

All settings are saved to your Google Sheet and persist across sessions.

### 8. Onboarding

New users are greeted by a **Welcome Tour** that walks them through the five setup steps. Language, units, and currency are selected on the first screen — so the app immediately feels local. A **Getting Started checklist** tracks progress until the user has completed their first calculation.

### 9. Mobile Optimisation

The results section (Shopping List, Cut Diagrams, Offcuts) is fully optimised for use on a phone or tablet. Designed for the woodworker standing in a lumber yard, with no wifi, looking at their shopping list on a phone. Data is cached locally so the app works even offline.

---

## How It Will Be Shipped

SolidCutlist is sold as a **Google Sheet** with a bound Google Apps Script. The buyer receives a link to make a copy of the sheet — one click creates their own private copy. All their data lives in their own Google account; the developer has no access to it.

**Brand:** Solid Homestead Plans

**Platform:** Etsy (primary launch). Gumroad may follow.

**Price:** 49€ - one time purchase

**What the buyer gets:**
- Their own private copy of the Google Sheet
- The full app, running in their browser from that sheet
- Data saved permanently in their own Google Drive
- No recurring fees, no account to create, no software to install

**What they need:**
- A free Google account (Gmail is enough)
- A modern browser (Chrome recommended)
- No programming knowledge whatsoever

---

## The OAuth Hurdle — and How We Handle It

This is the one friction point in the purchase journey, and it needs to be addressed head-on.

### What Happens

The first time a buyer opens their copy of the sheet and launches the app, Google displays an **authorisation screen**. It explains that the script wants permission to run on their behalf — specifically, to read and write to their own Google Sheet.

This is unavoidable: the app uses Google Sheets as its database, and it needs permission to write data back to the sheet that belongs to the user.

**The problem:** Because SolidCutlist is not (yet) listed in the Google Workspace Marketplace, Google currently shows an "unverified app" warning. The user has to click **"Advanced"** and then **"Go to [app name] (unsafe)"** before the app will run. The word "unsafe" is alarming and does not reflect reality — it simply means Google has not reviewed the app.

### Why It Asks

The app runs **as the user**, not as the developer. This is intentional and is actually safer for the buyer — it means their data stays in their own Google account and the developer cannot access it. The trade-off is that Google requires explicit consent.

**Permissions requested:**
- Read and write to the connected Google Sheet (the user's own data store)
- Nothing else — no access to Drive files, email, contacts, or any other Google service

### How We Will Smooth This

**1. Clear pre-purchase instructions**
The product listing will include a plain-language explanation of the authorisation step, with screenshots, before the buyer even clicks buy. Setting expectations early removes the surprise.

**2. A step-by-step setup guide**
Included with the purchase: a short PDF or linked page that walks through the authorisation screen with annotated screenshots. "When you see this screen, click Advanced, then click 'Go to SolidCutlist'. This is safe — Google shows this warning for any script that hasn't been through their formal review process. Your data never leaves your own Google account."

**3. Transparency about what the app accesses**
The listing will clearly state: "This app only ever reads and writes to your own Google Sheet. It does not access your Drive, your email, your contacts, or anything else. Your data belongs to you."

**4. Google Workspace Marketplace (longer term)**
Publishing on the Workspace Marketplace removes the "unsafe" warning and replaces it with a clean branded consent screen showing a verified app icon. This is the long-term solution. It requires a one-time Google review process and a small annual fee, but it dramatically improves buyer confidence. Worth pursuing once the app has its first paying customers and the product is stable.

**5. Social proof**
Once early buyers are happy, customer reviews and screenshots of the finished product in use will do more to build trust than any technical explanation. Etsy reviews in particular carry weight.

---

## Summary — The Pitch in One Paragraph

SolidCutlist is the cut-list tool that woodworkers actually want: no CAD skills required, no subscription, no software to install. You open it in your browser, enter your parts, and it works out the most efficient way to cut them from your stock — taking into account your blade kerf, your edge trim, your minimum offcut size, and whether your boards will even fit in your car. It speaks your units (mm or inches), your language (English, German, French, Spanish, Portuguese, or Italian), and your currency. It prints labels for your parts. It tells you exactly what to buy. It is a Google Sheet that does the thinking for you.

---

*Document version: 2026-04-26. Written for marketing handoff.*
