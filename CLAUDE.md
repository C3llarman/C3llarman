# High Fantasy Football

A fantasy football league where your roster is a D&D party and you crawl a dungeon
instead of playing head-to-head. Everyone in a guild faces the same floors, so every
run is directly comparable.

`reference/hff-mobile-v5.html` is a working visual prototype. **Treat it as the design
spec.** Do not redesign it. Port its look, structure, and copy into the real app.

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

Every colour pair below was verified against WCAG 2.1 AA. **Re-verify with a contrast
calculation, not by eye, if you change any of them.**

```
--page  #E4D9BE   --card      #DCCFAF   --ink   #17120D
--rule  #7A2718   --live      #B00C26   (small text on light)
                  --live-dark #F72446   (on the near-black masthead)
--faint #635541   --hair      #7B715A   --gild  #6D541A   --mend #2A5735
```

Two reds are required: no single red passes on both the light page and the dark masthead.

- **Type:** EB Garamond (body) + Archivo Narrow (numerals, labels, headings).
  Both free via Google Fonts. Licensed type is the biggest available upgrade and has
  not been bought yet.
- **Look:** a D&D Monster Manual page crossed with an ESPN box score. Players are
  rendered as stat blocks; the six ability scores are combine numbers (the Hunter's
  DEX is separation, CTD is contested-catch rate). Tapered red-brown rules, drop caps,
  hand-drawn SVG filigree at the frame corners, seamless paper grain.
- **Hierarchy on a card:** class name, then **position · player · team** (position in
  red), then the creature-type line small and italic. The real player must be obvious.
- **Art:** `reference/assets/` — engraved ink PNGs, transparent, red-brown. These do
  NOT read below ~40px; the tab icons are separate hand-drawn line glyphs.

## Navigation

Mobile-first bottom tab bar. **v1 ships two tabs, Week and Tavern — Week is default**
(Sunday is when people open it).

- **Week** — this Sunday only: encounter, party row, arrivals, log, result.
- **Tavern** — the party, substitution, the Floor reveal banner, rules, conversion table.

**Dungeon and Guild are deferred, not cut.** Dungeon needs multi-week progression to
track — v1 only has one week of real data wired up, so "floors cleared / current /
revealed / sealed" has nothing to show yet. Guild needs authentication and shared state
— a leaderboard means nothing with one local party and no accounts. Both come back once
those exist.

When they do, **Week and Dungeon must stay split by time horizon** (event vs.
progression) or they duplicate each other — that constraint predates the two-tab v1 and
still holds for whenever Dungeon returns.

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

## Open questions — do not silently decide these

1. **Guild as leaderboard vs. rivalry.** Identical floors for everyone makes it a
   leaderboard, and leaderboards go stale by week 11 when the gap is unbridgeable.
   A weekly "who cleared this floor" comparison may be livelier than a season total.

## Naming / legal

"High Fantasy Football" has not been checked for prior use or trademark. The stat-block
layout and tapered red rules are closely associated with WotC — keep the resemblance at
"same genre," not pixel-matched, before this goes public. Real player names in a private
league among friends is different from a commercial product.
