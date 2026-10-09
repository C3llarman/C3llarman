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
  and a player who got hurt must look different on the card. HP never *becomes* damage,
  but it gates it: below half max HP a member is **Bloodied** and deals ×0.75; at 0 HP
  they are **Down** and deal nothing (a Down Mender heals nothing). Status is fixed for the
  week right after the floor's strike (see Season-progression rules), and is shown as a
  chip on the Week party row and on each Tavern card's iron strip.

Conversion rates (from the prototype, tune freely):

| Class | Reads | Rate |
|---|---|---|
| The Wall | Sacks allowed (team; shown, not scored) | soaks 40% of incoming party damage, flat |
| The Breaker | Sacks · TFL | 70 · 22 |
| The Tactician | Pass yds · TD | 0.55/yd · 45 |
| The Hunter | Rec yds · catch · TD | 1.1/yd · 6 · 60 |
| The Rogue | Rush yds · TD | 1.3/yd · 60 |
| The Mender | Made kicks | 14 dmg · 7 heal (max 9 to one member per drive) |

HP drain: the floor's weekly strike (d6 × floor id × 2, split six ways). Tactician −6 per
sack taken. Rogue −0.7 per carry. Wall absorbs 40% of every other member's hit first.

**XP comes from clearing rooms, not from points.** Fantasy points are already yards plus
TDs; granting XP for them pays twice for the same production and lets the best roster run
away with the season. Clean clear (nobody under half HP) pays more. **Not built yet:** XP is
never saved or spent, so the UI shows no XP number. The verdict and stat card say clean
clear vs wounded in words until XP actually does something.

**Only show a number if it's a mechanic.** No invented stats on screen: the old ability
scores, AC and Speed (cards and encounter) were removed because nothing read them. Trait
copy describes what `public/formulas.js` does; its numbers are read off `RATES`,
`resolveDrive` and `applyDrive` (`HP_FX` in `public/index.html`), not restated.

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

### Automation (decided)

`.github/workflows/refresh.yml` runs hourly on GitHub. It flattens the current week from
nflverse, runs `scripts/advance-week.mjs` (a no-op until the week's last game is 6h past
kickoff), and commits any change in `data/` to main, which Netlify deploys. It commits only
real changes, since the flatten script skips timestamp-only rewrites. Each run's summary
lists starters who are ruled out or haven't played all season
(`scripts/report-injuries.mjs`); who to bench stays a human call. It can be run by hand from
the Actions tab.

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
- **Black iron** = stats / game mechanics (HP + the class's real rates)

**Player card anatomy:** armour frame → pale identity plate (emblem overlapping the
upper-left, class name in small caps, **position · player · team** with position in red,
creature-type line italic, Kickoff / Projection) → black-iron strip (Hit Points, red bar,
then `mechCells()`: 2–4 cells with brass separators holding this class's real numbers on the
current floor: damage per stat off `RATES` scaled by the floor's mechanic, and its HP effect,
with HP costs in red; on the Horde Mother floor, her rules instead) → parchment (bold-italic red trait name,
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
  Encounter art per floor is `FLOOR_ART` in `public/index.html` (II Horde Mother,
  III Ash Rooks, IV Old Scaleback, V Keeper of Tides, VI Gnawing Choir, VII Warden); sources live in `reference/assets/`. Landscape art
  (wider than 1.25:1) gets the full-width `.plate.wide` treatment automatically.

## Navigation

Mobile-first bottom tab bar, **four tabs: Week, Tavern, Dungeon, Guild — Week is default**
(Sunday is when people open it). One continuous blackened-steel bar; the selected tab is
a red enamel inset with brass edging.

- **Week** — this Sunday only: a three-sentence "How this works" primer, then encounter,
  party row, arrivals, log, result. Once the week is done, a **Week in review** card
  (`#review`, `renderReview()`) sits under the stat card:
  damage by class as a share of the week (iron bars, numbers printed beside them), what the
  floor cost or gave (Swarm/Sentinel halving and doubling, Scaleback's armor, scales pried
  loose), one takeaway line read off those numbers, and party HP start → end with attrition
  and healing. All of it goes through `explainDamage()`; on Horde Mother weeks it shows first
  downs, turnovers, soldiers and hits instead. Only committed cards count.
  The primer (`#primer`, a `<details>`) is open until the
  viewer finishes a run or taps "Got it", then folds to a one-line toggle; the flag is
  `hff:primer` in localStorage (per-viewer convenience only: it ships open, so blocked
  storage just leaves it open). It stays general; per-floor rules belong elsewhere. Its link
  goes to the Tavern rules (`#rules`).
- **Tavern** — the party, substitution, the Floor reveal banner, rules, conversion table.
  "Rules of the Delve" is a numbered list of plain rules in the order a player needs them
  (party, damage, floor first, bench and lock, hits and heals, floor HP carryover, wounds and
  15% recovery with no death, the die, the Guild comparison), lore art after it. Every rule
  must be backed by `public/formulas.js` or a decided rule here — no XP claims, since XP
  isn't saved or used.

**What wins this floor.** One plain headline, on the Week tab's encounter block (above the
trait lines) and at the top of the Tavern, says what this floor rewards: Swarm/Sentinel
read each term's multiplier off `FLOOR_MECHANICS` ("Yards and catches count in full · TDs
and sacks count half — start volume players"), Plated names this week's armor, the Horde
Mother names its events and the three classes that make them. The Tavern's "How
production becomes damage" table is generated from `RATES` under the current floor:
base rate and this floor's rate per stat (changed ones in red, "half"/"double"), the
Wall's soak and the Mender's heal from `WALL_SOAK`/`MENDER_HEAL`/`HEAL_CAP`, and on the
Horde Mother her event table instead. Each class shows how much of its usual damage the
floor "keeps" (this party's starters' and bench players' games so far through
`explainDamage`), and is marked **favoured** when it keeps 3+ points more than the party
does as a whole (damage-weighted). `renderFloorGuide()` in `public/index.html` builds
all of it; no rate is written into the page.
- **Dungeon** — floor progression from `data/floors.json` + `data/season-state.json`:
  cleared / current / sealed.

- **Guild** — the other parties: last week's head-to-head + season standings, the
  campaign so far (small multiples, one bar per completed week per party), and rival
  lineups (their real six with saved bench swaps applied). **Each party locks at its own
  first kickoff**, so each rival is sealed separately until both that rival and the viewer
  have locked — nobody sees a lineup that could still change, or while their own could.

The Guild tab needs no accounts: every party in `data/parties.json` is replayed into
`data/season-state.json` (each party's `history`, one entry per completed week), so it's
the same static data for everyone; rival lineups read each party's week file plus its
`/api/subs`. Real guilds — sign-in, guild codes, joining, private leagues — are still
deferred until authentication exists (today a party's identity is just its URL). Live
Sunday progress of rivals is deliberately not shown (see Guild comparison below).

**Week, Dungeon and Guild must stay split** — Week is this Sunday (event), Dungeon is your
climb (progression), Guild is everyone else — or they duplicate each other.

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
  mechanic, maxHp, flavor) — seven floors seeded, `maxHp` scaled from real 2025
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

- **The floor strikes back (decided by the owner, 2026-10-09).** At the start of every
  week, after the 15% recovery (unchanged), the floor strikes the party once:
  total = d6 face × floor id (1–7) × 2, split evenly across the six (each share rounded).
  The Wall takes its own share; every other share goes through the Wall's 40% soak while
  the Wall has HP, exactly as attrition does (`applyDrive`). HP clamps at 0. The face is
  **seeded, not random**: `strikeFace()` hashes (season, week, floor id) with FNV-1a, so
  every party on that floor that week takes the same strike, it's shown on the Week tab
  before lineups lock (part of the floor reveal), and the replay reproduces it.
- **Bloodied / Down (decided by the owner, 2026-10-09).** Status is read once, from HP
  right after the strike, and fixed for the whole week (attrition and heals during the
  week move HP, not status), like the plated armor, so commit order never matters.
  Below half max HP: **Bloodied**, ×0.75 on that member's damage after the floor
  mechanic's scaling and before plated armor. 0 HP: **Down**, deals nothing, a Down
  Mender heals nothing, strips no scales. A Down member's own sacks/carries still cost
  HP (it's the game they played). On the Horde Mother a Down member's turnovers, first
  downs and TDs don't count, and Bloodied has no effect (whole events can't be scaled).
  HP belongs to the **slot**: a bench swap inherits the slot's HP and status (the replay
  tracks HP per slot and can't see swaps). Constants (`STRIKE_DIE`, `STRIKE_MULT`,
  `BLOODIED_AT`, `BLOODIED_FACTOR`) live in `public/formulas.js`, threaded through
  `resolveDrive`, `explainDamage`, `projectSlot`/`compareSlot`, `scaleStrips` and the
  Horde Mother sequence; `scripts/compute-season-state.mjs` applies the same strike and
  status and records each week's `strike` and any non-ok `status` in its history.
- **Plated floor (Floor IV, Old Scaleback — a bear armored like a pangolin).**
  `mechanic: "plated"`, with `scales` and `armorPerScale` on the floor in
  `data/floors.json`. Every drive loses `scales × armorPerScale` off the top (flat damage
  reduction, no swarm/sentinel scaling), so small drives glance off and a two-kick Mender
  deals nothing. Each TD (Tactician/Hunter/Rogue) or whole sack (Breaker) strips one
  scale, **effective next week**. Armor is fixed for the whole week, so commit order never
  matters and the live run matches the replay. Tuned to 8 scales × 8 and 1250 HP: against
  real 2026 weeks 1–3, all three parties take three weeks to clear it.
  Art: `public/assets/scaleback.webp` (cleaned from the supplied sheet). The scale counter
  icons (`scale-full`/`scale-cracked.webp`) are cut from one of its back spikes.

## Projections

Each player's projection is their own completed games this season (`form.lines`,
attached by the flatten script — never the projected week's own line) run through
`projectSlot()` in `public/formulas.js` under the current floor's mechanic, so the same
player can project higher on one floor than another. Shown as a mean plus the
low–high range and the number of games. No vendor projections and no matchup
adjustment. Injury tags come from nflverse's weekly injury report. Players on IR/PUP
drop off that report rather than being listed as Out, so "No games yet this season"
is what flags them.

Each bench option in the Tavern carries one line from `compareSlot()` in
`public/formulas.js`: its projection minus the current starter's **on this floor**
("−29 on this floor"), the term the gap comes from when one term alone explains it
("(pass yds)", labels from `RATES`), and a floor still ahead whose mechanic would reverse
the sign ("· +5 on a Sentinel floor"), claimed only when `projectSlot` under that mechanic
actually flips. Flips only consider Swarm and Sentinel (a plated floor's armor depends on
scales not yet known). A comparison resting on 1–2 games says "thin". On the Horde
Mother it compares first downs / TD / turnovers a game instead; the Wall, and slots that
can't touch the floor, get no line.

## The d20 (decided: theatre, not chance)

Not to be confused with the floor's **strike die** (a d6, see Season-progression rules):
that one *does* change numbers (party HP, and through Bloodied/Down, damage), but it is
seeded from (season, week, floor id) and shared by every party on that floor that week,
never rolled at the table. The d20 below never changes a number.

Each drive gets a d20 face from `rollFor()` in `public/formulas.js`. It **reads** the box
score and never changes a number, so the same stat line always lands on the same face.
Raw production (no floor scaling) vs the player's usual: their own earlier games this
season, pulled toward a class baseline as if it were 2 extra games, floored at 90% of the
baseline. Fixed ratio bands, plus a per-class "big game" ratio for the 20 (`ROLL_BIG`:
quarterback output barely swings, a pass rusher's is 0 or 2 sacks). 1 = zero production
with chances to make some. Against 2026 weeks 1–4: 8 natural 20s and 3 natural 1s in
61 games. Flavor text for each class and tier lives in `public/roll-copy.js`, picked
deterministically per player and week.

The reveal (`commit()` → `rollStage()` in `public/index.html`): tapping an arrived card
throws `public/assets/d20.webp` center-screen. It tumbles about 0.9s while random faces
flicker, then lands on the real face. A natural 20 gilds and bursts, a natural 1 goes gray,
cracks and shakes, and both buzz on Android. Then the unchanged commit math runs. Room HP
counts down while a gold trail catches up. The log, the party row and the stat card keep a
small die. Tap or Esc skips; reduced motion shows the face with no tumble or shake. The gilded and cracked dice are their own art (`d20-nat20.webp`, `d20-nat1.webp`), cut in
the same frame as `d20.webp` so the swap on landing doesn't jump. Sources are in
`reference/assets/`.
Die numbers are engraved numerals with a 1.5px black-iron outline (no backing disc). The
outline is what the contrast check measures them against. Every roll is captioned on the
stage (tier name plus "better than / about / well short of their usual game"). The
"How the die works" key under the party row and a Tavern rule explain that the die never
changes the damage.

## Receipts (show the working)

Every campaign-log line with a number, and every row of the end-of-week stat card, opens
(a `<details>` whose summary is the line itself) to show how the number was reached:
each stat × its rate, the floor's multiplier on the volume or big-play term, what a plated
floor's armor ate, then the total. All of it comes from `explainDamage()` in
`public/formulas.js`; index.html never knows a rate. The Wall shows what it soaked, the
Mender where its heal landed (applyDrive's real per-member split), the Horde Mother floor
shows turnovers → soldiers, first downs → soldiers cut down, and TDs that reached her or
were blocked (from `resolveHordeMotherWeekSequence`'s per-slot before/after state). A run
restored from a checkpoint replays soak/heal from the week's starting HP.

## Guild comparison (decided)

**Both, week first.** The Guild tab shows the last completed week's head-to-head
on top and season standings underneath — a pure season leaderboard goes stale by week 11
once the gap is unbridgeable; the weekly comparison resets every Sunday.

- Parties can be on different floors with different mechanics, so the weekly number is
  `progress`: that week's damage (or Horde Mother hits) as a share of the floor it was
  dealt to, **uncapped** — a week that finished off a sliver still counts what it hit for.
- Season standings: floors cleared, then how much of the current floor is left. Party HP
  only orders a true tie, and a tie shares its rank.
- Results appear once a week is final (the replay only runs on completed weeks), so a
  live Sunday run is never compared against someone else's.

## New-rules briefing

Seven floors share four rule sets (swarm, horde-mother, plated, sentinel). On the first
floor of a rule set the party hasn't fought under, the Week tab opens with a parchment
briefing above the encounter art (`renderBriefing()` in `public/index.html`). "Hasn't
fought under" = no *other* floor in the party's `season-state.json` history has that
mechanic, so Floor I counts and the briefing stays up for every week of that first floor.
It says what changed in plain sentences, then runs this party's own starters through
the old rules and the new ones: each starter's typical game (season averages, rounded,
so the line shown deals exactly the number beside it) through `explainDamage`, showing
the starter the new rules suit best and the one they hurt most. The comparison is the
last swarm/sentinel floor (plated armor is gone once the bear falls; Floor I compares
against face value). Horde Mother walks the Tactician, Hunter and Rogue through
`resolveHordeMotherDrive` instead. No games yet → a labelled example line, still through
formulas.js. "Got it" folds it to a one-line "New rules on this floor" button that
reopens it; folded state is per viewer in localStorage (`hff:brief:<party>:<mechanic>`),
and without storage it just starts open each load.

## Open questions — do not silently decide these

None open right now.

## Naming / legal

"High Fantasy Football" has not been checked for prior use or trademark. The stat-block
layout and tapered red rules are closely associated with WotC — keep the resemblance at
"same genre," not pixel-matched, before this goes public. Real player names in a private
league among friends is different from a commercial product.
