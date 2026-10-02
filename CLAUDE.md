# High Fantasy Football

A fantasy football league where your roster is a D&D party and you crawl a dungeon
instead of playing head-to-head. Everyone in a guild faces the same floors, so every
run is directly comparable.

`reference/hff-mobile-v5.html` is the original visual prototype. Its structure, copy and
accessibility still hold, but its **look has been superseded by the iron reskin** (see
Design system below): a dark page with steel-framed cards, built from a cut asset kit.

---

## The six classes

One of each. No duplicates, no bench.

| Class | Position | Role |
|---|---|---|
| The Wall | Offensive Line (unit, not an individual) | Tank — absorbs damage |
| The Breaker | Edge Rusher / D-Line | Burst DPS |
| The Tactician | Quarterback | Damage + party buff |
| The Hunter | Wide Receiver | Steady volume damage |
| The Rogue | Running Back | High-variance damage |
| The Mender | Kicker | Healing |

## Core model

Three separate currencies. Keeping them separate is the whole design — do not collapse them.

- **Yards → damage.** The grind that chips a room down.
- **Touchdowns → critical hits.** Burst.
- **Hit points → wear and availability**, NOT production. A player who was shut down
  and a player who got hurt must look different on the card.

Conversion rates (from the prototype, tune freely):

| Class | Reads | Rate |
|---|---|---|
| The Wall | Pressure allowed | soaks 40% of incoming party damage |
| The Breaker | Sacks · TFL | 70 · 22 |
| The Tactician | Pass yds · TD | 0.55/yd · 45 |
| The Hunter | Rec yds · catch · TD | 1.1/yd · 6 · 60 |
| The Rogue | Rush yds · TD | 1.3/yd · 60 |
| The Mender | Made kicks | 14 dmg · 7 heal (max 9 to one member per drive) |

HP drain: Tactician −6 per sack taken. Rogue −0.7 per carry. Wall absorbs 40% first.

**XP comes from clearing rooms, not from points.** Fantasy points are already yards plus
TDs; granting XP for them pays twice for the same production and lets the best roster run
away with the season. Clean clear (nobody under half HP) pays more.

## Floor modifiers

The floor is revealed BEFORE lineups lock. This is the strategy layer — it should
sometimes be correct to start the lower projection.

- **Swarm floor:** single big plays halved, volume unreduced.
- **Sentinel floor:** volume halved, burst doubled.

---

## Architecture (target)

Netlify, connected to this repo.

- **Data:** nflverse weekly player stats (free, public, on GitHub — no API key).
  A build-time script flattens one season into compact per-week JSON committed as
  static files. **Play completed weeks, not live ones** — the season is over, every stat
  already exists. This removes live polling, rate limits, and mid-game state entirely.
- **"Next drive"** is a paced reveal of a result already computed, not a fetch.
- **Guild:** Netlify Blobs behind a serverless function. Guild code + party + result.
- **v1 scope:** no live draft. Each person picks six independently; duplicates allowed.
  A snake draft is real-time multiplayer and is most of the engineering — it does not
  test the thing worth testing (does reading the floor and setting a lineup feel good).

### Known data problem — do not paper over this

**O-line has almost no public box-score data.** Pancakes aren't tracked; pressure rate
allowed is behind PFF's paywall. Derive The Wall from what nflverse actually has —
team sack rate allowed, rushing yards before contact — and say so in the UI. Do not
invent a pressure stat.

---

## Design system

**The iron reskin.** Dark blackened-stone page; the cards are physical objects on it.
Material roles, keep them strict or the page turns to noise:

- **Red** = active / dangerous / important (selected tab, section pennants, HP, live)
- **Gold** = ornament / hierarchy (rules, labels, stat keys)
- **Steel** = interface structure (card frames, tab bar)
- **Parchment** = readable information (ability text, data notes)
- **Black iron** = stats / game mechanics (HP + the six ability scores)

**Player card anatomy:** armour frame → pale identity plate (emblem overlapping the
upper-left, class name in small caps, **position · player · team** with position in red,
creature-type line italic, AC / Speed / Kickoff / Projection) → black-iron strip (Hit
Points, red bar, six stats with brass separators) → parchment (bold-italic red trait name,
mechanics, then the NFL/data explanation smaller). Game numbers live on the iron, football
facts on the plates. `data-k` on each card is the hook for per-class ornaments (spikes for
the Breaker, filigree for the Tactician...) — use ornaments sparingly, as characterisation.

**No text baked into art.** Every name, number and label is HTML over the artwork.

**Assets:** the kit is `reference/assets/ui/kit-sheet.png` (one RGBA sheet, true alpha).
`scripts/cut-ui-kit.py` cuts it into `public/assets/ui/` — never hand-edit those outputs,
re-run the script (`pip install pillow numpy`). Frames are 9-slice `border-image`s
(corners fixed, rails stretch), never one finished frame image. The card frame is one
corner mirrored to all four (the sheet's four corners are painted differently), drawn on
`::after` above the plates with the emblem above that. Plates are 9-slice too: painted
rusty edges stay put, the centre is the texture under a flat tint. The tab-bar pieces
are stitched from the plain metal either side of the sheet's painted icons — icons and
labels stay HTML. Per-class ornaments hang off `.card[data-k=...] .plate-id::after`.
`reference/assets/ui/concept-sheet.png` (also true alpha) supplies the brass divider rod
(`.bar`) and the angular steel brackets (Rogue, Hunter); its finished frames bake the
shield and cloth into the corner, so they can't 9-slice and stay reference only.
`reference/assets/ui/button-sheet.png` supplies the plaque buttons (spiked caps 9-slice,
body stretches): **red = the primary action** (Roll for the week, bench "Start" chips),
**dark iron = everything else** (bench toggle, start over, disabled), plus the round
medallions behind guild ranks. Labels sit on plaque art the CSS can't tint (border-image
`fill` paints above backgrounds), so the cut script pre-darkens each plaque's label area
and measures it like any other ground. Buttons set `display:flex`, so `[hidden]` needs
its own `display:none` rule.

**Text never sits on raw texture.** Each textured surface gets a tint whose alpha lives in
`TINTS` in `scripts/cut-ui-kit.py` and must match the CSS. The script writes each tinted
surface's worst-case pixel to `public/assets/ui/grounds.json`, and the contrast check
tests every text colour against that — so it covers the texture, not a flat guess.

Colours are three token sets in `public/index.html`: `:root` (dark page), the light set
re-declared on `.block`/`.verdict`/`.statcard`/`.plate-id`/`.plate-lore`, and the iron set on
`.plate-iron`. Every pair is checked by **`node scripts/check-contrast.mjs`** — run it after
any colour change and keep its pair list in step with the tokens. Notable results: red
text needs a different value on each ground (`#FF6B7D` stone page, `#8E0A1E` light plates,
`#FF5A6E` iron, `#F72446` masthead); dim rows by colour, never `opacity` (opacity drops text
under 4.5:1).

- **Type:** Cinzel (class names, section pennants, tab labels) + EB Garamond (body) +
  Archivo Narrow (numerals, labels). All free via Google Fonts. Licensed type is still the biggest available upgrade.
- **Art:** `public/assets/` — the class emblems are full-colour painted crests; the
  encounter/tower engravings are red-brown ink and read fine on the dark page.

## Navigation

Mobile-first bottom tab bar, **three tabs: Week, Tavern, Dungeon — Week is default**
(Sunday is when people open it). One continuous blackened-steel bar; the selected tab is
a red enamel inset with brass edging.

- **Week** — this Sunday only: encounter, party row, arrivals, log, result.
- **Tavern** — the party, substitution, the guild view, the Floor reveal banner, rules,
  conversion table.
- **Dungeon** — floor progression from `data/floors.json` + `data/season-state.json`:
  cleared / current / sealed.

**The guild view lives in the Tavern** and needs no accounts: every party in
`data/parties.json` is replayed into `data/season-state.json` (each party's `history`, one
entry per completed week), so it's the same static data for everyone. A Guild *tab* —
guild codes, joining, shared live runs — is still deferred until authentication exists.

**Week and Dungeon must stay split by time horizon** (event vs. progression) or they
duplicate each other.

Accessibility already in the prototype, keep it: 56px targets,
`env(safe-area-inset-bottom)`, `tablist`/`tab`/`tabpanel` roles with arrow-key support,
`role="progressbar"` with live values on HP bars, `aria-live` on the log, visible focus
rings, `prefers-reduced-motion`.

---

## Season-progression rules (decided)

Resolved what used to be open questions #1 and #2 below, once multi-week floor
progression was actually scoped:

- **Off-week recovery: partial.** Each party member regains 15% of max HP per week,
  capped at max. Not a full heal (attrition still matters over a season), not zero
  (a single Mender's weekly heal isn't the only thing keeping a party alive).
- **A bad week costs a floor, never the party.** No permadeath. Party HP clamps at 0
  and the next week proceeds wounded, not ended.
- **Overkill doesn't carry to the next floor.** Clearing a floor with HP to spare
  doesn't splash into the next one — each floor starts at its own full `maxHp`. A
  party that one-shots a floor doesn't get a head start on one they haven't seen the
  reveal for yet.
- **Floor list and per-floor `maxHp` live in `data/floors.json`** (id, name, place,
  mechanic, maxHp, flavor) — six floors seeded, `maxHp` scaled from real 2025
  weeks 1–6 damage totals across all three parties (swarm-scaled `dmgFor`, n=18,
  mean ≈449, range 241–757), not guessed.
- **Swarm/Sentinel math is implemented, not just flavor text.** `dmgFor()` splits
  each class's damage into a volume term (yards, catches, TFL, made kicks) and a
  burst term (TDs, sacks), scaled independently by the active floor's `mechanic`:
  Swarm halves burst and leaves volume unreduced; Sentinel halves volume and
  doubles burst. Hunter and Mender have no burst term at all — matches their
  crit:false everywhere they're rolled.
- **Formulas live in one place, not duplicated.** When floor-HP/party-HP carryover
  across weeks is built (replaying committed weekly stat files against
  `data/floors.json`), it reads the same damage formulas `public/index.html` uses
  live — not a second copy that can drift out of sync with a tuning change.

## Projections

Each player's projection is their own completed games this season (`form.lines`,
attached by the flatten script — never the projected week's own line) run through
`projectSlot()` in `public/formulas.js` under the current floor's mechanic, so the same
player can project higher on one floor than another. Shown as a mean plus the
low–high range and the number of games. No vendor projections and no matchup
adjustment. Injury tags come from nflverse's weekly injury report. Players on IR/PUP
drop off that report rather than being listed as Out, so "No games yet this season"
is what flags them.

## Guild comparison (decided)

**Both, week first.** The Tavern's guild view shows the last completed week's head-to-head
on top and season standings underneath — a pure season leaderboard goes stale by week 11
once the gap is unbridgeable; the weekly comparison resets every Sunday.

- Parties can be on different floors with different mechanics, so the weekly number is
  `progress`: that week's damage (or Horde Mother hits) as a share of the floor it was
  dealt to, **uncapped** — a week that finished off a sliver still counts what it hit for.
- Season standings: floors cleared, then how much of the current floor is left. Party HP
  only orders a true tie, and a tie shares its rank.
- Results appear once a week is final (the replay only runs on completed weeks), so a
  live Sunday run is never compared against someone else's.

## Open questions — do not silently decide these

None open right now.

## Naming / legal

"High Fantasy Football" has not been checked for prior use or trademark. The stat-block
layout and tapered red rules are closely associated with WotC — keep the resemblance at
"same genre," not pixel-matched, before this goes public. Real player names in a private
league among friends is different from a commercial product.
