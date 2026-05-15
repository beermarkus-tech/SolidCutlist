# How the optimizer works

- **Lumber & profiles** — parts are packed longest-first onto boards, one part at a time.
- **Sheet goods** — multiple sort orders and cut directions are tried automatically; the layout with the fewest sheets and least waste wins.
- **Not globally optimal** — identical parts may not always be grouped together on a sheet; placements are chosen to minimise local waste, not to simplify your cut sequence.
- **To improve yield** — disable grain direction if not structurally required, and disable transport mode if sheet delivery is not a constraint. Both give the optimizer more placement freedom.
