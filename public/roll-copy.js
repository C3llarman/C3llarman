// Flavor lines for each class at each d20 tier (rollTier() in formulas.js).
// Presentation only - nothing here changes a number. Edit freely; a lore
// master's rewrite of any line is welcome. Two or more lines per tier so a
// party doesn't read the same sentence every week. pickRollLine() chooses
// one deterministically (same player + same week = same line on every
// reload and device), never at random.
//
// {who} is replaced with the player's short name (or the team, for the Wall).

export const ROLL_COPY = {
  tactician: {
    nat20:  ['{who} sees the whole field at once. Every throw lands where the party needed it.',
             'The commands ring out and the dungeon itself seems to obey. {who} is untouchable.'],
    strong: ['{who} marks the targets and the party swings true.',
             'Clean reads, clean throws. {who} keeps the party moving.'],
    par:    ['{who} manages the game. Nothing more, nothing less.',
             'A workmanlike day from {who}. The party advances, slowly.'],
    weak:   ['{who} squints into the dark and throws to where someone used to be.',
             'Hesitation. {who} holds the ball too long and the moment passes.'],
    nat1:   ['{who} fumbles the orders. The party scatters in four directions.',
             'Nothing connects. {who} walks off the field to silence.'],
  },
  hunter: {
    nat20:  ['Every arrow finds a throat. {who} cannot be covered today.',
             '{who} disappears into the dark and reappears in the end zone. Again.'],
    strong: ['{who} works open and the volleys keep coming.',
             'Steady, deadly. {who} picks the floor apart one catch at a time.'],
    par:    ['{who} draws the bow a few times. A few land.',
             'An ordinary hunt for {who}. Enough to feed the party, not to feast.'],
    weak:   ['The arrows clatter off the stone. {who} never really gets free.',
             '{who} is blanketed all afternoon. A shot here, a shot there, mostly air.'],
    nat1:   ['{who} never looses a single arrow. The quiver comes back full.',
             'Shadowed from the first whistle. {who} may as well have stayed in the tavern.'],
  },
  rogue: {
    nat20:  ['{who} slips through a gap that was never there and is gone before the blade falls.',
             'The floor opens and {who} runs through all of it. Untouchable.'],
    strong: ['{who} finds the seams and cuts deep.',
             'Quick hands, quicker feet. {who} leaves a trail of bodies.'],
    par:    ['{who} grinds out what the line gives. No more.',
             'Short gains, honest work. {who} keeps the chains moving.'],
    weak:   ['{who} runs into a wall of bodies, over and over.',
             'Every gap closes a step before {who} reaches it.'],
    nat1:   ['{who} is caught before the first step. The daggers stay sheathed.',
             'Nothing. {who} is swallowed whole by the line.'],
  },
  breaker: {
    nat20:  ['{who} comes through the line like a battering ram and does not stop.',
             'The pocket collapses. {who} is standing over the quarterback before the snap echoes.'],
    strong: ['{who} breaks through and the backfield pays for it.',
             'Heavy blows land. {who} makes the enemy line regret the day.'],
    par:    ['{who} pushes and pushes. The line bends, but holds.',
             'A day of hand-fighting. {who} wins some, loses some.'],
    weak:   ['{who} swings at shadows. The ball is always gone.',
             'Double-teamed and smothered. {who} barely gets a hand on anyone.'],
    nat1:   ['{who} swings at nothing. The swarm doesn\'t even notice.',
             'Not a sack, not a stop. {who} might as well be a statue in the trenches.'],
  },
  mender: {
    nat20:  ['{who} never misses. Every kick is a blessing on the party.',
             'From any distance, through any wind. {who} is perfect, and the party feels it.'],
    strong: ['{who} splits the uprights and the wounds close.',
             'Reliable as prayer. {who} keeps the party on its feet.'],
    par:    ['A kick or two from {who}. The party takes what it can get.',
             '{who} does the job. The bandages hold.'],
    weak:   ['{who} gets few chances and makes little of them.',
             'The ball wobbles. {who}\'s blessings come thin today.'],
    nat1:   ['Wide. Wide again. {who}\'s blessings fall on stone.',
             '{who} misses everything. The wounded stay wounded.'],
  },
  wall: {
    nat20:  ['Not a single defender gets through. {who} is a fortress.',
             'The pocket is a cathedral. {who} gives the party all the time in the world.'],
    strong: ['{who} holds the line. The party fights in peace.',
             'Firm footing behind {who}. Barely a scratch gets through.'],
    par:    ['{who} bends, but mostly holds.',
             'A few hits get through {who}. Nothing the party can\'t take.'],
    weak:   ['{who} leaks all day. The party fights with one eye over its shoulder.',
             'Cracks in the wall. Defenders keep finding a way past {who}.'],
    nat1:   ['The wall comes down. {who} is overrun again and again.',
             '{who} collapses. The party is hit from every side.'],
  },
};

// FNV-1a over a short string: stable across browsers and Node, no deps.
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function pickRollLine(slot, tier, who, seed) {
  const lines = ROLL_COPY[slot]?.[tier];
  if (!lines || !lines.length) return '';
  return lines[hash(`${seed}|${who}|${tier}`) % lines.length].replaceAll('{who}', who);
}
