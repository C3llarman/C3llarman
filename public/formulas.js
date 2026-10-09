// Damage/HP math shared between the live app (public/index.html) and the
// build-time season-state script (scripts/compute-season-state.mjs) - one
// place for these formulas, not two copies that can drift out of sync
// with a tuning change (CLAUDE.md: "Formulas live in one place, not
// duplicated"). A real ES module on purpose, loaded by <script
// type="module"> in the browser and by `import` in Node - not a classic
// script + a hand-copied Node port.

// The one number off index.html's FLAVOR sheet (art, class names,
// traits) that a formula actually needs - canonical here, FLAVOR.max
// reads from it, not the other way around.
export const MAX_HP = { wall:74, breaker:44, tactician:52, hunter:48, rogue:46, mender:36 };

// Canonical party order - matches buildParty()'s slot order and the
// order a Mender's heal pool distributes in. Not ARRIVAL_ORDER, which is
// drive-reveal order, not heal-distribution order.
export const SLOT_ORDER = ['wall','breaker','tactician','hunter','rogue','mender'];

// volume/burst split per class (CLAUDE.md conversion table) - a floor's
// mechanic scales these two terms independently (see FLOOR_MECHANICS
// below). Hunter's burst rate matches Rogue's (60/TD) - a receiving TD
// and a rushing TD score the same in standard fantasy scoring (6pts),
// unlike a passing TD (Tactician, usually 4pts, rate 45) - so Hunter
// isn't pure volume after all, just steadier than Rogue's yardage-driven
// variance. Mender still has no burst term - a made kick has no
// explosive-play concept to isolate. Wall stays 0/0 - no O-line dmg
// formula exists (CLAUDE.md's known data problem).
// The conversion table itself - the one place a rate lives. Each row is
// [term, stat field, label, rate]; a term's value is round(stat * rate),
// so yardage rounds per stat exactly as it always has. dmgParts and
// explainDamage both read this, so a breakdown shown to the player can
// never disagree with the damage actually dealt.
export const RATES={
  tactician:[['volume','y','pass yds',0.55],['burst','td','TD',45]],
  hunter:[['volume','y','rec yds',1.1],['volume','c','catches',6],['burst','td','TD',60]],
  rogue:[['volume','y','rush yds',1.3],['burst','td','TD',60]],
  breaker:[['volume','tfl','TFL',22],['burst','sk','sacks',70]],
  mender:[['volume','fg','made kicks',14]],
  wall:[],
};
function rateTerms(k,r){
  return (RATES[k]||[]).map(([term,field,label,rate])=>{
    const n=r[field]||0;
    return {term,field,label,n,rate,value:Math.round(n*rate)};
  });
}
export function dmgParts(k,r){
  let volume=0,burst=0;
  for(const t of rateTerms(k,r)){ if(t.term==='volume')volume+=t.value; else burst+=t.value; }
  return {volume,burst};
}
// Floor modifiers (CLAUDE.md): Swarm halves the big-play term and leaves
// volume unreduced; Sentinel halves volume and doubles burst. Defaults
// to 'swarm' - Floor I, the only floor wired into live gameplay.
export const FLOOR_MECHANICS={
  swarm:{vol:1,burst:0.5},
  sentinel:{vol:0.5,burst:2},
  // Plated floors (the scaled bear) don't rescale volume vs burst at all -
  // they take a flat bite out of every drive instead (plateArmor below).
  plated:{vol:1,burst:1},
};

// Plated floor - a beast armored in overlapping scales, like a pangolin.
// Damage reduction, D&D-style: every drive loses a flat `armor` off the
// top before it reaches the room's HP, so a spread of small drives
// (a 2-kick Mender, a quiet pass rusher) glances off entirely and only
// a big single performance gets through. Crits crack the armor: each
// touchdown (Tactician/Hunter/Rogue) or sack (Breaker) strips one scale.
// A cracked scale falls away BEFORE NEXT WEEK, not mid-week - armor is
// fixed for the whole week at whatever the scales were when it started,
// so the result never depends on the order cards get committed in, and
// the live run and the season replay always agree. Scale count and
// armor per scale live on the floor in data/floors.json.
export function plateArmor(floor, scales){
  return Math.max(0, scales) * (floor.armorPerScale || 0);
}
export function scaleStrips(slot, r){
  if(slot==='tactician'||slot==='hunter'||slot==='rogue') return r.td||0;
  // whole sacks only - a split sack doesn't pry a scale loose
  if(slot==='breaker') return Math.floor(r.sk||0);
  return 0;
}
export function dmgFor(k,r,mechanic='swarm'){
  const {volume,burst}=dmgParts(k,r);
  const m=FLOOR_MECHANICS[mechanic]||{vol:1,burst:1};
  return Math.round(volume*m.vol+burst*m.burst);
}

// The receipt for one drive: every stat that dealt damage, the floor's
// multiplier on each term, and what a plated floor's armor ate - for the
// UI to show the working ("146 rush yds x 1.3 = 190 ...") rather than a
// bare number. Same arithmetic as dmgFor/resolveDrive by construction:
// raw === dmgFor(k,r,mechanic) and dmg === resolveDrive(...).dmg.
// Horde Mother isn't damage at all - see hordeEvents for that floor.
export function explainDamage(k,r,mechanic='swarm',armor=0){
  const m=FLOOR_MECHANICS[mechanic]||{vol:1,burst:1};
  const terms=rateTerms(k,r).map(t=>({...t,mult:t.term==='volume'?m.vol:m.burst}));
  const {volume,burst}=dmgParts(k,r);
  const raw=Math.round(volume*m.vol+burst*m.burst);
  const dmg=Math.max(0,raw-armor);
  return {terms,volume,burst,volMult:m.vol,burstMult:m.burst,raw,armor:raw-dmg,dmg};
}

// The numeric half of one slot's drive - room damage, whether it crits,
// and what it costs the party (take, before the Wall's soak; or heal for
// the Mender). Flavor text lives with the caller (index.html's `drives`)
// since it's presentation, not a formula.
// `armor` is a plated floor's flat per-drive reduction (0 everywhere
// else); `blocked` is how much of the drive it ate.
export function resolveDrive(slot, r, mechanic='swarm', armor=0){
  const raw = dmgFor(slot, r, mechanic);
  const dmg = Math.max(0, raw - armor);
  const blocked = raw - dmg;
  switch(slot){
    case 'wall': return {dmg,blocked,crit:false,take:0};
    case 'tactician': return {dmg,blocked,crit:r.td>=1,take:r.sk*6};
    case 'hunter': return {dmg,blocked,crit:r.td>=1,take:0};
    case 'rogue': return {dmg,blocked,crit:r.td>=1,take:Math.round(r.car*0.7)};
    case 'breaker': return {dmg,blocked,crit:r.sk>=1,take:0};
    case 'mender': return {dmg,blocked,crit:false,heal:r.fg*7,miss:r.att-r.fg};
    default: return {dmg,blocked,crit:false,take:0};
  }
}

// Applies one resolved drive to room HP and party HP - the Wall soaks
// 40% of a `take` first, a Mender's heal pool distributes up to 9 per
// member in SLOT_ORDER, every hp clamps at 0. Pure: takes a hp map, hands
// back a new one, mutates nothing - so a live commit() (called once per
// tap) and a build-time replay (called once per slot in a fixed order)
// run exactly the same arithmetic.
export function applyDrive(hp, roomHp, slot, result){
  const next={...hp};
  roomHp-=result.dmg;
  if(result.heal){
    let pool=result.heal;
    for(const k of SLOT_ORDER){
      if(pool<=0)break;
      if(next[k]<MAX_HP[k]){
        const g=Math.min(pool,MAX_HP[k]-next[k],9);
        next[k]+=g;pool-=g;
      }
    }
  }
  // soak returned too - callers (the live log line, a season-state
  // summary) need "the Wall absorbed N" without recomputing it.
  let soak=0;
  if(result.take){
    soak=Math.min(next.wall,Math.round(result.take*0.4));
    next.wall-=soak;
    next[slot]-=(result.take-soak);
  }
  for(const k of SLOT_ORDER) if(next[k]<0) next[k]=0;
  return {hp:next, roomHp, soak};
}

// Season-progression rules (CLAUDE.md, decided): each party member
// regains 15% of max HP between weeks, capped at max - partial recovery
// (attrition still matters over a season), not zero (a single Mender's
// weekly heal isn't the only thing keeping a party alive).
export function regenHp(hp, pct=0.15){
  const next={...hp};
  for(const k of SLOT_ORDER) next[k]=Math.min(MAX_HP[k], next[k]+Math.round(MAX_HP[k]*pct));
  return next;
}

// Floor II - The Horde Mother: a shielded boss, not a yards/TD damage
// pool like Floor I's swarm/sentinel math. A turnover births a soldier;
// a first down kills one; a touchdown only reaches the Horde Mother
// herself once no soldiers are standing between the party and her.
// Only tactician/rogue/hunter generate any of these three events - the
// three roles who can carry the ball, throw a turnover, or convert a
// down. Wall and Mender have no turnover/first-down/touchdown of their
// own to contribute to this fight.
export const HORDE_MOTHER_MAX_HP = 3;

// A turnover, from whichever of the two ways these three slots can
// commit one - thrown (Tactician) or lost on a fumble (any of the
// three).
function bossTurnovers(r){ return (r.int||0) + (r.fumblesLost||0); }

// Known data-granularity gap, same spirit as the Wall's documented one
// (CLAUDE.md): nflverse credits a single completed pass's first down to
// BOTH the passer and the targeted receiver, so summing Tactician's
// passing_first_downs and Hunter's receiving_first_downs can occasionally
// double-count one real conversion as two dead soldiers when that
// specific completion went to this roster's Hunter. Not fixable without
// play-by-play data, which this app deliberately doesn't use anywhere -
// noted, not hidden, and coarse enough (killing an extra soldier that
// was going to die anyway, most weeks) not to change who clears the
// floor.
//
// Resolves the week in the order it actually happened: each drive's own
// turnovers and first downs, then its touchdowns against the soldiers
// standing at that moment (resolveHordeMotherDrive), walked in kickoff
// order. Same-game ties go Tactician, Hunter, Rogue - weekly totals
// can't say which play came first inside one game.
//
// The live page applies these same per-slot effects whatever order the
// cards get tapped in, so the live run and the season replay always
// land on the same soldiers and hits. Later games never change an
// earlier drive's effect, so a week that's still being played resolves
// the same way it will when it's final.
const HORDE_SLOTS_ORDER=['tactician','hunter','rogue'];
export function resolveHordeMotherWeekSequence(startState, weekReal){
  const ko=s=>Date.parse(weekReal[s].kickoff)||0;
  const order=HORDE_SLOTS_ORDER.filter(s=>weekReal[s]&&weekReal[s].hasStats)
    .sort((a,b)=>ko(a)-ko(b)||HORDE_SLOTS_ORDER.indexOf(a)-HORDE_SLOTS_ORDER.indexOf(b));
  let state={soldiers:startState.soldiers,bossHp:startState.bossHp};
  const perSlot={};
  for(const s of order){
    const d=resolveHordeMotherDrive(state,weekReal[s]);
    // before/after ride along so the UI's receipt can say WHY a touchdown
    // was blocked (soldiers still standing) or fell short (she ran out of hits)
    perSlot[s]={bornSoldiers:d.bornSoldiers,killedSoldiers:d.killedSoldiers,bossDamage:d.bossDamage,
      soldiersBefore:state.soldiers,bossHpBefore:state.bossHp,soldiers:d.soldiers,bossHp:d.bossHp};
    state={soldiers:d.soldiers,bossHp:d.bossHp};
  }
  return {perSlot,soldiers:state.soldiers,bossHp:state.bossHp,defeated:state.bossHp<=0};
}
export function resolveHordeMotherWeek(startState, weekReal){
  const {soldiers,bossHp,defeated}=resolveHordeMotherWeekSequence(startState, weekReal);
  return {soldiers,bossHp,defeated};
}

// Per-commit version for live play, where a real tap order exists (the
// order the party's cards get committed) - unlike the weekly replay
// above, which has no real order to respect and nets the whole week at
// once for exactly that reason. Resolves ONE slot's drive against the
// state as it stands at that moment: its own turnovers/first-downs
// update the soldier count first, then its own touchdowns are checked
// against the count as it now stands - the same "does a shield still
// stand in the way right now" question the season-state replay can't
// answer per-event but a live commit genuinely can.
export function resolveHordeMotherDrive(state, r){
  const bornSoldiers=bossTurnovers(r);
  const killedSoldiers=Math.min(state.soldiers+bornSoldiers,r.firstDowns||0);
  const soldiers=Math.max(0,state.soldiers+bornSoldiers-killedSoldiers);
  const bossDamage=soldiers===0?Math.min(state.bossHp,r.td||0):0;
  const bossHp=state.bossHp-bossDamage;
  return {soldiers,bossHp,bornSoldiers,killedSoldiers,bossDamage,defeated:bossHp<=0};
}

// Projections - what a player is likely to do THIS week, read off their
// own completed games earlier this season (the `form.lines` the build
// script attaches - never this week's own line, so a projection can't
// leak a result). Each past game runs through the exact formula the
// live floor uses, so the same receiver projects differently on a Swarm
// floor (volume) than a Sentinel one (burst) - the strategy layer
// CLAUDE.md asks for ("starting the lower projection is sometimes
// correct"). No vendor projections, no matchup adjustment: just this
// player, this season, this floor's rules. A small sample by design -
// `games` rides along so the UI can say how small.
//
//   {kind:'dmg', games, mean, low, high}           yards-damage floors
//   {kind:'horde', games, firstDowns, td, turnovers} per-game means, Horde Mother
//   {kind:'none'}                                   slot can't touch this floor
export function hordeEvents(r){
  return {turnovers:bossTurnovers(r), firstDowns:r.firstDowns||0, td:r.td||0};
}
const HORDE_SLOTS=['tactician','hunter','rogue'];
// `armor` (plated floors only) comes off every past game the same way it
// would come off this week's drive; `strips` is scales cracked a game.
export function projectSlot(k, lines, mechanic='swarm', armor=0){
  lines=lines||[];
  if(k==='wall')return {kind:'none'};
  if(mechanic==='horde-mother'){
    if(!HORDE_SLOTS.includes(k))return {kind:'none'};
    const n=lines.length, avg=f=>n?lines.reduce((s,r)=>s+hordeEvents(r)[f],0)/n:0;
    return {kind:'horde', games:n, firstDowns:avg('firstDowns'), td:avg('td'), turnovers:avg('turnovers')};
  }
  const d=lines.map(r=>Math.max(0,dmgFor(k,r,mechanic)-armor));
  if(!d.length)return {kind:'dmg', games:0, mean:0, low:0, high:0, strips:0};
  return {kind:'dmg', games:d.length, mean:Math.round(d.reduce((a,b)=>a+b,0)/d.length),
    low:Math.min(...d), high:Math.max(...d),
    strips:lines.reduce((s,r)=>s+scaleStrips(k,r),0)/lines.length};
}

// The d20 - theatre, not chance. Every number was already decided by the
// box score; the die only READS it, so the same stat line always lands
// on the same face (reload, another device, the season replay - all
// agree). The face answers one question: did this player hit their
// number? It compares this game's raw production (dmgParts, no floor
// scaling - the floor's rules show up in the damage, the die is about
// the player) against what this player usually does.
//
// "Usually" = their own earlier games this season (the same form.lines
// projections use), pulled toward a class baseline as if the baseline
// were ROLL_PRIOR_GAMES extra games. Without that pull, a player with one
// or two games of history makes nearly every week look like a new best
// or a new worst. Baselines are 2026 weeks 1-4 means for these
// rosters (stars, not league average).
//
// q = this game / usual, against that class's "big game" ratio (BIG):
//   q >= BIG          20      a real outlier for this kind of player
//   1.0 <= q < BIG    13-19   above usual
//   0.6 <= q < 1.0    8-12    around it
//   0   <  q < 0.6    2-7     well short
//   nothing           1       0 production with chances to make some
// BIG differs by class because volatility does: a quarterback's output
// barely swings week to week (428 yards is only ~1.4x a usual star QB
// week), while a pass rusher is 0 or 2 sacks.
// The Wall is scored on sacks allowed (fewer is better); 6+ is a collapse.
export const ROLL_BASELINE={tactician:200,hunter:170,rogue:120,breaker:90,mender:28,wall:2.3};
export const ROLL_PRIOR_GAMES=2;
export const ROLL_BIG={tactician:1.35,hunter:1.7,rogue:1.8,breaker:2.2,mender:2.0,wall:2.5};
function rawProduction(k,r){const {volume,burst}=dmgParts(k,r);return volume+burst;}
function usual(k,values){
  const n=values.length,b=ROLL_BASELINE[k];
  // floored at 90% of the baseline: one dud week shouldn't make the next
  // ordinary game look like an outlier
  return Math.max(0.9*b,(values.reduce((a,c)=>a+c,0)+b*ROLL_PRIOR_GAMES)/(n+ROLL_PRIOR_GAMES));
}
function faceFromRatio(q,big){
  if(q>=big)return 20;
  if(q>=1)return Math.min(19,13+Math.round(6*(q-1)/(big-1)));
  if(q>=0.6)return Math.min(12,8+Math.round(4*(q-0.6)/0.4));
  return Math.max(2,Math.min(7,2+Math.round(5*q/0.6)));
}
export function rollTier(face){
  return face===20?'nat20':face>=13?'strong':face>=8?'par':face>=2?'weak':'nat1';
}
export function rollFor(k,r){
  if(!r||!r.hasStats)return null;
  const lines=(r.form&&r.form.lines)||[];
  let face;
  if(k==='wall'){
    const u=usual('wall',lines.map(l=>l.sacksAllowed));
    face=r.sacksAllowed>=6?1:faceFromRatio((u+1)/(r.sacksAllowed+1),ROLL_BIG.wall);
  }else{
    const v=rawProduction(k,r);
    // a kicker never sent out isn't a botch - just a quiet day
    if(v===0)face=k==='mender'&&!r.att?4:1;
    else{
      // a kicker's no-attempt weeks say nothing about the kicker
      const played=k==='mender'?lines.filter(l=>l.att>0):lines;
      face=faceFromRatio(v/usual(k,played.map(l=>rawProduction(k,l))),ROLL_BIG[k]);
    }
  }
  return {face,tier:rollTier(face)};
}
